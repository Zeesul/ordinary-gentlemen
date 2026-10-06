/* ===================================================================
   analytics.js — the advanced numbers: best possible lineups and
   efficiency, all-play records, luck, consistency, weekly power ranks,
   awards, matchup win odds and the playoff-odds simulation.
   Pure computation on top of MODEL; no fetching, no DOM.
   =================================================================== */

/* Which positions can fill each lineup slot. */
const SLOT_ELIGIBLE = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'], WRRB_FLEX: ['RB', 'WR'], REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE']
};
const BLOWOUT = 40;          // a win by this many points is a blowout (same as the record book)

/** The starting slots of a season's lineup (bench, IR and taxi left out). */
const lineupSlots = s => (s.rosterPositions || []).filter(p => SLOT_ELIGIBLE[p]);

/**
 * player id -> position. Sleeper's player list first; for anyone it doesn't
 * know, the draft board, then the lineup slot he was started in.
 */
function buildPositionResolver(seasons) {
  const fromDraft = {}, fromSlot = {};
  seasons.forEach(s => {
    if (s.draft) s.draft.picks.forEach(p => {
      if (p.playerId && p.position) fromDraft[p.playerId] = p.position === 'DST' ? 'DEF' : p.position;
    });
    const slots = lineupSlots(s);
    Object.values(s.lineups || {}).forEach(wk => Object.values(wk).forEach(lu => {
      (lu.st || []).forEach((pid, i) => {
        const el = SLOT_ELIGIBLE[slots[i]];
        if (pid && pid !== '0' && el && el.length === 1) fromSlot[pid] = el[0];
      });
    }));
  });
  return pid => {
    const p = PLAYERS && PLAYERS[pid];
    if (p && p[1]) return p[1];
    if (fromDraft[pid]) return fromDraft[pid];
    if (fromSlot[pid]) return fromSlot[pid];
    if (pid && !/^\d+$/.test(String(pid))) return 'DEF';
    return '';
  };
}

/**
 * The best lineup a roster could have set. Single-position slots are filled
 * first, then flex slots from most to least restrictive, each time with the
 * highest scorer still available. For these nested eligibility rules that
 * greedy order is optimal.
 * @param {object} pts  playerId -> points (or projection)
 * @returns {{ total:number, picks:{slot:string, pid:string, pts:number}[] }}
 */
function bestLineup(pts, slots, posOf) {
  const order = slots.map((slot, i) => ({ slot, i, n: (SLOT_ELIGIBLE[slot] || []).length }))
    .sort((a, b) => a.n - b.n || a.i - b.i);
  const pool = Object.keys(pts).map(pid => ({ pid, pos: posOf(pid), pts: pts[pid] || 0 }))
    .sort((a, b) => b.pts - a.pts);
  const used = new Set();
  const picks = new Array(slots.length);
  let total = 0;
  order.forEach(o => {
    const el = SLOT_ELIGIBLE[o.slot] || [];
    const best = pool.find(p => !used.has(p.pid) && el.indexOf(p.pos) !== -1);
    if (best) {
      used.add(best.pid);
      total += best.pts;
      picks[o.i] = { slot: o.slot, pid: best.pid, pts: best.pts };
    } else {
      picks[o.i] = { slot: o.slot, pid: null, pts: 0 };
    }
  });
  return { total, picks };
}

/* ------------------------------------------------------------------
   Per-season, per-team advanced stats (regular season, finished weeks)
   ------------------------------------------------------------------ */
