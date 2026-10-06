/* ===================================================================
   grades.js — trade grades, waiver grades and draft grades.

   Trades use three measures:
     1. Trade-day value  what each side got, at market value, the week of
                         the trade (DynastyProcess's weekly trade values)
     2. Value change     how those values moved since: to today for the
                         live season, to the end of the season otherwise
     3. Realized points  what the players actually scored in the receiving
                         team's starting lineup, from the trade until they
                         left that roster. Bench points don't count.
   A finished season is graded on realized points. The season in progress
   is graded on current market value until there's a season of production
   to judge, and says so on every card.

   Waiver pickups are graded on the points they scored in your lineup,
   against what you paid. Draft picks are graded in hindsight: what the
   player produced over a replacement-level player, against what that
   draft slot usually returns in this league.
   =================================================================== */

const TRADE_TIERS = [
  { key: 'even', win: 'Even', lose: 'Even', verb: '' },
  { key: 'slight', win: 'Slight Edge', lose: 'Slight Loss', verb: 'edged' },
  { key: 'good', win: 'Good Win', lose: 'Bad Loss', verb: 'beat' },
  { key: 'clear', win: 'Clear Win', lose: 'Clear Loss', verb: 'crushed' },
  { key: 'fleece', win: 'Fleece', lose: 'Fleeced', verb: 'fleeced' }
];
/* Gap needed for each tier above Even: market value points, or realized
   starter points. Tuned on this league's own trades so most deals land in
   the middle tiers and a Fleece really is one. */
const TRADE_BANDS = {
  market: [500, 1500, 3000, 5000],
  realized: [15, 40, 80, 130]
};
const tierIndex = (gap, bands) => {
  let i = 0;
  bands.forEach((b, k) => { if (gap >= b) i = k + 1; });
  return i;
};

const WAIVER_TIERS = {
  jackpot: { label: 'Jackpot', tone: 'green' },
  great: { label: 'Great Add', tone: 'green' },
  good: { label: 'Good Add', tone: 'blue' },
  paid: { label: 'Paid Up', tone: 'amber' },
  depth: { label: 'Depth', tone: 'slate' },
  miss: { label: 'Miss', tone: 'red' },
  pending: { label: 'Too Soon', tone: 'slate' }
};
const WAIVER_ORDER = ['jackpot', 'great', 'good', 'paid', 'depth', 'miss', 'pending'];

const GRADE_POINTS = {
  'A+': 4.3, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7,
  'C+': 2.3, C: 2, 'C-': 1.7, 'D+': 1.3, D: 1, 'D-': 0.7, F: 0
};
function letterForGpa(g) {
  let best = 'F', diff = Infinity;
  Object.keys(GRADE_POINTS).forEach(k => {
    const d = Math.abs(GRADE_POINTS[k] - g);
    if (d < diff) { diff = d; best = k; }
  });
  return best;
}

/* ------------------------------------------------------------------
   Following a player after he joins a roster
   ------------------------------------------------------------------ */
/** Playoff weeks count only while a team is still playing for the title or
    third place (the 5th-place game pays nothing). */
function aliveWeeks(s) {
  const alive = {};
  (s.winnersBracket || []).forEach(m => {
    if (m.p === 5) return;
    playoffWeeks(s, m.r).forEach(w => {
      const set = alive[w] || (alive[w] = new Set());
      if (typeof m.t1 === 'number') set.add(m.t1);
      if (typeof m.t2 === 'number') set.add(m.t2);
    });
  });
  return alive;
}

/** The last week whose scores are final for a season. */
function lastFinalWeek(s) {
  if (s.complete) return s.lastLeg;
  if (MODEL && MODEL.liveSeason === s && MODEL.lastFinal != null) return MODEL.lastFinal;
  return Math.max.apply(null, [0].concat((s.finalGames || []).map(g => g.week)));
}

/**
 * From `fromWeek` until he leaves roster `rid`: points he scored in its
 * starting lineup, weeks started, weeks rostered, and how he left.
 */
