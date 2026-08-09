/* ===================================================================
   data.js — config, helpers, and everything that talks to Sleeper.
   Loaded first; everything else builds on what's declared here.
   =================================================================== */

const CONFIG = {
  leagueId: '1353221128079839232',
  api: 'https://api.sleeper.app/v1',
  cacheKey: 'log_site_data_v4',
  playerKey: 'log_players_v1',
  txnKey: 'log_txn_v1_',
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
const n1 = v => (Math.round(v * 10) / 10).toFixed(1);
const n2 = v => (Math.round(v * 100) / 100).toFixed(2);
const pct = v => (v * 100).toFixed(1) + '%';
const range = (a, b) => (b < a ? [] : Array.from({ length: b - a + 1 }, (_, i) => a + i));
const ordinal = i => {
  const s = ['th', 'st', 'nd', 'rd'], v = i % 100;
  return i + (s[(v - 20) % 10] || s[v] || s[0]);
};
const fmtDate = ms => {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

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
      moves: s.total_moves || 0,
      waiverUsed: s.waiver_budget_used || 0
    };
  });

  // ---- every week's scores (regular season + playoffs) --------------
  const games = [];      // regular season head-to-head only
  const scores = {};     // { week: { rosterId: points } }
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

      if (week < playoffStart) {
        const byMatchup = {};
        data.forEach(m => {
          if (m.matchup_id == null) return;
          (byMatchup[m.matchup_id] = byMatchup[m.matchup_id] || []).push(m);
        });
        Object.values(byMatchup).forEach(pair => {
          if (pair.length !== 2) return;
          const [a, b] = pair;
          const ap = a.points || 0, bp = b.points || 0;
          if (ap === 0 && bp === 0) return; // not played yet
          games.push({ week, a: a.roster_id, ap, b: b.roster_id, bp });
        });
      }
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
  const toilet = bracketPick(lb, 1);

  let championRoster = final ? final.w : null;
  if (!championRoster && lg.metadata && lg.metadata.latest_league_winner_roster_id) {
    championRoster = Number(lg.metadata.latest_league_winner_roster_id);
  }

  const playoffRosters = new Set();
  (Array.isArray(wb) ? wb : []).forEach(m => {
    if (typeof m.t1 === 'number') playoffRosters.add(m.t1);
    if (typeof m.t2 === 'number') playoffRosters.add(m.t2);
  });

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
    playoffStart,
    playoffTeams: st.playoff_teams || 6,
    lastLeg,
    teams, games, scores, draft,
    winnersBracket: Array.isArray(wb) ? wb : [],
    losersBracket: Array.isArray(lb) ? lb : [],
    championRoster,
    runnerUpRoster: final ? final.l : null,
    thirdRoster: third ? third.w : null,
    // Winner of the losers bracket final = consolation champion.
    // Last place is NOT taken from this bracket: its placings depend on
    // league config and routinely disagree with the actual worst record.
    // The model derives last place from the final standings instead.
    consolationRoster: toilet ? toilet.w : null,
    playoffRosters: Array.from(playoffRosters)
  };
}

async function loadEverything() {
  boot.say('Finding every season…');
  const chain = await loadLeagueChain();
  boot.plan(chain.length * 20);
  const seasons = [];
  for (const lg of chain) {
    boot.say(`Loading the ${lg.season} season…`);
    seasons.push(await loadSeason(lg));
  }
  return { fetchedAt: Date.now(), leagueName: chain[0] ? chain[0].name : 'The League', seasons };
}

/* ------------------------------------------------------------------
   Player name lookup — only downloaded when a page actually needs it
   (the Trades page). Trimmed hard before caching so it fits happily
   in localStorage.
   ------------------------------------------------------------------ */
let PLAYERS = null;

async function loadPlayers() {
  if (PLAYERS) return PLAYERS;

  try {
    const hit = JSON.parse(localStorage.getItem(CONFIG.playerKey) || 'null');
    if (hit && hit.ts && Date.now() - hit.ts < CONFIG.playerCacheDays * 864e5 && hit.p) {
      PLAYERS = hit.p;
      return PLAYERS;
    }
  } catch (_) { /* ignore */ }

  const raw = await getJSON('/players/nfl');
  const slim = {};
  Object.keys(raw || {}).forEach(id => {
    const p = raw[id];
    if (!p) return;
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') ||
      p.last_name || id;
    slim[id] = [name, p.position || '', p.team || ''];
  });
  PLAYERS = slim;
  try {
    localStorage.setItem(CONFIG.playerKey, JSON.stringify({ ts: Date.now(), p: slim }));
  } catch (_) { /* over quota — fine, we just refetch next visit */ }
  return PLAYERS;
}

function playerName(id) {
  if (!PLAYERS || !PLAYERS[id]) return String(id);
  return PLAYERS[id][0];
}
function playerMeta(id) {
  const p = PLAYERS && PLAYERS[id];
  return p ? { name: p[0], pos: p[1], team: p[2] } : { name: String(id), pos: '', team: '' };
}

/* ------------------------------------------------------------------
   Transactions — also loaded on demand, one season at a time.
   ------------------------------------------------------------------ */
async function loadTransactions(season) {
  const key = CONFIG.txnKey + season.leagueId;
  try {
    const hit = JSON.parse(localStorage.getItem(key) || 'null');
    if (hit && hit.ts && (season.complete || Date.now() - hit.ts < 6 * 3600e3)) return hit.t;
  } catch (_) { /* ignore */ }

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

  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), t: all })); }
  catch (_) { /* ignore */ }
  return all;
}

/* ------------------------------------------------------------------
   Cache for the main dataset
   ------------------------------------------------------------------ */
function readCache() {
  try {
    const hit = JSON.parse(localStorage.getItem(CONFIG.cacheKey) || 'null');
    if (!hit || !hit.fetchedAt) return null;
    if (Date.now() - hit.fetchedAt > CONFIG.cacheHours * 3600e3) return null;
    return hit;
  } catch (_) { return null; }
}

function writeCache(raw) {
  try {
    const slim = {
      fetchedAt: raw.fetchedAt,
      leagueName: raw.leagueName,
      seasons: raw.seasons.map(s => Object.assign({}, s, {
        byRoster: undefined, standings: undefined
      }))
    };
    localStorage.setItem(CONFIG.cacheKey, JSON.stringify(slim));
  } catch (_) { /* quota or private mode — not fatal */ }
}
