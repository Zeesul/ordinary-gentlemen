/* ===================================================================
   charts.js — small hand-rolled SVG charts with a live crosshair
   tooltip. No external libraries.
   =================================================================== */

const PALETTE = [
  '#60a5fa', '#f472b6', '#4ade80', '#fbbf24', '#a78bfa', '#fb923c',
  '#2dd4bf', '#f87171', '#a3e635', '#22d3ee', '#e879f9', '#facc15',
  '#94a3b8', '#818cf8', '#34d399', '#fda4af', '#c4b5fd', '#fdba74',
  '#5eead4', '#bef264'
];
const seriesColor = i => PALETTE[i % PALETTE.length];

/**
 * Multi-series line chart with an interactive crosshair.
 * @param {(string|number)[]} labels  x-axis labels
 * @param {{name, values:(number|null)[], color?, id?, you?}[]} series
 * @param {object} opts  { title, sub, height, zeroBased, invert, decimals,
 *                         unit, xLabel, maxXLabels, focus: seriesId, dashed: seriesId[] }
 */
function lineChart(labels, series, opts) {
  opts = opts || {};
  const W = opts.width || 880, H = opts.height || 320;
  const pad = { t: 14, r: 14, b: 30, l: 44 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;

  if (!labels.length || !series.length) return `<div class="empty">Not enough data to chart yet.</div>`;

  let min = Infinity, max = -Infinity;
  series.forEach(s => s.values.forEach(v => {
    if (v == null) return;
    if (v < min) min = v;
    if (v > max) max = v;
  }));
  if (!isFinite(min)) return `<div class="empty">Not enough data to chart yet.</div>`;
  if (min === max) { min -= 1; max += 1; }
  let ticks = 5;
  if (opts.invert) { min = Math.min(1, min); ticks = Math.min(6, max - min); }
  else {
    // round the axis to tidy steps (5, 10, 20, 25, 50...)
    if (opts.zeroBased) min = 0;
    const raw = (max - min) / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => k >= raw) || raw;
    min = Math.floor(min / step) * step;
    max = Math.ceil(max / step) * step;
    ticks = Math.max(1, Math.round((max - min) / step));
  }

  const x = i => pad.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = v => opts.invert
    ? pad.t + ((v - min) / (max - min)) * ih
    : pad.t + ih - ((v - min) / (max - min)) * ih;

  let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    const yy = y(v);
    grid += `<line x1="${pad.l}" y1="${yy.toFixed(1)}" x2="${W - pad.r}" y2="${yy.toFixed(1)}" class="ch-grid"/>`;
    grid += `<text x="${pad.l - 8}" y="${(yy + 4).toFixed(1)}" class="ch-axis" text-anchor="end">${opts.invert ? '#' + Math.round(v) : (Math.round(v * 10) / 10).toLocaleString()}</text>`;
  }
  const step = Math.max(1, Math.ceil(labels.length / (opts.maxXLabels || 12)));
  labels.forEach((lb, i) => {
    if (i % step && i !== labels.length - 1) return;
    grid += `<text x="${x(i).toFixed(1)}" y="${H - 9}" class="ch-axis" text-anchor="middle">${esc(lb)}</text>`;
  });

  const focus = opts.focus || null;
  const norm = series.map((s, si) => ({
    id: String(s.id || s.name), name: s.name,
    color: s.color || seriesColor(si), values: s.values, you: !!s.you
  }));

  const paths = norm.map(s => {
    // break the line across nulls (a season boundary, a missing week)
    let d = '', pen = false;
    s.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    const isFocus = focus && s.id === focus;
    const faint = focus && !isFocus;
    const dashed = (opts.dashed || []).indexOf(s.id) !== -1;
    return `<g class="ch-series${faint ? ' faint' : ''}" data-series="${esc(s.id)}">
      <path d="${d}" fill="none" stroke="${s.color}" stroke-width="${isFocus ? 3 : 1.8}"
        ${dashed ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/></g>`;
  }).join('');

  const dots = norm.map(s =>
    `<circle class="ch-dot" data-series="${esc(s.id)}" r="4" fill="${s.color}"
      stroke="var(--bg)" stroke-width="2" cx="-99" cy="-99"/>`).join('');

  const legend = norm.map(s =>
    `<button class="ch-key${s.you ? ' you' : ''}" data-series="${esc(s.id)}">
      <span class="ch-swatch" style="background:${s.color}"></span>${esc(s.name)}</button>`).join('');

  const payload = esc(JSON.stringify({
    labels, series: norm,
    geo: { W, H, padL: pad.l, padT: pad.t, iw, ih, min, max, invert: !!opts.invert },
    unit: opts.unit || '', decimals: opts.decimals ? 1 : 0,
    xLabel: opts.xLabel != null ? opts.xLabel : 'Week', rankAsc: !!opts.invert
  }));

  return `<div class="chart" data-chart="${payload}">
    ${opts.title ? `<div class="chart-title">${esc(opts.title)}</div>` : ''}
    ${opts.sub ? `<div class="chart-sub">${opts.sub}</div>` : ''}
    <div class="ch-canvas">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
        aria-label="${esc(opts.title || 'Chart')}">
        ${grid}
        <line class="ch-cross" x1="-99" y1="${pad.t}" x2="-99" y2="${pad.t + ih}"/>
        ${paths}
        <g class="ch-focus">${dots}</g>
      </svg>
      <div class="ch-tip"></div>
    </div>
    ${opts.legend === false ? '' : `<div class="ch-legend">${legend}</div>`}
  </div>`;
}

/**
 * Each manager's weekly range: lowest to highest score, with the average
 * (blue tick) and median (amber dot), against the league average (red line).
 * rows: [{ id, name, min, max, avg, med, you }]
 */
