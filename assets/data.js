/* ===================================================================
   data.js — config, helpers, and everything that talks to Sleeper.
   Loaded first; everything else builds on what's declared here.
   =================================================================== */

const CONFIG = {
  leagueId: '1353221128079839232',
  api: 'https://api.sleeper.app/v1',
  // v9: every season now keeps its weekly lineups (starters + every
  // rostered player's points), which efficiency, trade and waiver grades need.
  cacheKey: 'log_site_data_v9',
  playerKey: 'log_players_v2',
  txnKey: 'log_txn_v2_',
  projKey: 'log_proj_v1_',
  valuesLiveKey: 'log_values_live_v1',
  valuesSnapKey: 'log_values_snap_v1_',
  viewerKey: 'log_viewer',
  projApi: 'https://api.sleeper.app',
  // DynastyProcess publishes weekly FantasyPros-based trade values on GitHub.
  // assets/values-history.json holds every in-season week back to 2022; the
  // current week is read live, and anything in between is looked up by date.
  valuesHistory: 'assets/values-history.json',
  valuesLive: 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/values-players.csv',
  valuesRaw: 'https://raw.githubusercontent.com/dynastyprocess/data/',
  valuesCommits: 'https://api.github.com/repos/dynastyprocess/data/commits?path=files/values-players.csv&per_page=1&until=',
  valuesLiveHours: 12,
  liveMins: 3,            // a live season's scores are re-pulled after this long
  projCacheMins: 60,
  cacheHours: 3,
  playerCacheDays: 7,
  concurrency: 6
};

let MODEL = null;   // assigned once the model is built (see app.js)

/* ------------------------------------------------------------------
   Departed managers
   ------------------------------------------------------------------
   When someone leaves the league, Sleeper deletes them: the roster's
   owner is nulled, they vanish from the members list, and even the
   draft board forgets who made their picks. Their team still has a
   real record, so it stays in the history as "Unknown".

   You know who they were — fill them in here and they'll be named
   everywhere on the site. The key is "<season>:<rosterId>", which the
   site shows next to any unknown team.

   Example:
     '2022:5': { name: 'Danny', team: 'Danny’s Dynasty' },
   ------------------------------------------------------------------ */
const MANAGER_OVERRIDES = {
  // '2022:5': { name: '', team: '' },
  // '2024:7': { name: '', team: '' },
};

/* ------------------------------ helpers --------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const n0 = v => Math.round(v).toLocaleString();
const n1 = v => (Math.round(v * 10) / 10).toFixed(1);
const n2 = v => (Math.round(v * 100) / 100).toFixed(2);
const pct = v => (v * 100).toFixed(1) + '%';
const pct0 = v => Math.round(v * 100) + '%';
const signed = (v, f) => (v > 0 ? '+' : v < 0 ? '-' : '') + (f || n1)(Math.abs(v));
const range = (a, b) => (b < a ? [] : Array.from({ length: b - a + 1 }, (_, i) => a + i));
const sum = arr => arr.reduce((a, b) => a + b, 0);
const mean = arr => arr.length ? sum(arr) / arr.length : 0;
const stdev = arr => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(sum(arr.map(x => (x - m) * (x - m))) / (arr.length - 1));
};
const median = arr => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b), h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
const ordinal = i => {
  const s = ['th', 'st', 'nd', 'rd'], v = i % 100;
  return i + (s[(v - 20) % 10] || s[v] || s[0]);
};
const fmtDate = ms => {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtMonth = ms => new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
/** UTC calendar date of a timestamp, the way DynastyProcess dates its files. */
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);

/** "2h ago" / "3d ago" style relative time. */
const timeAgo = ms => {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.round(hours / 24);
  if (days < 7) return days + 'd ago';
  return fmtDate(ms);
};

/** Today in the local timezone, formatted the way Sleeper dates its games. */
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26), for win probabilities. */
function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
    0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Small seeded PRNG, so a simulation gives the same answer on every reload. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function safeGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
}

/** Run an async fn over items with limited concurrency. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function getJSON(path, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(CONFIG.api + path, { cache: 'no-store' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      if (attempt === tries) throw err;
      await new Promise(r => setTimeout(r, 250 * attempt));
    }
  }
}

/* ------------------------------ boot overlay ---------------------- */
const boot = {
  done: 0, total: 1,
  show(msg) {
    const b = $('#boot');
    if (b) b.classList.remove('hidden');
    if (msg) this.say(msg);
  },
  say(msg) { const n = $('#bootStatus'); if (n) n.textContent = msg; },
  plan(total) { this.total = Math.max(total, 1); this.done = 0; this.paint(); },
  tick(by = 1) { this.done += by; this.paint(); },
  paint() {
    const bar = $('#bootBar');
    if (bar) bar.style.width = Math.min(100, (this.done / this.total) * 100) + '%';
  },
  hide() { const b = $('#boot'); if (b) b.classList.add('hidden'); }
};