function seasonTeamStats(s, posOf) {
  const slots = lineupSlots(s);
  const games = s.finalGames || s.games;
  const byWeek = {};
  games.forEach(g => { (byWeek[g.week] = byWeek[g.week] || []).push(g); });

  const out = {};
  s.teams.forEach(t => {
    out[t.rosterId] = {
      rosterId: t.rosterId, ownerId: t.ownerId, season: s.season,
      g: 0, w: 0, l: 0, t: 0, pf: 0, pa: 0, maxPf: 0, maxWeeks: 0, pfMaxWeeks: 0,
      allW: 0, allL: 0, allT: 0, luckyW: 0, unluckyL: 0, blowouts: 0,
      scores: [], weeks: [], streak: 0
    };
  });

  Object.keys(byWeek).map(Number).sort((a, b) => a - b).forEach(w => {
    const list = byWeek[w];
    const all = [];
    list.forEach(g => { all.push({ rid: g.a, pts: g.ap }, { rid: g.b, pts: g.bp }); });
    const med = median(all.map(x => x.pts));
    const lu = (s.lineups || {})[w] || {};
    list.forEach(g => {
      [[g.a, g.ap, g.b, g.bp], [g.b, g.bp, g.a, g.ap]].forEach(([rid, pts, opp, oppPts]) => {
        const r = out[rid];
        if (!r) return;
        r.g++; r.pf += pts; r.pa += oppPts; r.scores.push(pts);
        const won = pts > oppPts, lost = pts < oppPts;
        if (won) r.w++; else if (lost) r.l++; else r.t++;
        all.forEach(o => {
          if (o.rid === rid) return;
          if (pts > o.pts) r.allW++; else if (pts < o.pts) r.allL++; else r.allT++;
        });
        if (won && pts < med) r.luckyW++;
        if (lost && pts > med) r.unluckyL++;
        if (won && pts - oppPts >= BLOWOUT) r.blowouts++;
        let max = null;
        const mine = lu[rid];
        if (mine && mine.pp && Object.keys(mine.pp).length) {
          max = Math.max(bestLineup(mine.pp, slots, posOf).total, pts);
          r.maxPf += max; r.maxWeeks++; r.pfMaxWeeks += pts;
        }
        r.weeks.push({ week: w, pts, opp, oppPts, won, lost, med, max });
      });
    });
  });

  Object.values(out).forEach(r => {
    let cur = 0;
    r.weeks.forEach(x => { cur = x.won ? cur + 1 : 0; r.streak = Math.max(r.streak, cur); });
  });
  return out;
}

/* ------------------------------------------------------------------
   Manager totals over any set of seasons
   ------------------------------------------------------------------ */
function aggregateStats(seasons) {
  const by = {};
  seasons.forEach(s => {
    if (!s.stats) return;
    Object.values(s.stats).forEach(r => {
      if (!r.g) return;
      const a = by[r.ownerId] || (by[r.ownerId] = {
        ownerId: r.ownerId, seasons: 0, g: 0, w: 0, l: 0, t: 0, pf: 0, pa: 0,
        maxPf: 0, pfMaxWeeks: 0, allW: 0, allL: 0, allT: 0, luckyW: 0, unluckyL: 0,
        blowouts: 0, scores: [], weeks: []
      });
      a.seasons++;
      ['g', 'w', 'l', 't', 'pf', 'pa', 'maxPf', 'pfMaxWeeks', 'allW', 'allL', 'allT',
        'luckyW', 'unluckyL', 'blowouts'].forEach(k => { a[k] += r[k]; });
      a.scores.push.apply(a.scores, r.scores);
      r.weeks.forEach(x => a.weeks.push(Object.assign({ season: s.season }, x)));
    });
  });
  return Object.values(by).map(a => {
    a.winPct = a.g ? (a.w + a.t / 2) / a.g : 0;
    a.ppg = a.g ? a.pf / a.g : 0;
    a.papg = a.g ? a.pa / a.g : 0;
    a.diff = a.pf - a.pa;
    a.eff = a.maxPf ? a.pfMaxWeeks / a.maxPf : 0;
    const ag = a.allW + a.allL + a.allT;
    a.allPct = ag ? (a.allW + a.allT / 2) / ag : 0;
    a.luck = a.luckyW - a.unluckyL;
    a.sd = stdev(a.scores);
    // longest run of wins, counted straight across season boundaries
    let cur = 0, best = 0;
    a.weeks.sort((x, y) => x.season.localeCompare(y.season) || x.week - y.week)
      .forEach(x => { cur = x.won ? cur + 1 : 0; best = Math.max(best, cur); });
    a.streak = best;
    return a;
  });
}

