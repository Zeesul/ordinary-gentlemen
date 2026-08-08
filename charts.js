/* ===================================================================
   charts.js — small hand-rolled SVG charts with a live crosshair
   tooltip. No external libraries.
   =================================================================== */

const PALETTE = [
  '#d4af37', '#5aa9e6', '#35c48a', '#e5615f', '#b18cd9', '#f0913e',
  '#4fd1c5', '#ec6ea8', '#8fbf5a', '#9aa7b8', '#c9a227', '#6f8ce0'
];
const seriesColor = i => PALETTE[i % PALETTE.length];

/**
 * Multi-series line chart with an interactive crosshair.
 * @param {number[]} labels  x-axis values (week numbers)
 * @param {{name:string, values:number[], color?:string, id?:string}[]} series
 */
function lineChart(labels, series, opts) {
  opts = opts || {};
  const W = opts.width || 880, H = opts.height || 360;
  const pad = { t: 18, r: 18, b: 36, l: 56 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;

  if (!labels.length || !series.length) {
    return `<div class="empty">Not enough data to chart yet.</div>`;
  }

  let min = Infinity, max = -Infinity;
  series.forEach(s => s.values.forEach(v => {
    if (v < min) min = v;
    if (v > max) max = v;
  }));
  if (min === max) { min -= 1; max += 1; }
  const padY = (max - min) * 0.08;
  max += padY;
  min = opts.zeroBased ? 0 : min - padY;

  const x = i => pad.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = v => pad.t + ih - ((v - min) / (max - min)) * ih;

  /* gridlines + axis labels */
  const ticks = 5;
  let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    const yy = y(v);
    grid += `<line x1="${pad.l}" y1="${yy.toFixed(1)}" x2="${W - pad.r}" y2="${yy.toFixed(1)}" class="ch-grid"/>`;
    grid += `<text x="${pad.l - 9}" y="${(yy + 4).toFixed(1)}" class="ch-axis" text-anchor="end">${opts.decimals ? Math.round(v * 10) / 10 : Math.round(v)}</text>`;
  }
  const step = Math.max(1, Math.ceil(labels.length / (opts.maxXLabels || 12)));
  labels.forEach((lb, i) => {
    if (i % step && i !== labels.length - 1) return;
    grid += `<text x="${x(i).toFixed(1)}" y="${H - 12}" class="ch-axis" text-anchor="middle">${esc(lb)}</text>`;
  });

  const norm = series.map((s, si) => ({
    id: String(s.id || s.name),
    name: s.name,
    color: s.color || seriesColor(si),
    values: s.values
  }));

  const paths = norm.map(s => {
    const d = s.values.map((v, i) =>
      `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const dots = s.values.map((v, i) =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.4" fill="${s.color}"/>`).join('');
    return `<g class="ch-series" data-series="${esc(s.id)}">
      <path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round"/>${dots}</g>`;
  }).join('');

  const focus = norm.map(s =>
    `<circle class="ch-dot" data-series="${esc(s.id)}" r="4.5" fill="${s.color}"
      stroke="var(--bg)" stroke-width="2" cx="-99" cy="-99"/>`).join('');

  const legend = norm.map(s =>
    `<button class="ch-key" data-series="${esc(s.id)}">
      <span class="ch-swatch" style="background:${s.color}"></span>${esc(s.name)}</button>`).join('');

  const payload = esc(JSON.stringify({
    labels,
    series: norm,
    geo: { W, H, padL: pad.l, padT: pad.t, iw, ih, min, max },
    unit: opts.unit || '',
    decimals: opts.decimals ? 1 : 0,
    xLabel: opts.xLabel || 'Week'
  }));

  return `<div class="chart" data-chart="${payload}">
    <div class="ch-canvas">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
        aria-label="${esc(opts.title || 'Chart')}">
        ${grid}
        <line class="ch-cross" x1="-99" y1="${pad.t}" x2="-99" y2="${pad.t + ih}"/>
        ${paths}
        <g class="ch-focus">${focus}</g>
      </svg>
      <div class="ch-tip"></div>
    </div>
    <div class="ch-legend">${legend}</div>
  </div>`;
}

/** Horizontal bar chart for simple rankings. */
function barChart(rows, opts) {
  opts = opts || {};
  if (!rows.length) return `<div class="empty">Nothing to chart yet.</div>`;
  const max = Math.max.apply(null, rows.map(r => r.value)) || 1;
  return `<div class="bars">` + rows.map((r, i) => `
    <div class="bar-row">
      <div class="bar-label">${esc(r.label)}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(r.value / max) * 100}%;
          background:${r.color || seriesColor(i)}"></div>
      </div>
      <div class="bar-value">${esc(r.display != null ? r.display : r.value)}</div>
    </div>`).join('') + `</div>`;
}