function followPlayer(s, pid, rid, fromWeek, opts) {
  const regEnd = s.playoffStart - 1;
  const alive = opts.alive;
  const last = opts.lastWeek;
  // how he left: the first later move that took him off this roster
  const exit = (opts.txnsAsc || []).find(t => t.created > opts.since && t.drops && t.drops[pid] === rid) || null;
  const left = exit ? { type: exit.type === 'trade' ? 'traded' : 'dropped', week: exit.week, id: exit.id } : null;

  let pts = 0, started = 0, rostered = 0, total = 0, seen = false;
  for (let w = fromWeek; w <= last; w++) {
    if (left && w > left.week) break;
    const lu = s.lineups && s.lineups[w] && s.lineups[w][rid];
    const on = !!(lu && lu.pp && lu.pp[pid] != null);
    if (!on) {
      // the trade week's snapshot can predate the move; allow that one miss
      if (!seen && w === fromWeek) continue;
      break;
    }
    seen = true;
    if (w > regEnd && !(alive[w] && alive[w].has(rid))) continue;
    rostered++;
    const p = lu.pp[pid] || 0;
    total += p;
    if ((lu.st || []).indexOf(pid) !== -1) { pts += p; started++; }
  }
  return { startedPts: pts, startedWeeks: started, rosterWeeks: rostered, totalPts: total, left };
}

/* ------------------------------------------------------------------
   Trades
   ------------------------------------------------------------------ */
/**
 * Grade every trade in one season. Needs loadValues() (and, for trades
 * newer than the shipped history, ensureSnapshots) to have run first.
 */
function gradeSeasonTrades(s, txns) {
  const posOf = MODEL.posOf;
  const ctx = {
    alive: aliveWeeks(s),
    lastWeek: lastFinalWeek(s),
    txnsAsc: txns.slice().sort((a, b) => a.created - b.created)
  };
  const endSnap = s.complete ? snapshotAfter(seasonEndDate(s.season)) : null;
  const basis = s.complete ? 'realized' : 'market';
  const bands = TRADE_BANDS[basis];

  return txns.filter(t => t.type === 'trade').map(t => {
    const date = isoDay(t.created);
    const thenSnap = snapshotOn(date);
    const sides = (t.rosters || []).map(rid => {
      const team = s.byRoster[rid];
      const got = Object.keys(t.adds || {}).filter(pid => t.adds[pid] === rid);
      const sent = Object.keys(t.drops || {}).filter(pid => t.drops[pid] === rid);
      const players = got.map(pid => {
        const f = followPlayer(s, pid, rid, t.week, Object.assign({ since: t.created }, ctx));
        const then = snapValue(thenSnap, pid);
        const now = s.complete ? snapValue(endSnap, pid) : valueNow(pid);
        return {
          pid, pos: posOf(pid), then, now, gl: now - then,
          pts: f.startedPts, started: f.startedWeeks, weeks: f.rosterWeeks,
          left: f.left
        };
      }).sort((a, b) => b.then - a.then || b.pts - a.pts);
      const faab = (t.faab || []).filter(f => f.receiver === rid).reduce((a, f) => a + (f.amount || 0), 0);
      const faabSent = (t.faab || []).filter(f => f.sender === rid).reduce((a, f) => a + (f.amount || 0), 0);
      const picks = (t.picks || []).filter(p => p.owner_id === rid);
      return {
        rosterId: rid, ownerId: team ? team.ownerId : null,
        players, sent, faab, faabSent, picks,
        then: sum(players.map(p => p.then)),
        now: sum(players.map(p => p.now)),
        pts: sum(players.map(p => p.pts))
      };
    });
    sides.forEach(sd => { sd.gl = sd.now - sd.then; });

    const graded = sides.length >= 2 && sides.some(sd => sd.players.length);
    const metric = sd => basis === 'realized' ? sd.pts : sd.now;
    const vsOthers = (sd, f) => {
      const others = sides.filter(o => o !== sd);
      return others.length ? f(sd) - mean(others.map(f)) : 0;
    };
    sides.forEach(sd => {
      sd.net = graded ? vsOthers(sd, metric) : 0;
      sd.netThen = vsOthers(sd, x => x.then);
      sd.netNow = vsOthers(sd, x => x.now);
      sd.netPts = vsOthers(sd, x => x.pts);
      const ti = graded ? tierIndex(Math.abs(sd.net), bands) : 0;
      sd.tier = TRADE_TIERS[ti].key;
      sd.result = !graded ? null : ti === 0 ? 'E' : sd.net > 0 ? 'W' : 'L';
      sd.label = ti === 0 ? 'Even' : sd.net > 0 ? TRADE_TIERS[ti].win : TRADE_TIERS[ti].lose;
    });
    const sorted = sides.slice().sort((a, b) => b.net - a.net);
    const top = sorted[0], bottom = sorted[sorted.length - 1];
    const ti = graded && top ? tierIndex(Math.abs(top.net), bands) : 0;
    return {
      id: t.id, season: s.season, week: t.week, created: t.created, date,
      txn: t, graded, basis, sides,
      tier: TRADE_TIERS[ti].key, tierIndex: ti,
      winner: graded && ti > 0 ? top : null,
      loser: graded && ti > 0 ? bottom : null,
      gap: graded && top && bottom ? top.net - bottom.net : 0,
      live: !s.complete
    };
  });
}