/* ------------------------------------------------------------------
   Weekly power rankings: after each week, teams ranked by season-to-date
   all-play win % (every team's score against every other team's score
   that week), points for breaking ties.
   ------------------------------------------------------------------ */
function weeklyPowerRanks(s) {
  if (!s.stats) return { weeks: [], ranks: {} };
  const weeks = Array.from(new Set((s.finalGames || []).map(g => g.week))).sort((a, b) => a - b);
  const run = {};
  Object.values(s.stats).forEach(r => { run[r.rosterId] = { w: 0, g: 0, pf: 0 }; });
  const ranks = {};
  weeks.forEach(w => {
    const scores = [];
    Object.values(s.stats).forEach(r => {
      const x = r.weeks.find(k => k.week === w);
      if (x) scores.push({ rid: r.rosterId, pts: x.pts });
    });
    scores.forEach(a => {
      const R = run[a.rid];
      scores.forEach(b => {
        if (a === b) return;
        R.g++;
        if (a.pts > b.pts) R.w++; else if (a.pts === b.pts) R.w += 0.5;
      });
      R.pf += a.pts;
    });
    Object.keys(run).map(Number).sort((a, b) => {
      const A = run[a], B = run[b];
      return (B.g ? B.w / B.g : 0) - (A.g ? A.w / A.g : 0) || B.pf - A.pf;
    }).forEach((rid, i) => { (ranks[rid] = ranks[rid] || []).push(i + 1); });
  });
  return { weeks, ranks };
}

/* ------------------------------------------------------------------
   Score spread. How far a single team-week typically lands from that
   team's own season average: the noise the odds below are built on.
   ------------------------------------------------------------------ */
function leagueScoreSpread(seasons) {
  const resid = [];
  seasons.forEach(s => {
    if (!s.stats) return;
    Object.values(s.stats).forEach(r => {
      if (r.scores.length < 4) return;
      const m = mean(r.scores);
      r.scores.forEach(x => resid.push(x - m));
    });
  });
  return resid.length > 30 ? Math.sqrt(sum(resid.map(x => x * x)) / (resid.length - 1)) : 25;
}

/* ------------------------------------------------------------------
   Matchup odds
   ------------------------------------------------------------------ */
/**
 * Win probability for side A. Each side's final score is treated as its
 * expected total (points already scored + Sleeper's projection for whoever
 * hasn't played), give or take the league's usual week-to-week spread,
 * shrunk by how much of the lineup is still to play.
 */
function winProb(a, b, spread) {
  const sdFor = x => {
    if (x.total == null || x.total <= 0) return spread;
    return spread * Math.sqrt(Math.max(0, Math.min(1, x.remaining / x.total)));
  };
  const sa = sdFor(a), sb = sdFor(b);
  const sd = Math.sqrt(sa * sa + sb * sb);
  if (sd < 0.01) return a.expected > b.expected ? 1 : a.expected < b.expected ? 0 : 0.5;
  return normCdf((a.expected - b.expected) / sd);
}

/** Probability as a sportsbook moneyline (-150 / +130). */
function moneyline(p) {
  const q = Math.min(0.995, Math.max(0.005, p));
  if (Math.abs(q - 0.5) < 0.005) return 'EVEN';
  return q > 0.5 ? '-' + Math.round(100 * q / (1 - q)) : '+' + Math.round(100 * (1 - q) / q);
}

/* ------------------------------------------------------------------
   Outlook: Monte Carlo of the rest of the regular season and playoffs
   ------------------------------------------------------------------ */
/** Who plays whom in the playoffs, by seed, for common bracket sizes. */
function playoffTemplate(n) {
  if (n >= 8) return { byes: [], r1: [[1, 8], [4, 5], [2, 7], [3, 6]] };
  if (n === 6) return { byes: [1, 2], r1: [[4, 5], [3, 6]] };
  if (n === 4) return { byes: [], r1: [[1, 4], [2, 3]] };
  return { byes: [], r1: [[1, 2]] };
}

