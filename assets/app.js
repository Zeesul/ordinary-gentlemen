/* ===================================================================
   app.js — routing, startup and page wiring.
   Loads last, after data.js / model.js / charts.js / views.js.
   =================================================================== */

function parseHash() {
  const raw = (location.hash || '#/').replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const params = {};
  new URLSearchParams(query || '').forEach((v, k) => { params[k] = v; });
  return { route: path || 'home', params };
}

function setHash(route, params) {
  const q = new URLSearchParams();
  Object.keys(params || {}).forEach(k => { if (params[k]) q.set(k, params[k]); });
  const s = q.toString();
  location.hash = '#/' + route + (s ? '?' + s : '');
}

function markNav(route) {
  $$('.mainnav a').forEach(a => {
    const r = a.dataset.route;
    a.classList.toggle('active', r === route ||
      (r === 'managers' && route === 'manager'));
  });
}

/* ---- things that need hooking up after a page is painted ---------- */
function wirePage(route) {
  const host = $('#view');

  // season chips (standings, playoffs, draft, trades)
  const chips = $('#seasonChips', host);
  if (chips) {
    chips.addEventListener('click', e => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      setHash(chips.dataset.route || route, { season: btn.dataset.season });
    });
  }

  // chart mode toggle on the standings page
  const chartChips = $('#chartChips', host);
  if (chartChips) {
    chartChips.addEventListener('click', e => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      setHash('standings', {
        season: chartChips.dataset.season,
        chart: btn.dataset.chart
      });
    });
  }

  // record book filters
  const filters = $('#recFilters', host);
  if (filters) {
    const apply = () => setHash('records', {
      mgr: $('#recMgr').value,
      season: $('#recSeason').value
    });
    $('#recMgr').addEventListener('change', apply);
    $('#recSeason').addEventListener('change', apply);
    const clear = $('#recClear');
    if (clear) clear.addEventListener('click', () => setHash('records', {}));
  }

  // managers page sorting + qualification toggle
  const mgrTools = $('#mgrTools', host);
  if (mgrTools) {
    const { params } = parseHash();
    mgrTools.addEventListener('click', e => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      setHash('managers', { sort: btn.dataset.sort, qual: params.qual });
    });
    const q = $('#qualOnly', host);
    if (q) q.addEventListener('change', () =>
      setHash('managers', { sort: params.sort, qual: q.checked ? '1' : '' }));
  }

  // head-to-head: click a cell for the full series
  const h2hTable = $('.h2h', host);
  if (h2hTable) {
    h2hTable.addEventListener('click', e => {
      const cell = e.target.closest('td.cell');
      if (!cell || !cell.dataset.a) return;
      setHash('h2h', { a: cell.dataset.a, b: cell.dataset.b });
    });
  }
  const h2hClear = $('#h2hClear', host);
  if (h2hClear) h2hClear.addEventListener('click', () => setHash('h2h', {}));
  const h2hActive = $('#h2hActive', host);
  if (h2hActive) h2hActive.addEventListener('change', () =>
    setHash('h2h', { active: h2hActive.checked ? '1' : '' }));

  wireCharts(host);

  // draft countdown, ticking every second
  clearInterval(wirePage._countdown);
  const cd = $('#draftCountdown', host);
  if (cd) {
    const ts = Number(cd.dataset.ts);
    const nums = {};
    $$('.dt-num', cd).forEach(n => { nums[n.dataset.u] = n; });
    const tick = () => {
      let diff = Math.floor((ts - Date.now()) / 1000);
      if (diff <= 0) {
        clearInterval(wirePage._countdown);
        $('.draft-timer', cd).innerHTML =
          '<div class="dt-live">It\'s draft day — good luck, gentlemen.</div>';
        return;
      }
      nums.d.textContent = Math.floor(diff / 86400);
      nums.h.textContent = String(Math.floor(diff % 86400 / 3600)).padStart(2, '0');
      nums.m.textContent = String(Math.floor(diff % 3600 / 60)).padStart(2, '0');
      nums.s.textContent = String(diff % 60).padStart(2, '0');
    };
    tick();
    wirePage._countdown = setInterval(tick, 1000);
  }
}

const TITLES = {
  home: '', standings: 'Standings', playoffs: 'Playoffs', champions: 'Trophy Room',
  h2h: 'Head to Head', records: 'Record Book', managers: 'Managers',
  manager: 'Manager', draft: 'Draft History', trades: 'Transactions',
  money: 'Money'
};

let renderToken = 0;

async function render() {
  const { route, params } = parseHash();
  const view = views[route] || views.home;
  const host = $('#view');
  const token = ++renderToken;

  markNav(route);
  $('#mainnav').classList.remove('open');

  try {
    const out = view(params);
    if (out && typeof out.then === 'function') {
      host.innerHTML = `<div class="loading-page">
        <div class="boot-spinner"></div>
        <div class="muted small">Loading…</div></div>`;
      const html = await out;
      if (token !== renderToken) return;   // a newer navigation won
      host.innerHTML = html;
    } else {
      host.innerHTML = out;
    }
  } catch (err) {
    console.error(err);
    if (token !== renderToken) return;
    host.innerHTML = `<div class="empty">Something went wrong loading this page.<br>
      <span class="small">${esc(err.message || String(err))}</span></div>`;
  }

  wirePage(route);

  const base = 'The League of Ordinary Gentlemen';
  const extra = route === 'manager' && MODEL && MODEL.managers[params.id]
    ? MODEL.managers[params.id].name : TITLES[route];
  document.title = extra ? `${extra} | ${base}` : base;

  // keep the reader in place when they're only changing a filter
  if (!params.a && !params.mgr && !params.sort && !params.chart) window.scrollTo(0, 0);
}

/* ------------------------------ startup --------------------------- */
function stamp(raw) {
  const note = $('#cacheNote');
  if (!note) return;
  const mins = Math.round((Date.now() - raw.fetchedAt) / 60000);
  note.textContent = mins < 1 ? 'Data loaded just now'
    : `Data loaded ${mins} minute${mins === 1 ? '' : 's'} ago`;
}

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
  }
  MODEL = buildModel(raw);
  stamp(raw);
  boot.hide();
  render();
}

window.addEventListener('hashchange', () => { if (MODEL) render(); });

document.addEventListener('DOMContentLoaded', () => {
  $('#navToggle').addEventListener('click', () => {
    const nav = $('#mainnav');
    nav.classList.toggle('open');
    $('#navToggle').setAttribute('aria-expanded', nav.classList.contains('open'));
  });
  $('#refreshBtn').addEventListener('click', () => {
    Object.keys(localStorage).forEach(k => {
      if (k.indexOf('log_') === 0) localStorage.removeItem(k);
    });
    start(true);
  });
  start(false);
});