/* ------------------------------ league history -------------------- */
async function loadLeagueChain() {
  const chain = [];
  let id = CONFIG.leagueId;
  const seen = new Set();
  while (id && id !== '0' && !seen.has(id) && chain.length < 40) {
    seen.add(id);
    const lg = await getJSON('/league/' + id);
    if (!lg) break;
    chain.push(lg);
    id = lg.previous_league_id;
  }
  return chain.reverse(); // oldest season first
}

function avatarURL(user) {
  if (user && user.metadata && user.metadata.avatar) return user.metadata.avatar;
  if (user && user.avatar) return 'https://sleepercdn.com/avatars/thumbs/' + user.avatar;
  return 'https://sleepercdn.com/images/v2/icons/player_default.webp';
}

const r2 = v => Math.round((v || 0) * 100) / 100;

async function loadSeason(lg) {
  const id = lg.league_id;
  const st = lg.settings || {};
  const playoffStart = st.playoff_week_start || 15;
  const started = lg.status !== 'pre_draft' && lg.status !== 'drafting';

  // how many weeks to pull: regular season plus the playoff rounds
  const lastLeg = Math.min(18, Math.max(st.last_scored_leg || 0, playoffStart + 2));

  const [users, rosters, wb, lb, drafts] = await Promise.all([
    getJSON(`/league/${id}/users`),
    getJSON(`/league/${id}/rosters`),
    started ? getJSON(`/league/${id}/winners_bracket`).catch(() => null) : null,
    started ? getJSON(`/league/${id}/losers_bracket`).catch(() => null) : null,
    getJSON(`/league/${id}/drafts`).catch(() => null)
  ]);
  boot.tick();

  const userById = {};
  (users || []).forEach(u => { userById[u.user_id] = u; });

  const teams = (rosters || []).map(r => {
    const u = userById[r.owner_id] || null;
    const s = r.settings || {};
    return {
      rosterId: r.roster_id,
      orphan: !r.owner_id,
      ownerId: r.owner_id || ('departed-' + lg.season + '-' + r.roster_id),
      manager: u ? (u.display_name || 'Unknown') : `Unknown (${lg.season})`,
      teamName: (u && u.metadata && u.metadata.team_name) ||
        (u ? u.display_name : `Team ${r.roster_id} · left the league`),
      avatar: avatarURL(u),
      wins: s.wins || 0,
      losses: s.losses || 0,
      ties: s.ties || 0,
      pf: (s.fpts || 0) + (s.fpts_decimal || 0) / 100,
      pa: (s.fpts_against || 0) + (s.fpts_against_decimal || 0) / 100,
      ppts: (s.ppts || 0) + (s.ppts_decimal || 0) / 100,
      moves: s.total_moves || 0,
      waiverUsed: s.waiver_budget_used || 0,
      players: r.players || [],
      starters: r.starters || [],
      reserve: r.reserve || [],
      taxi: r.taxi || []
    };
  });

  const rosterById = {};
  (rosters || []).forEach(r => { rosterById[r.roster_id] = r; });

  // ---- every week's scores (regular season + playoffs) --------------
  const games = [];      // regular season head-to-head, played only
  const scores = {};     // { week: { rosterId: points } }
  // Every scheduled pairing, played or not, so the site can show the week
  // ahead. `games` stays results-only: the record book and head-to-head
  // must never see a matchup that hasn't happened.
  const pairings = {};   // { week: [{ week, a, ap, b, bp, played }] }
  /* Per-week lineups for every season:
       lineups[week][rosterId] = { st: starters, sp: starter points,
                                   pp: { playerId: points } for the whole roster }
     Efficiency (best possible lineup), trade grades (points a player scored
     in your starting lineup) and waiver grades all read from this. */
  const lineups = {};
  if (started && lastLeg >= 1) {
    const weeks = range(1, lastLeg);
    const results = await pool(weeks, CONFIG.concurrency, async w => {
      const data = await getJSON(`/league/${id}/matchups/${w}`).catch(() => null);
      boot.tick();
      return { week: w, data };
    });
    results.forEach(({ week, data }) => {
      if (!Array.isArray(data) || !data.length) return;
      const wk = {};
      let anyPoints = false;
      data.forEach(m => {
        const p = m.points || 0;
        wk[m.roster_id] = p;
        if (p > 0) anyPoints = true;
      });
      if (anyPoints) scores[week] = wk;

      const byMatchup = {};
      data.forEach(m => {
        if (m.matchup_id == null) return;
        (byMatchup[m.matchup_id] = byMatchup[m.matchup_id] || []).push(m);
      });
      const wkPairs = [];
      Object.values(byMatchup).forEach(pair => {
        if (pair.length !== 2) return;
        const [a, b] = pair;
        const ap = a.points || 0, bp = b.points || 0;
        const played = ap > 0 || bp > 0;
        wkPairs.push({ week, a: a.roster_id, ap, b: b.roster_id, bp, played });
        if (week < playoffStart && played) {
          games.push({ week, a: a.roster_id, ap, b: b.roster_id, bp });
        }
      });
      if (wkPairs.length) pairings[week] = wkPairs;

      const byRoster = {};
      data.forEach(m => {
        const pp = {};
        Object.keys(m.players_points || {}).forEach(pid => { pp[pid] = r2(m.players_points[pid]); });
        let starters = m.starters;
        let startersPoints = m.starters_points;
        // A week's matchup snapshot can come back with starters: null while the
        // roster's own lineup is fully set (see sleeper-api-gotchas #5). Fall
        // back to the roster's current starters, priced from this week.
        if (!starters || !starters.length) {
          const r = rosterById[m.roster_id];
          if (r && r.starters && r.starters.length) {
            starters = r.starters;
            startersPoints = starters.map(pid => pp[pid] || 0);
          }
        }
        byRoster[m.roster_id] = {
          st: starters || [],
          sp: (startersPoints || []).map(r2),
          pp
        };
      });
      lineups[week] = byRoster;
    });
  } else {
    boot.tick(Math.max(lastLeg, 0));
  }

  // ---- postseason ---------------------------------------------------
  const bracketPick = (bracket, place) => {
    if (!Array.isArray(bracket)) return null;
    const m = bracket.find(x => x.p === place);
    return m ? { w: m.w, l: m.l } : null;
  };
  const final = bracketPick(wb, 1);
  const third = bracketPick(wb, 3);
  const fifth = bracketPick(wb, 5);
  const toilet = bracketPick(lb, 1);

  let championRoster = final ? final.w : null;
  // Sleeper copies latest_league_winner_roster_id onto a rolled-over league, so
  // an in-progress season carries the PREVIOUS season's winner. Only trust this
  // fallback once this season has actually finished.
  if (!championRoster && lg.status === 'complete' &&
      lg.metadata && lg.metadata.latest_league_winner_roster_id) {
    championRoster = Number(lg.metadata.latest_league_winner_roster_id);
  }

  // Sleeper seeds next season's bracket the moment the league rolls over, so a
  // team that has played no games can already appear in a "playoff" matchup.
  // The bracket only means something once the season has reached playoff weeks.
  const playoffsUnderway = lg.status === 'complete' ||
    (st.last_scored_leg || 0) >= playoffStart;

  const playoffRosters = new Set();
  if (playoffsUnderway) {
    (Array.isArray(wb) ? wb : []).forEach(m => {
      if (typeof m.t1 === 'number') playoffRosters.add(m.t1);
      if (typeof m.t2 === 'number') playoffRosters.add(m.t2);
    });
  }

  // ---- draft ---------------------------------------------------------
  let draft = null;
  const d0 = Array.isArray(drafts) && drafts.length ? drafts[0] : null;
  if (d0 && d0.status === 'complete') {
    const picksRaw = await getJSON(`/draft/${d0.draft_id}/picks`).catch(() => null);
    if (Array.isArray(picksRaw) && picksRaw.length) {
      draft = {
        type: d0.type,
        rounds: (d0.settings && d0.settings.rounds) || 0,
        picks: picksRaw.map(p => {
          const md = p.metadata || {};
          return {
            round: p.round,
            pick: p.pick_no,
            slot: p.draft_slot,
            rosterId: p.roster_id,
            pickedBy: p.picked_by || null,
            playerId: p.player_id,
            player: [md.first_name, md.last_name].filter(Boolean).join(' ') || 'Unknown Player',
            position: md.position || '',
            team: md.team || '',
            keeper: !!p.is_keeper
          };
        })
      };
    }
  }
  boot.tick();

  /* ---- rescue orphaned rosters ---------------------------------------
     When a manager leaves, Sleeper nulls out the roster's owner_id and
     the team shows up as "Vacant". The draft board still records who
     actually made each pick, so we can recover the real person — and,
     because we recover their true user id, their history merges with any
     other season they played. */
  const orphans = teams.filter(t => t.orphan);
  if (orphans.length && draft) {
    const pickerByRoster = {};
    draft.picks.forEach(p => {
      if (p.pickedBy && p.rosterId != null && !pickerByRoster[p.rosterId]) {
        pickerByRoster[p.rosterId] = p.pickedBy;
      }
    });
    await pool(orphans, 3, async t => {
      const uid = pickerByRoster[t.rosterId];
      if (!uid) return;
      let u = userById[uid];
      if (!u) u = await getJSON('/user/' + uid).catch(() => null);
      if (!u) return;
      t.ownerId = uid;
      t.manager = u.display_name || t.manager;
      if (!t.teamName || t.teamName.indexOf('Team ') === 0 || t.orphan) {
        t.teamName = (u.metadata && u.metadata.team_name) || u.display_name || t.teamName;
      }
      t.avatar = avatarURL(u);
      t.orphan = false;
    });
  }

  /* Anything still unidentified gets whatever name you've supplied. */
  teams.forEach(t => {
    if (!t.orphan) return;
    t.key = lg.season + ':' + t.rosterId;
    const o = MANAGER_OVERRIDES[t.key];
    if (o && o.name) {
      t.manager = o.name;
      t.teamName = o.team || o.name;
      t.ownerId = o.mergeWith || ('named-' + o.name.toLowerCase().replace(/\s+/g, '-'));
      t.orphan = false;
    }
  });

  return {
    season: lg.season,
    leagueId: id,
    status: lg.status,
    complete: lg.status === 'complete',
    started,
    inProgress: started && lg.status !== 'complete',
    numTeams: lg.total_rosters || teams.length,
    draftStart: d0 && d0.start_time ? d0.start_time : null,
    draftId: d0 ? d0.draft_id : null,
    draftStatus: d0 ? d0.status : null,
    playoffStart,
    playoffRoundType: st.playoff_round_type || 0,
    playoffsUnderway,
    rosterPositions: Array.isArray(lg.roster_positions) ? lg.roster_positions : [],
    playoffTeams: st.playoff_teams || 6,
    waiverBudget: st.waiver_budget || 0,
    lastScored: st.last_scored_leg || 0,
    lastLeg,
    teams, games, scores, pairings, lineups, draft,
    winnersBracket: Array.isArray(wb) ? wb : [],
    losersBracket: Array.isArray(lb) ? lb : [],
    championRoster,
    runnerUpRoster: final ? final.l : null,
    thirdRoster: third ? third.w : null,
    fourthRoster: third ? third.l : null,
    fifthRoster: fifth ? fifth.w : null,
    sixthRoster: fifth ? fifth.l : null,
    // Winner of the losers bracket final = consolation champion.
    // Last place is NOT taken from this bracket: its placings depend on
    // league config and routinely disagree with the actual worst record.
    // The model derives last place from the final standings instead.
    consolationRoster: toilet ? toilet.w : null,
    playoffRosters: Array.from(playoffRosters)
  };
}

