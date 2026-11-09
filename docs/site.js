// The night behind the hero (and the close), the retracting bar, and the screen switcher. The page reads the same without it.

// A runway at night, seen from the approach: two rows of edge lights in true perspective, a far
// town on the horizon, the "rabbit" (the sequenced approach flash) running towards the horizon,
// and an aircraft's landing light sinking onto the runway. The runway lies in the gap between the
// hero's text and its screenshot, so the motion never runs behind either. The hero's canvas moves
// slowly; any other canvas (the close) is drawn once and held still.
function createNight(canvas, animate) {
  const css = getComputedStyle(document.documentElement);
  const lit = css.getPropertyValue('--color-accent').trim();
  const pale = css.getPropertyValue('--color-ink').trim();
  const skyHigh = css.getPropertyValue('--color-sky-high').trim();
  const skyLow = css.getPropertyValue('--color-sky-low').trim();
  const landFar = css.getPropertyValue('--color-land-far').trim();
  const landNear = css.getPropertyValue('--color-land').trim();
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1, grain = null, town = [], edges = [], vanish = 0, horizonY = 0;

  const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // A soft light: a small core and a faint halo, so it reads as a lamp, not a printed dot.
  const lamp = (x, y, r, colour, alpha) => {
    if (alpha <= 0.01 || r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, colour);
    g.addColorStop(0.25, colour);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  const layout = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const rnd = rng(7);
    const horizon = h * 0.78;
    // Centre of the gap between the text and the screenshot, else a little left of centre.
    const host = canvas.parentElement;
    const text = host.querySelector('.hero__grid > :first-child');
    const shot = host.querySelector('.hero__grid > figure');
    const box = canvas.getBoundingClientRect();
    vanish = text && shot && shot.getBoundingClientRect().left > text.getBoundingClientRect().right
      ? (text.getBoundingClientRect().right + shot.getBoundingClientRect().left) / 2 - box.left
      : w * 0.42;
    horizonY = horizon;
    const land = h - horizon;

    // The town spreads over the land in depth: most lights far and small at the horizon, fewer
    // nearer, larger and brighter; none on the runway itself. Each flickers slowly on its own.
    const corridor = (y) => (w * 0.16) * ((y - horizon) / (land * 0.95)) + 14;
    town = [];
    for (let i = 0; i < Math.round(w / 4); i++) {
      const d = Math.pow(rnd(), 2.6); // 0 at the horizon, 1 nearest
      const y = horizon - 3 + rnd() * 3 + d * land * 0.42;
      const x = rnd() * w;
      if (Math.abs(x - vanish) < corridor(y)) continue;
      town.push({ x, y, r: 0.45 + d * 1.1 + rnd() * 0.3, a: 0.14 + d * 0.32 + rnd() * 0.12, speed: 0.2 + rnd() * 0.5, phase: rnd() * Math.PI * 2 });
    }

    // Edge lights evenly spaced along the runway, projected: nearer ones fall off the bottom edge.
    edges = [];
    for (let i = 0; i < 90; i++) {
      const z = 0.7 + i * 0.4;
      const y = horizon + (land * 0.95) / z;
      // Past this the rows would run together into a drawn line; the runway fades out instead.
      if (y > h + 20 || z > 9) continue;
      const fadeOut = Math.min(1, (9 - z) / 3.5);
      for (const side of [-1, 1]) {
        edges.push({ x: vanish + side * (w * 0.16) / z, y, z, r: Math.max(0.55, Math.min(2.4, 2.4 / z)), a: Math.max(0.12, Math.min(0.8, 1.2 / Math.sqrt(z))) * fadeOut });
      }
    }

    // The still backdrop, painted once: sky into land with no hard edge, a low haze where the
    // town's light hangs in the air, the land darkening towards the viewer, then grain.
    grain = document.createElement('canvas');
    grain.width = canvas.width;
    grain.height = canvas.height;
    const g = grain.getContext('2d');
    g.scale(dpr, dpr);
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, skyHigh);
    sky.addColorStop((horizon - land * 0.6) / h, skyLow);
    sky.addColorStop(horizon / h, skyLow);
    sky.addColorStop(Math.min(1, (horizon + land * 0.12) / h), landFar);
    sky.addColorStop(1, landNear);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const haze = g.createLinearGradient(0, horizon - land * 0.7, 0, horizon + land * 0.25);
    haze.addColorStop(0, 'transparent');
    haze.addColorStop(0.72, pale);
    haze.addColorStop(1, 'transparent');
    g.globalAlpha = 0.06;
    g.fillStyle = haze;
    g.fillRect(0, horizon - land * 0.7, w, land * 0.95);
    g.fillStyle = pale;
    g.globalAlpha = 0.045;
    for (let i = 0; i < (w * h) / 900; i++) g.fillRect(rnd() * w, rnd() * h, 1, 1);
    g.globalAlpha = 1;
  };

  const draw = (t) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(grain, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sec = t / 1000;

    for (const l of town) lamp(l.x, l.y, l.r, pale, l.a * (0.75 + 0.25 * Math.sin(sec * l.speed + l.phase)));

    // The rabbit: a flash running from the nearest lights to the horizon, once every 4 seconds.
    const run = (sec % 4) / 1.6; // 0..1 while it runs, then dark until the next run
    const zFlash = 0.7 + run * 24;
    for (const e of edges) {
      const near = run <= 1 ? Math.max(0, 1 - Math.abs(e.z - zFlash) / 2.2) : 0;
      lamp(e.x, e.y, e.r, pale, e.a * 0.8);
      if (near > 0) lamp(e.x, e.y, e.r * 1.8 + 0.6, lit, Math.min(1, near * (e.a + 0.5)));
    }

    // An aircraft on final: its landing light sinks from high in the gap to the runway's far end
    // over 22 seconds, the amber beacon blinking once a second, then it is gone for a few seconds.
    const leg = (sec % 26) / 22;
    if (leg <= 1) {
      const ease = leg * leg * (3 - 2 * leg);
      const x = vanish + Math.sin(leg * Math.PI) * 6;
      const y = h * 0.12 + (horizonY - 6 - h * 0.12) * ease;
      const fade = Math.min(1, leg * 8) * Math.min(1, (1 - leg) * 10);
      lamp(x, y, 1.6 - ease * 0.6, pale, 0.9 * fade);
      if (sec % 1 < 0.12) lamp(x, y - 4, 1.1, lit, 0.9 * fade);
    }
    ctx.globalAlpha = 1;
  };

  let raf = 0, last = 0, running = false;
  const frame = (t) => {
    if (!running) return;
    if (t - last > 33) { draw(t); last = t; } // about 30 frames a second is plenty for this
    raf = requestAnimationFrame(frame);
  };
  const api = {
    play() { if (!animate || running) return; running = true; raf = requestAnimationFrame(frame); },
    pause() { running = false; cancelAnimationFrame(raf); },
    redraw() { layout(); draw(animate ? performance.now() : 0); },
  };
  api.redraw();
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(api.redraw, 150); }, { passive: true });
  return api;
}

