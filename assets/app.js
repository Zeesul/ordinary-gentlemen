/* ===================================================================
   app.js — routing, startup, the sidebar, and generic page wiring
   (sortable tables, "show all" buttons, filters that live in the URL).
   Loads last.
   =================================================================== */

let AFTER = [];                 // per-render hooks registered by views
const after = fn => { AFTER.push(fn); };

function parseHash() {
  const raw = (location.hash || '#/').replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const params = {};
  new URLSearchParams(query || '').forEach((v, k) => { params[k] = v; });
  return { route: path || 'home', params };
}

function setHash(route, params) {
  location.hash = hrefWith(route, params).slice(1);
}

const TITLES = {
  home: 'Overview', standings: 'Standings', playoffs: 'Playoffs', champions: 'Champions',
  week: 'This Week', outlook: 'Outlook', managers: 'Managers', manager: 'Manager',
  rosters: 'Rosters', h2h: 'Head to Head', trades: 'Trades', waivers: 'Waivers',
  draft: 'Draft', records: 'Record Book', money: 'Money'
};
const NAV_ALIAS = { manager: 'managers' };

function markNav(route) {
  const r = NAV_ALIAS[route] || route;
  $$('#sidenav .nav-link').forEach(a => {
    const on = a.dataset.route === r;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

function closeDrawer() {
  document.body.classList.remove('nav-open');
  const b = $('#menuBtn');
  if (b) b.setAttribute('aria-expanded', 'false');
}

/* ------------------------------ generic wiring --------------------- */
function sortTable(th) {
  const table = th.closest('table');
  const wrap = th.closest('.table-wrap');
  const tbody = table.tBodies[0];
  const col = Number(th.dataset.col);
  const type = th.dataset.type;
  const dir = th.dataset.dir === 'desc' ? 'asc' : (th.dataset.dir === 'asc' ? 'desc' : (type === 'num' ? 'desc' : 'asc'));
  $$('th', table).forEach(h => {
    delete h.dataset.dir;
    const a = $('.arrow', h);
    if (a) a.remove();
  });
  th.dataset.dir = dir;
  th.insertAdjacentHTML('beforeend', `<span class="arrow">${dir === 'desc' ? '&darr;' : '&uarr;'}</span>`);
  const rows = Array.from(tbody.rows).filter(r => !r.classList.contains('empty-row'));
  const val = r => {
    const c = r.cells[col];
    if (!c) return null;
    if (c.dataset.v != null && c.dataset.v !== '') return type === 'num' ? Number(c.dataset.v) : c.dataset.v;
    const t = c.textContent.trim();
    if (type === 'num') {
      const n = parseFloat(t.replace(/[,$%±+]/g, '').replace(/^−/, '-'));
      return isNaN(n) ? null : n;
    }
    return t.toLowerCase();
  };
  rows.sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const c = type === 'num' ? x - y : String(x).localeCompare(String(y));
    return dir === 'desc' ? -c : c;
  });
  const limit = wrap && wrap.dataset.limit && !wrap.classList.contains('show-all') ? Number(wrap.dataset.limit) : 0;
  rows.forEach((r, i) => {
    tbody.appendChild(r);
    const rk = r.querySelector('td.rank');
    if (rk && table.dataset.rerank !== 'no') rk.textContent = i + 1;
    if (limit) r.classList.toggle('extra', i >= limit);
  });
}

function wirePage(root) {
  // sortable tables
  $$('th.sortable', root).forEach(th => {
    if (th.dataset.wired) return;
    th.dataset.wired = '1';
    th.addEventListener('click', () => sortTable(th));
  });
  // "show all N" under long tables
  $$('.table-more', root).forEach(btn => {
    if (btn.dataset.wired || btn.dataset.expand) return;
    const wrap = btn.closest('.table-wrap');
    if (!wrap) return;
    btn.dataset.wired = '1';
    const limit = $$('tbody tr', wrap).filter(r => !r.classList.contains('extra')).length;
    wrap.dataset.limit = limit;
    btn.addEventListener('click', () => {
      const open = wrap.classList.toggle('show-all');
      btn.textContent = open ? 'Show fewer' : 'Show all ' + btn.dataset.more;
    });
  });
  // column expanders: <button data-cols="#tableId">
  $$('[data-cols]', root).forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      const t = $(btn.dataset.cols);
      if (!t) return;
      const open = t.classList.toggle('show-cols');
      btn.textContent = open ? btn.dataset.less : btn.dataset.moreLabel;
    });
  });
  // generic expanders: <button data-expand="#id">
  $$('[data-expand]', root).forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      const t = $(btn.dataset.expand);
      if (!t) return;
      const open = t.classList.toggle('show-all');
      btn.textContent = open ? btn.dataset.less : btn.dataset.moreLabel;
    });
  });
  // tab-style pickers that swap panels in place: a [data-pick-group=".panelClass"]
  // container of buttons, each with data-pick="panelId". The choice is written to
  // the URL (data-pick-param / data-pick-value) without re-rendering the page.
  $$('[data-pick]', root).forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      const group = btn.closest('[data-pick-group]');
      if (!group) return;
      $$('[data-pick]', group).forEach(b => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
      $$(group.dataset.pickGroup).forEach(p => { p.hidden = p.id !== btn.dataset.pick; });
      if (btn.dataset.pickParam) {
        const { route, params } = parseHash();
        params[btn.dataset.pickParam] = btn.dataset.pickValue;
        try { history.replaceState(null, '', hrefWith(route, params)); } catch (_) { /* ignore */ }
      }
    });
  });
  // selects and checkboxes that live in the URL
  $$('select[data-param]', root).forEach(sel => {
    if (sel.dataset.wired) return;
    sel.dataset.wired = '1';
    sel.addEventListener('change', () => {
      const { route, params } = parseHash();
      const next = Object.assign({}, params, { [sel.dataset.param]: sel.value });
      if (sel.dataset.reset) sel.dataset.reset.split(',').forEach(k => { delete next[k]; });
      setHash(sel.dataset.route || route, next);
    });
  });
  $$('input[type=checkbox][data-param]', root).forEach(cb => {
    if (cb.dataset.wired) return;
    cb.dataset.wired = '1';
    cb.addEventListener('change', () => {
      const { route, params } = parseHash();
      setHash(route, Object.assign({}, params, { [cb.dataset.param]: cb.checked ? '1' : '' }));
    });
  });
  wireCharts(root);
}

