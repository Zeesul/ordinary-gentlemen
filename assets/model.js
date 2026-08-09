/* ===================================================================
   model.js — turns the raw seasons into every statistic the site shows.
   Pure computation: no fetching, no DOM.
   =================================================================== */

function buildModel(raw) {
  const seasons = raw.seasons;
  const played = seasons.filter(s => s.started && s.games.length);

  seasons.forEach(s => {
    s.byRoster = {};
    s.teams.forEach(t => { s.byRoster[t.rosterId] = t; });
  });

  /* ---------------- manager registry (keyed by Sleeper user id) ----- */
  const managers = {};
  const touch = (ownerId, t) => {
    let m = managers[ownerId];
    if (!m) {
      m = managers[ownerId] = {
        id: ownerId, name: t.manager, avatar: t.avatar,
        teamNames: [], seasons: [],
        w: 0, l: 0, ties: 0, pf: 0, pa: 0,
        weeks: 0, bestWeek: null, worstWeek: null,
        titles: [], finals: 0, thirds: 0, consolations: 0, playoffs: 0, lastPlace: 0,
        regularTitles: 0, crowns: 0, moves: 0, faab: 0,
        closeWins: 0, closeLosses: 0, blowoutWins: 0, blowoutLosses: 0
      };
    }
    m.name = t.manager;
    m.avatar = t.avatar;
    if (t.orphan) m.orphanKey = t.key;   // so the site can tell you what to name
    if (t.teamName && !m.teamNames.includes(t.teamName)) m.teamNames.push(t.teamName);
    return m;
  };

  /* ---------------- standings ---------------------------------------- */
  seasons.forEach(s => {
    s.standings = s.teams.slice().sort((a, b) => {
      const aw = a.wins + a.ties * 0.5, bw = b.wins + b.ties * 0.5;
      if (bw !== aw) return bw - aw;
      return b.pf - a.pf;
    });
    s.standings.forEach((t, i) => { t.seed = i + 1; });
    // Last place = worst regular-season record. Sleeper's consolation
    // bracket places teams by config and often disagrees with reality.
    const bottom = s.standings[s.standings.length - 1];
    s.lastPlaceRoster = s.complete && bottom ? bottom.rosterId : null;
  });

  /* ---------------- head to head + game log -------------------------- */
  const h2h = {};
  const weekly = [];
  const gameLog = [];

  const bump = (a, b, res, pf, pa) => {
    const k = a + '|' + b;
    const rec = h2h[k] || (h2h[k] = { w: 0, l: 0, t: 0, pf: 0, pa: 0, games: [] });
    rec[res]++; rec.pf += pf; rec.pa += pa;
  };

  played.forEach(s => {
    s.games.forEach(g => {
      const ta = s.byRoster[g.a], tb = s.byRoster[g.b];
      if (!ta || !tb) return;
      const A = ta.ownerId, B = tb.ownerId;
      const res = g.ap > g.bp ? 'w' : (g.ap < g.bp ? 'l' : 't');
      bump(A, B, res, g.ap, g.bp);
      bump(B, A, res === 'w' ? 'l' : (res === 'l' ? 'w' : 't'), g.bp, g.ap);
      h2h[A + '|' + B].games.push({ season: s.season, week: g.week, pts: g.ap, oppPts: g.bp });
      h2h[B + '|' + A].games.push({ season: s.season, week: g.week, pts: g.bp, oppPts: g.ap });

      weekly.push({ season: s.season, week: g.week, ownerId: A, pts: g.ap, opp: B, oppPts: g.bp, won: g.ap > g.bp });
      weekly.push({ season: s.season, week: g.week, ownerId: B, pts: g.bp, opp: A, oppPts: g.ap, won: g.bp > g.ap });
      gameLog.push({
        season: s.season, week: g.week,
        winner: res === 'w' ? A : B, loser: res === 'w' ? B : A,
        hi: Math.max(g.ap, g.bp), lo: Math.min(g.ap, g.bp),
        margin: Math.abs(g.ap - g.bp), total: g.ap + g.bp, tie: res === 't'
      });
    });
  });

  /* ---------------- career aggregates -------------------------------- */
  seasons.forEach(s => {
    if (!s.started) return;
    s.standings.forEach(t => {
      const m = touch(t.ownerId, t);
      const champ = s.championRoster === t.rosterId;
      const row = {
        season: s.season, seed: t.seed, wins: t.wins, losses: t.losses, ties: t.ties,
        pf: t.pf, pa: t.pa, teamName: t.teamName, rosterId: t.rosterId,
        champion: champ,
        runnerUp: s.runnerUpRoster === t.rosterId,
        third: s.thirdRoster === t.rosterId,
        consolation: s.consolationRoster === t.rosterId,
        playoffs: s.playoffRosters.includes(t.rosterId),
        lastPlace: s.lastPlaceRoster === t.rosterId,
        complete: s.complete
      };
      m.seasons.push(row);
      m.w += t.wins; m.l += t.losses; m.ties += t.ties;
      m.pf += t.pf; m.pa += t.pa;
      m.moves += t.moves || 0;
      m.faab += t.waiverUsed || 0;
      if (champ) m.titles.push(s.season);
      if (row.runnerUp) m.finals++;
      if (row.third) m.thirds++;
      if (row.consolation) m.consolations++;
      if (row.playoffs) m.playoffs++;
      if (row.lastPlace) m.lastPlace++;
      if (t.seed === 1 && s.complete) m.regularTitles++;
    });
  });

  weekly.forEach(wk => {
    const m = managers[wk.ownerId];
    if (!m) return;
    m.weeks++;
    if (!m.bestWeek || wk.pts > m.bestWeek.pts) m.bestWeek = wk;
    if (!m.worstWeek || wk.pts < m.worstWeek.pts) m.worstWeek = wk;
  });

  gameLog.forEach(g => {
    const W = managers[g.winner], L = managers[g.loser];
    if (!W || !L || g.tie) return;
    if (g.margin < 5) { W.closeWins++; L.closeLosses++; }
    if (g.margin >= 40) { W.blowoutWins++; L.blowoutLosses++; }
  });

  /* ---------------- weekly crowns (top score of the week) ------------- */
  const crownList = [];
  played.forEach(s => {
    const byWeek = {};
    s.games.forEach(g => {
      (byWeek[g.week] = byWeek[g.week] || []).push(
        { rosterId: g.a, pts: g.ap }, { rosterId: g.b, pts: g.bp });
    });
    Object.keys(byWeek).forEach(w => {
      const top = byWeek[w].slice().sort((a, b) => b.pts - a.pts)[0];
      const t = s.byRoster[top.rosterId];
      if (!t) return;
      crownList.push({ season: s.season, week: Number(w), ownerId: t.ownerId, pts: top.pts });
      if (managers[t.ownerId]) managers[t.ownerId].crowns++;
    });
  });

  /* ---------------- finalise manager list ----------------------------- */
  /* Small samples make raw win% misleading: one lucky 9-5 rookie season
     shouldn't outrank four years of steady work. Two guards are applied.
     1. "Qualified" — a manager needs MIN_SEASONS finished seasons to be
        eligible for the all-time win% crown.
     2. "Adjusted win%" — the raw record is regressed toward .500 by one
        season's worth of games, so short careers drift to the middle
        until they've earned otherwise. This is what the site sorts on. */
  const MIN_SEASONS = 2;
  const REGRESS = 14;

  // A rookie is someone whose very first season is the newest one played.
  // Finish a season and you're not a rookie any more, however long ago it was.
  const playedSeasons = seasons.filter(s => s.started);
  const latestSeason = playedSeasons.length
    ? playedSeasons[playedSeasons.length - 1].season : null;

  const managerList = Object.values(managers).map(m => {
    const g = m.w + m.l + m.ties;
    m.games = g;
    m.winPct = g ? (m.w + m.ties * 0.5) / g : 0;
    m.adjWinPct = (m.w + m.ties * 0.5 + REGRESS * 0.5) / (g + REGRESS);
    m.fullSeasons = m.seasons.filter(s => s.complete).length;
    m.qualified = m.fullSeasons >= MIN_SEASONS;
    m.firstSeason = m.seasons.length ? m.seasons[0].season : null;
    m.rookie = !!latestSeason && m.firstSeason === latestSeason;
    m.ppg = m.weeks ? m.pf / m.weeks : 0;
    m.papg = m.weeks ? m.pa / m.weeks : 0;
    m.diff = m.pf - m.pa;
    m.active = m.seasons.some(s => s.season === seasons[seasons.length - 1].season);
    return m;
  }).sort((a, b) => b.adjWinPct - a.adjWinPct || b.pf - a.pf);

  /* ---------------- streaks -------------------------------------------- */
  const chrono = {};
  weekly.slice().sort((a, b) =>
    a.season.localeCompare(b.season) || a.week - b.week
  ).forEach(wk => { (chrono[wk.ownerId] = chrono[wk.ownerId] || []).push(wk); });

  let longestWinStreak = null, longestLossStreak = null;
  Object.entries(chrono).forEach(([id, list]) => {
    let ws = 0, ls = 0;
    list.forEach(wk => {
      if (wk.won) { ws++; ls = 0; } else { ls++; ws = 0; }
      if (!longestWinStreak || ws > longestWinStreak.n) longestWinStreak = { n: ws, id, end: wk };
      if (!longestLossStreak || ls > longestLossStreak.n) longestLossStreak = { n: ls, id, end: wk };
    });
    const m = managers[id];
    if (m) {
      let cur = 0, dir = null;
      for (let i = list.length - 1; i >= 0; i--) {
        if (dir === null) { dir = list[i].won; cur = 1; }
        else if (list[i].won === dir) cur++;
        else break;
      }
      m.streak = dir === null ? null : { n: cur, won: dir };
    }
  });

  /* ---------------- record book ---------------------------------------- */
  const bySc = weekly.slice().sort((a, b) => b.pts - a.pts);
  const byMargin = gameLog.slice().sort((a, b) => b.margin - a.margin);
  const byTotal = gameLog.slice().sort((a, b) => b.total - a.total);
  const closest = gameLog.filter(g => !g.tie).sort((a, b) => a.margin - b.margin);
  const losses = weekly.filter(w => !w.won).sort((a, b) => b.pts - a.pts);
  const wins = weekly.filter(w => w.won).sort((a, b) => a.pts - b.pts);

  const seasonRows = [];
  managerList.forEach(m => m.seasons.forEach(s => {
    if (s.complete) seasonRows.push(Object.assign({ ownerId: m.id }, s));
  }));

  const records = {
    topWeeks: bySc,
    lowWeeks: bySc.slice().reverse(),
    blowouts: byMargin,
    nailbiters: closest,
    shootouts: byTotal,
    mostInLoss: losses,
    fewestInWin: wins,
    bestSeasonPF: seasonRows.slice().sort((a, b) => b.pf - a.pf),
    bestSeasonRec: seasonRows.slice().sort((a, b) =>
      (b.wins + b.ties * .5) - (a.wins + a.ties * .5) || b.pf - a.pf),
    crowns: crownList,
    longestWinStreak, longestLossStreak
  };

  /* ---------------- money ---------------------------------------------- */
  const money = computeMoney(seasons, managers, crownList);
  managerList.forEach(m => {
    const row = money.byManager[m.id];
    m.winnings = row ? row.total : 0;
    m.paidIn = row ? row.buyIns : 0;
    m.net = m.winnings - m.paidIn;
    m.cashes = row ? row.awards.length : 0;
  });

  return {
    fetchedAt: raw.fetchedAt,
    leagueName: raw.leagueName,
    seasons, money,
    completedSeasons: seasons.filter(s => s.complete),
    liveSeason: seasons.find(s => s.inProgress) || null,
    currentSeason: seasons[seasons.length - 1],
    managers, managerList, h2h, weekly, gameLog, records, seasonRows,
    qualifiedList: managerList.filter(m => m.qualified),
    minSeasons: MIN_SEASONS,
    regressGames: REGRESS,
    totals: {
      games: gameLog.length,
      points: weekly.reduce((a, w) => a + w.pts, 0),
      seasons: seasons.filter(s => s.complete).length
    }
  };
}