/* ------------------------------------------------------------------
   Interaction: crosshair, focus dots, ranked tooltip, legend isolate
   ------------------------------------------------------------------ */
function wireCharts(root) {
  $$('.chart', root || document).forEach(chart => {
    let cfg;
    try { cfg = JSON.parse(chart.dataset.chart || 'null'); } catch (_) { cfg = null; }
    if (!cfg) return;

    const canvas = $('.ch-canvas', chart);
    const svg = $('svg', chart);
    const cross = $('.ch-cross', chart);
    const tip = $('.ch-tip', chart);
    const dots = $$('.ch-dot', chart);
    const g = cfg.geo;

    const xAt = i => g.padL + (cfg.labels.length === 1
      ? g.iw / 2 : (i / (cfg.labels.length - 1)) * g.iw);
    const yAt = v => g.padT + g.ih - ((v - g.min) / (g.max - g.min)) * g.ih;
    const fmt = v => cfg.decimals ? (Math.round(v * 10) / 10).toFixed(1) : Math.round(v);

    let isolated = null;

    function show(i, clientX) {
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / g.W;

      cross.setAttribute('x1', xAt(i));
      cross.setAttribute('x2', xAt(i));
      cross.classList.add('on');

      dots.forEach(d => {
        const s = cfg.series.find(x => x.id === d.dataset.series);
        const v = s && s.values[i];
        const hidden = isolated && s && s.id !== isolated;
        if (v == null || hidden) { d.setAttribute('cx', -99); d.setAttribute('cy', -99); return; }
        d.setAttribute('cx', xAt(i));
        d.setAttribute('cy', yAt(v));
      });

      const ranked = cfg.series
        .map(s => ({ s, v: s.values[i] }))
        .filter(r => r.v != null)
        .sort((a, b) => b.v - a.v);

      tip.innerHTML =
        `<div class="ch-tip-head">${esc(((cfg.xLabel ? cfg.xLabel + ' ' : '') + cfg.labels[i]).trim())}</div>` +
        ranked.map((r, n) => `<div class="ch-tip-row ${isolated && r.s.id === isolated ? 'lit' : ''}">
            <span class="ch-tip-rank">${n + 1}</span>
            <span class="ch-swatch" style="background:${r.s.color}"></span>
            <span class="ch-tip-name">${esc(r.s.name)}</span>
            <span class="ch-tip-val">${fmt(r.v)}${esc(cfg.unit)}</span>
          </div>`).join('');

      tip.classList.add('on');
      const tw = tip.offsetWidth || 210;
      const px = (clientX != null ? clientX - rect.left : xAt(i) * scale);
      let left = px + 18;
      if (left + tw > rect.width) left = Math.max(6, px - tw - 18);
      tip.style.left = left + 'px';
    }

    function hide() {
      cross.classList.remove('on');
      tip.classList.remove('on');
      dots.forEach(d => { d.setAttribute('cx', -99); d.setAttribute('cy', -99); });
    }

    function indexFromEvent(e) {
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / g.W;
      const sx = (e.clientX - rect.left) / scale;
      const t = (sx - g.padL) / (g.iw || 1);
      return Math.max(0, Math.min(cfg.labels.length - 1,
        Math.round(t * (cfg.labels.length - 1))));
    }

    canvas.addEventListener('mousemove', e => show(indexFromEvent(e), e.clientX));
    canvas.addEventListener('mouseleave', hide);
    canvas.addEventListener('touchmove', e => {
      if (!e.touches.length) return;
      show(indexFromEvent(e.touches[0]), e.touches[0].clientX);
    }, { passive: true });
    canvas.addEventListener('touchend', hide);

    /* legend: hover to highlight, click to lock */
    const setIsolate = id => {
      isolated = id;
      $$('.ch-key', chart).forEach(k =>
        k.classList.toggle('active', !!id && k.dataset.series === id));
      $$('.ch-series', chart).forEach(gr => {
        gr.classList.toggle('dim', !!id && gr.dataset.series !== id);
        gr.classList.toggle('lit', !!id && gr.dataset.series === id);
      });
    };

    $$('.ch-key', chart).forEach(key => {
      key.addEventListener('mouseenter', () => { if (!isolated) setIsolate(key.dataset.series); });
      key.addEventListener('mouseleave', () => { if (!isolated) setIsolate(null); });
      key.addEventListener('click', () => {
        const id = key.dataset.series;
        const was = isolated;
        isolated = null;
        setIsolate(was === id ? null : id);
        isolated = was === id ? null : id;
      });
    });
  });
}