/** Grades for every started season's trades. */
async function gradeAllTrades(txnsBySeason) {
  await loadValues();
  // Live trades newer than the shipped value history need their week's values.
  const live = MODEL.liveSeason;
  if (live && txnsBySeason[live.season]) {
    await ensureSnapshots(txnsBySeason[live.season].filter(t => t.type === 'trade')
      .map(t => isoDay(t.created))).catch(() => null);
  }
  const out = [];
  MODEL.seasons.filter(s => s.started && txnsBySeason[s.season]).forEach(s => {
    gradeSeasonTrades(s, txnsBySeason[s.season]).forEach(g => out.push(g));
  });
  return out.sort((a, b) => b.created - a.created);
}

/** Per-manager trade summary across a list of graded trades. */
function tradeSummary(graded) {
  const by = {};
  graded.forEach(g => g.sides.forEach(sd => {
    if (!sd.ownerId) return;
    const r = by[sd.ownerId] || (by[sd.ownerId] = {
      ownerId: sd.ownerId, trades: 0, w: 0, l: 0, e: 0,
      netPts: 0, netThen: 0, netNow: 0, acquired: 0, sent: 0, best: null, worst: null
    });
    r.trades++;
    r.acquired += sd.players.length;
    r.sent += sd.sent.length;
    if (!g.graded) return;
    if (sd.result === 'W') r.w++; else if (sd.result === 'L') r.l++; else r.e++;
    r.netPts += sd.netPts; r.netThen += sd.netThen; r.netNow += sd.netNow;
    // compare across seasons on one scale: each trade's gap against its own Fleece line
    const k = sd.net / TRADE_BANDS[g.basis][3];
    if (!r.best || k > r.best.k) r.best = { trade: g, side: sd, k };
    if (!r.worst || k < r.worst.k) r.worst = { trade: g, side: sd, k };
  }));
  return Object.values(by);
}

/** How many trades each pair of managers has made together. */
function tradePartners(graded) {
  const m = {};
  graded.forEach(g => {
    const owners = g.sides.map(sd => sd.ownerId).filter(Boolean);
    owners.forEach(a => owners.forEach(b => {
      if (a === b) return;
      m[a + '|' + b] = (m[a + '|' + b] || 0) + 1;
    }));
  });
  return m;
}

/** Players traded more than once, most-traded first. */
function mostTraded(graded) {
  const by = {};
  graded.forEach(g => g.sides.forEach(sd => sd.players.forEach(p => {
    const r = by[p.pid] || (by[p.pid] = { pid: p.pid, pos: p.pos, n: 0, last: 0, owners: new Set() });
    r.n++;
    r.last = Math.max(r.last, g.created);
    g.sides.forEach(o => { if (o.ownerId) r.owners.add(o.ownerId); });
  })));
  return Object.values(by).filter(r => r.n >= 2)
    .sort((a, b) => b.n - a.n || b.last - a.last);
}

/* ------------------------------------------------------------------
   Waivers and free agents
   ------------------------------------------------------------------ */
function waiverTier(c) {
  if (!c.weeks && !c.started) return c.live ? 'pending' : (c.bid > 2 ? 'miss' : 'depth');
  if (c.pts >= 75) return 'jackpot';
  if (c.pts >= 40) return 'great';
  if (c.pts >= 15) return c.bid >= 15 ? 'paid' : 'good';
  return c.bid > 2 ? 'miss' : 'depth';
}