/* ------------------------------------------------------------------
   Money: who won what, what everyone paid in, and whether each
   season's prize pool actually adds up to what was collected.
   ------------------------------------------------------------------ */
function computeMoney(seasons, managers, crownList) {
  const cfgFor = season =>
    (typeof PAYOUTS !== 'undefined' && PAYOUTS[season]) ? PAYOUTS[season] : null;

  const byManager = {};
  const rowFor = ownerId => byManager[ownerId] || (byManager[ownerId] = {
    total: 0, buyIns: 0, awards: [], bySeason: {}
  });

  const seasonRows = seasons.map(s => {
    const cfg = cfgFor(s.season);
    if (!cfg) return null;

    const places = cfg.places || {};
    const teams = s.numTeams || s.teams.length || 0;
    const buyIn = cfg.buyIn || 0;
    const collected = buyIn * teams;

    // what the structure promises, whether or not it has been won yet
    const wh = cfg.weeklyHigh;
    const weeklyWeeks = wh ? (wh.to - wh.from + 1) : 0;
    const scheduled = Object.keys(places).reduce((a, k) => a + places[k], 0) +
      (wh ? wh.amount * weeklyWeeks : 0);

    const rosterFor = {
      champion: s.championRoster,
      runnerUp: s.runnerUpRoster,
      third: s.thirdRoster,
      consolation: s.consolationRoster
    };

    const awards = [];
    if (s.complete) {
      Object.keys(places).forEach(type => {
        const rid = rosterFor[type];
        const t = rid != null ? s.byRoster[rid] : null;
        if (!t) return;
        awards.push({
          season: s.season, type, label: PAYOUT_LABELS[type] || type,
          amount: places[type], ownerId: t.ownerId, rosterId: rid
        });
      });
    }

    // weekly prizes accrue as the season is played, not just at the end
    if (wh) {
      crownList.filter(c => c.season === s.season &&
        c.week >= wh.from && c.week <= wh.to).forEach(c => {
          awards.push({
            season: s.season, type: 'weeklyHigh',
            label: `Week ${c.week} high score`,
            amount: wh.amount, ownerId: c.ownerId, week: c.week, pts: c.pts
          });
        });
    }

    awards.forEach(a => {
      if (!a.ownerId) return;
      const row = rowFor(a.ownerId);
      row.total += a.amount;
      row.awards.push(a);
      row.bySeason[a.season] = (row.bySeason[a.season] || 0) + a.amount;
    });

    const paid = awards.reduce((a, x) => a + x.amount, 0);

    return {
      season: s.season, buyIn, teams, collected, scheduled, paid,
      difference: collected - scheduled,
      balanced: collected === scheduled,
      complete: s.complete, started: s.started,
      weeklyWeeks, config: cfg, awards
    };
  }).filter(Boolean);

  // Buy-ins are charged for any season a manager actually fielded a team.
  seasons.forEach(s => {
    if (!s.started) return;
    const cfg = cfgFor(s.season);
    if (!cfg || !cfg.buyIn) return;
    s.teams.forEach(t => { rowFor(t.ownerId).buyIns += cfg.buyIn; });
  });

  Object.keys(byManager).forEach(id => {
    const r = byManager[id];
    r.net = r.total - r.buyIns;
    r.awards.sort((a, b) => b.season.localeCompare(a.season) ||
      b.amount - a.amount || (a.week || 0) - (b.week || 0));
  });

  return {
    seasons: seasonRows,
    byManager,
    totalPaid: seasonRows.reduce((a, s) => a + s.paid, 0),
    totalCollected: seasonRows.filter(s => s.started)
      .reduce((a, s) => a + s.collected, 0),
    unbalanced: seasonRows.filter(s => !s.balanced)
  };
}

