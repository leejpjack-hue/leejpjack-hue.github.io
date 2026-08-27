(function () {
    const PRINT = { last: 766.08 };
    const CAP = 779.37;
    const KEY = "desk.pendingFills";
    const HKT = "Asia/Hong_Kong", JST = "Asia/Tokyo", NY = "America/New_York";
    const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const VENUES = [
      { id: "US", tz: NY, sessions: [{open: 9*60+30, close: 16*60}] },
      { id: "HK", tz: HKT, sessions: [{open: 9*60+30, close: 12*60},{open: 13*60, close: 16*60}] },
      { id: "JP", tz: JST, sessions: [{open: 9*60, close: 11*60+30},{open: 12*60+30, close: 15*60}] },
    ];
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
    const US_OPEN = zoned(NY, 2026, 8, 27, 9, 30);
    function usOpened(now) { return now.getTime() >= US_OPEN.getTime(); }
    function setChip(el, status, text) {
      el.className = "chip " + (status==="OPEN"||status==="PASS"?"pass":status==="LUNCH"||status==="PENDING"?"pend":status==="SKIP"?"skip":"closed");
      el.textContent = text;
    }
    function tick() {
      const now = new Date();
      const opened = usOpened(now);
      const skip = PRINT.last > CAP;
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
      const c3chip = document.getElementById("c3-chip");
      const c3stamp = document.getElementById("c3-stamp");
      const capChip = document.getElementById("cap-chip");
      if (skip) {
        document.getElementById("skip-banner").style.display = "block";
        document.getElementById("under-banner").style.display = "none";
        document.getElementById("skip-reason").textContent = "Last print 766.08 is above buy-not-above 779.37. SKIP until next Friday review.";
        setChip(capChip, "SKIP", "SKIP");
        setChip(c3chip, "SKIP", "3 SKIP");
        c3stamp.className = "stamp skip"; c3stamp.textContent = "3 SKIP";
        document.getElementById("c3-title").textContent = "Gap through buy-not-above at open = SKIP until next Friday";
        document.getElementById("c3-detail").textContent = "Last Researcher print 766.08 is above buy-not-above 779.37. Action = SKIP until next Friday review.";
      } else {
        document.getElementById("skip-banner").style.display = "none";
        document.getElementById("under-banner").style.display = "block";
        setChip(capChip, "PASS", "766.08 < cap 779.37");
        if (!opened) {
          document.getElementById("under-reason").textContent = "Until US open: 766.08 under cap 779.37. Check 3 PENDING, not SKIP.";
          setChip(c3chip, "PENDING", "3 PENDING");
          c3stamp.className = "stamp pend"; c3stamp.textContent = "3 PENDING";
          document.getElementById("c3-title").textContent = "PENDING US open — Gap through buy-not-above at open = SKIP until next Friday";
          document.getElementById("c3-detail").textContent = "Last print 766.08 is under cap 779.37. Until US open: not SKIP. If SPY gaps through 779 at the open: SKIP until next Friday review.";
        } else {
          document.getElementById("under-reason").textContent = "Print 766.08 remains under cap 779.37. No Researcher open print. Not SKIP.";
          setChip(c3chip, "PASS", "3 PASS");
          c3stamp.className = "stamp pass"; c3stamp.textContent = "3 PASS";
          document.getElementById("c3-title").textContent = "No Researcher open print above cap — not SKIP";
          document.getElementById("c3-detail").textContent = "US RTH has started since the regular close. Researcher has not posted a newer print than 766.08 (under 779.37). Development does not invent an open print. Not SKIP.";
        }
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
        note: "Not a fill. Development does not invent fills. Tracker books only after Jack ticker/qty/price/HK time. Positions and NAV unchanged."
      };
      try {
        const prev = JSON.parse(localStorage.getItem(KEY) || "[]");
        localStorage.setItem(KEY, JSON.stringify([payload].concat(Array.isArray(prev)?prev:[]).slice(0,20)));
      } catch (err2) {}
      showPayload(payload);
    });
    try {
      const prev = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (prev && prev[0]) showPayload(prev[0]);
    } catch (e) {}
    tick();
    setInterval(tick, 1000);
  })();