const still = matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll('[data-night]').forEach((canvas) => {
  const loop = canvas.closest('[data-loop]');
  const night = createNight(canvas, !!loop);
  if (!loop) return;
  // Runs only while on screen, with the tab visible, not held by the visitor, and not under reduced motion.
  const s = { seen: false, held: false };
  const btn = loop.querySelector('[data-loop-toggle]');
  const sync = () => {
    const run = s.seen && !s.held && !still.matches && !document.hidden;
    if (run) night.play(); else night.pause();
    loop.classList.toggle('is-running', run);
    if (btn) {
      btn.textContent = s.held ? 'Play the night' : 'Pause the night';
      btn.setAttribute('aria-pressed', String(s.held));
    }
  };
  btn?.addEventListener('click', () => { s.held = !s.held; sync(); });
  document.addEventListener('visibilitychange', sync);
  still.addEventListener('change', sync);
  new IntersectionObserver(([e]) => { s.seen = e.isIntersecting; sync(); }).observe(loop);
});

// The bar slides away while reading down and returns on the way up.
const bar = document.querySelector('[data-bar]');
if (bar) {
  let last = window.scrollY;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      bar.classList.toggle('is-away', y > last && y > 400 && !bar.contains(document.activeElement));
      last = y;
      ticking = false;
    });
  }, { passive: true });
  bar.addEventListener('focusin', () => bar.classList.remove('is-away'));
}

// Screen switcher: arrow keys move between tabs.
document.querySelectorAll('[data-switch]').forEach((root) => {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = tabs[(i + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
  // Without script every screen shows in order; with it, only the first.
  tabs.forEach((t, i) => { document.getElementById(t.getAttribute('aria-controls')).hidden = i !== 0; });
});
