(function () {
    const KEY = "desk.pendingFills";
    const HKT = "Asia/Hong_Kong", JST = "Asia/Tokyo", NY = "America/New_York";
    const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const VENUES = [
      { id: "US", tz: NY, sessions: [{open: 9*60+30, close: 16*60}] },
      { id: "HK", tz: HKT, sessions: [{open: 9*60+30, close: 12*60},{open: 13*60, close: 16*60}] },
      { id: "JP", tz: JST, sessions: [{open: 9*60, close: 11*60+30},{open: 12*60+30, close: 15*60}] },
    ];
    const SEED = {
      append_only: true,
      events: [
        {
          id: "evt-2026-08-27-sign-spy",
          ticket_id: "WK-2026-08-21-SPY",
          type: "SIGN",
          recorded_at_hkt: "2026-08-27T00:00:00+08:00",
          actor: "cos",
          fill: null,
          rationale: {
            action: "SPY US BUY ETF",
            usd_size: 5000,
            why: "Analyst SPY 10w +3.2 / 25w +11.6 as of Fri 21 Aug 2026; overlay off; PLTR vs SPY FAIL G3; HK CASH (0005 G3 FAIL; 2800 25w ≤0); JP CASH (6857 G3 FAIL; 1321 10w −1.1); not buying 0005.HK, 2800.HK, 1321.T, PLTR, 6857.T, 6098.T",
            buy_not_above: 779.37,
            buy_not_above_note: "10w high week of 10 Aug, not 767.35",
            researcher_print: { source: "Yahoo SPY", last: 766.08, range_low: 763.93, range_high: 767.35, prior: 765.91, label: "close 04:00 HKT 27 Aug" },
            check_3: "PENDING",
            tracker_fill: null,
            what_kills_it: "10w or 25w ≤0 → cash; US stock all-five → one sleeve change; gap through 779 at open → SKIP until next Friday",
            cos_signoff: "CoS signed 27 Aug 2026 HKT"
          }
        },
        {
          id: "evt-2026-08-27-fill-spy",
          ticket_id: "WK-2026-08-21-SPY",
          type: "FILL",
          recorded_at_hkt: "2026-08-27T23:11:00+08:00",
          actor: "tracker",
          fill: { ticker: "SPY", qty: 6, price: 770.53, time_hkt: "2026-08-27T23:11:00+08:00" },
          rationale: null
        }
      ]
    };

    function parts(date, tz) {
      const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
      const bag = {};
      for (const p of f.formatToParts(date)) if (p.type !== "literal") bag[p.type] = p.value;
      const hour = +bag.hour, minute = +bag.minute;
      return { weekday: bag.weekday, wd: WD.indexOf(bag.weekday), y: +bag.year, m: +bag.month, d: +bag.day, hour, minute, second: +bag.second, minutes: hour*60+minute };
    }
    function tzOff(date, tz) {
      const p = parts(date, tz);
      return Date.UTC(p.y, p.m-1, p.d, p.hour, p.minute, p.second) - date.getTime();
    }
    function zoned(tz, y, m, d, h, min) {
      const utcGuess = Date.UTC(y, m-1, d, h, min, 0);
      let dt = new Date(utcGuess);
      for (let i=0;i<4;i++) dt = new Date(utcGuess - tzOff(dt, tz));
      return dt;
    }
    function addDays(y,m,d,n) {
      const dt = new Date(Date.UTC(y, m-1, d+n));
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth()+1, d: dt.getUTCDate() };
    }
    function hm(mins) { return { h: Math.floor(mins/60), min: mins%60 }; }
    function fmtHkt(date) {
      return new Intl.DateTimeFormat("en-GB", { timeZone: HKT, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(",","") + " HKT";
    }
    function fmtZone(date, tz) {
      return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
    }
    function nextOpen(v, y, m, d, wd) {
      if (wd === 6) { const a = addDays(y,m,d,2); y=a.y; m=a.m; d=a.d; wd=1; }
      else if (wd === 0) { const a = addDays(y,m,d,1); y=a.y; m=a.m; d=a.d; wd=1; }
      const t = hm(v.sessions[0].open);
      return zoned(v.tz, y, m, d, t.h, t.min);
    }
    function clock(v, now) {
      const p = parts(now, v.tz);
      const local = [p.hour,p.minute,p.second].map(n => String(n).padStart(2,"0")).join(":");
      const weekend = p.wd===0 || p.wd===6;
      if (weekend) {
        const n = nextOpen(v, p.y, p.m, p.d, p.wd);
        return { local, status:"CLOSED", next:"open", nextHkt: fmtHkt(n), weekend:true };
      }
      for (const s of v.sessions) {
        if (p.minutes >= s.open && p.minutes < s.close) {
          const t = hm(s.close);
          return { local, status:"OPEN", next:"close", nextHkt: fmtHkt(zoned(v.tz, p.y, p.m, p.d, t.h, t.min)), weekend:false };
        }
      }
      if (v.sessions.length===2) {
        const am = v.sessions[0].close, pm = v.sessions[1].open;
        if (p.minutes >= am && p.minutes < pm) {
          const t = hm(pm);
          return { local, status:"LUNCH", next:"open", nextHkt: fmtHkt(zoned(v.tz, p.y, p.m, p.d, t.h, t.min)), weekend:false };
        }
      }
      if (p.minutes < v.sessions[0].open) {
        const t = hm(v.sessions[0].open);
        return { local, status:"CLOSED", next:"open", nextHkt: fmtHkt(zoned(v.tz, p.y, p.m, p.d, t.h, t.min)), weekend:false };
      }
      let nx = addDays(p.y, p.m, p.d, 1), wd = (p.wd+1)%7;
      if (wd===6) { nx = addDays(nx.y,nx.m,nx.d,2); wd=1; }
      else if (wd===0) { nx = addDays(nx.y,nx.m,nx.d,1); wd=1; }
      return { local, status:"CLOSED", next:"open", nextHkt: fmtHkt(nextOpen(v, nx.y, nx.m, nx.d, wd)), weekend:false };
    }
    function setChip(el, status, text) {
      el.className = "chip " + (status==="OPEN"||status==="PASS"?"pass":status==="LUNCH"||status==="PENDING"?"pend":status==="SKIP"?"skip":"closed");
      el.textContent = text;
    }
    function tick() {
      const now = new Date();
      document.getElementById("desk-hkt").textContent = fmtZone(now, HKT);
      document.getElementById("foot-hkt").textContent = fmtHkt(now);
      VENUES.forEach(function (v) {
        const c = clock(v, now);
        const root = document.querySelector('[data-venue="'+v.id+'"]');
        root.querySelector("[data-tm]").textContent = c.local;
        setChip(root.querySelector("[data-st]"), c.status, c.status);
        root.querySelector("[data-ev]").textContent = c.next;
        root.querySelector("[data-nx]").textContent = c.nextHkt;
        const wk = root.querySelector("[data-wk]");
        if (wk) wk.textContent = c.weekend ? "Weekend · Monday open" : "";
      });
    }
    function nowHktLocal(now) {
      const p = parts(now, HKT);
      const pad = n => String(n).padStart(2,"0");
      return p.y+"-"+pad(p.m)+"-"+pad(p.d)+"T"+pad(p.hour)+":"+pad(p.minute);
    }
    function showPayload(obj) {
      document.getElementById("payload-box").style.display = "block";
      document.getElementById("payload-status").textContent = obj.status;
      document.getElementById("payload-json").textContent = JSON.stringify(obj, null, 2);
    }
    function esc(s) {
      return String(s).replace(/[&<>"]/g, function (c) { return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[c]; });
    }
    function whyHtml(rationale, fill) {
      const p = rationale.researcher_print;
      const fillBlock = fill
        ? '<p class="fill-chip">FILL '+esc(fill.ticker)+' '+fill.qty+' @ '+Number(fill.price).toFixed(2)+' · '+esc(fill.time_hkt)+'</p>'
        : '<p class="mono dim">tracker_fill null</p>';
      return fillBlock +
        '<p style="margin-top:10px"><span class="muted">Action </span>'+esc(rationale.action)+' · usd_size '+Number(rationale.usd_size).toLocaleString("en-US")+'</p>' +
        '<p>'+esc(rationale.why)+'</p>' +
        '<p>buy_not_above '+Number(rationale.buy_not_above).toFixed(2)+' = '+esc(rationale.buy_not_above_note)+'</p>' +
        '<p class="mono dim">researcher_print at SIGN: '+esc(p.source)+' '+Number(p.last).toFixed(2)+' / '+Number(p.range_low).toFixed(2)+'–'+Number(p.range_high).toFixed(2)+' / '+Number(p.prior).toFixed(2)+' '+esc(p.label)+' · check 3 '+esc(rationale.check_3)+'</p>' +
        '<p class="dim">'+esc(rationale.what_kills_it)+'</p>' +
        '<p class="dim">'+esc(rationale.cos_signoff)+'</p>';
    }
    function renderLedger(file) {
      const events = (file.events || []).slice().sort(function (a, b) {
        return a.recorded_at_hkt < b.recorded_at_hkt ? 1 : -1;
      });
      const sign = events.filter(function (e) { return e.type === "SIGN"; }).pop();
      const body = document.getElementById("ledger-body");
      const detail = document.getElementById("ledger-detail");
      body.innerHTML = events.map(function (e) {
        const fillTxt = e.fill ? (e.fill.ticker+' '+e.fill.qty+' @ '+Number(e.fill.price).toFixed(2)) : "null";
        return '<tr class="ledger-row" data-id="'+esc(e.id)+'"><td class="mono">'+esc(e.recorded_at_hkt)+'</td><td class="mono"><strong>'+esc(e.type)+'</strong></td><td>'+esc(e.actor)+'</td><td class="mono">'+esc(e.id)+'</td><td class="mono">'+esc(fillTxt)+'</td></tr>';
      }).join("");
      body.querySelectorAll(".ledger-row").forEach(function (row) {
        row.addEventListener("click", function () {
          const id = row.getAttribute("data-id");
          const ev = events.find(function (e) { return e.id === id; });
          body.querySelectorAll(".ledger-row").forEach(function (r) { r.classList.remove("sel"); });
          row.classList.add("sel");
          if (!ev || !sign || !sign.rationale) return;
          detail.style.display = "block";
          detail.innerHTML = '<p class="kicker">Frozen Why · '+esc(ev.type)+' '+esc(ev.id)+'</p>' +
            '<p class="mono dim">'+esc(ev.recorded_at_hkt)+'</p>' +
            whyHtml(sign.rationale, ev.fill);
        });
      });
    }

    document.getElementById("hkTime").value = nowHktLocal(new Date());
    document.getElementById("nowHkt").addEventListener("click", function () {
      document.getElementById("hkTime").value = nowHktLocal(new Date());
    });
    document.getElementById("fill-form").addEventListener("submit", function (e) {
      e.preventDefault();
      const ticker = document.getElementById("ticker").value.trim();
      const qty = document.getElementById("qty").value.trim();
      const price = document.getElementById("price").value.trim();
      const hkTime = document.getElementById("hkTime").value.trim();
      const err = document.getElementById("form-err");
      if (!ticker || !qty || !price || !hkTime) {
        err.textContent = "Tracker needs ticker, qty, price, and Hong Kong time. Empty fields are not a fill.";
        return;
      }
      err.textContent = "";
      const payload = {
        id: "pending-"+Date.now(),
        submittedAtHkt: fmtZone(new Date(), HKT)+" HKT",
        ticker: ticker.toUpperCase(),
        qty: qty,
        price: price,
        hkTime: hkTime,
        timezone: "Asia/Hong_Kong",
        status: "AWAITING TRACKER",
        booked: false,
        ledgerAppended: false,
        note: "Not a fill. Fill box does not book and does not append FILL. SIGN and FILL stay frozen. Positions and NAV unchanged."
      };
      try {
        const prev = JSON.parse(localStorage.getItem(KEY) || "[]");
        localStorage.setItem(KEY, JSON.stringify([payload].concat(Array.isArray(prev)?prev:[]).slice(0,20)));
      } catch {
        /* ignore quota / private mode */
      }
      showPayload(payload);
    });

    renderLedger(SEED);
    fetch("ledger.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : SEED; }).then(function (file) {
      if (file && Array.isArray(file.events)) renderLedger(file);
    }).catch(function () { renderLedger(SEED); });

    tick();
    setInterval(tick, 1000);
  })();