/* ------------------------------ render ----------------------------- */
let renderToken = 0;

async function render() {
  const { route, params } = parseHash();
  const view = views[route] || views.home;
  const host = $('#view');
  const token = ++renderToken;
  DEFERRED = [];
  AFTER = [];

  markNav(route);
  closeDrawer();
  const title = route === 'manager' && MODEL.managers[params.id] ? MODEL.managers[params.id].name
    : (TITLES[route] || TITLES.home);
  $('#pageTitle').textContent = title;
  document.title = route === 'home' ? 'The League of Ordinary Gentlemen'
    : `${title} | The League of Ordinary Gentlemen`;

  let html;
  try {
    const out = view(params);
    if (out && typeof out.then === 'function') {
      host.innerHTML = `<div class="loading-page"><div class="spinner"></div><div class="small">Loading&hellip;</div></div>`;
      html = await out;
      if (token !== renderToken) return;     // a newer navigation won
    } else {
      html = out;
    }
  } catch (err) {
    console.error(err);
    if (token !== renderToken) return;
    html = empty(`Something went wrong loading this page.<br><span class="small">${esc(err.message || String(err))}</span>`);
  }
  const banner = route === 'manager' ? '' : youBanner();
  host.innerHTML = banner + html + footerHtml();
  wirePage(host);
  AFTER.forEach(fn => { try { fn(host); } catch (e) { console.error(e); } });

  // deferred sections fill in as their data arrives
  const jobs = DEFERRED;
  DEFERRED = [];
  jobs.forEach(job => {
    Promise.resolve().then(job.fn).then(out => {
      if (token !== renderToken) return;
      const el = document.getElementById(job.id);
      if (!el) return;
      el.innerHTML = out || '';
      wirePage(el);
    }).catch(err => {
      console.error('[deferred]', job.id, err);
      const el = document.getElementById(job.id);
      if (el && token === renderToken) el.innerHTML = empty('This section could not load right now. Try the refresh button.');
    });
  });

  // Keep the reader in place when only a filter on the same page changed.
  const samePage = route === render._lastRoute;
  render._lastRoute = route;
  if (!samePage || params.top) window.scrollTo(0, 0);
  const focusEl = params.focus && document.getElementById(params.focus);
  if (focusEl) focusEl.scrollIntoView({ block: 'start' });
}

