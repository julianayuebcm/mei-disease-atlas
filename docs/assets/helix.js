/* Background: a rotating DNA double helix drifting left; every cycle an element inserts by target-primed
   reverse transcription — nick, the element grows into the gap ending in its polyA tail, the flanking
   target-site duplication flashes, and the insertion drifts away with the helix. */
(function () {
  const cv = document.getElementById("helix");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ELS = [["Alu", "--alu", 9], ["L1", "--l1", 15], ["SVA", "--sva", 12]];
  const STEPS = ["nick", "rt", "tsd"];
  let W = 0, H = 0, dpr = 1, col = {};
  const SP = 15;                // rung spacing (px)
  const K = 0.42;               // twist per rung (radians)
  let rungs = [], offset = 0, t = 0, last = 0, cycle = null, elIdx = 0, running = true;

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = n => cs.getPropertyValue(n).trim();
    col = { a: g("--helix-a"), b: g("--helix-b"), rung: g("--helix-rung"), glow: g("--glow"), ink: g("--ink"),
            el: Object.fromEntries(ELS.map(e => [e[0], g(e[1])])) };
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    while (rungs.length * SP < W + 200) rungs.push({ w: 1, el: null, pa: false, hl: 0 });
  }
  const cy = () => Math.min(H * 0.42, 430);
  const amp = () => Math.max(26, Math.min(56, W / 24));

  function newCycle() {
    const el = ELS[elIdx++ % ELS.length];
    return { el, phase: 0, time: 0, site: null, inserted: false, rnp: { x: W + 40, y: cy() - 160 } };
  }
  function siteIndex(targetX) {
    let x = -offset;
    for (let i = 0; i < rungs.length; i++) { if (x >= targetX) return i; x += rungs[i].w * SP; }
    return rungs.length - 1;
  }
  function rungX(i) { let x = -offset; for (let j = 0; j < i; j++) x += rungs[j].w * SP; return x; }

  function step(dt) {
    t += dt;
    offset += dt * 18;                                   // drift left
    while (rungs.length && rungs[0].w * SP < offset) {   // recycle rungs that left the screen
      offset -= rungs[0].w * SP; rungs.shift();
      if (cycle && cycle.site !== null) cycle.site--;
    }
    let total = -offset; rungs.forEach(r => total += r.w * SP);
    while (total < W + 200) { rungs.push({ w: 1, el: null, pa: false, hl: 0 }); total += SP; }

    if (!cycle) cycle = newCycle();
    const c = cycle; c.time += dt;
    const n = c.el[2];
    if (c.phase === 0) {                                  // RNP drifts to the target site
      if (c.site === null) c.site = siteIndex(W * 0.6);
      const tx = rungX(c.site), ty = cy();
      c.rnp.x += (tx - c.rnp.x) * Math.min(1, dt * 1.6);
      c.rnp.y += (ty - c.rnp.y) * Math.min(1, dt * 1.6);
      if (c.time > 2.2) { c.phase = 1; c.time = 0; }
    } else if (c.phase === 1) {                           // nick: strands bulge open
      if (c.time > 1.1) {
        const add = [];
        for (let i = 0; i < n; i++) add.push({ w: 0, el: c.el[0], pa: i >= n - 2, hl: 0 });
        rungs.splice(c.site + 1, 0, ...add);
        c.phase = 2; c.time = 0;
      }
    } else if (c.phase === 2) {                           // reverse transcription: element grows in
      const p = Math.min(1, c.time / 3.2);
      for (let i = 0; i < n; i++) rungs[c.site + 1 + i].w = Math.max(0, Math.min(1, p * n - i));
      if (p >= 1) { c.phase = 3; c.time = 0; }
    } else if (c.phase === 3) {                           // target-site duplication flashes on both flanks
      const f = Math.sin(Math.min(1, c.time / 1.6) * Math.PI);
      for (let k = 0; k < 2; k++) {
        if (rungs[c.site - k]) rungs[c.site - k].hl = f;
        if (rungs[c.site + n + 1 + k]) rungs[c.site + n + 1 + k].hl = f;
      }
      if (c.time > 1.6) { c.phase = 4; c.time = 0; }
    } else if (c.phase === 4) {                           // hold; insertion drifts away, next cycle starts
      if (c.time > 2.4) cycle = null;
    }
    publish();
  }

  function publish() {
    const st = document.getElementById("helix-steps");
    if (!st || !cycle) return;
    const active = cycle.phase === 1 ? "nick" : cycle.phase === 2 ? "rt" : cycle.phase === 3 ? "tsd" : cycle.phase === 0 ? "nick" : "";
    st.style.setProperty("--el", col.el[cycle.el[0]]);
    st.querySelectorAll(".s").forEach(s => s.classList.toggle("on", s.dataset.step === active || (cycle.phase === 4 && s.dataset.step === "tsd")));
    const nm = st.querySelector(".el-name");
    if (nm) nm.textContent = cycle.el[0];
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const y0 = cy(), A = amp();
    const pts = [];
    let x = -offset;
    const c = cycle;
    for (let i = 0; i < rungs.length; i++) {
      const r = rungs[i];
      const xm = x + r.w * SP / 2;
      x += r.w * SP;
      if (xm < -40 || xm > W + 40) continue;
      let bulge = 1;
      if (c && c.site !== null && (c.phase === 1 || c.phase === 2)) {
        const d = Math.abs(i - c.site - (c.phase === 2 ? c.el[2] / 2 : 0));
        const open = c.phase === 1 ? Math.min(1, c.time / 0.8) : 1 - Math.min(1, Math.max(0, c.time - 2.6) / 0.6);
        bulge = 1 + 0.55 * open * Math.exp(-d * d / 14);
      }
      const ang = t * 0.9 + (xm + offset) * K / SP;
      pts.push({ x: xm, ya: y0 + A * bulge * Math.sin(ang), yb: y0 - A * bulge * Math.sin(ang), z: Math.cos(ang), r, w: r.w });
    }
    // rungs (base pairs)
    for (const p of pts) {
      if (p.w < 0.15) continue;
      const depth = 0.35 + 0.65 * (p.z * 0.5 + 0.5);
      ctx.globalAlpha = depth;
      ctx.strokeStyle = p.r.el ? col.el[p.r.el] : col.rung;
      ctx.lineWidth = p.r.el ? 2.4 : 1.4;
      if (p.r.pa) { ctx.setLineDash([2, 3]); }
      ctx.beginPath(); ctx.moveTo(p.x, p.ya); ctx.lineTo(p.x, p.yb); ctx.stroke();
      ctx.setLineDash([]);
      if (p.r.hl > 0.02) {
        ctx.globalAlpha = p.r.hl; ctx.strokeStyle = col.ink; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x, p.ya); ctx.lineTo(p.x, p.yb); ctx.stroke();
      }
    }
    // backbones, coloured where the element sits
    const strand = (key, base) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const el = a.r.el && b.r.el ? a.r.el : null;
        ctx.globalAlpha = 0.55 + 0.45 * ((key === "ya" ? b.z : -b.z) * 0.5 + 0.5);
        ctx.strokeStyle = el ? col.el[el] : base;
        ctx.lineWidth = el ? 3.2 : 2.2;
        ctx.beginPath(); ctx.moveTo(a.x, a[key]); ctx.lineTo(b.x, b[key]); ctx.stroke();
      }
    };
    ctx.shadowColor = col.glow; ctx.shadowBlur = 12;
    strand("ya", col.a); strand("yb", col.b);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    // the L1 ribonucleoprotein (endonuclease + reverse transcriptase)
    if (c && c.phase <= 3) {
      let rx = c.rnp.x, ry = c.rnp.y;
      if (c.phase >= 1 && c.site !== null) {
        let xx = -offset;
        const upto = c.site + 1 + (c.phase === 2 ? Math.floor(c.el[2] * Math.min(1, c.time / 3.2)) : c.phase === 3 ? c.el[2] : 0);
        for (let j = 0; j < upto && j < rungs.length; j++) xx += rungs[j].w * SP;
        rx = xx; ry = y0 - amp() * 1.25;
        c.rnp.x = rx; c.rnp.y = ry;
      }
      const elc = col.el[c.el[0]];
      const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, 26);
      g.addColorStop(0, elc); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = c.phase === 3 ? 1 - Math.min(1, c.time / 1.2) : 0.9;
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(rx, ry, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = elc; ctx.beginPath(); ctx.arc(rx, ry, 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    step(dt); draw();
    requestAnimationFrame(frame);
  }
  function fadeOnScroll() { cv.style.opacity = String(Math.max(0.22, 1 - window.scrollY / 700)); }

  readColors(); resize();
  window.addEventListener("resize", () => { resize(); if (reduce) still(); });
  window.addEventListener("scroll", fadeOnScroll, { passive: true });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("helix:route", () => { publish(); fadeOnScroll(); });

  function still() {   // reduced motion: one finished insertion, no animation
    cycle = newCycle(); cycle.site = siteIndex(W * 0.55);
    const n = cycle.el[2];
    const add = []; for (let i = 0; i < n; i++) add.push({ w: 1, el: cycle.el[0], pa: i >= n - 2, hl: 0 });
    rungs.splice(cycle.site + 1, 0, ...add); cycle.phase = 4; t = 1.2; draw();
  }
  if (reduce) { still(); return; }
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) { last = 0; requestAnimationFrame(frame); }
  });
  requestAnimationFrame(frame);
})();