/**
 * @param {object} s       the live season (with stats)
 * @param {object} opts    { asOf: last finished week, current: { rid: {expected, remaining, total} },
 *                           sims, spread, seed }
 */
function simulateSeason(s, opts) {
  const asOf = opts.asOf;                      // weeks <= asOf are final
  const regEnd = s.playoffStart - 1;
  const spread = opts.spread || 25;
  const sims = opts.sims || 10000;
  const rand = mulberry32(opts.seed || 20260905);
  const rids = s.teams.map(t => t.rosterId);

  // records and points through `asOf`
  const base = {};
  rids.forEach(r => { base[r] = { w: 0, pf: 0, g: 0 }; });
  (s.games || []).filter(g => g.week <= asOf).forEach(g => {
    const A = base[g.a], B = base[g.b];
    if (!A || !B) return;
    A.pf += g.ap; B.pf += g.bp; A.g++; B.g++;
    if (g.ap > g.bp) A.w++; else if (g.bp > g.ap) B.w++; else { A.w += 0.5; B.w += 0.5; }
  });
  const allPts = [];
  (s.games || []).filter(g => g.week <= asOf).forEach(g => allPts.push(g.ap, g.bp));
  const leagueMean = allPts.length ? mean(allPts) : (opts.priorMean || 118);

  // Team strength: points per game so far, pulled toward a prior by K games.
  // The prior is this week's projected lineup when Sleeper has one (roster
  // strength), otherwise the league average.
  const K = 4;
  const mu = {};
  rids.forEach(r => {
    const prior = opts.prior && opts.prior[r] > 40 ? opts.prior[r] : leagueMean;
    mu[r] = (base[r].pf + K * prior) / (base[r].g + K);
  });

  // remaining regular-season schedule
  const games = [];
  range(asOf + 1, regEnd).forEach(w => {
    (s.pairings[w] || []).forEach(p => {
      const cur = w === asOf + 1 && opts.current ? opts.current : null;
      games.push({ week: w, a: p.a, b: p.b, cur: cur && cur[p.a] && cur[p.b] ? [cur[p.a], cur[p.b]] : null });
    });
  });

  // normal draw (Box-Muller)
  let spare = null;
  const gauss = () => {
    if (spare != null) { const v = spare; spare = null; return v; }
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    const m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  };
  const score = (rid, cur) => {
    if (cur) {
      const sd = cur.total > 0 ? spread * Math.sqrt(Math.max(0, Math.min(1, cur.remaining / cur.total))) : spread;
      return cur.expected + sd * gauss();
    }
    return mu[rid] + spread * gauss();
  };

  const tpl = playoffTemplate(s.playoffTeams);
  const nextWeekGames = games.filter(g => g.week === asOf + 1);
  const res = {};
  rids.forEach(r => {
    res[r] = { wins: 0, pf: 0, playoffs: 0, bye: 0, title: 0, final: 0, semi: 0, seed: 0,
      seedHist: new Array(rids.length + 1).fill(0) };
  });
  // conditional tallies for the rooting guide: cond[gameIndex][winnerSide][rid]
  const cond = nextWeekGames.map(() => [{ n: 0, p: {} }, { n: 0, p: {} }]);

  for (let it = 0; it < sims; it++) {
    const W = {}, PF = {};
    rids.forEach(r => { W[r] = base[r].w; PF[r] = base[r].pf; });
    const outcome = [];
    games.forEach(g => {
      const sa = score(g.a, g.cur && g.cur[0]), sb = score(g.b, g.cur && g.cur[1]);
      PF[g.a] += sa; PF[g.b] += sb;
      if (sa > sb) W[g.a]++; else W[g.b]++;
      if (g.week === asOf + 1) outcome.push(sa > sb ? 0 : 1);
    });
    const order = rids.slice().sort((a, b) => W[b] - W[a] || PF[b] - PF[a]);
    const seedOf = {};
    order.forEach((r, i) => { seedOf[r] = i + 1; res[r].seedHist[i + 1]++; });
    rids.forEach(r => { res[r].wins += W[r]; res[r].pf += PF[r]; res[r].seed += seedOf[r]; });
    const field = order.slice(0, s.playoffTeams);
    field.forEach(r => { res[r].playoffs++; });
    tpl.byes.forEach(sd => { if (order[sd - 1] != null) res[order[sd - 1]].bye++; });

    // playoffs, one game per round
    const play = (x, y) => (mu[x] + spread * gauss() > mu[y] + spread * gauss() ? x : y);
    const bySeed = sd => order[sd - 1];
    let round = tpl.byes.length
      // seeds 1 and 2 sit out round one, then 1 meets the 4/5 winner and 2 the 3/6 winner
      ? [[bySeed(1), play(bySeed(4), bySeed(5))], [bySeed(2), play(bySeed(3), bySeed(6))]]
      : tpl.r1.map(([x, y]) => [bySeed(x), bySeed(y)]);
    while (round.length > 1) {
      if (round.length === 2) round.forEach(([x, y]) => { res[x].semi++; res[y].semi++; });
      const winners = round.map(([x, y]) => play(x, y));
      const next = [];
      for (let i = 0; i < winners.length; i += 2) next.push([winners[i], winners[i + 1]]);
      round = next;
    }
    if (round[0] && round[0][0] != null && round[0][1] != null) {
      const [x, y] = round[0];
      res[x].final++; res[y].final++;
      res[play(x, y)].title++;
    }

    outcome.forEach((side, gi) => {
      const c = cond[gi][side];
      c.n++;
      field.forEach(r => { c.p[r] = (c.p[r] || 0) + 1; });
    });
  }

  const teams = {};
  rids.forEach(r => {
    const x = res[r];
    const remOpp = games.filter(g => g.a === r || g.b === r).map(g => (g.a === r ? mu[g.b] : mu[g.a]));
    teams[r] = {
      rosterId: r,
      mu: mu[r],
      wins: x.wins / sims,
      pf: x.pf / sims,
      playoffs: x.playoffs / sims,
      bye: x.bye / sims,
      title: x.title / sims,
      final: x.final / sims,
      semi: x.semi / sims,
      // where each team's season ends: champion, runner-up, semifinal, first
      // round, or no playoffs (which can be decided by a bye too)
      dist: {
        champ: x.title / sims,
        runner: (x.final - x.title) / sims,
        semi: Math.max(0, x.semi - x.final) / sims,
        r1: Math.max(0, x.playoffs - x.semi) / sims,
        miss: 1 - x.playoffs / sims
      },
      avgSeed: x.seed / sims,
      seedHist: x.seedHist.map(v => v / sims),
      sos: remOpp.length ? mean(remOpp) : null,
      remaining: remOpp.length
    };
  });
  const rooting = nextWeekGames.map((g, gi) => ({
    week: g.week, a: g.a, b: g.b,
    // P(team makes playoffs | side wins)
    ifA: rid => cond[gi][0].n ? (cond[gi][0].p[rid] || 0) / cond[gi][0].n : null,
    ifB: rid => cond[gi][1].n ? (cond[gi][1].p[rid] || 0) / cond[gi][1].n : null
  }));
  return { teams, mu, spread, asOf, games, rooting, leagueMean };
}