function gradeSeasonWaivers(s, txns) {
  const ctx = {
    alive: aliveWeeks(s),
    lastWeek: lastFinalWeek(s),
    txnsAsc: txns.slice().sort((a, b) => a.created - b.created)
  };
  const out = [];
  txns.filter(t => t.type === 'waiver' || t.type === 'free_agent').forEach(t => {
    const rid = (t.rosters || [])[0];
    const team = s.byRoster[rid];
    const dropped = Object.keys(t.drops || {}).filter(pid => t.drops[pid] === rid);
    Object.keys(t.adds || {}).filter(pid => t.adds[pid] === rid).forEach(pid => {
      const f = followPlayer(s, pid, rid, t.week, Object.assign({ since: t.created }, ctx));
      const c = {
        id: t.id + ':' + pid, season: s.season, week: t.week, created: t.created,
        type: t.type, rosterId: rid, ownerId: team ? team.ownerId : null,
        pid, pos: MODEL.posOf(pid), bid: t.type === 'waiver' ? (t.bid || 0) : 0,
        dropped, pts: f.startedPts, started: f.startedWeeks, weeks: f.rosterWeeks,
        total: f.totalPts, left: f.left, live: !s.complete
      };
      c.tier = waiverTier(c);
      out.push(c);
    });
  });
  return out;
}

function gradeAllWaivers(txnsBySeason) {
  const out = [];
  MODEL.seasons.filter(s => s.started && txnsBySeason[s.season]).forEach(s => {
    gradeSeasonWaivers(s, txnsBySeason[s.season]).forEach(c => out.push(c));
  });
  return out.sort((a, b) => b.created - a.created);
}

function waiverSummary(claims) {
  const by = {};
  claims.forEach(c => {
    if (!c.ownerId) return;
    const r = by[c.ownerId] || (by[c.ownerId] = {
      ownerId: c.ownerId, claims: 0, waivers: 0, fa: 0, spent: 0, pts: 0, hits: 0, best: null, tiers: {}
    });
    r.claims++;
    if (c.type === 'waiver') r.waivers++; else r.fa++;
    r.spent += c.bid;
    r.pts += c.pts;
    if (c.tier === 'jackpot' || c.tier === 'great') r.hits++;
    r.tiers[c.tier] = (r.tiers[c.tier] || 0) + 1;
    if (!r.best || c.pts > r.best.pts) r.best = c;
  });
  return Object.values(by).map(r => Object.assign(r, { perDollar: r.spent ? r.pts / r.spent : null }));
}

/* ------------------------------------------------------------------
   Draft grades (hindsight)
   ------------------------------------------------------------------ */
/** How many starters each team fields at each position, flex shared out. */
function starterShares(rosterPositions) {
  const share = {
    QB: { QB: 1 }, RB: { RB: 1 }, WR: { WR: 1 }, TE: { TE: 1 }, K: { K: 1 }, DEF: { DEF: 1 },
    FLEX: { RB: 0.4, WR: 0.5, TE: 0.1 },
    WRRB_FLEX: { RB: 0.5, WR: 0.5 },
    REC_FLEX: { WR: 0.8, TE: 0.2 },
    SUPER_FLEX: { QB: 0.8, RB: 0.1, WR: 0.1 }
  };
  const out = {};
  (rosterPositions || []).forEach(p => {
    const s = share[p];
    if (s) Object.keys(s).forEach(k => { out[k] = (out[k] || 0) + s[k]; });
  });
  return out;
}

const DRAFT_BANDS = [
  // [minimum points over what the slot usually returns, letter]
  [120, 'A+'], [85, 'A'], [60, 'A-'], [38, 'B+'], [18, 'B'], [4, 'B-'],
  [-10, 'C+'], [-25, 'C'], [-40, 'C-'], [-56, 'D+'], [-72, 'D'], [-90, 'D-'], [-Infinity, 'F']
];
const draftLetter = x => DRAFT_BANDS.find(b => x >= b[0])[1];

