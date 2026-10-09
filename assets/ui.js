/* ===================================================================
   ui.js — shared building blocks for every page: manager and player
   cells, stat and award cards, sortable tables, pills and tabs, grade
   chips, and "deferred" sections that fill in after the page paints.
   =================================================================== */

const views = {};                        // route name -> function(params) => html

/* ------------------------------ who's who ------------------------- */
const mgr = id => (MODEL && MODEL.managers[id]) ||
  { id: id, name: 'Unknown', avatar: '', teamNames: [], titles: [] };
const viewerId = () => (setViewer.mem != null ? setViewer.mem : getViewer()) || '';
const isYou = id => !!id && id === viewerId();
const youBadge = id => isYou(id) ? ' <span class="you-badge">YOU</span>' : '';
const youRow = id => isYou(id) ? 'you' : '';

const avatar = (id, cls) => `<img class="${cls || 'av'}" src="${esc(mgr(id).avatar)}" alt="" loading="lazy"
  onerror="this.style.visibility='hidden'">`;

function mgrCell(id, sub, noLink) {
  const m = mgr(id);
  const inner = `<div class="mgr">${avatar(id)}
    <div style="min-width:0"><div class="mgr-name">${esc(m.name)}${youBadge(id)}</div>
    ${sub ? `<div class="mgr-team">${esc(sub)}</div>` : ''}</div></div>`;
  return noLink || !id ? inner
    : `<a class="mgr-link" href="#/manager?id=${encodeURIComponent(id)}">${inner}</a>`;
}

/** A manager's name (or any label) as a link to their profile. */
function mgrLink(id, text) {
  const label = text != null ? text : mgr(id).name;
  if (!id) return esc(label);
  return `<a class="name-link" href="#/manager?id=${encodeURIComponent(id)}">${esc(label)}</a>`;
}