/** Plain head-to-head odds between two teams from their strength ratings. */
const rateOdds = (muA, muB, spread) => normCdf((muA - muB) / (spread * Math.SQRT2));

/* ------------------------------------------------------------------
   Attach everything to the model
   ------------------------------------------------------------------ */
function buildAnalytics(M) {
  M.builtAt = Date.now() + Math.random();
  const posOf = buildPositionResolver(M.seasons);
  M.posOf = posOf;
  M.seasons.forEach(s => { s.stats = s.started ? seasonTeamStats(s, posOf) : null; });
  M.spread = leagueScoreSpread(M.completedSeasons.length ? M.completedSeasons : M.seasons);
  M.statsFor = seasonList => aggregateStats(seasonList);
  M.allStats = aggregateStats(M.seasons.filter(s => s.started));
  M.allStatsBy = {};
  M.allStats.forEach(a => { M.allStatsBy[a.ownerId] = a; });
  return M;
}

/** The fifteen awards, for a set of seasons. */
function computeAwards(stats, extras) {
  extras = extras || {};
  const list = [];
  const enough = stats.filter(a => a.g >= Math.max(4, 0.5 * Math.max.apply(null, stats.map(x => x.g).concat([0]))));
  const top = (arr, key, dir) => arr.slice().sort((a, b) => dir * (b[key] - a[key]))[0];
  const add = (key, label, ownerId, value, sub, tone) => {
    if (ownerId) list.push({ key, label, ownerId, value, sub, tone });
  };
  const rec = top(stats, 'w', 1);
  if (rec) add('record', 'Best Record', rec.ownerId, rec.w + ' wins', 'Most regular season wins', 'amber');
  const sc = top(stats, 'pf', 1);
  if (sc) add('scorer', 'Top Scorer', sc.ownerId, n0(sc.pf) + ' pts', 'Most total points', 'blue');
  const ph = top(enough, 'allPct', 1);
  if (ph) add('power', 'Power House', ph.ownerId, pct(ph.allPct), 'Best all-play win rate', 'violet');
  const ef = top(enough.filter(a => a.maxPf), 'eff', 1);
  if (ef) add('eff', 'Most Efficient', ef.ownerId, pct(ef.eff), 'Best lineup efficiency', 'teal');
  if (extras.bestTrader) add('bestTrader', 'Best Trader', extras.bestTrader.ownerId,
    extras.bestTrader.value, extras.bestTrader.sub, 'green');
  if (extras.worstTrader) add('worstTrader', 'Worst Trader', extras.worstTrader.ownerId,
    extras.worstTrader.value, extras.worstTrader.sub, 'red');
  if (extras.bestDrafter) add('bestDrafter', 'Best Drafter', extras.bestDrafter.ownerId,
    extras.bestDrafter.value, extras.bestDrafter.sub, 'orange');
  const cons = top(enough, 'sd', -1);
  if (cons) add('consistent', 'Most Consistent', cons.ownerId, '±' + n1(cons.sd) + ' pts', 'Lowest scoring std dev', 'slate');
  const lucky = top(stats, 'luck', 1);
  if (lucky && lucky.luck > 0) add('lucky', 'Luckiest', lucky.ownerId, signed(lucky.luck, n0) + ' luck',
    'Most wins while scoring under the median', 'pink');
  const robbed = top(stats, 'unluckyL', 1);
  if (robbed && robbed.unluckyL > 0) add('robbed', 'Most Robbed', robbed.ownerId, robbed.unluckyL + ' games',
    'Most losses while scoring over the median', 'red');
  const streak = top(stats, 'streak', 1);
  if (streak && streak.streak > 1) add('streak', 'Win Streak King', streak.ownerId, streak.streak + ' in a row',
    'Longest win streak', 'amber');
  const weeks = [];
  stats.forEach(a => a.weeks.forEach(w => weeks.push(Object.assign({ ownerId: a.ownerId }, w))));
  const best = weeks.slice().sort((a, b) => b.pts - a.pts)[0];
  if (best) add('bestWeek', 'Best Week Ever', best.ownerId, n2(best.pts) + ' pts',
    `Wk ${best.week}, ${best.season}`, 'green');
  const worst = weeks.slice().sort((a, b) => a.pts - b.pts)[0];
  if (worst) add('worstWeek', 'Worst Week Ever', worst.ownerId, n2(worst.pts) + ' pts',
    `Wk ${worst.week}, ${worst.season}`, 'red');
  const blow = weeks.filter(w => w.won).sort((a, b) => (b.pts - b.oppPts) - (a.pts - a.oppPts))[0];
  if (blow) add('blowout', 'Biggest Blowout', blow.ownerId, '+' + n1(blow.pts - blow.oppPts) + ' pts',
    `Wk ${blow.week}, ${blow.season}`, 'blue');
  const tough = top(enough, 'papg', 1);
  if (tough) add('tough', 'Toughest Schedule', tough.ownerId, n1(tough.papg) + ' opp avg',
    'Highest average opponent score', 'violet');
  return list;
}
