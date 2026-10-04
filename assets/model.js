/* ===================================================================
   model.js — turns the raw seasons into every statistic the site shows.
   Pure computation: no fetching, no DOM.
   =================================================================== */

function buildModel(raw) {
  const seasons = raw.seasons;

  /* ---------------- what week is it right now? --------------------------
     Sleeper's /state/nfl is the authority. Fall back to the last week that
     actually has scores, so the site still knows where it is if that call
     failed. Clamped to the season's own week range either way. */
  const liveSeason = seasons.find(s => s.inProgress) || null;
  const nflState = raw.nflState || null;
  let currentWeek = null;
  if (liveSeason) {
    let w = null;
    if (nflState && String(nflState.season) === String(liveSeason.season) &&
        nflState.season_type === 'regular') {
      w = Number(nflState.week || nflState.display_week) || null;
    }
    if (!w) {
      const scored = Object.keys(liveSeason.pairings || {}).map(Number)
        .filter(x => (liveSeason.pairings[x] || []).some(p => p.played));
      w = scored.length ? Math.max.apply(null, scored) : 1;
    }
    currentWeek = Math.max(1, Math.min(w, liveSeason.lastLeg || w));
  }

  /* ---------------- finished games only ---------------------------------
     A week in progress is full of half-played lineups — teams sitting on 0.0
     because their players have not kicked off yet. Those are not results, and
     letting them through gives you "lowest score ever: 0.00" and career
     records that count a half-finished week. Everything historical is built
     from `finalGames`; the live views still read `games` for current scores. */
  seasons.forEach(s => {
    s.finalGames = (s.inProgress && currentWeek)
      ? s.games.filter(g => g.week < currentWeek)
      : s.games;
  });

  const played = seasons.filter(s => s.started && s.finalGames.length);

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
        regW: 0, regL: 0, pw: 0, pl: 0,
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
    s.finalGames.forEach(g => {
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

  /* ---------------- playoff games ---------------------------------------
     Sleeper's matchup data doesn't say which games were playoff games, but
     the winners bracket does: every match there has both teams, the round,
     and the bracket's own winner (which also settles a tied score the way
     Sleeper did). Scores come from that round's week(s). Only matches the
     bracket has actually decided count, so a live postseason fills in one
     round at a time. The consolation (losers) bracket is not the playoffs
     and stays out. */
  const playoffLog = [];
  seasons.forEach(s => {
    s.playoffGames = [];
    if (!s.playoffsUnderway) return;
    (s.winnersBracket || []).forEach(m => {
      if (typeof m.t1 !== 'number' || typeof m.t2 !== 'number') return;
      if (m.w !== m.t1 && m.w !== m.t2) return;          // not decided yet
      const weeks = playoffWeeks(s, m.r);
      let ap = 0, bp = 0, have = true;
      weeks.forEach(w => {
        const wk = s.scores[w] || {};
        if (wk[m.t1] == null || wk[m.t2] == null) have = false;
        ap += wk[m.t1] || 0; bp += wk[m.t2] || 0;
      });
      if (!have) return;
      const ta = s.byRoster[m.t1], tb = s.byRoster[m.t2];
      if (!ta || !tb) return;
      const label = m.p === 1 ? 'Championship' : m.p === 3 ? '3rd place game'
        : m.p === 5 ? '5th place game'
        : (m.r === Math.max.apply(null, s.winnersBracket.map(x => x.r)) - 1 ? 'Semifinal' : 'Quarterfinal');
      const g = {
        season: s.season, week: weeks[weeks.length - 1], round: m.r, label, place: m.p || null,
        a: m.t1, ap, b: m.t2, bp, winner: m.w
      };
      s.playoffGames.push(g);

      const A = ta.ownerId, B = tb.ownerId;
      const aWon = m.w === m.t1;
      bump(A, B, aWon ? 'w' : 'l', ap, bp);
      bump(B, A, aWon ? 'l' : 'w', bp, ap);
      h2h[A + '|' + B].pw = (h2h[A + '|' + B].pw || 0) + (aWon ? 1 : 0);
      h2h[A + '|' + B].pl = (h2h[A + '|' + B].pl || 0) + (aWon ? 0 : 1);
      h2h[B + '|' + A].pw = (h2h[B + '|' + A].pw || 0) + (aWon ? 0 : 1);
      h2h[B + '|' + A].pl = (h2h[B + '|' + A].pl || 0) + (aWon ? 1 : 0);
      h2h[A + '|' + B].games.push({ season: s.season, week: g.week, pts: ap, oppPts: bp, won: aWon, playoff: label });
      h2h[B + '|' + A].games.push({ season: s.season, week: g.week, pts: bp, oppPts: ap, won: !aWon, playoff: label });
      playoffLog.push({
        season: s.season, week: g.week, label,
        winner: aWon ? A : B, loser: aWon ? B : A,
        winnerRoster: m.w, loserRoster: aWon ? m.t2 : m.t1,
        hi: aWon ? ap : bp, lo: aWon ? bp : ap
      });
    });
  });

  /* ---------------- career aggregates -------------------------------- */
  seasons.forEach(s => {
    if (!s.started) return;
    s.standings.forEach(t => {
      const m = touch(t.ownerId, t);
      const champ = s.championRoster === t.rosterId;
      const pw = s.playoffGames.filter(g => g.winner === t.rosterId).length;
      const pl = s.playoffGames.filter(g => (g.a === t.rosterId || g.b === t.rosterId) &&
        g.winner !== t.rosterId).length;
      const row = {
        season: s.season, seed: t.seed, wins: t.wins, losses: t.losses, ties: t.ties,
        pf: t.pf, pa: t.pa, teamName: t.teamName, rosterId: t.rosterId,
        playoffW: pw, playoffL: pl,
        champion: champ,
        runnerUp: s.runnerUpRoster === t.rosterId,
        third: s.thirdRoster === t.rosterId,
        consolation: s.consolationRoster === t.rosterId,
        playoffs: s.playoffRosters.includes(t.rosterId),
        lastPlace: s.lastPlaceRoster === t.rosterId,
        complete: s.complete
      };
      m.seasons.push(row);
      // Career record = regular season + playoff games. The regular-season
      // half is kept separately for the places that want it on its own.
      m.regW += t.wins; m.regL += t.losses;
      m.pw += pw; m.pl += pl;
      m.w += t.wins + pw; m.l += t.losses + pl; m.ties += t.ties;
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
    s.finalGames.forEach(g => {
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

  // "Active" = owns a roster in the newest season, even if it hasn't
  // started yet. (Pre-draft rosters exist, so this is always known.)
  const newest = seasons[seasons.length - 1];
  const activeIds = new Set(newest ? newest.teams.map(t => t.ownerId) : []);

  const managerList = Object.values(managers).map(m => {
    const g = m.w + m.l + m.ties;
    m.games = g;
    m.winPct = g ? (m.w + m.ties * 0.5) / g : 0;
    m.adjWinPct = (m.w + m.ties * 0.5 + REGRESS * 0.5) / (g + REGRESS);
    m.fullSeasons = m.seasons.filter(s => s.complete).length;
    // Playoff trips in finished seasons only, so "missed playoffs" can't go
    // negative while a live season is in its playoff weeks.
    m.fullPlayoffs = m.seasons.filter(s => s.complete && s.playoffs).length;
    m.regGames = m.regW + m.regL + m.ties;
    m.playoffGames = m.pw + m.pl;
    m.qualified = m.fullSeasons >= MIN_SEASONS;
    m.firstSeason = m.seasons.length ? m.seasons[0].season : null;
    m.rookie = !!latestSeason && m.firstSeason === latestSeason;
    m.ppg = m.weeks ? m.pf / m.weeks : 0;
    m.papg = m.weeks ? m.pa / m.weeks : 0;
    m.diff = m.pf - m.pa;
    m.active = activeIds.has(m.id);
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

  /* ---------------- current record holders ------------------------------
     Every league record and who holds it right now. Recomputed from
     scratch each load, so the moment a record falls the showcase moves
     to the new holder automatically. */
  const recordHolders = (() => {
    const list = [];
    const add = (key, label, display, owners, detail, tone) => {
      owners = (Array.isArray(owners) ? owners : [owners]).filter(Boolean);
      if (!owners.length) return;
      list.push({ key, label, display, owners, detail: detail || '', tone: tone || '' });
    };
    const wk = f => f ? `${f.season} · Week ${f.week}` : '';
    const w = records.topWeeks[0], lo = records.lowWeeks[0],
      bl = records.blowouts[0], nb = records.nailbiters[0],
      sh = records.shootouts[0], ml = records.mostInLoss[0],
      fw = records.fewestInWin[0],
      bpf = records.bestSeasonPF[0], brec = records.bestSeasonRec[0];

    if (w) add('topWeek', 'Highest single week', n2(w.pts), w.ownerId, wk(w), 'hot');
    if (lo) add('lowWeek', 'Lowest single week', n2(lo.pts), lo.ownerId, wk(lo), 'cold');
    if (bl) {
      add('blowoutW', 'Biggest blowout win', 'by ' + n2(bl.margin), bl.winner, wk(bl), 'hot');
      add('blowoutL', 'Biggest blowout loss', 'by ' + n2(bl.margin), bl.loser, wk(bl), 'cold');
    }
    if (nb) add('closest', 'Closest win ever', 'by ' + n2(nb.margin), nb.winner, wk(nb), 'hot');
    if (sh) add('shootout', 'Highest-scoring game', n2(sh.total) + ' combined',
      [sh.winner, sh.loser], wk(sh));
    if (ml) add('mostLoss', 'Most points in a loss', n2(ml.pts), ml.ownerId, wk(ml), 'cold');
    if (fw) add('fewWin', 'Fewest points in a win', n2(fw.pts), fw.ownerId, wk(fw));
    if (bpf) add('seasonPF', 'Most points in a season', n2(bpf.pf), bpf.ownerId,
      bpf.season + ' regular season', 'hot');
    if (brec) add('seasonRec', 'Best regular season',
      `${brec.wins}-${brec.losses}${brec.ties ? '-' + brec.ties : ''}`, brec.ownerId,
      brec.season + (brec.champion ? ' · won the title too' : ''), 'hot');
    if (longestWinStreak) add('winStreak', 'Longest win streak',
      longestWinStreak.n + ' games', longestWinStreak.id,
      `through ${longestWinStreak.end.season} Week ${longestWinStreak.end.week}`, 'hot');
    if (longestLossStreak) add('lossStreak', 'Longest losing streak',
      longestLossStreak.n + ' games', longestLossStreak.id,
      `through ${longestLossStreak.end.season} Week ${longestLossStreak.end.week}`, 'cold');

    /* career maxima — ties share the record */
    const maxOwners = fn => {
      const mx = Math.max.apply(null, managerList.map(fn));
      return { mx, owners: managerList.filter(m => fn(m) === mx).map(m => m.id) };
    };
    const cr = maxOwners(m => m.crowns);
    if (cr.mx > 0) add('crowns', 'Most weekly crowns', cr.mx + ' crowns', cr.owners,
      'highest score of the week, all-time', 'hot');
    const ti = maxOwners(m => m.titles.length);
    if (ti.mx > 0) add('titles', 'Most championships', ti.mx + (ti.mx === 1 ? ' title' : ' titles'),
      ti.owners, '', 'hot');
    const q = managerList.filter(m => m.qualified);
    if (q.length) {
      const bp = Math.max.apply(null, q.map(m => m.winPct));
      add('winPct', 'Best career win %', pct(bp),
        q.filter(m => m.winPct === bp).map(m => m.id), `${MIN_SEASONS}+ seasons`, 'hot');
      const bg = Math.max.apply(null, q.map(m => m.ppg));
      add('ppg', 'Highest career PPG', n1(bg),
        q.filter(m => m.ppg === bg).map(m => m.id), `${MIN_SEASONS}+ seasons`, 'hot');
    }
    const cp = maxOwners(m => m.pf);
    if (cp.mx > 0) add('careerPF', 'Most career points',
      Math.round(cp.mx).toLocaleString(), cp.owners, 'all-time scoring leader', 'hot');
    return list;
  })();

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
    seasons, money, nflState, currentWeek,
    completedSeasons: seasons.filter(s => s.complete),
    liveSeason,
    currentSeason: seasons[seasons.length - 1],
    managers, managerList, h2h, weekly, gameLog, playoffLog, records, seasonRows, recordHolders,
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
   Projected score

   Starters who have already played contribute their real points.
   Everyone still to play contributes Sleeper's own projection for
   them and nothing else. No model sits on top of Sleeper's numbers.
   ------------------------------------------------------------------ */

/**
 * Projected final score for one side of a matchup, built only from
 * Sleeper's own per-player projections.
 * @param {string[]} starters      roster's starting player ids
 * @param {number[]} startersPoints points already scored, parallel to starters
 * @param {object}   proj          player id -> projection record
 * @param {string}   today         YYYY-MM-DD, local
 */
function projectSide(starters, startersPoints, proj, today) {
  let expected = 0, remaining = 0, totalProj = 0;
  (starters || []).forEach((pid, i) => {
    if (!pid || pid === '0') return;                 // empty lineup slot
    const info = proj ? proj[pid] : null;
    const p = info && info.proj != null ? info.proj : 0;
    const actual = Number((startersPoints || [])[i]) || 0;
    totalProj += p;
    // Someone whose game day has passed is finished even if he scored nothing;
    // otherwise any points on the board mean he has started.
    const isDone = actual > 0 || (info && info.date && info.date < today);
    if (isDone) expected += actual;
    else { expected += p; remaining += p; }
  });
  return { expected, remaining, hasProjection: totalProj > 0 };
}

/* ------------------------------------------------------------------
   Season-level helpers used by charts and the playoff bracket
   ------------------------------------------------------------------ */

/** Cumulative points and wins by week for every team in a season. */
function seasonProgression(s) {
  // finished weeks only: a half-played week would put a fake dip in every line
  const games = s.finalGames || s.games;
  const weeks = Array.from(new Set(games.map(g => g.week))).sort((a, b) => a - b);
  const series = {};
  s.teams.forEach(t => { series[t.rosterId] = { pts: [], wins: [], team: t }; });

  const runPts = {}, runWins = {};
  s.teams.forEach(t => { runPts[t.rosterId] = 0; runWins[t.rosterId] = 0; });

  weeks.forEach(w => {
    games.filter(g => g.week === w).forEach(g => {
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

/** The NFL week(s) a playoff round is played over. Sleeper's
    playoff_round_type: 0 = one week per round, 1 = two-week championship,
    2 = two weeks per round. Every season so far has been type 0. */
function playoffWeeks(season, round) {
  const start = season.playoffStart, type = season.playoffRoundType || 0;
  const r = Number(round);
  if (type === 2) return [start + (r - 1) * 2, start + (r - 1) * 2 + 1];
  const wk = start + r - 1;
  if (type === 1) {
    const last = Math.max.apply(null, (season.winnersBracket || []).map(m => m.r).concat([r]));
    if (r === last) return [wk, wk + 1];
  }
  return [wk];
}

/** Group a Sleeper bracket into rounds, attaching scores where we have them. */
function bracketRounds(bracket, season) {
  if (!Array.isArray(bracket) || !bracket.length) return [];
  const byRound = {};
  bracket.forEach(m => { (byRound[m.r] = byRound[m.r] || []).push(m); });
  return Object.keys(byRound).sort((a, b) => a - b).map(r => {
    const weeks = playoffWeeks(season, r);
    const ptsFor = rid => {
      if (typeof rid !== 'number') return undefined;
      let total = 0, any = false;
      weeks.forEach(w => {
        const v = (season.scores[w] || {})[rid];
        if (v != null) { total += v; any = true; }
      });
      return any ? total : undefined;
    };
    return {
      round: Number(r),
      week: weeks[0],
      weeks,
      matches: byRound[r].sort((a, b) => a.m - b.m).map(m => ({
        t1: m.t1, t2: m.t2, w: m.w, l: m.l, place: m.p,
        t1Pts: ptsFor(m.t1),
        t2Pts: ptsFor(m.t2),
        t1From: m.t1_from, t2From: m.t2_from
      }))
    };
  });
}

/* ------------------------------------------------------------------
   Trade grades

   Only finished seasons are graded: a trade's grade is what actually
   happened after it, so a live season has nothing to grade yet.

   How a side is valued
   - Each player a team received is followed week by week from the trade
     onward, for as long as he stayed on that roster. Trade him on, drop
     him, and he stops counting for that team.
   - Each week he earns points over a replacement-level player at his
     position (never below zero: a bad or injured week costs nothing,
     because the team could start somebody else). Replacement level is
     what the last rostered starter at that position typically scored
     that season, so a 20-point kicker week and a 20-point running back
     week aren't treated as equal.
   - Regular-season weeks always count. Playoff weeks count only while the
     team was still alive in the championship bracket.
   - FAAB changing hands is shown but not valued. FAAB-only deals aren't
     graded at all.

   How a side is graded
   Its value minus the average value of what the other side(s) got. That
   difference, in replacement-adjusted points, maps to a letter. The two
   sides of a two-team deal always mirror each other (A pairs with D-).
   ------------------------------------------------------------------ */
const TRADE_GRADE_BANDS = [
  // [minimum net, winner letter, loser letter]
  [60, 'A+', 'F'],
  [40, 'A', 'D-'],
  [25, 'A-', 'D'],
  [15, 'B+', 'D+'],
  [8, 'B', 'C-'],
  [3, 'B-', 'C+'],
  [0, 'C', 'C']
];
const GRADE_POINTS = {
  'A+': 4.3, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7,
  'C+': 2.3, C: 2, 'C-': 1.7, 'D+': 1.3, D: 1, 'D-': 0.7, F: 0
};

function letterFor(net) {
  const a = Math.abs(net);
  const band = TRADE_GRADE_BANDS.find(b => a >= b[0]) || TRADE_GRADE_BANDS[TRADE_GRADE_BANDS.length - 1];
  return net >= 0 ? (a < 3 ? 'C' : band[1]) : (a < 3 ? 'C' : band[2]);
}

/** How many starters each team fields at each position, flex spots shared out. */
function starterSlots(rosterPositions) {
  const share = {
    QB: { QB: 1 }, RB: { RB: 1 }, WR: { WR: 1 }, TE: { TE: 1 }, K: { K: 1 }, DEF: { DEF: 1 },
    FLEX: { RB: 0.4, WR: 0.5, TE: 0.1 },
    WRRB_FLEX: { RB: 0.5, WR: 0.5 },
    REC_FLEX: { WR: 0.8, TE: 0.2 },
    SUPER_FLEX: { QB: 0.8, RB: 0.1, WR: 0.1 }
  };
  const slots = {};
  (rosterPositions || []).forEach(p => {
    const s = share[p];
    if (!s) return;
    Object.keys(s).forEach(k => { slots[k] = (slots[k] || 0) + s[k]; });
  });
  return slots;
}

/**
 * @param {object} s            a finished season
 * @param {object[]} txns       loadTransactions(s)
 * @param {object} weeksPts     loadPlayerWeeks(s): { week: { rosterId: { pid: pts } } }
 * @param {function} posOf      player id -> position
 */
function gradeSeasonTrades(s, txns, weeksPts, posOf) {
  const teams = s.numTeams || s.teams.length;
  const regEnd = s.playoffStart - 1;

  /* Replacement level per position, from the regular season: rank every
     rostered player by his average in the weeks he actually played (byes
     and inactive zeros left out, at least 4 games), then take the average
     of the last starter at that spot. 12 teams starting 1 QB makes it the
     12th-best QB's average. */
  const slots = starterSlots(s.rosterPositions);
  const games = {};   // pid -> [points, ...]
  range(1, regEnd).forEach(w => {
    const wk = weeksPts[w];
    if (!wk) return;
    Object.keys(wk).forEach(rid => Object.keys(wk[rid]).forEach(pid => {
      const p = wk[rid][pid];
      if (p !== 0) (games[pid] = games[pid] || []).push(p);
    }));
  });
  const baseline = {};
  Object.keys(slots).forEach(pos => {
    const k = Math.max(1, Math.round(teams * slots[pos]));
    const avgs = Object.keys(games)
      .filter(pid => posOf(pid) === pos && games[pid].length >= 4)
      .map(pid => games[pid].reduce((a, b) => a + b, 0) / games[pid].length)
      .sort((a, b) => b - a);
    baseline[pos] = avgs.length ? avgs[Math.min(k, avgs.length) - 1] : 0;
  });

  /* which rosters were still alive in the championship bracket, by week */
  const aliveIn = {};
  (s.winnersBracket || []).forEach(m => {
    playoffWeeks(s, m.r).forEach(w => {
      const set = aliveIn[w] || (aliveIn[w] = new Set());
      // The 5th-place game pays nothing; every other bracket game is either
      // a title shot or the paid 3rd-place game, so those weeks count.
      if (m.p === 5) return;
      if (typeof m.t1 === 'number') set.add(m.t1);
      if (typeof m.t2 === 'number') set.add(m.t2);
    });
  });
  const counts = (rid, w) => w <= regEnd || (aliveIn[w] && aliveIn[w].has(rid));

  const follow = (pid, rid, fromWeek) => {
    const pos = posOf(pid);
    const base = baseline[pos] || 0;
    let started = false, pts = 0, vor = 0, weeks = 0;
    for (let w = fromWeek; w <= s.lastLeg; w++) {
      const onRoster = weeksPts[w] && weeksPts[w][rid] && weeksPts[w][rid][pid] != null;
      if (!onRoster) {
        // the trade week's snapshot can predate the trade; allow it to miss
        if (!started && w === fromWeek) continue;
        break;
      }
      started = true;
      if (!counts(rid, w)) continue;
      const p = weeksPts[w][rid][pid];
      pts += p; vor += Math.max(0, p - base); weeks++;
    }
    return { pid, pos, pts, vor, weeks };
  };

  /* Trade trees. A player who is flipped in a later trade carries a share
     of what that trade brought back (split evenly over everything the team
     sent in it), so turning one deal into a better one counts. Graded
     newest first, so a later trade's value is known before an earlier one
     needs it, and a chain of flips adds up all the way down. */
  const trades = txns.filter(t => t.type === 'trade')
    .slice().sort((a, b) => (b.created || 0) - (a.created || 0));
  const result = {};
  const flippedIn = (pid, rid, after) => trades
    .filter(t2 => (t2.created || 0) > (after || 0) && t2.drops && t2.drops[pid] === rid)
    .sort((a, b) => a.created - b.created)[0] || null;

  trades.forEach(t => {
    const rosters = t.rosters || [];
    const sides = rosters.map(rid => {
      const got = Object.keys(t.adds || {}).filter(pid => t.adds[pid] === rid);
      const players = got.map(pid => {
        const f = follow(pid, rid, t.week);
        const t2 = flippedIn(pid, rid, t.created);
        const g2 = t2 && result[t2.id];
        if (g2 && g2.graded) {
          const side2 = g2.sides.find(x => x.rosterId === rid);
          const sent = Object.keys(t2.drops || {}).filter(x => t2.drops[x] === rid).length || 1;
          if (side2) {
            f.flip = { week: t2.week, value: side2.value / sent };
            f.vor += f.flip.value;
          }
        }
        return f;
      }).sort((a, b) => b.vor - a.vor || b.pts - a.pts);
      const team = s.byRoster[rid];
      return {
        rosterId: rid,
        ownerId: team ? team.ownerId : null,
        players,
        faab: (t.faab || []).filter(f => f.receiver === rid).reduce((a, f) => a + (f.amount || 0), 0),
        value: players.reduce((a, p) => a + p.vor, 0),
        pts: players.reduce((a, p) => a + p.pts, 0)
      };
    });

    const anyPlayers = sides.some(sd => sd.players.length);
    const graded = anyPlayers && sides.length >= 2;
    sides.forEach(sd => {
      const others = sides.filter(o => o !== sd);
      sd.net = graded ? sd.value - others.reduce((a, o) => a + o.value, 0) / others.length : 0;
      sd.grade = graded ? letterFor(sd.net) : null;
      sd.gpa = graded ? GRADE_POINTS[sd.grade] : null;
    });
    const sorted = sides.slice().sort((a, b) => b.net - a.net);
    result[t.id] = {
      id: t.id, season: s.season, week: t.week, created: t.created,
      graded, sides,
      winner: graded && sorted[0].net >= 3 ? sorted[0] : null,
      margin: graded ? sorted[0].net - sorted[sorted.length - 1].net : 0
    };
  });
  // back in the order the transactions came in (newest first)
  return txns.filter(t => t.type === 'trade').map(t => result[t.id]);
}

/** Per-manager trade report across every graded trade. */
function tradeReport(gradedTrades) {
  const by = {};
  gradedTrades.filter(t => t.graded).forEach(t => t.sides.forEach(sd => {
    if (!sd.ownerId) return;
    const r = by[sd.ownerId] || (by[sd.ownerId] = {
      ownerId: sd.ownerId, trades: 0, gpaSum: 0, net: 0, won: 0, lost: 0, even: 0, best: null, worst: null
    });
    r.trades++; r.gpaSum += sd.gpa; r.net += sd.net;
    if (sd.net >= 3) r.won++; else if (sd.net <= -3) r.lost++; else r.even++;
    if (!r.best || sd.net > r.best.side.net) r.best = { trade: t, side: sd };
    if (!r.worst || sd.net < r.worst.side.net) r.worst = { trade: t, side: sd };
  }));
  return Object.values(by).map(r => Object.assign(r, { gpa: r.gpaSum / r.trades }))
    .sort((a, b) => b.gpa - a.gpa || b.net - a.net);
}

/** GPA back to the nearest letter, for a manager's overall trade grade. */
function letterForGpa(g) {
  let best = 'F', diff = Infinity;
  Object.keys(GRADE_POINTS).forEach(k => {
    const d = Math.abs(GRADE_POINTS[k] - g);
    if (d < diff) { diff = d; best = k; }
  });
  return best;
}