const money0 = v => (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString();
const recordStr = m => `${m.w}-${m.l}${m.ties ? '-' + m.ties : ''}`;
const wl = t => `${t.wins}-${t.losses}${t.ties ? '-' + t.ties : ''}`;
const wlt = (w, l, t) => `${w}-${l}${t ? '-' + t : ''}`;
const colorNum = (v, f, digits) => `<span class="${v > 0 ? 'pos-t' : v < 0 ? 'neg-t' : 'muted'}">${signed(v, f || (x => x.toFixed(digits == null ? 1 : digits)))}</span>`;

/* ------------------------------ players --------------------------- */
const posBadge = pos => {
  const p = pos === 'DST' ? 'DEF' : (pos || '');
  return `<span class="pos pos-${['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].indexOf(p) !== -1 ? p : 'NA'}">${esc(p || '—')}</span>`;
};

/* Player headshot from Sleeper's CDN. Team defenses use the team logo.
   Sleeper only serves a player's current photo, so an old draft pick shows
   today's headshot. Anyone missing falls back to a silhouette. */
function playerFace(id, size) {
  if (!id) return '';
  const isTeam = !/^\d+$/.test(String(id));
  const src = isTeam
    ? `https://sleepercdn.com/images/team_logos/nfl/${String(id).toLowerCase()}.png`
    : `https://sleepercdn.com/content/nfl/players/thumb/${encodeURIComponent(id)}.jpg`;
  const s = size || 24;
  return `<img class="av" style="width:${s}px;height:${s}px;${isTeam ? 'border-radius:4px;object-fit:contain' : ''}"
    src="${esc(src)}" alt="" loading="lazy" decoding="async"
    onerror="if(!this.dataset.f){this.dataset.f=1;this.src='https://sleepercdn.com/images/v2/icons/player_default.webp'}">`;
}

function playerCell(pid, opts) {
  opts = opts || {};
  const m = opts.meta || playerMeta(pid);
  const pos = opts.pos || m.pos;
  return `<div class="pl">${opts.face === false ? '' : playerFace(pid, opts.size)}
    ${posBadge(pos)}<span class="pl-name">${esc(m.name)}</span>${opts.after || ''}</div>`;
}

/* ------------------------------ labels ----------------------------- */
const lbl = (text, tone) => `<span class="lbl lbl-${tone || 'slate'}">${text}</span>`;

function finishLabel(row) {
  if (row.champion) return lbl('Champion', 'gold');
  if (row.runnerUp) return lbl('2nd', 'silver');
  if (row.third) return lbl('3rd', 'bronze');
  if (row.finish) return lbl(ordinal(row.finish), row.playoffs ? 'blue' : 'slate');
  if (row.playoffs) return lbl('Playoffs', 'blue');
  if (!row.complete) return lbl('In progress', 'slate');
  return '';
}

function medal(row) {
  if (row.champion) return lbl('Champion', 'gold');
  if (row.runnerUp) return lbl('Runner-up', 'silver');
  if (row.third) return lbl('3rd', 'bronze');
  if (row.playoffs) return lbl('Playoffs', 'blue');
  if (row.consolation) return lbl('Consolation', 'teal');
  if (row.lastPlace) return lbl('Last', 'red');
  return '';
}

function gradeLetter(letter, big) {
  if (!letter) return '<span class="dim">&mdash;</span>';
  const t = letter[0].toLowerCase();
  return `<span class="grade g-${'abcdf'.indexOf(t) !== -1 ? t : 'c'}${big ? ' lg' : ''}">${esc(letter)}</span>`;
}

/** A trade side's result as a coloured chip ("Fleece", "Bad Loss"...). */
function tierChip(side, basis, showBasis) {
  if (!side) return '';
  const loss = side.result === 'L';
  const cls = side.tier === 'even' ? 'tier-even' : (loss ? 'tier-loss-' : 'tier-') + side.tier;
  const b = showBasis ? `<span class="basis">${basis === 'realized' ? 'Realized pts:' : basis === 'projected' ? 'Projected pts:' : 'Market:'}</span>` : '';
  return `<span class="tier ${cls}">${b}${esc(side.label)}</span>`;
}

function waiverChip(tier) {
  const t = WAIVER_TIERS[tier] || WAIVER_TIERS.depth;
  return lbl(esc(t.label), t.tone);
}

/* ------------------------------ cards ------------------------------ */
function statCard(o) {
  return `<div class="stat acc-${o.acc || 'blue'}${o.you ? ' you' : ''}">
    <div class="stat-label">${o.label}</div>
    <div class="stat-value">${o.value}</div>
    ${o.sub ? `<div class="stat-sub">${o.sub}</div>` : ''}
  </div>`;
}

function awardCard(a, info) {
  const you = isYou(a.ownerId);
  return `<div class="award t-${a.tone || 'blue'}${you ? ' you' : ''}">
    <div class="award-top"><span class="award-label">${esc(a.label)}</span>${info || ''}</div>
    <div class="award-name">${mgrLink(a.ownerId)}${youBadge(a.ownerId)}</div>
    <div class="award-value">${esc(a.value)}</div>
    <div class="award-sub">${esc(a.sub || '')}</div>
  </div>`;
}

function section(title, body, o) {
  o = o || {};
  return `<section class="section${o.tight ? ' tight' : ''}"${o.id ? ` id="${o.id}"` : ''}>
    <div class="section-head"><h2>${title}${o.tag ? ` <span class="tag">${o.tag}</span>` : ''}</h2>
      ${o.act ? `<span class="act">${o.act}</span>` : ''}</div>
    ${o.sub ? `<p class="section-sub">${o.sub}</p>` : ''}
    ${body}
  </section>`;
}

const empty = text => `<div class="empty">${text}</div>`;
const skeleton = text => `<div class="skeleton">${esc(text || 'Loading…')}</div>`;
const learn = (text) => `<div class="learn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg><span>${text}</span></div>`;

/* ------------------------------ tables ----------------------------- */
/**
 * headers: strings or { label, num, sort: 'num'|'text', extra, title, cls }
 * rows:    pre-rendered <tr> strings. For sorting, a cell can carry
 *          data-v="number"; otherwise its text is used.
 * opts:    { cls, sortable, limit, more, id, empty, extraCols }
 */
function table(headers, rows, opts) {
  opts = opts || {};
  const head = headers.map((h, i) => {
    const o = typeof h === 'string' ? { label: h } : (h || { label: '' });
    const cls = [o.num ? 'num' : '', o.extra ? 'col-extra' : '', o.cls || '',
      opts.sortable && o.label && o.sort !== false ? 'sortable' : ''].filter(Boolean).join(' ');
    return `<th scope="col" class="${cls}" data-col="${i}" data-type="${o.sort || (o.num ? 'num' : 'text')}"
      ${o.title ? `title="${esc(o.title)}"` : ''}>${o.label != null ? o.label : ''}</th>`;
  }).join('');
  const limit = opts.limit && rows.length > opts.limit ? opts.limit : 0;
  const body = rows.length ? rows.map((r, i) => limit && i >= limit
    ? r.replace(/^\s*<tr(\s+class="([^"]*)")?/, (m, a, c) => `<tr class="${(c || '') + ' extra'}"`) : r).join('')
    : `<tr class="empty-row"><td colspan="${headers.length}">${opts.empty || 'Nothing here yet.'}</td></tr>`;
  const more = limit ? `<button class="table-more" data-more="${rows.length}">${opts.more || 'Show all ' + rows.length}</button>` : '';
  return `<div class="table-wrap${opts.wrapCls ? ' ' + opts.wrapCls : ''}"${opts.id ? ` id="${opts.id}"` : ''}><table class="${opts.cls || ''}">
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${more}</div>`;
}

/** A <td> whose sort value differs from what it shows. */
const tdv = (v, html, cls) => `<td class="${cls || 'num'}" data-v="${v == null || isNaN(v) ? '' : v}">${html}</td>`;

/* ------------------------------ navigation bits -------------------- */
function hrefWith(route, params) {
  const q = new URLSearchParams();
  Object.keys(params || {}).forEach(k => {
    if (params[k] != null && params[k] !== '') q.set(k, params[k]);
  });
  const s = q.toString();
  return '#/' + route + (s ? '?' + s : '');
}

/** Season pills. `all` adds an "All seasons" pill (value ''). */
function seasonPills(route, params, list, active, o) {
  o = o || {};
  const items = [];
  if (o.all) items.push({ v: '', label: o.all });
  list.forEach(s => items.push({ v: s.season, label: s.season + (s.inProgress ? ' &middot; live' : '') }));
  return `<div class="pills">${items.map(x => `<a class="pill-btn ${x.v === (active || '') ? 'active' : ''}"
    href="${hrefWith(route, Object.assign({}, params, { season: x.v }))}">${x.label}</a>`).join('')}</div>`;
}

function tabs(route, params, items, active, key) {
  key = key || 'tab';
  return `<div class="tabs">${items.map(([k, label]) => `<a class="tab ${k === active ? 'active' : ''}"
    href="${hrefWith(route, Object.assign({}, params, { [key]: k }))}">${label}</a>`).join('')}</div>`;
}

/* ------------------------------ deferred sections ------------------ */
/* Some sections need more data than the main load (every season's
   transactions, market values). The page paints right away with a
   placeholder; app.js runs each deferred filler afterwards. */
let DEFERRED = [];
function deferred(id, fn, placeholder) {
  DEFERRED.push({ id, fn });
  return `<div id="${id}">${placeholder != null ? placeholder : skeleton()}</div>`;
}

/* ------------------------------ the "you" banner -------------------- */
function youBanner() {
  const id = viewerId();
  if (!id || !MODEL.managers[id]) return '';
  const all = MODEL.allStats.slice().sort((a, b) => b.winPct - a.winPct || b.pf - a.pf);
  const me = MODEL.allStatsBy[id];
  if (!me) return '';
  const rank = all.findIndex(a => a.ownerId === id) + 1;
  const m = mgr(id);
  return `<div class="you-banner">
    <div class="you-banner-label">Your stats &middot; ${esc(m.name)} &middot; all seasons</div>
    <div class="you-banner-row">
      <span>Rank <b>#${rank}</b> of ${all.length}</span>
      <span>Record <b>${wlt(me.w, me.l, me.t)}</b></span>
      <span>Avg PF <b>${n1(me.ppg)}</b></span>
      <span>Eff% <b>${me.eff ? pct(me.eff) : '—'}</b></span>
      <span>Luck <b class="${me.luck > 0 ? 'pos-t' : me.luck < 0 ? 'neg-t' : ''}">${signed(me.luck, n0) || '0'}</b></span>
      <span>Avg PA <b>${n1(me.papg)}</b></span>
      <span>Titles <b>${m.titles.length}</b></span>
    </div>
  </div>`;
}

/* ------------------------------ memoised heavy work ----------------- */
/* Grading every trade, every pickup and every draft, or simulating the
   season, is done once per data load and reused by every page. */
const MEMO = new Map();
function memo(key, fn) {
  const k = (MODEL ? MODEL.builtAt : 0) + '|' + key;
  if (!MEMO.has(k)) {
    const v = fn();
    MEMO.set(k, v);
    if (v && typeof v.catch === 'function') v.catch(() => MEMO.delete(k));
  }
  return MEMO.get(k);
}
const getTxns = () => memo('txns', () => loadAllTransactions());
const getTrades = () => memo('trades', async () => gradeAllTrades(await getTxns()));
const getWaivers = () => memo('waivers', async () => gradeAllWaivers(await getTxns()));
const getDrafts = () => memo('drafts', () => gradeDrafts());

/** Owner id of a roster in a given season. */
function ownerOfRoster(season, rid) {
  const s = MODEL.seasons.find(x => x.season === String(season));
  const t = s && s.byRoster[rid];
  return t ? t.ownerId : null;
}

/** Seasons for a season filter value ('' = every started season). */
function seasonsFor(season) {
  const started = MODEL.seasons.filter(s => s.started);
  if (!season) return started;
  return started.filter(s => s.season === season);
}