function gradeDrafts() {
  const posOf = MODEL.posOf;
  const seasons = MODEL.seasons.filter(s => s.draft && s.draft.picks.length && s.started);
  const bySeason = {};

  // each season: regular-season production and value over replacement
  seasons.forEach(s => {
    const regEnd = s.playoffStart - 1;
    const last = Math.min(regEnd, lastFinalWeek(s));
    const prod = {};
    range(1, last).forEach(w => {
      const wk = s.lineups && s.lineups[w];
      if (!wk) return;
      Object.values(wk).forEach(lu => Object.keys(lu.pp || {}).forEach(pid => {
        prod[pid] = (prod[pid] || 0) + (lu.pp[pid] || 0);
      }));
    });
    const teams = s.numTeams || s.teams.length;
    const shares = starterShares(s.rosterPositions);
    const repl = {};
    Object.keys(shares).forEach(pos => {
      const list = Object.keys(prod).filter(pid => posOf(pid) === pos).map(pid => prod[pid])
        .sort((a, b) => b - a);
      const n = Math.max(1, Math.round(teams * shares[pos]));
      repl[pos] = list.length ? list[Math.min(n, list.length - 1)] : 0;
    });
    const frac = regEnd ? Math.max(0, last) / regEnd : 1;
    bySeason[s.season] = {
      s, frac, teams, provisional: !s.complete,
      picks: s.draft.picks.map(p => {
        const pos = (p.position === 'DST' ? 'DEF' : p.position) || posOf(p.playerId);
        const pts = prod[p.playerId] || 0;
        const gradeable = ['QB', 'RB', 'WR', 'TE'].indexOf(pos) !== -1;
        return Object.assign({}, p, {
          pos, pts, gradeable,
          vorp: gradeable ? pts - (repl[pos] || 0) : null,
          x: (p.pick - 1) / teams           // draft position in rounds, so 10- and 12-team years line up
        });
      })
    };
  });

  /* What each draft slot usually returns here: a smoothed average of value
     over replacement by draft position across finished seasons, never
     rising as the draft goes on. */
  const sample = [];
  Object.values(bySeason).forEach(d => {
    if (d.provisional) return;
    d.picks.forEach(p => { if (p.gradeable) sample.push([p.x, p.vorp]); });
  });
  const bw = 0.75;
  const curveAt = x => {
    let num = 0, den = 0;
    sample.forEach(([px, v]) => {
      const w = Math.exp(-((px - x) * (px - x)) / (2 * bw * bw));
      num += w * v; den += w;
    });
    return den ? num / den : 0;
  };
  const grid = range(0, 40).map(i => i * 0.5);
  const raw = grid.map(curveAt);
  for (let i = 1; i < raw.length; i++) raw[i] = Math.min(raw[i], raw[i - 1]);
  const expected = x => {
    const i = Math.max(0, Math.min(raw.length - 2, Math.floor(x / 0.5)));
    const t = Math.max(0, Math.min(1, (x - grid[i]) / 0.5));
    return raw[i] + (raw[i + 1] - raw[i]) * t;
  };

  Object.values(bySeason).forEach(d => {
    d.picks.forEach(p => {
      if (!p.gradeable || !sample.length) { p.grade = null; return; }
      p.exp = expected(p.x) * d.frac;
      p.surplus = p.vorp - p.exp;
      // A partial season is scaled up toward a full one, but only part of the
      // way: four weeks of production is too noisy to extrapolate in full.
      p.grade = draftLetter(d.frac > 0 ? p.surplus / Math.sqrt(Math.max(d.frac, 0.1)) : 0);
      p.gpa = GRADE_POINTS[p.grade];
    });
    const byRoster = {};
    d.picks.forEach(p => {
      const r = byRoster[p.rosterId] || (byRoster[p.rosterId] = {
        rosterId: p.rosterId, picks: [], gpaSum: 0, n: 0, surplus: 0, steal: null, bust: null
      });
      r.picks.push(p);
      if (p.grade == null) return;
      r.gpaSum += p.gpa; r.n++; r.surplus += p.surplus;
      if (!r.steal || p.surplus > r.steal.surplus) r.steal = p;
      if (p.round <= 6 && (!r.bust || p.surplus < r.bust.surplus)) r.bust = p;
    });
    Object.values(byRoster).forEach(r => {
      r.gpa = r.n ? r.gpaSum / r.n : null;
      r.letter = r.gpa != null ? letterForGpa(r.gpa) : null;
      const t = d.s.byRoster[r.rosterId];
      r.ownerId = t ? t.ownerId : null;
    });
    d.byRoster = byRoster;
  });
  return bySeason;
}

/** Average draft GPA per manager across a set of seasons. */
function draftSummary(drafts, seasons) {
  const by = {};
  seasons.forEach(season => {
    const d = drafts[season];
    if (!d) return;
    Object.values(d.byRoster).forEach(r => {
      if (!r.ownerId || r.gpa == null) return;
      const a = by[r.ownerId] || (by[r.ownerId] = { ownerId: r.ownerId, drafts: 0, gpaSum: 0, surplus: 0, steal: null });
      a.drafts++; a.gpaSum += r.gpa; a.surplus += r.surplus;
      if (r.steal && (!a.steal || r.steal.surplus > a.steal.surplus)) a.steal = Object.assign({ season }, r.steal);
    });
  });
  return Object.values(by).map(a => Object.assign(a, { gpa: a.gpaSum / a.drafts, letter: letterForGpa(a.gpaSum / a.drafts) }));
}
