(function () {
    const KEY = "desk.pendingFills";
    const HKT = "Asia/Hong_Kong", JST = "Asia/Tokyo", NY = "America/New_York";
    const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const VENUES = [
      { id: "US", tz: NY, sessions: [{open: 9*60+30, close: 16*60}] },
      { id: "HK", tz: HKT, sessions: [{open: 9*60+30, close: 12*60},{open: 13*60, close: 16*60}] },
      { id: "JP", tz: JST, sessions: [{open: 9*60, close: 11*60+30},{open: 12*60+30, close: 15*60}] },
    ];
    const FILL = { ticker: "SPY", qty: 6, price: 770.53, time_hkt: "2026-08-27T23:11:00+08:00" };
    const SIGN_RATIONALE = {
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
    };
    const FILL_RATIONALE = Object.assign({}, SIGN_RATIONALE, {
      tracker_fill: FILL,
      headline: "Tracker fill SPY 6 @ 770.53 at 23:11 HKT",
      check_3: "PASS",
      check_7: "booked",
      later_print_note: "770.39 is a later print, not the fill"
    });
    const SEED = [
      {
        id: "evt-2026-08-27-sign-spy",
        ticket_id: "WK-2026-08-21-SPY",
        type: "SIGN",
        recorded_at_hkt: "2026-08-27T00:00:00+08:00",
        actor: "cos",
        fill: null,
        rationale: SIGN_RATIONALE
      },
      {
        id: "evt-2026-08-27-fill-spy",
        ticket_id: "WK-2026-08-21-SPY",
        type: "FILL",
        recorded_at_hkt: "2026-08-27T23:11:00+08:00",
        actor: "tracker",
        fill: FILL,
        rationale: FILL_RATIONALE
      }
    ];
    let deskEvents = SEED;

    function parts(date, tz) {
      const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
      const bag = {};
      for (const p of f.formatToParts(date)) if (p.type !== "literal") bag[p.type] = p.value;
      const hour = +bag.hour, minute = +bag.minute;
      const wdName = String(bag.weekday || "").replace(/\./g,"").slice(0,3);
      return { weekday: bag.weekday, wd: WD.indexOf(wdName), y: +bag.year, m: +bag.month, d: +bag.day, hour, minute, second: +bag.second, minutes: hour*60+minute };
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
      if (!date || isNaN(date.getTime())) return "";
      try {
        return new Intl.DateTimeFormat("en-GB", { timeZone: HKT, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(/,/g,"") + " HKT";
      } catch {
        return "";
      }
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
      const deskHkt = document.getElementById("desk-hkt");
      const footHkt = document.getElementById("foot-hkt");
      if (deskHkt) deskHkt.textContent = fmtZone(now, HKT);
      if (footHkt) footHkt.textContent = fmtHkt(now);
      VENUES.forEach(function (v) {
        const root = document.querySelector('[data-venue="'+v.id+'"]');
        if (!root) return;
        let c;
        try {
          c = clock(v, now);
        } catch {
          c = null;
        }
        if (!c || !c.nextHkt) {
          const p = parts(now, v.tz);
          const n = nextOpen(v, p.y, p.m, p.d, p.wd === -1 ? 6 : p.wd);
          c = { local: "--:--:--", status:"CLOSED", next:"open", nextHkt: fmtHkt(n) || "Monday open HKT", weekend:true };
        }
        const tm = root.querySelector("[data-tm]");
        const st = root.querySelector("[data-st]");
        const ev = root.querySelector("[data-ev]");
        const nx = root.querySelector("[data-nx]");
        const wk = root.querySelector("[data-wk]");
        if (tm) tm.textContent = c.local;
        if (st) setChip(st, c.status, c.status);
        if (ev) ev.textContent = c.next || "open";
        if (nx) nx.textContent = c.nextHkt;
        if (wk) wk.textContent = c.weekend ? "Weekend · Monday open" : "";
      });
      const wp = document.getElementById("weekend-print");
      if (wp) {
        const hkt = parts(now, HKT);
        const closed = hkt.wd === 0 || hkt.wd === 6;
        wp.style.display = closed ? "block" : "none";
        if (closed) wp.textContent = "Weekend CLOSED. Last print 770.39 · Yahoo 23:03 HKT 27 Aug. No Saturday tape.";
      }
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
    function asLedgerArray(raw) {
      return Array.isArray(raw) && raw.length ? raw : SEED;
    }
    function newestFirst(events) {
      return events.slice().sort(function (a, b) {
        return a.recorded_at_hkt < b.recorded_at_hkt ? 1 : -1;
      });
    }
    function tickerOf(e) {
      if (e.fill && e.fill.ticker) return e.fill.ticker;
      if (e.rationale && e.rationale.action) return String(e.rationale.action).trim().split(/\s+/)[0];
      return "";
    }
    function sleeveOf(ticker) {
      if (ticker.slice(-3) === ".HK") return "HK";
      if (ticker.slice(-2) === ".T") return "JP";
      return ticker ? "US" : "";
    }
    function whyHtml(ev) {
      const rationale = ev.rationale;
      if (!rationale) return '<p class="dim">No frozen why on this event.</p>';
      const p = rationale.researcher_print;
      const fill = ev.fill || rationale.tracker_fill;
      const isFill = ev.type === "FILL" || !!fill;
      const fillBlock = fill
        ? '<p class="fill-chip">'+esc(rationale.headline || ("Tracker fill "+fill.ticker+" "+fill.qty+" @ "+Number(fill.price).toFixed(2)+" at 23:11 HKT"))+'</p>'
        : '<p class="mono dim">tracker_fill null</p>';
      const printLabel = isFill ? "print at SIGN only" : "researcher_print at SIGN";
      const later = isFill
        ? '<p class="mono dim">'+esc(rationale.later_print_note || "770.39 is a later print, not the fill")+". Check 7 "+esc(rationale.check_7 || "booked")+".</p>'
        : "";
      return fillBlock +
        '<p style="margin-top:10px"><span class="muted">Action </span>'+esc(rationale.action)+' · usd_size '+Number(rationale.usd_size).toLocaleString("en-US")+'</p>' +
        '<p>'+esc(rationale.why)+'</p>' +
        '<p>buy_not_above '+Number(rationale.buy_not_above).toFixed(2)+' = '+esc(rationale.buy_not_above_note)+'</p>' +
        '<p class="mono dim">'+printLabel+': '+esc(p.source)+' '+Number(p.last).toFixed(2)+' / '+Number(p.range_low).toFixed(2)+'–'+Number(p.range_high).toFixed(2)+' / '+Number(p.prior).toFixed(2)+' '+esc(p.label)+' · check 3 '+esc(rationale.check_3)+'</p>' +
        later +
        '<p class="dim">'+esc(rationale.what_kills_it)+'</p>' +
        '<p class="dim">'+esc(rationale.cos_signoff)+'</p>';
    }
    function renderLiveWhy(events) {
      const latest = newestFirst(events)[0];
      const box = document.getElementById("live-why");
      if (!box || !latest) return;
      const kicker = box.querySelector("[data-live-kicker]");
      const meta = box.querySelector("[data-live-meta]");
      const hash = box.querySelector("[data-live-hash]");
      const body = box.querySelector("[data-live-body]");
      if (kicker) kicker.textContent = "Why · latest event · " + latest.type;
      if (meta) meta.textContent = latest.id + " · " + latest.recorded_at_hkt + " · " + latest.actor;
      if (hash) {
        hash.setAttribute("href", "#" + latest.id);
        hash.textContent = "#" + latest.id;
      }
      if (body) body.innerHTML = whyHtml(latest);
    }
    function hashId() {
      try {
        return decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
      } catch {
        return "";
      }
    }
    function showCard(ev) {
      const detail = document.getElementById("blotter-detail");
      if (!detail) return;
      if (!ev) {
        detail.style.display = "none";
        detail.innerHTML = "";
        return;
      }
      detail.style.display = "block";
      detail.innerHTML = '<div class="why-head">' +
        '<div><p class="kicker">Frozen Why · '+esc(ev.type)+'</p>' +
        '<p class="mono dim">'+esc(ev.recorded_at_hkt)+'</p></div>' +
        '<a class="hash-hit" href="#'+esc(ev.id)+'">#'+esc(ev.id)+'</a>' +
        '</div>' +
        whyHtml(ev);
    }
    function highlight(id) {
      document.querySelectorAll(".blotter-row, .blotter-tr").forEach(function (r) {
        r.classList.toggle("sel", r.getAttribute("data-id") === id);
      });
    }
    function openFromHash(events) {
      const id = hashId();
      const blotter = document.getElementById("blotter");
      const missing = document.getElementById("blotter-missing");
      if (missing) missing.style.display = "none";
      if (!id) {
        highlight("");
        showCard(null);
        return;
      }
      const ev = events.find(function (e) { return e.id === id; });
      if (!ev) {
        highlight("");
        showCard(null);
        if (missing) {
          missing.style.display = "block";
          missing.textContent = "No event " + id + ". Blotter is below. Page did not crash.";
        }
        if (blotter) blotter.scrollIntoView({ block: "start" });
        return;
      }
      highlight(ev.id);
      showCard(ev);
      const card = document.getElementById("blotter-detail");
      if (card && card.scrollIntoView) card.scrollIntoView({ block: "nearest" });
    }
    function selectEvent(id, events) {
      if (!id) return;
      if (hashId() !== id) {
        try {
          history.replaceState(null, "", "#" + id);
        } catch {
          location.hash = id;
        }
      }
      const ev = events.find(function (e) { return e.id === id; });
      if (!ev) {
        openFromHash(events);
        return;
      }
      const missing = document.getElementById("blotter-missing");
      if (missing) missing.style.display = "none";
      highlight(ev.id);
      showCard(ev);
    }
    function rowBits(e) {
      const ticker = tickerOf(e);
      const qty = e.fill ? e.fill.qty : "";
      const price = e.fill ? Number(e.fill.price).toFixed(2) : "";
      const fillLine = e.fill ? (ticker+" "+qty+" @ "+price) : ticker;
      const usd = e.rationale ? e.rationale.usd_size : "";
      const why = e.rationale ? e.rationale.why : "";
      return { ticker: ticker, fillLine: fillLine, usd: usd, why: why };
    }
    function bindSelect(el, events) {
      if (!el) return;
      el.addEventListener("click", function (evt) {
        if (evt.target.closest && evt.target.closest("a.hash-hit")) return;
        selectEvent(el.getAttribute("data-id") || "", events);
      });
    }
    function renderBlotter(raw) {
      const events = newestFirst(asLedgerArray(raw));
      const table = document.getElementById("blotter-table");
      if (table) {
        table.innerHTML = events.map(function (e) {
          const b = rowBits(e);
          return '<tr class="blotter-tr" data-id="'+esc(e.id)+'">' +
            '<td class="mono">'+esc(e.type)+'</td>' +
            '<td class="mono">'+esc(b.fillLine)+'</td>' +
            '<td class="mono">'+esc(e.recorded_at_hkt)+'</td>' +
            '<td>'+esc(sleeveOf(b.ticker))+'</td>' +
            '<td>'+esc(b.usd)+'</td>' +
            '<td>'+esc(b.why)+'</td>' +
            '</tr>';
        }).join("");
        table.querySelectorAll(".blotter-tr").forEach(function (row) { bindSelect(row, events); });
      }
      const body = document.getElementById("blotter-body");
      body.innerHTML = events.map(function (e) {
        const b = rowBits(e);
        return '<article class="blotter-row" data-id="'+esc(e.id)+'">' +
          '<div class="blotter-head"><strong class="mono">'+esc(e.type)+'</strong><span class="mono">'+esc(b.fillLine)+'</span></div>' +
          '<div class="blotter-meta"><span class="mono">'+esc(e.recorded_at_hkt)+'</span><span>Sleeve '+esc(sleeveOf(b.ticker))+'</span><span>USD '+esc(b.usd)+'</span></div>' +
          '<p class="why-wrap">'+esc(b.why)+'</p>' +
          '<a class="hash-hit" href="#'+esc(e.id)+'">#'+esc(e.id)+'</a>' +
          '</article>';
      }).join("");
      body.querySelectorAll(".blotter-row").forEach(function (row) { bindSelect(row, events); });
      renderLiveWhy(events);
      openFromHash(events);
      deskEvents = events;
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
        note: "Later request only. Not a fill. Fill box does not append FILL and does not change the book. FIRST BUY BOOKED: SPY 6 @ 770.53 at 23:11 HKT, stop NONE."
      };
      try {
        const prev = JSON.parse(localStorage.getItem(KEY) || "[]");
        localStorage.setItem(KEY, JSON.stringify([payload].concat(Array.isArray(prev)?prev:[]).slice(0,20)));
      } catch {
        /* ignore quota / private mode */
      }
      showPayload(payload);
    });

    window.addEventListener("hashchange", function () {
      openFromHash(deskEvents);
    });

    renderBlotter(SEED);
    fetch("ledger.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : SEED; }).then(function (file) {
      renderBlotter(file);
    }).catch(function () { renderBlotter(SEED); });

    tick();
    setInterval(tick, 1000);
  })();