function rangeChart(rows, leagueAvg) {
  if (!rows.length) return `<div class="empty">Nothing to chart yet.</div>`;
  const lo = Math.floor(Math.min.apply(null, rows.map(r => r.min)) / 10) * 10;
  const hi = Math.ceil(Math.max.apply(null, rows.map(r => r.max)) / 10) * 10;
  const at = v => ((v - lo) / Math.max(1, hi - lo) * 100).toFixed(2) + '%';
  return `<div class="card range-chart">` + rows.map(r => `
    <div class="rc-row ${r.you ? 'you' : ''}">
      <div class="rc-name">${esc(r.name)}${r.you ? ' (you)' : ''}</div>
      <div class="rc-track" title="${esc(r.name)}: ${n1(r.min)} to ${n1(r.max)}, average ${n1(r.avg)}, median ${n1(r.med)}">
        <span class="rc-lg" style="left:${at(leagueAvg)}"></span>
        <span class="rc-line" style="left:${at(r.min)};width:calc(${at(r.max)} - ${at(r.min)})"></span>
        <span class="rc-end" style="left:${at(r.min)};top:-12px">${Math.round(r.min)}</span>
        <span class="rc-end" style="left:${at(r.max)};top:-12px">${Math.round(r.max)}</span>
        <span class="rc-med" style="left:${at(r.med)}"></span>
        <span class="rc-mid" style="left:${at(r.avg)}"></span>
      </div>
      <div class="rc-val">${n1(r.avg)} <span class="dim small">avg</span></div>
    </div>`).join('') + `
    <div class="dist-legend" style="margin-top:10px">
      <span><span class="dot" style="background:#475569"></span>Min&ndash;max range</span>
      <span><span class="dot" style="background:var(--blue-soft)"></span>Average</span>
      <span><span class="dot" style="background:var(--amber);border-radius:50%"></span>Median</span>
      <span><span class="dot" style="background:rgba(248,113,113,.8);width:2px"></span>League average ${n1(leagueAvg)}</span>
    </div></div>`;
}

/** Tiny inline trend line. */
function sparkline(values, o) {
  o = o || {};
  const W = o.w || 90, H = o.h || 24;
  const vals = values.filter(v => v != null);
  if (vals.length < 2) return '';
  const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  const x = i => (i / (values.length - 1)) * (W - 4) + 2;
  const y = v => H - 2 - ((v - min) / Math.max(1e-6, max - min)) * (H - 4);
  const d = values.map((v, i) => v == null ? '' : `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${d}" fill="none"
    stroke="${o.color || 'var(--blue-soft)'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

/* ------------------------------------------------------------------
   Interaction: crosshair, focus dots, ranked tooltip, legend isolate
   ------------------------------------------------------------------ */
function wireCharts(root) {
  $$('.chart', root || document).forEach(chart => {
    if (chart.dataset.wired) return;
    chart.dataset.wired = '1';
    let cfg;
    try { cfg = JSON.parse(chart.dataset.chart || 'null'); } catch (_) { cfg = null; }
    if (!cfg) return;

    const canvas = $('.ch-canvas', chart);
    const svg = $('svg', chart);
    const cross = $('.ch-cross', chart);
    const tip = $('.ch-tip', chart);
    const dots = $$('.ch-dot', chart);
    const g = cfg.geo;

    const xAt = i => g.padL + (cfg.labels.length === 1 ? g.iw / 2 : (i / (cfg.labels.length - 1)) * g.iw);
    const yAt = v => g.invert
      ? g.padT + ((v - g.min) / (g.max - g.min)) * g.ih
      : g.padT + g.ih - ((v - g.min) / (g.max - g.min)) * g.ih;
    const fmt = v => cfg.rankAsc ? '#' + v : cfg.decimals ? (Math.round(v * 10) / 10).toFixed(1) : Math.round(v);

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

      const ranked = cfg.series.map(s => ({ s, v: s.values[i] })).filter(r => r.v != null)
        .sort((a, b) => cfg.rankAsc ? a.v - b.v : b.v - a.v);
      tip.innerHTML =
        `<div class="ch-tip-head">${esc(((cfg.xLabel ? cfg.xLabel + ' ' : '') + cfg.labels[i]).trim())}</div>` +
        ranked.slice(0, 14).map((r, n) => `<div class="ch-tip-row ${(isolated && r.s.id === isolated) || r.s.you ? 'lit' : ''}">
            <span class="ch-tip-rank">${n + 1}</span>
            <span class="ch-swatch" style="background:${r.s.color}"></span>
            <span class="ch-tip-name">${esc(r.s.name)}</span>
            <span class="ch-tip-val">${fmt(r.v)}${esc(cfg.unit)}</span>
          </div>`).join('');
      tip.classList.add('on');
      const tw = tip.offsetWidth || 210;
      const px = (clientX != null ? clientX - rect.left : xAt(i) * scale);
      let left = px + 16;
      if (left + tw > rect.width) left = Math.max(4, px - tw - 16);
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
      return Math.max(0, Math.min(cfg.labels.length - 1, Math.round(t * (cfg.labels.length - 1))));
    }
    canvas.addEventListener('mousemove', e => show(indexFromEvent(e), e.clientX));
    canvas.addEventListener('mouseleave', hide);
    canvas.addEventListener('touchmove', e => {
      if (!e.touches.length) return;
      show(indexFromEvent(e.touches[0]), e.touches[0].clientX);
    }, { passive: true });
    canvas.addEventListener('touchend', hide);

    const setIsolate = id => {
      $$('.ch-key', chart).forEach(k => k.classList.toggle('active', !!id && k.dataset.series === id));
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
        isolated = isolated === id ? null : id;
        setIsolate(isolated);
      });
    });
  });
}
