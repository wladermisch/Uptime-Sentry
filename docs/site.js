// The night behind the hero, the retracting bar, and the screen switcher. The page reads the same without it.

// A runway at night: the approach lights and the two edge rows meeting at the horizon, drawn once, held still.
function drawNight(canvas) {
  const css = getComputedStyle(document.documentElement);
  const lit = css.getPropertyValue('--color-accent').trim();
  const pale = css.getPropertyValue('--color-ink').trim();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const horizon = h * 0.78;
  const vanish = w * 0.62;
  // Seeded noise, so every load draws the same field.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const dot = (x, y, r, colour, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  // Far town lights along the horizon.
  for (let i = 0; i < 140; i++) {
    const x = rnd() * w;
    const y = horizon - 2 - rnd() * 6;
    dot(x, y, 0.6 + rnd() * 0.7, rnd() > 0.82 ? lit : pale, 0.18 + rnd() * 0.35);
  }

  // Two edge rows of the runway, converging on the horizon.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 22; i++) {
      const t = i / 21; // 0 near, 1 at the horizon
      const depth = Math.pow(t, 1.8);
      const x = vanish + side * (w * 0.55) * (1 - depth) * 0.9 + side * 6;
      const y = h - (h - horizon) * depth - 4;
      dot(x, y, 2.4 * (1 - depth) + 0.6, lit, 0.85 - depth * 0.5);
    }
  }

  // Grain, so the gradient does not band.
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = pale;
  for (let i = 0; i < (w * h) / 900; i++) ctx.fillRect(rnd() * w, rnd() * h, 1, 1);
  ctx.globalAlpha = 1;
}

document.querySelectorAll('[data-night]').forEach((canvas) => {
  drawNight(canvas);
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => drawNight(canvas), 150); }, { passive: true });
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