/* ------------------------------------------------------------------
   Season-level helpers used by charts and the playoff bracket
   ------------------------------------------------------------------ */

/** Cumulative points and wins by week for every team in a season. */
function seasonProgression(s) {
  const weeks = Array.from(new Set(s.games.map(g => g.week))).sort((a, b) => a - b);
  const series = {};
  s.teams.forEach(t => { series[t.rosterId] = { pts: [], wins: [], team: t }; });

  const runPts = {}, runWins = {};
  s.teams.forEach(t => { runPts[t.rosterId] = 0; runWins[t.rosterId] = 0; });

  weeks.forEach(w => {
    s.games.filter(g => g.week === w).forEach(g => {
      runPts[g.a] = (runPts[g.a] || 0) + g.ap;
      runPts[g.b] = (runPts[g.b] || 0) + g.bp;
      if (g.ap > g.bp) runWins[g.a] = (runWins[g.a] || 0) + 1;
      else if (g.bp > g.ap) runWins[g.b] = (runWins[g.b] || 0) + 1;
      else { runWins[g.a] = (runWins[g.a] || 0) + 0.5; runWins[g.b] = (runWins[g.b] || 0) + 0.5; }
    });
    s.teams.forEach(t => {
      series[t.rosterId].pts.push(runPts[t.rosterId] || 0);
      series[t.rosterId].wins.push(runWins[t.rosterId] || 0);
    });
  });
  return { weeks, series };
}

/** Group a Sleeper bracket into rounds, attaching scores where we have them. */
function bracketRounds(bracket, season) {
  if (!Array.isArray(bracket) || !bracket.length) return [];
  const byRound = {};
  bracket.forEach(m => { (byRound[m.r] = byRound[m.r] || []).push(m); });
  return Object.keys(byRound).sort((a, b) => a - b).map(r => {
    const week = season.playoffStart + Number(r) - 1;
    const wkScores = season.scores[week] || {};
    return {
      round: Number(r),
      week,
      matches: byRound[r].sort((a, b) => a.m - b.m).map(m => ({
        t1: m.t1, t2: m.t2, w: m.w, l: m.l, place: m.p,
        t1Pts: typeof m.t1 === 'number' ? wkScores[m.t1] : undefined,
        t2Pts: typeof m.t2 === 'number' ? wkScores[m.t2] : undefined,
        t1From: m.t1_from, t2From: m.t2_from
      }))
    };
  });
}