function footerHtml() {
  return `<footer class="footer">
    Data pulled live from the Sleeper API and built in your browser. Player trade values from
    ${fcLink('FantasyCalc.com')} (redraft, 1 QB, 12 teams, PPR).
  </footer>`;
}

/* ------------------------------ sidebar ---------------------------- */
function fillSidebar() {
  const sel = $('#viewer');
  const current = viewerId();
  const active = MODEL.managerList.filter(m => m.active).sort((a, b) => a.name.localeCompare(b.name));
  const former = MODEL.managerList.filter(m => !m.active && !/^Unknown/.test(m.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const opt = m => `<option value="${esc(m.id)}" ${m.id === current ? 'selected' : ''}>${esc(m.name)}</option>`;
  sel.innerHTML = `<option value="">Everyone</option>
    <optgroup label="Current managers">${active.map(opt).join('')}</optgroup>
    ${former.length ? `<optgroup label="Former managers">${former.map(opt).join('')}</optgroup>` : ''}`;
  if (current && !MODEL.managers[current]) setViewer('');

  const first = MODEL.seasons[0];
  const cur = MODEL.currentSeason;
  const sub = $('#brandSub');
  if (sub && first && cur) sub.innerHTML = `Est. ${esc(first.season)} &middot; ${cur.numTeams} teams &middot; PPR`;
  const live = $('#liveBadge');
  if (live) live.hidden = !MODEL.liveSeason;
}

function stamp(raw) {
  const mins = Math.round((Date.now() - Math.max(raw.fetchedAt, raw.liveAt || 0)) / 60000);
  const txt = mins < 1 ? 'Synced just now' : `Synced ${mins < 60 ? mins + 'm' : Math.round(mins / 60) + 'h'} ago`;
  const a = $('#syncNote');
  if (a) a.textContent = txt;
  const b = $('#cacheNote');
  if (b) b.textContent = txt;
}

/* ------------------------------ startup --------------------------- */
async function start(force) {
  boot.show('Contacting Sleeper…');
  let raw = force ? null : readCache();
  if (!raw) {
    try {
      raw = await loadEverything();
      writeCache(raw);
    } catch (err) {
      console.error(err);
      boot.say('Could not reach Sleeper. Check your connection and refresh the page.');
      return;
    }
  } else {
    boot.say('Loaded from cache');
    // the player list is cached separately; a stale one reloads in the background
    await loadPlayers().catch(() => null);
  }
  MODEL = buildModel(raw);
  buildAnalytics(MODEL);
  fillSidebar();
  stamp(raw);
  clearInterval(start._stamp);
  start._stamp = setInterval(() => stamp(raw), 60000);
  boot.hide();
  $('#refreshBtn').classList.remove('spin');
  render();
  // History is cached for hours, but a live season's scores shouldn't be.
  // Re-pull just that season in the background, then quietly redraw.
  if (!force && raw.seasons.some(s => s.inProgress) &&
      Date.now() - (raw.liveAt || raw.fetchedAt) > CONFIG.liveMins * 60000) {
    refreshLive(raw).then(fresh => {
      if (!fresh) return;
      writeCache(fresh);
      MODEL = buildModel(fresh);
      buildAnalytics(MODEL);
      fillSidebar();
      stamp(fresh);
      const { route } = parseHash();
      if (['home', 'week', 'outlook', 'standings', 'manager', 'rosters'].indexOf(route) !== -1) render();
    }).catch(err => console.warn('[live refresh]', err));
  }
}

window.addEventListener('hashchange', () => { if (MODEL) render(); });

document.addEventListener('DOMContentLoaded', () => {
  $('#menuBtn').addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    $('#menuBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  $('#scrim').addEventListener('click', closeDrawer);
  $('#viewer').addEventListener('change', e => {
    setViewer(e.target.value);
    if (MODEL) render();
  });
  $('#refreshBtn').addEventListener('click', () => {
    $('#refreshBtn').classList.add('spin');
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.indexOf('log_') === 0 && k !== CONFIG.viewerKey && k.indexOf(CONFIG.playerKey) !== 0) {
          localStorage.removeItem(k);
        }
      });
    } catch (_) { /* ignore */ }
    Object.keys(TXN_MEMO).forEach(k => { delete TXN_MEMO[k]; });
    Object.keys(PROJ_MEMO).forEach(k => { delete PROJ_MEMO[k]; });
    Object.assign(VALUES, { live: null, seasons: [], history: {}, loading: {}, proj: null, ready: null });
    MEMO.clear();
    start(true);
  });
  start(false);
});