/* ------------------------------------------------------------------
   NFL schedule with each game's status (pre_game / in_game / complete).
   Sleeper's own week counter can lag a full day behind the last game of
   the week (sleeper-api-gotchas #3); the schedule says exactly when every
   game of a week is over, and which players are still playing.
   ------------------------------------------------------------------ */
async function loadSchedule(season) {
  try {
    const res = await fetch(`${CONFIG.projApi}/schedule/nfl/regular/${season}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const list = await res.json();
    if (!Array.isArray(list)) return null;
    return {
      season: String(season),
      games: list.map(g => ({ week: g.week, home: g.home, away: g.away, status: g.status, date: g.date }))
    };
  } catch (_) { return null; }
}

/** Re-pull just the live season (scores, lineups, schedule). */
async function refreshLive(raw) {
  const i = raw.seasons.findIndex(s => s.inProgress);
  if (i < 0) return null;
  const old = raw.seasons[i];
  const [lg, nflState, schedule] = await Promise.all([
    getJSON('/league/' + old.leagueId).catch(() => null),
    getJSON('/state/nfl').catch(() => null),
    loadSchedule(old.season)
  ]);
  if (!lg) return null;
  raw.seasons[i] = await loadSeason(lg);
  if (nflState) raw.nflState = nflState;
  if (schedule) raw.schedule = schedule;
  raw.liveAt = Date.now();
  // the live season's transactions are re-read too
  delete TXN_MEMO[old.leagueId];
  return raw;
}

async function loadEverything() {
  boot.say('Finding every season…');
  // /state/nfl is the authority on what week it currently is — the league's
  // own `leg` lags behind during the offseason.
  const [chain, nflState] = await Promise.all([
    loadLeagueChain(),
    getJSON('/state/nfl').catch(() => null)
  ]);
  boot.plan(chain.length * 21 + 2);
  // The player list (names and positions) loads alongside the seasons. It is
  // cached for a week, so most visits skip it entirely.
  const playersP = loadPlayers().catch(err => { console.warn('[players]', err); return null; })
    .then(p => { boot.tick(2); return p; });
  const seasons = [];
  for (const lg of chain) {
    boot.say(`Loading the ${lg.season} season…`);
    seasons.push(await loadSeason(lg));
  }
  const live = seasons.find(s => s.inProgress);
  const schedule = live ? await loadSchedule(live.season) : null;
  boot.say('Loading player names…');
  await playersP;
  return {
    fetchedAt: Date.now(), liveAt: Date.now(), nflState, schedule,
    leagueName: chain[chain.length - 1] ? chain[chain.length - 1].name : 'The League', seasons
  };
}

/* ------------------------------------------------------------------
   Player list — names, positions and NFL teams for every player id.
   Sleeper's full dictionary is several megabytes, so it is trimmed to
   [name, position, team] before caching, and kept for a week.
   ------------------------------------------------------------------ */
let PLAYERS = null;

async function loadPlayers() {
  if (PLAYERS) return PLAYERS;
  const hit = safeGet(CONFIG.playerKey);
  if (hit && hit.ts && Date.now() - hit.ts < CONFIG.playerCacheDays * 864e5 && hit.p) {
    PLAYERS = hit.p;
    return PLAYERS;
  }
  const raw = await getJSON('/players/nfl');
  const slim = {};
  Object.keys(raw || {}).forEach(id => {
    const p = raw[id];
    if (!p) return;
    const pos = p.position || (Array.isArray(p.fantasy_positions) ? p.fantasy_positions[0] : '') || '';
    // only fantasy-relevant positions; the rest is several thousand linemen
    if (['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'FB'].indexOf(pos) === -1) return;
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') ||
      p.last_name || id;
    slim[id] = [name, pos === 'FB' ? 'RB' : pos, p.team || ''];
  });
  PLAYERS = slim;
  // drop older shapes of this cache
  try { localStorage.removeItem('log_players_v1'); } catch (_) { /* ignore */ }
  safeSet(CONFIG.playerKey, { ts: Date.now(), p: slim });
  return PLAYERS;
}

function playerName(id) {
  if (!PLAYERS || !PLAYERS[id]) return /^\d+$/.test(String(id)) ? 'Player ' + id : String(id);
  return PLAYERS[id][0];
}
function playerMeta(id) {
  const p = PLAYERS && PLAYERS[id];
  if (p) return { name: p[0], pos: p[1], team: p[2] };
  // team defenses are keyed by their abbreviation
  if (id && !/^\d+$/.test(String(id))) return { name: String(id) + ' D/ST', pos: 'DEF', team: String(id) };
  return { name: 'Player ' + id, pos: '', team: '' };
}

/* ------------------------------------------------------------------
   Weekly projections.

   Sleeper's projections feed is undocumented but public, and it carries
   far more than points: every record has the player's name, position,
   NFL team and injury status.

   The response is ~2MB, so it is trimmed to the fields the site uses
   before being cached, and refetched hourly while a week is live.
   ------------------------------------------------------------------ */
const PROJ_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const PROJ_MEMO = {};

async function loadProjections(season, week) {
  const memoKey = season + '|' + week;
  if (PROJ_MEMO[memoKey]) return PROJ_MEMO[memoKey];

  const key = CONFIG.projKey + season + '_' + week;
  const hit = safeGet(key);
  if (hit && hit.ts && hit.p && Date.now() - hit.ts < CONFIG.projCacheMins * 60000) {
    PROJ_MEMO[memoKey] = hit.p;
    return hit.p;
  }

  const qs = PROJ_POSITIONS.map(p => 'position[]=' + p).join('&');
  let raw = null;
  try {
    const res = await fetch(
      `${CONFIG.projApi}/projections/nfl/${season}/${week}?season_type=regular&${qs}&order_by=ppr`);
    if (res.ok) raw = await res.json();
  } catch (_) { /* projections are a bonus, never fatal */ }
  if (!Array.isArray(raw)) {
    // Ad/privacy blockers sometimes eat this request (it is not under /v1 and
    // looks like a tracking endpoint). Say so — silently dropping the projections
    // looks like a bug in the site.
    console.warn('[projections] could not load week ' + week + ' — matchup ' +
      'projections will be hidden. An ad blocker may be blocking ' +
      CONFIG.projApi + '/projections/…');
    return {};
  }

  const map = {};
  raw.forEach(x => {
    const p = x.player || {};
    const pts = x.stats && x.stats.pts_ppr != null ? x.stats.pts_ppr : null;
    map[x.player_id] = {
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || String(x.player_id),
      pos: p.position || '',
      team: x.team || p.team || '',
      inj: p.injury_status || '',
      proj: pts,
      date: x.date || ''
    };
  });
  PROJ_MEMO[memoKey] = map;
  // Each week's projections are ~290KB. Only the week being viewed is ever
  // reused, so drop every older week before saving this one. Without this a
  // season's worth piles up past the browser's ~5MB limit, and from then on
  // the main data cache silently fails to save and every visit refetches.
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.indexOf(CONFIG.projKey) === 0 && k !== key) localStorage.removeItem(k);
    });
  } catch (_) { /* ignore */ }
  safeSet(key, { ts: Date.now(), p: map });
  return map;
}

/** Name/position/team for a player id, from whichever lookup we have. */
function projMeta(proj, pid) {
  const i = proj && proj[pid];
  const m = playerMeta(pid);
  if (i) return Object.assign({}, i, { name: i.name || m.name, pos: i.pos || m.pos, team: i.team || m.team });
  return { name: m.name, pos: m.pos, team: m.team, inj: '', proj: null, date: '' };
}

/* ------------------------------------------------------------------
   Transactions — loaded on demand, one season at a time.
   ------------------------------------------------------------------ */
const TXN_MEMO = {};

async function loadTransactions(season) {
  if (TXN_MEMO[season.leagueId]) return TXN_MEMO[season.leagueId];
  const key = CONFIG.txnKey + season.leagueId;
  const hit = safeGet(key);
  // A finished season never changes. A live one is re-pulled every half
  // hour so a trade made this afternoon shows up today.
  if (hit && hit.ts && (season.complete || Date.now() - hit.ts < 30 * 60e3)) {
    TXN_MEMO[season.leagueId] = hit.t;
    return hit.t;
  }

  const weeks = range(1, Math.max(season.lastLeg, 17));
  const chunks = await pool(weeks, CONFIG.concurrency, w =>
    getJSON(`/league/${season.leagueId}/transactions/${w}`).catch(() => null));

  const all = [];
  chunks.forEach((list, i) => {
    if (!Array.isArray(list)) return;
    list.forEach(t => {
      if (t.status !== 'complete') return;
      all.push({
        id: t.transaction_id,
        type: t.type,
        week: t.leg || (i + 1),
        created: t.created,
        rosters: t.roster_ids || [],
        adds: t.adds || null,
        drops: t.drops || null,
        bid: (t.settings && t.settings.waiver_bid) || 0,
        faab: Array.isArray(t.waiver_budget) ? t.waiver_budget : [],
        picks: Array.isArray(t.draft_picks) ? t.draft_picks : []
      });
    });
  });
  all.sort((a, b) => b.created - a.created);
  TXN_MEMO[season.leagueId] = all;
  safeSet(key, { ts: Date.now(), t: all });
  return all;
}

/** Every started season's transactions, oldest season first. */
async function loadAllTransactions() {
  const list = MODEL.seasons.filter(s => s.started);
  const out = await pool(list, 2, s => loadTransactions(s).catch(() => []));
  const map = {};
  list.forEach((s, i) => { map[s.season] = out[i] || []; });
  return map;
}

/* ------------------------------------------------------------------
   Market values (DynastyProcess), for trade grades and roster values.

   VALUES.history  weekly snapshots shipped with the site
   VALUES.extra    snapshots fetched at runtime for dates newer than that
   VALUES.live     this week's values, read straight from DynastyProcess
   ------------------------------------------------------------------ */
const VALUES = { history: null, extra: [], live: null, ready: null };

function parseValuesCsv(text, fpMap) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { date: '', v: {}, names: {} };
  const head = lines[0].split(',').map(h => h.replace(/"/g, ''));
  const ix = k => head.indexOf(k);
  const iName = ix('player'), iPos = ix('pos'), iVal = ix('value_1qb'), iDate = ix('scrape_date'), iFp = ix('fp_id');
  const v = {}, unmatched = [];
  let date = '';
  lines.slice(1).forEach(line => {
    // fields can contain commas inside quotes (names like "Smith, Jr.")
    const cells = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') q = !q;
      else if (c === ',' && !q) { cells.push(cur); cur = ''; }
      else cur += c;
    }
    cells.push(cur);
    const val = Number(cells[iVal]) || 0;
    if (!date && cells[iDate]) date = cells[iDate];
    if (val <= 0) return;
    const sid = fpMap[cells[iFp]];
    if (sid) v[sid] = val;
    else unmatched.push({ name: cells[iName], pos: cells[iPos], val });
  });
  // Players newer than the shipped id map (next year's rookies) are matched
  // by name and position against Sleeper's player list.
  if (unmatched.length && PLAYERS) {
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '').replace(/(jr|sr|ii|iii|iv)$/, '');
    const byName = {};
    Object.keys(PLAYERS).forEach(id => {
      const p = PLAYERS[id];
      byName[norm(p[0]) + '|' + p[1]] = id;
    });
    unmatched.forEach(u => {
      const id = byName[norm(u.name) + '|' + u.pos];
      if (id && !v[id]) v[id] = u.val;
    });
  }
  return { date, v };
}

async function loadValues() {
  if (VALUES.ready) return VALUES.ready;
  VALUES.ready = (async () => {
    try {
      const res = await fetch(CONFIG.valuesHistory);
      if (res.ok) VALUES.history = await res.json();
    } catch (err) { console.warn('[values] history', err); }
    const fpMap = (VALUES.history && VALUES.history.fp) || {};

    const hit = safeGet(CONFIG.valuesLiveKey);
    if (hit && hit.ts && Date.now() - hit.ts < CONFIG.valuesLiveHours * 3600e3 && hit.v) {
      VALUES.live = { date: hit.date, v: hit.v };
    } else {
      try {
        const res = await fetch(CONFIG.valuesLive, { cache: 'no-store' });
        if (res.ok) {
          VALUES.live = parseValuesCsv(await res.text(), fpMap);
          safeSet(CONFIG.valuesLiveKey, { ts: Date.now(), date: VALUES.live.date, v: VALUES.live.v });
        }
      } catch (err) { console.warn('[values] live', err); }
    }
    // runtime snapshots fetched on an earlier visit
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.indexOf(CONFIG.valuesSnapKey) !== 0) return;
        const s = safeGet(k);
        if (s && s.date && s.v) VALUES.extra.push(s);
      });
    } catch (_) { /* ignore */ }
    return VALUES;
  })();
  return VALUES.ready;
}

function valueSnapshots() {
  const out = [];
  const H = VALUES.history;
  if (H) H.dates.forEach((d, i) => out.push({ date: d, i }));
  VALUES.extra.forEach(s => out.push({ date: s.date, snap: s }));
  if (VALUES.live && VALUES.live.date) out.push({ date: VALUES.live.date, snap: VALUES.live });
  out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return out;
}

/** A player's value in one snapshot. */
function snapValue(s, pid) {
  if (!s) return 0;
  if (s.snap) return s.snap.v[pid] || 0;
  const H = VALUES.history;
  const arr = H && H.v[pid];
  return arr ? (arr[s.i] || 0) * (H.scale || 1) : 0;
}

/** Latest snapshot on or before a date (YYYY-MM-DD). */
function snapshotOn(date) {
  const list = valueSnapshots();
  let pick = null;
  list.forEach(s => { if (s.date <= date) pick = s; });
  return pick || list[0] || null;
}

/** First snapshot on or after a date. */
function snapshotAfter(date) {
  const list = valueSnapshots();
  return list.find(s => s.date >= date) || list[list.length - 1] || null;
}

const valueOn = (pid, date) => snapValue(snapshotOn(date), pid);
const valueNow = pid => VALUES.live ? (VALUES.live.v[pid] || 0)
  : snapValue(valueSnapshots().slice(-1)[0], pid);

/** The season's closing value: the first snapshot after its championship week. */
function seasonEndDate(season) {
  return (Number(season) + 1) + '-01-08';
}

/**
 * Make sure there is a snapshot close to each of these dates. Dates newer
 * than the shipped history (trades from the last few weeks) are looked up on
 * GitHub, once, and remembered for good: a week's values never change.
 */
async function ensureSnapshots(dates) {
  await loadValues();
  const H = VALUES.history;
  const last = H && H.dates.length ? H.dates[H.dates.length - 1] : '0000';
  const liveDate = VALUES.live && VALUES.live.date;
  const need = Array.from(new Set(dates.filter(d => d > last && (!liveDate || d < liveDate))));
  const have = new Set(VALUES.extra.map(s => s.date));
  const fpMap = (H && H.fp) || {};
  for (const d of need.slice(0, 6)) {
    // already have the snapshot that was current on that date?
    const s = snapshotOn(d);
    if (s && s.date > last && (!liveDate || s.date !== liveDate)) continue;
    try {
      const res = await fetch(CONFIG.valuesCommits + d + 'T23:59:59Z');
      if (!res.ok) break;                           // rate limited: use what we have
      const list = await res.json();
      const c = Array.isArray(list) && list[0];
      if (!c) continue;
      const cDate = (c.commit && c.commit.committer && c.commit.committer.date || '').slice(0, 10);
      if (!cDate || cDate <= last || have.has(cDate)) continue;
      const raw = await fetch(CONFIG.valuesRaw + c.sha + '/files/values-players.csv');
      if (!raw.ok) continue;
      const parsed = parseValuesCsv(await raw.text(), fpMap);
      const snap = { date: parsed.date || cDate, v: parsed.v };
      VALUES.extra.push(snap);
      have.add(snap.date);
      safeSet(CONFIG.valuesSnapKey + snap.date, snap);
    } catch (err) { console.warn('[values] snapshot', d, err); break; }
  }
}

/* ------------------------------------------------------------------
   Who's looking. Picking yourself in the sidebar highlights you in
   every table and adds "your" numbers. It lives only in this browser.
   ------------------------------------------------------------------ */
function getViewer() {
  try { return localStorage.getItem(CONFIG.viewerKey) || ''; } catch (_) { return ''; }
}
function setViewer(id) {
  try {
    if (id) localStorage.setItem(CONFIG.viewerKey, id);
    else localStorage.removeItem(CONFIG.viewerKey);
  } catch (_) { /* private mode: lasts for this visit only */ }
  setViewer.mem = id;
}

/* ------------------------------------------------------------------
   Cache for the main dataset
   ------------------------------------------------------------------ */
function readCache() {
  const hit = safeGet(CONFIG.cacheKey);
  if (!hit || !hit.fetchedAt) return null;
  if (Date.now() - hit.fetchedAt > CONFIG.cacheHours * 3600e3) return null;
  // Age is not enough. A cache written by an older build can be perfectly
  // fresh and still be missing fields this build needs, which fails silently
  // as empty tables rather than as an error. Check the shape too.
  if (!cacheShapeOK(hit)) {
    console.warn('[cache] shape is from an older build — refetching');
    return null;
  }
  return hit;
}

/** Does this cached payload carry everything the current build reads? */
function cacheShapeOK(hit) {
  const seasons = hit.seasons;
  if (!Array.isArray(seasons) || !seasons.length) return false;
  return seasons.every(s => {
    if (!s || !Array.isArray(s.teams)) return false;
    if (s.teams.some(t => !Array.isArray(t.players) || !Array.isArray(t.starters))) return false;
    if (!s.pairings || typeof s.pairings !== 'object') return false;
    if (!s.lineups || typeof s.lineups !== 'object') return false;
    if (s.started && Object.keys(s.scores || {}).length &&
        !Object.values(s.lineups).some(w => Object.values(w).some(x => x && x.pp))) return false;
    return true;
  });
}

function writeCache(raw) {
  const slim = {
    fetchedAt: raw.fetchedAt,
    liveAt: raw.liveAt || raw.fetchedAt,
    leagueName: raw.leagueName,
    nflState: raw.nflState || null,
    schedule: raw.schedule || null,
    seasons: raw.seasons.map(s => Object.assign({}, s, {
      byRoster: undefined, standings: undefined, finalGames: undefined,
      playoffGames: undefined, stats: undefined
    }))
  };
  // Older builds' copies are dead weight once the key is bumped.
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.indexOf('log_site_data_') === 0 && k !== CONFIG.cacheKey) localStorage.removeItem(k);
      if (k.indexOf('log_ppts_') === 0) localStorage.removeItem(k);   // replaced by lineups
      if (k.indexOf('log_txn_v1_') === 0) localStorage.removeItem(k);
    });
  } catch (_) { /* ignore */ }
  if (!safeSet(CONFIG.cacheKey, slim)) {
    // Over quota: make room by dropping the biggest optional caches, then retry.
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.indexOf(CONFIG.projKey) === 0 || k.indexOf(CONFIG.txnKey) === 0) localStorage.removeItem(k);
      });
    } catch (_) { /* ignore */ }
    safeSet(CONFIG.cacheKey, slim);
  }
}
