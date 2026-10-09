/* ===================================================================
   views-overview.js — Overview (home), This Week and Outlook.
   =================================================================== */

/* ------------------------------ live week helpers ----------------- */
/** Regressed scoring average for a team, for odds before kickoff. */
function teamStrength(s, rid) {
  const st = s.stats && s.stats[rid];
  const all = [];
  if (s.stats) Object.values(s.stats).forEach(r => all.push.apply(all, r.scores));
  const lg = all.length ? mean(all) : 118;
  if (!st || !st.g) return lg;
  return (st.pf + 4 * lg) / (st.g + 4);
}

/**
 * One week's matchups with live scores, projected finals and odds.
 * proj: that week's projections ({} when unavailable or not needed).
 */
const weekIsFinal = (s, wk) => !(MODEL.liveSeason === s && wk > (MODEL.lastFinal || 0));
const weekStatus = wk => (MODEL.gameStatus && MODEL.gameStatus[wk]) || null;

/** Has this player's game kicked off (so his lineup spot is locked)? */
function playerLocked(info, pts, status, today) {
  const st = status && info && info.team ? status[info.team] : null;
  if (st) return st !== 'pre_game';
  return pts > 0 || !!(info && info.date && info.date < today);
}

function weekMatchups(s, wk, proj) {
  const final = weekIsFinal(s, wk);
  const status = weekStatus(wk);
  const lineups = (s.lineups && s.lineups[wk]) || {};
  const today = todayISO();
  const hasProj = proj && Object.keys(proj).length > 0;
  return ((s.pairings && s.pairings[wk]) || []).map(p => {
    const side = rid => {
      const lu = lineups[rid] || {};
      if (final) return { expected: p.a === rid ? p.ap : p.bp, remaining: 0, total: 0 };
      if (hasProj) return projectSide(lu.st, lu.sp, proj, today, status);
      return { expected: teamStrength(s, rid), remaining: 1, total: 1, fallback: true };
    };
    const sa = side(p.a), sb = side(p.b);
    let pA = null;
    // every starter on both sides is done: decided, just not official yet
    const decided = !final && hasProj && p.played && sa.remaining === 0 && sb.remaining === 0;
    if (final || decided) pA = p.ap > p.bp ? 1 : p.ap < p.bp ? 0 : 0.5;
    else if (!(sa.fallback && p.played)) pA = winProb(sa, sb, MODEL.spread);
    return Object.assign({}, p, { sa, sb, pA, final, decided });
  });
}

/**
 * One matchup as a small scoreboard tile. With `href` it links to the This
 * Week page; with `panel` it's a button that swaps in that matchup's
 * head-to-head panel (see the pickers in app.js).
 */
function scoreTile(s, m, o) {
  o = o || {};
  const ta = s.byRoster[m.a], tb = s.byRoster[m.b];
  if (!ta || !tb) return '';
  const done = m.final || m.decided;
  const aw = done && m.ap > m.bp, bw = done && m.bp > m.ap;
  const live = m.pA != null && !done;
  const line = (t, pts, sd, won, lost) => `<span class="mt-line${won ? ' won' : ''}${lost ? ' lost' : ''}">
      ${avatar(t.ownerId)}<span class="mt-nm">${esc(mgr(t.ownerId).name)}${youBadge(t.ownerId)}</span>
      <span class="mt-pts">${m.played || m.final ? n2(pts) : `<span class="mt-proj" title="Projected">${n1(sd.expected)}</span>`}</span></span>`;
  const lead = m.sa.expected >= m.sb.expected ? ta : tb;
  const margin = Math.abs(m.sa.expected - m.sb.expected);
  const foot = done
    ? (m.ap === m.bp ? 'Tie' : `${m.final ? 'Final' : 'All games over'}: ${esc(mgr((m.ap > m.bp ? ta : tb).ownerId).name)} by ${n2(Math.abs(m.ap - m.bp))}`)
    : margin >= 0.05 ? `${esc(mgr(lead.ownerId).name)} by ${n1(margin)} projected` : 'Dead even';
  const you = isYou(ta.ownerId) || isYou(tb.ownerId);
  const attrs = o.href ? `href="${o.href}"`
    : `type="button" role="tab" data-pick="${o.panel}" data-pick-param="t" data-pick-value="${m.a}" aria-selected="${o.sel ? 'true' : 'false'}" aria-controls="${o.panel}"`;
  const tag = o.href ? 'a' : 'button';
  return `<${tag} class="mtile${you ? ' you' : ''}" ${attrs}>
    ${line(ta, m.ap, m.sa, aw, bw)}${line(tb, m.bp, m.sb, bw, aw)}
    ${live ? `<span class="mt-wp" title="${pct0(m.pA)} – ${pct0(1 - m.pA)} to win"><i style="width:${(m.pA * 100).toFixed(1)}%"></i></span>` : ''}
    <span class="mt-foot">${foot}</span>
  </${tag}>`;
}

/** Matchups with the viewer's first. */
function viewerFirst(s, ms) {
  const mine = m => [m.a, m.b].some(rid => s.byRoster[rid] && isYou(s.byRoster[rid].ownerId)) ? 1 : 0;
  return ms.slice().sort((x, y) => mine(y) - mine(x));
}

/* ============================== OVERVIEW =========================== */
function standingsRows(stats, season) {
  return stats.map(a => {
    const id = a.ownerId;
    const s = season ? MODEL.seasons.find(x => x.season === season) : null;
    const team = s ? s.teams.find(t => t.ownerId === id) : null;
    return `<tr class="${youRow(id)}">
      ${s ? tdv(team ? team.seed : 99, team ? team.seed : '', 'rank') : ''}
      <td>${mgrCell(id, team ? team.teamName : null)}</td>
      <td class="num">${a.w}</td><td class="num">${a.l}</td>
      ${tdv(a.winPct, pct(a.winPct))}
      ${tdv(a.pf, n2(a.pf))}
      ${tdv(a.pa, n2(a.pa))}
      ${tdv(a.diff, colorNum(a.diff, n2))}
      ${tdv(a.ppg, n2(a.ppg))}
      ${tdv(a.eff, a.eff ? pct(a.eff) : '&mdash;')}
      ${tdv(a.allPct, pct(a.allPct))}
      ${tdv(a.luck, colorNum(a.luck, n0))}
      ${tdv(a.papg, n2(a.papg), 'num col-extra')}
      ${tdv(a.maxPf, n2(a.maxPf), 'num col-extra')}
      ${tdv(a.luckyW, a.luckyW, 'num col-extra')}
      ${tdv(a.unluckyL, a.unluckyL, 'num col-extra')}
      ${tdv(a.sd, '±' + n1(a.sd), 'num col-extra')}
      ${tdv(a.streak, a.streak, 'num col-extra')}
      ${tdv(a.blowouts, a.blowouts, 'num col-extra')}
    </tr>`;
  });
}

function standingsHeaders(withSeed) {
  return (withSeed ? [{ label: 'Seed', num: 1 }] : []).concat([
    { label: 'Team', sort: 'text' }, { label: 'W', num: 1 }, { label: 'L', num: 1 },
    { label: 'Win%', num: 1 }, { label: 'PF', num: 1 }, { label: 'PA', num: 1 },
    { label: '+/-', num: 1 }, { label: 'Avg PF', num: 1 },
    { label: 'Eff%', num: 1, title: 'Points scored as a share of the best lineup you could have set' },
    { label: 'PWin%', num: 1, title: 'All-play win rate: your score against every team, every week' },
    { label: 'Luck', num: 1, title: 'Wins while scoring under the weekly median, minus losses while scoring over it' },
    { label: 'Avg PA', num: 1, extra: 1 }, { label: 'Max PF', num: 1, extra: 1 },
    { label: 'Lucky W', num: 1, extra: 1 }, { label: 'Unlucky L', num: 1, extra: 1 },
    { label: 'Std Dev', num: 1, extra: 1 }, { label: 'W Streak', num: 1, extra: 1 },
    { label: 'Blowouts', num: 1, extra: 1, title: 'Wins by 40 or more' }
  ]);
}

function liveStrip() {
  const live = MODEL.liveSeason;
  if (!live || !MODEL.currentWeek) return '';
  const wk = MODEL.currentWeek;
  const id = 'liveStrip';
  const done = weekIsFinal(live, wk);
  return section(`Week ${wk} <span class="tag">${done ? 'Final' : 'Live'}</span>`, deferred(id, async () => {
    const proj = await loadProjections(live.season, wk);
    const ms = weekMatchups(live, wk, proj);
    return `<div class="scoreboard">${viewerFirst(live, ms).map(m => scoreTile(live, m, { href: hrefWith('week', { t: m.a }) })).join('')}</div>`;
  }, `<div class="grid g3">${skeleton('Loading this week’s matchups…')}</div>`), {
    act: `<a href="#/week">Lineups and odds &rarr;</a>`, tight: true
  });
}

function draftCountdown() {
  const up = !MODEL.liveSeason && MODEL.currentSeason && !MODEL.currentSeason.complete ? MODEL.currentSeason : null;
  if (!up || !up.draftStart || up.draftStatus !== 'pre_draft') return '';
  const d = new Date(up.draftStart);
  const when = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  after(host => {
    const cd = $('#draftCountdown', host);
    if (!cd) return;
    clearInterval(draftCountdown._t);
    const ts = Number(cd.dataset.ts);
    const nums = {};
    $$('.cd-num', cd).forEach(n => { nums[n.dataset.u] = n; });
    const tick = () => {
      const diff = Math.floor((ts - Date.now()) / 1000);
      if (diff <= 0) { clearInterval(draftCountdown._t); $('.countdown', cd).innerHTML = '<b>It’s draft day. Good luck, gentlemen.</b>'; return; }
      nums.d.textContent = Math.floor(diff / 86400);
      nums.h.textContent = String(Math.floor(diff % 86400 / 3600)).padStart(2, '0');
      nums.m.textContent = String(Math.floor(diff % 3600 / 60)).padStart(2, '0');
      nums.s.textContent = String(diff % 60).padStart(2, '0');
    };
    tick();
    draftCountdown._t = setInterval(tick, 1000);
  });
  return `<div class="hero" id="draftCountdown" data-ts="${up.draftStart}">
    <div><div class="hero-eyebrow">${esc(up.season)} Draft</div>
      <h2>${esc(when)}</h2>
      <p><a href="https://sleeper.com/draft/nfl/${esc(up.draftId)}" target="_blank" rel="noopener">Open the draft room &rarr;</a></p></div>
    <div class="countdown">
      ${['d', 'h', 'm', 's'].map(u => `<div class="cd-tile"><span class="cd-num" data-u="${u}">&ndash;</span><span class="cd-label">${{ d: 'days', h: 'hours', m: 'min', s: 'sec' }[u]}</span></div>`).join('')}
    </div></div>`;
}

views.home = params => {
  const season = params.season && MODEL.seasons.find(s => s.season === params.season && s.started) ? params.season : '';
  const tab = params.tab === 'advanced' ? 'advanced' : 'overview';
  const list = seasonsFor(season);
  const started = MODEL.seasons.filter(s => s.started).slice().reverse();
  const stats = MODEL.statsFor(list);
  const lastDone = MODEL.completedSeasons[MODEL.completedSeasons.length - 1];
  const champT = lastDone && lastDone.byRoster[lastDone.championRoster];
  const champLine = champT && !season ? `<a class="champ-line" href="#/champions" style="text-decoration:none">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>
      <span>Reigning champion <b>${esc(mgr(champT.ownerId).name)}</b>${youBadge(champT.ownerId)} &middot; ${esc(lastDone.season)} &middot; ${esc(champT.teamName)}${
        mgr(champT.ownerId).titles.length > 1 ? ` &middot; ${mgr(champT.ownerId).titles.length} titles` : ''}</span></a>` : '';
  const head = `${draftCountdown()}${champLine}
    ${!season ? liveStrip() : ''}
    <div class="section">
    ${seasonPills('home', { tab: params.tab }, started, season, { all: 'All seasons' })}
    ${learn(`Records are regular season. <a href="#/home?tab=${tab}&amp;focus=howto">How efficiency, all-play and luck work</a>`)}
    ${tabs('home', { season }, [['overview', 'Overview'], ['advanced', 'Advanced']], tab)}
    </div>`;
  if (!stats.length) return head + empty('No games have been played yet.');
  return head + (tab === 'advanced' ? overviewAdvanced(list, stats, season) : overviewMain(list, stats, season));
};

function overviewMain(list, stats, season) {
  const me = viewerId();
  const by = (k, dir, pool) => (pool || stats).slice().sort((a, b) => dir * (b[k] - a[k]))[0];
  const maxG = Math.max.apply(null, stats.map(a => a.g));
  const enough = stats.filter(a => a.g >= Math.max(4, maxG * 0.5));
  const bestRec = by('winPct', 1, enough), ppg = by('ppg', 1, enough), eff = by('eff', 1, enough.filter(a => a.maxPf)),
    cons = by('sd', -1, enough);
  const games = sum(list.map(s => (s.finalGames || []).length));
  const done = list.filter(s => s.complete).length;

  const cards = `<div class="grid g6">
    ${statCard({ label: 'Seasons', value: list.length, sub: `${done} complete${list.length > done ? ', 1 live' : ''}`, acc: 'blue' })}
    ${statCard({ label: 'Games Played', value: games.toLocaleString(), sub: 'regular season', acc: 'violet' })}
    ${bestRec ? statCard({ label: 'Best Record', value: wlt(bestRec.w, bestRec.l, bestRec.t), sub: `<span>${esc(mgr(bestRec.ownerId).name)}</span>${youBadge(bestRec.ownerId)}`, acc: 'green', you: isYou(bestRec.ownerId) }) : ''}
    ${ppg ? statCard({ label: 'Avg Points Leader', value: n1(ppg.ppg), sub: `<span>${esc(mgr(ppg.ownerId).name)}</span>${youBadge(ppg.ownerId)}`, acc: 'amber', you: isYou(ppg.ownerId) }) : ''}
    ${eff ? statCard({ label: 'Most Efficient', value: pct(eff.eff), sub: `<span>${esc(mgr(eff.ownerId).name)}</span>${youBadge(eff.ownerId)}`, acc: 'purple', you: isYou(eff.ownerId) }) : ''}
    ${cons ? statCard({ label: 'Most Consistent', value: '±' + n1(cons.sd), sub: `<span>${esc(mgr(cons.ownerId).name)}</span>${youBadge(cons.ownerId)}`, acc: 'teal', you: isYou(cons.ownerId) }) : ''}
  </div>`;

  const sorted = season
    ? stats.slice().sort((a, b) => {
      const s = list[0], ta = s.teams.find(t => t.ownerId === a.ownerId), tb = s.teams.find(t => t.ownerId === b.ownerId);
      return (ta ? ta.seed : 99) - (tb ? tb.seed : 99);
    })
    : stats.slice().sort((a, b) => b.w - a.w || b.winPct - a.winPct);
  const standings = section('Standings', `
    <div class="toolbar"><button class="chip" data-cols="#ovStandings" data-more-label="Show all 18 columns" data-less="Show fewer columns">Show all 18 columns</button>
      <span class="small muted">Click any column to sort.</span></div>
    ${table(standingsHeaders(!!season), standingsRows(sorted, season), { sortable: true, id: 'ovStandings' })}`,
    { act: season ? `<a href="#/standings?season=${esc(season)}">Season page &rarr;</a>` : `<a href="#/managers">Career stats &rarr;</a>` });

  // season history: yours when you've picked yourself, the league's otherwise
  let history;
  if (me && MODEL.managers[me]) {
    const rows = MODEL.managers[me].seasons.slice().reverse().map(r => {
      const s = MODEL.seasons.find(x => x.season === r.season);
      const st = s && s.stats && s.stats[r.rosterId];
      const champ = s && s.byRoster[s.championRoster];
      return `<tr class="${r.champion ? 'you' : ''}">
        <td><strong>${esc(r.season)}</strong></td>
        <td class="num">${wlt(r.wins, r.losses, r.ties)}</td>
        <td>${finishLabel(r) || (r.playoffs ? lbl('Made playoffs', 'blue') : '')}</td>
        <td class="num">${n2(r.pf)}</td>
        <td class="num">${st && st.maxPf ? n2(st.maxPf) : '&mdash;'}</td>
        <td>${champ ? mgrLink(champ.ownerId) : '<span class="dim">&mdash;</span>'}</td>
      </tr>`;
    });
    history = section('Your Season History', table(['Season', { label: 'Record', num: 1 }, 'Finish',
      { label: 'PF', num: 1 }, { label: 'Max PF', num: 1 }, 'Champion'], rows),
      { sub: 'Each season with your regular-season record, final finish, points for, and the most you could have scored.' });
  } else {
    const rows = MODEL.seasons.filter(s => s.started).slice().reverse().map(s => {
      const c = s.byRoster[s.championRoster], r = s.byRoster[s.runnerUpRoster], top = s.standings[0];
      const hi = s.stats ? Object.values(s.stats).sort((a, b) => b.pf - a.pf)[0] : null;
      return `<tr>
        <td><strong>${esc(s.season)}</strong>${s.inProgress ? ' ' + lbl('Live', 'amber') : ''}</td>
        <td>${c ? mgrCell(c.ownerId, c.teamName) : '<span class="dim">to be decided</span>'}</td>
        <td>${r ? mgrLink(r.ownerId) : '<span class="dim">&mdash;</span>'}</td>
        <td>${top && (s.finalGames || []).length ? mgrLink(top.ownerId) + ` <span class="dim small">${wl(top)}</span>` : '<span class="dim">&mdash;</span>'}</td>
        <td>${hi ? mgrLink(hi.ownerId) + ` <span class="dim small">${n1(hi.pf)}</span>` : ''}</td>
      </tr>`;
    });
    history = section('Season History', table(['Season', 'Champion', 'Runner-up', 'Top seed', 'Most points'], rows),
      { sub: 'Pick yourself under “Viewing as” to see your own season-by-season finishes here.' });
  }

  // awards: trader awards wait for every season's trades
  const drafts = getDrafts();
  const dsum = draftSummary(drafts, list.filter(s => s.complete || list.length === 1).map(s => s.season))
    .filter(d => d.drafts >= (season ? 1 : Math.min(2, list.filter(s => s.complete).length)));
  const bd = dsum.sort((a, b) => b.gpa - a.gpa)[0];
  const awards = computeAwards(stats, {
    bestDrafter: bd ? { ownerId: bd.ownerId, value: `${bd.letter} average (${bd.gpa.toFixed(2)})`, sub: `Across ${bd.drafts} graded draft${bd.drafts === 1 ? '' : 's'}` } : null
  });
  const info = k => `<a class="small" href="${k === 'bestDrafter' ? '#/draft?tab=summary' : '#/trades?tab=overview'}">More info</a>`;
  const card = a => awardCard(a, a.key === 'bestDrafter' ? info(a.key) : '');
  const ordered = awards.slice(0, 4).map(card)
    .concat([
      deferred('awBestTrader', async () => traderAward(list, 1), `<div class="award t-green"><div class="award-label">Best Trader</div><div class="award-sub" style="margin-top:8px">Grading trades&hellip;</div></div>`),
      deferred('awWorstTrader', async () => traderAward(list, -1), `<div class="award t-red"><div class="award-label">Worst Trader</div><div class="award-sub" style="margin-top:8px">Grading trades&hellip;</div></div>`)
    ])
    .concat(awards.slice(4).map(card));
  const awardsHtml = section('Awards', `<div class="grid g4 awards" id="awardGrid">${ordered.map((h, i) =>
    i >= 8 ? h.replace(/^<div /, '<div data-extra="1" ').replace(/^<div id=/, '<div data-extra="1" id=') : h).join('')}</div>`,
    { act: `<button class="linklike" data-expand="#awardGrid" data-more-label="Show all ${ordered.length}" data-less="Show fewer">Show all ${ordered.length}</button>` });

  const trades = section('Trade Highlights', deferred('ovTrades', () => tradeHighlights(list)),
    { tag: 'Graded', act: '<a href="#/trades">View all trades &rarr;</a>' });

  // highest / lowest weeks
  const weeks = [];
  stats.forEach(a => a.weeks.forEach(w => weeks.push(Object.assign({ ownerId: a.ownerId }, w))));
  const weekRows = arr => arr.map((w, i) => `<tr class="${youRow(w.ownerId)}">
    <td class="rank">${i + 1}</td><td>${mgrCell(w.ownerId)}</td>
    <td class="num">${esc(w.season)}</td><td class="num">${w.week}</td>
    <td class="num"><strong>${n2(w.pts)}</strong></td>
    <td>${w.won ? lbl('W', 'green') : w.lost ? lbl('L', 'red') : lbl('T')} <span class="dim small">vs ${esc(mgr(ownerOfRoster(w.season, w.opp)).name)}</span></td>
  </tr>`);
  const hiW = weeks.slice().sort((a, b) => b.pts - a.pts).slice(0, 20);
  const loW = weeks.slice().sort((a, b) => a.pts - b.pts).slice(0, 20);
  const wh = ['#', 'Team', { label: 'Year', num: 1 }, { label: 'Week', num: 1 }, { label: 'Points', num: 1 }, 'Result'];
  const scoring = `<div class="grid g2 gap-lg">
    ${section('Highest Scoring Weeks', table(wh, weekRows(hiW), { limit: 5, more: 'Show 20' }), { tight: true })}
    ${section('Lowest Scoring Weeks', table(wh, weekRows(loW), { limit: 5, more: 'Show 20' }), { tight: true })}
  </div>`;

  return `${cards}${standings}${history}${awardsHtml}${trades}
    <div class="section">${scoring}</div>
    ${howItWorks()}`;
}

async function traderAward(list, dir) {
  const all = await getTrades();
  const seasons = new Set(list.map(s => s.season));
  const graded = all.filter(g => g.graded && seasons.has(g.season));
  const sumr = tradeSummary(graded).filter(r => r.trades >= (list.length > 1 ? 3 : 1));
  const pick = sumr.sort((a, b) => dir * (b.netPts - a.netPts))[0];
  if (!pick) return `<div class="award t-${dir > 0 ? 'green' : 'red'}"><div class="award-label">${dir > 0 ? 'Best' : 'Worst'} Trader</div><div class="award-sub" style="margin-top:8px">Not enough trades yet.</div></div>`;
  return awardCard({
    key: dir > 0 ? 'bestTrader' : 'worstTrader', label: dir > 0 ? 'Best Trader' : 'Worst Trader',
    ownerId: pick.ownerId, tone: dir > 0 ? 'green' : 'red',
    value: `${signed(pick.netPts, n0)} pts from trades`,
    sub: `${pick.trades} trades · ${pick.w}W-${pick.l}L-${pick.e}E`
  }, `<a class="small" href="#/trades?tab=overview">More info</a>`);
}

async function tradeHighlights(list) {
  const all = await getTrades();
  const seasons = new Set(list.map(s => s.season));
  const graded = all.filter(g => g.graded && seasons.has(g.season));
  if (!graded.length) return empty('No trades in this span.');
  const norm = g => Math.abs(g.winner.net) / TRADE_BANDS[g.basis][3];
  const fleeces = graded.filter(g => g.winner).sort((a, b) => b.tierIndex - a.tierIndex || norm(b) - norm(a)).slice(0, 3);
  const sumr = tradeSummary(graded).filter(r => r.trades >= (list.length > 1 ? 3 : 1));
  const best = sumr.slice().sort((a, b) => b.netPts - a.netPts).slice(0, 3);
  const worst = sumr.slice().sort((a, b) => a.netPts - b.netPts).slice(0, 3);
  const rankRow = (r, i) => `<div class="ri">
    <span class="ri-n">${i + 1}</span>
    <div class="ri-main"><div>${mgrLink(r.ownerId)}${youBadge(r.ownerId)}</div>
      <div class="ri-sub">${r.trades} trades &middot; ${r.w}W-${r.l}L-${r.e}E</div></div>
    <div class="ri-val ${r.netPts >= 0 ? 'pos-t' : 'neg-t'}">${signed(r.netPts, n0)}<small>net starter pts</small></div>
  </div>`;
  return `<div style="margin-bottom:6px" class="small muted">Biggest fleeces</div>
    ${fleeces.map(g => tradeCard(g, { compact: true })).join('')}
    <p class="note" style="margin:4px 0 14px">Finished seasons are graded on what each side’s players scored in their new team’s starting lineup.
      The ${MODEL.liveSeason ? esc(MODEL.liveSeason.season) : 'current'} season adds Sleeper’s projections for the weeks still to come.</p>
    <div class="grid g2">
      <div class="panel panel-green"><div class="panel-h">Best Traders</div><div class="rank-list">${best.map(rankRow).join('')}</div></div>
      <div class="panel panel-red"><div class="panel-h">Worst Traders</div><div class="rank-list">${worst.map(rankRow).join('')}</div></div>
    </div>`;
}

function howItWorks() {
  return section('How These Numbers Work', `<div class="card small" style="line-height:1.7;color:var(--ink-2)">
    <p style="margin-top:0"><strong>Eff%</strong> is points scored divided by the most you could have scored that week:
      your best possible lineup from everyone on your roster, filling each slot with your highest scorer who fits it.
      <strong>Max PF</strong> is that best-possible total, added up.</p>
    <p><strong>PWin%</strong> (all-play) is your record if you played every team every week. It strips out schedule luck,
      so it’s the cleanest read on who has actually been best.</p>
    <p><strong>Luck</strong> is lucky wins minus unlucky losses. A lucky win is a win while scoring under that week’s
      league median; an unlucky loss is a loss while scoring over it.</p>
    <p style="margin-bottom:0"><strong>Std Dev</strong> is how much your weekly score swings. Lower is steadier.
      <strong>Blowouts</strong> are wins by 40 or more. Everything here is regular season, finished weeks only;
      the week being played counts once it’s final.</p></div>`, { id: 'howto' });
}

/* ------------------------------ Advanced tab ----------------------- */
function overviewAdvanced(list, stats, season) {
  const me = viewerId();
  const seasonsSorted = list.slice().sort((a, b) => a.season.localeCompare(b.season));
  // x axis: every finished week in the span
  const xs = [];
  seasonsSorted.forEach(s => {
    const weeks = Array.from(new Set((s.finalGames || []).map(g => g.week))).sort((a, b) => a - b);
    weeks.forEach(w => xs.push({ season: s.season, week: w }));
  });
  const label = x => season ? 'W' + x.week : `'${String(x.season).slice(2)} W${x.week}`;
  const idx = {};
  xs.forEach((x, i) => { idx[x.season + '|' + x.week] = i; });
  const owners = stats.slice().sort((a, b) => b.ppg - a.ppg).map(a => a.ownerId);
  const color = {};
  owners.forEach((id, i) => { color[id] = isYou(id) ? '#60a5fa' : seriesColor(i + 1); });

  // weekly scores
  const scoreSeries = owners.map(id => {
    const vals = new Array(xs.length).fill(null);
    const a = stats.find(x => x.ownerId === id);
    a.weeks.forEach(w => { const i = idx[w.season + '|' + w.week]; if (i != null) vals[i] = w.pts; });
    return { id, name: mgr(id).name, values: vals, color: color[id], you: isYou(id) };
  });
  const medSeries = { id: 'median', name: 'Median', color: '#e2e8f0', values: xs.map(x => {
    const s = MODEL.seasons.find(q => q.season === x.season);
    const sc = (s.finalGames || []).filter(g => g.week === x.week).reduce((a, g) => a.concat([g.ap, g.bp]), []);
    return sc.length ? median(sc) : null;
  }) };
  const scoreChart = lineChart(xs.map(label), scoreSeries.concat([medSeries]), {
    title: 'Weekly Scoring', sub: me ? `${esc(mgr(me).name)} against the league` : 'Every team, every week. Hover a name to isolate it.',
    focus: me && MODEL.managers[me] ? me : 'median', dashed: ['median'], decimals: true, maxXLabels: 11, xLabel: ''
  });

  // weekly power ranks
  const rankSeries = owners.map(id => ({ id, name: mgr(id).name, values: new Array(xs.length).fill(null), color: color[id], you: isYou(id) }));
  const rsBy = {};
  rankSeries.forEach(r => { rsBy[r.id] = r; });
  seasonsSorted.forEach(s => {
    const pr = weeklyPowerRanks(s);
    Object.keys(pr.ranks).forEach(rid => {
      const t = s.byRoster[rid];
      if (!t || !rsBy[t.ownerId]) return;
      pr.ranks[rid].forEach((rk, i) => {
        const j = idx[s.season + '|' + pr.weeks[i]];
        if (j != null) rsBy[t.ownerId].values[j] = rk;
      });
    });
  });
  const myRanks = me && rsBy[me] ? rsBy[me].values.filter(v => v != null) : [];
  const rankChart = lineChart(xs.map(label), rankSeries, {
    title: 'Weekly Power Rankings', invert: true,
    sub: myRanks.length ? `${esc(mgr(me).name)} average rank: #${n1(mean(myRanks))}` : 'Rank by season-to-date all-play win rate after each week.',
    focus: me && rsBy[me] ? me : null, maxXLabels: 11, xLabel: ''
  });

  // score distribution
  const allScores = [];
  stats.forEach(a => allScores.push.apply(allScores, a.scores));
  const dist = rangeChart(stats.slice().sort((a, b) => b.ppg - a.ppg).map(a => ({
    id: a.ownerId, name: mgr(a.ownerId).name, min: Math.min.apply(null, a.scores), max: Math.max.apply(null, a.scores),
    avg: a.ppg, med: median(a.scores), you: isYou(a.ownerId)
  })), mean(allScores));

  // year over year PPG
  let yoy = '';
  if (!season && seasonsSorted.length > 1) {
    const ys = seasonsSorted.map(s => s.season);
    const ser = owners.map(id => ({
      id, name: mgr(id).name, color: color[id], you: isYou(id),
      values: seasonsSorted.map(s => {
        const r = s.stats && Object.values(s.stats).find(x => x.ownerId === id);
        return r && r.g ? r.pf / r.g : null;
      })
    }));
    const lg = { id: 'lg', name: 'League avg', color: '#e2e8f0', values: seasonsSorted.map(s => {
      const sc = [];
      Object.values(s.stats || {}).forEach(r => sc.push.apply(sc, r.scores));
      return sc.length ? mean(sc) : null;
    }) };
    yoy = section('Year-over-Year PPG', lineChart(ys.map(y => "'" + y.slice(2)), ser.concat([lg]), {
      sub: me ? `${esc(mgr(me).name)} by season` : 'Points per game, season by season',
      focus: me && MODEL.managers[me] ? me : null, dashed: ['lg'], decimals: true, xLabel: '', height: 280
    }));
  }

  return `<div class="grid g2 gap-lg">${scoreChart}${rankChart}</div>
    ${section('Score Distribution', dist, { sub: 'Weekly scoring range, average and median, sorted by average.' })}
    ${yoy}`;
}

/* ============================== THIS WEEK ========================= */
function lineupRows(s, wk, rid, proj, opts) {
  opts = opts || {};
  const lu = (s.lineups && s.lineups[wk] && s.lineups[wk][rid]) || {};
  const slots = lineupSlots(s);
  const today = todayISO();
  const final = opts.final;
  const st = lu.st || [];
  const gs = weekStatus(wk);
  const row = (pid, slot, pts) => {
    if (!pid || pid === '0') return `<tr><td class="slot">${esc(slot)}</td><td class="dim">Empty</td><td></td><td></td></tr>`;
    const i = projMeta(proj, pid);
    const g = gs && i.team ? gs[i.team] : null;
    const done = final || pts > 0 || (g ? g !== 'pre_game' : (i.date && i.date < today));
    const status = final ? '' : g ? (g === 'complete' ? '<span class="status final">Final</span>'
      : g === 'pre_game' ? '' : g === 'canceled' ? '<span class="status">Canceled</span>' : '<span class="status live">Live</span>')
      : (i.date && i.date < today) ? '<span class="status final">Final</span>'
      : pts > 0 ? '<span class="status live">Live</span>' : '';
    const injured = i.inj ? ` <span class="lbl ${/^(Out|IR|Doubtful|PUP|Sus)/i.test(i.inj) ? 'lbl-red' : 'lbl-amber'}" style="font-size:9.5px;padding:0 5px">${esc(i.inj)}</span>` : '';
    return `<tr>
      <td class="slot">${esc(slot)}</td>
      <td>${playerCell(pid, { meta: i, after: injured + (i.team ? ` <span class="dim xsmall">${esc(i.team)}</span>` : '') })}</td>
      <td class="num dim">${i.proj != null && !final ? n1(i.proj) : ''}</td>
      <td class="num">${done || pts ? `<strong>${n2(pts || 0)}</strong>` : '<span class="dim">&mdash;</span>'}<div>${status}</div></td>
    </tr>`;
  };
  const starters = st.map((pid, i) => row(pid, slots[i] || '', Number((lu.sp || [])[i]) || 0));
  const set = new Set(st);
  const team = s.byRoster[rid];
  const benchIds = Object.keys(lu.pp || {}).filter(pid => !set.has(pid));
  if (!final && team) (team.players || []).forEach(pid => { if (!set.has(pid) && benchIds.indexOf(pid) === -1) benchIds.push(pid); });
  const bench = benchIds.map(pid => ({ pid, pts: (lu.pp || {})[pid] || 0, proj: (proj[pid] && proj[pid].proj) || 0 }))
    .sort((a, b) => (final ? b.pts - a.pts : b.proj - a.proj));
  return { starters, bench: bench.map(b => row(b.pid, 'BN', b.pts)), benchBest: bench[0] };
}

function lineupBlock(s, wk, rid, proj, side, opts) {
  const t = s.byRoster[rid];
  if (!t) return '';
  const r = lineupRows(s, wk, rid, proj, opts);
  const head = ['Slot', 'Player', { label: opts.final ? '' : 'Proj', num: 1 }, { label: 'Score', num: 1 }];
  return `<div class="lineup">
    <div class="lu-head"><span class="t">${mgrLink(t.ownerId)}${youBadge(t.ownerId)} <span class="dim small">(${wl(t)})</span></span>
      <span class="small"><strong>${n2(side.final ? (side.expected || 0) : (side.expected || 0))}</strong>
      <span class="dim">${opts.final ? 'final' : side.remaining > 0 ? 'proj' : 'final'}</span></span></div>
    ${table(head, r.starters)}
    ${r.bench.length ? `<details style="margin-top:8px"><summary class="small muted" style="cursor:pointer">Bench (${r.bench.length})${r.benchBest && !opts.final ? ` &middot; best ${n1(r.benchBest.proj)} proj` : r.benchBest ? ` &middot; best ${n2(r.benchBest.pts)}` : ''}</summary>
      <div style="margin-top:8px">${table(head, r.bench)}</div></details>` : ''}
  </div>`;
}

/** "Points left on your bench" and free-agent upgrades for one roster. */
function lineupCheck(s, wk, rid, proj) {
  const lu = (s.lineups && s.lineups[wk] && s.lineups[wk][rid]) || {};
  const team = s.byRoster[rid];
  if (!team || !Object.keys(proj).length) return '';
  const slots = lineupSlots(s);
  const today = todayISO();
  const posOf = pid => (proj[pid] && proj[pid].pos) || MODEL.posOf(pid);
  const ptsOf = pid => (lu.pp || {})[pid] || 0;
  const gs = weekStatus(wk);
  const locked = pid => playerLocked(proj[pid], ptsOf(pid), gs, today);
  const val = pid => locked(pid) ? ptsOf(pid) : ((proj[pid] && proj[pid].proj) || 0);
  const st = lu.st || [];
  const roster = Array.from(new Set((team.players || []).concat(Object.keys(lu.pp || {}))));
  const openSlots = [], current = [];
  st.forEach((pid, i) => { if (!pid || pid === '0' || !locked(pid)) { openSlots.push(slots[i]); if (pid && pid !== '0') current.push(pid); } });
  const pool = {};
  roster.filter(pid => !locked(pid) && (team.reserve || []).indexOf(pid) === -1).forEach(pid => { pool[pid] = val(pid); });
  const best = bestLineup(pool, openSlots, posOf);
  const curTotal = sum(current.map(val));
  const gain = best.total - curTotal;
  let html = '';
  if (gain >= 0.5) {
    const bestIds = best.picks.filter(p => p.pid).map(p => p.pid);
    const ins = bestIds.filter(pid => current.indexOf(pid) === -1);
    const outs = current.filter(pid => bestIds.indexOf(pid) === -1);
    const swaps = ins.map(pid => {
      const o = outs.find(x => posOf(x) === posOf(pid)) || outs[0];
      if (o) outs.splice(outs.indexOf(o), 1);
      return { pid, o };
    });
    const nm = pid => esc(projMeta(proj, pid).name);
    html += `<div class="tip tip-amber"><div class="tip-title">${n1(gain)} points left on your bench</div>
      <div class="tip-body">Your lineup projects ${n1(curTotal + sum(st.filter(p => p && locked(p)).map(ptsOf)))}; the best you can still set projects
        ${n1(best.total + sum(st.filter(p => p && locked(p)).map(ptsOf)))}. Fix it on Sleeper, then refresh.</div>
      ${swaps.map(x => `<div class="tip-body"><strong>Start ${nm(x.pid)}</strong> (${esc(posOf(x.pid))}, ${n1(val(x.pid))} proj)${x.o
        ? ` over ${nm(x.o)} (${esc(posOf(x.o))}, ${n1(val(x.o))} proj)` : ''}</div>`).join('')}</div>`;
  }
  // free agents who'd beat your worst unlocked starter at a position
  const rostered = new Set();
  s.teams.forEach(t => (t.players || []).forEach(p => rostered.add(p)));
  const ups = [];
  ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(pos => {
    const mine = st.map((pid, i) => ({ pid, slot: slots[i] })).filter(x => x.pid && x.pid !== '0' && !locked(x.pid) && x.slot === pos);
    if (!mine.length) return;
    const worst = mine.sort((a, b) => val(a.pid) - val(b.pid))[0];
    const fa = Object.keys(proj).filter(pid => !rostered.has(pid) && proj[pid].pos === pos && (proj[pid].proj || 0) > 0 &&
      !playerLocked(proj[pid], 0, gs, today) && !/^(Out|IR|Doubtful|PUP|Sus)/i.test(proj[pid].inj || ''))
      .sort((a, b) => proj[b].proj - proj[a].proj)[0];
    if (fa && proj[fa].proj - val(worst.pid) >= 3) ups.push({ fa, worst: worst.pid, gain: proj[fa].proj - val(worst.pid), pos });
  });
  ups.sort((a, b) => b.gain - a.gain).slice(0, 2).forEach(u => {
    const w = projMeta(proj, u.worst);
    html += `<div class="tip tip-blue"><div class="tip-title">Waiver upgrade available</div>
      <div class="tip-body"><strong>${esc(projMeta(proj, u.fa).name)}</strong> (${u.pos}, ${esc(proj[u.fa].team || 'FA')}) projects
        ${n1(proj[u.fa].proj)}, ${val(u.worst) > 0 ? `${n1(u.gain)} more than ${esc(w.name)} (${n1(val(u.worst))})`
          : `and ${esc(w.name)} has no projection this week (bye or injury)`}.</div></div>`;
  });
  return html;
}

/* ------------------------------ head-to-head --------------------- */
const INJ_SHORT = { Questionable: 'Q', Doubtful: 'D', Out: 'O', IR: 'IR', PUP: 'PUP', Sus: 'SUS', Suspended: 'SUS', NA: 'NA', COV: 'COV', DNR: 'DNR' };
const SLOT_SHORT = { FLEX: 'FLEX', SUPER_FLEX: 'SF', WRRB_FLEX: 'W/R', REC_FLEX: 'W/T' };
/** "B. Purdy" for the narrow layout; team defenses keep their abbreviation. */
const shortName = (name, pid) => !/^\d+$/.test(String(pid)) ? String(pid)
  : String(name || '').replace(/^(\S)\S*\s+/, '$1. ');

/** One player's week: points, projection, and where his game stands. */
function playerWeek(pid, pts, proj, gs, today, final) {
  const i = projMeta(proj, pid);
  const g = gs && i.team ? gs[i.team] : null;
  const state = final ? 'final'
    : g ? (g === 'complete' || g === 'canceled' ? 'final' : g === 'pre_game' ? 'pre' : 'live')
    : (i.date && i.date < today) ? 'final' : pts > 0 ? 'live' : 'pre';
  // with the schedule in hand, a team that isn't on it is on bye
  const bye = !final && !!gs && !!i.team && !gs[i.team];
  const day = state === 'pre' && i.date ? new Date(i.date + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short' }) : '';
  return { pid, i, pts: pts || 0, proj: i.proj, state, bye, day };
}

/** A roster's starters (slot by slot) and bench for one week. */
function sideLineup(s, wk, rid, proj, final) {
  const lu = (s.lineups && s.lineups[wk] && s.lineups[wk][rid]) || {};
  const team = s.byRoster[rid];
  const slots = lineupSlots(s);
  const gs = weekStatus(wk), today = todayISO();
  const st = (lu.st && lu.st.length) || final || !team ? (lu.st || []) : (team.starters || []);
  const starters = slots.map((slot, k) => {
    const pid = st[k];
    return { slot, p: pid && pid !== '0' ? playerWeek(pid, Number((lu.sp || [])[k]) || 0, proj, gs, today, final) : null };
  });
  const on = new Set(st);
  const ids = Object.keys(lu.pp || {}).filter(pid => !on.has(pid));
  if (!final && team) (team.players || []).forEach(pid => { if (!on.has(pid) && ids.indexOf(pid) === -1) ids.push(pid); });
  const bench = ids.map(pid => playerWeek(pid, (lu.pp || {})[pid] || 0, proj, gs, today, final))
    .sort((a, b) => final ? b.pts - a.pts : (b.proj || 0) - (a.proj || 0) || b.pts - a.pts);
  return { starters, bench };
}

function h2hPlayer(x, side, bench) {
  if (!x) return bench ? `<div class="lu-p ${side}"></div>` : `<div class="lu-p ${side} empty"><span class="lu-nm dim">Empty</span></div>`;
  const i = x.i;
  const inj = i.inj ? `<span class="inj${/^(Out|IR|Doubtful|PUP|Sus)/i.test(i.inj) ? ' bad' : ''}" title="${esc(i.inj)}">${esc(INJ_SHORT[i.inj] || i.inj)}</span>` : '';
  const game = x.state === 'live' ? '<span class="g live">Live</span>'
    : x.state === 'final' ? '<span class="g">Final</span>'
    : x.bye ? '<span class="g">Bye</span>'
    : x.day ? `<span class="g">${esc(x.day)}${i.opp ? `<span class="opp"> vs ${esc(i.opp)}</span>` : ''}</span>` : '';
  return `<div class="lu-p ${side}">
    ${playerFace(x.pid, 32)}
    <div class="lu-id">
      <div class="lu-nm"><span class="full">${esc(i.name)}</span><span class="short">${esc(shortName(i.name, x.pid))}</span>${inj}</div>
      <div class="lu-sub">${posBadge(i.pos)}${i.team && i.pos !== 'DEF' ? `<span>${esc(i.team)}</span>` : ''}${game}</div>
    </div>
  </div>`;
}

function h2hPoints(x, side, final, trail) {
  if (!x) return `<div class="lu-pts ${side}"></div>`;
  const projTxt = !final && x.proj != null && x.state !== 'final' ? `<small>${n1(x.proj)}<span class="pj"> proj</span></small>` : '';
  return `<div class="lu-pts ${side}${trail ? ' trail' : ''}"><b>${x.state === 'pre' ? '&ndash;' : n2(x.pts)}</b>${projTxt}</div>`;
}

function h2hRow(a, b, slot, final) {
  // once both games are over, dim the lower score so each slot reads at a glance
  const both = a && b && a.state === 'final' && b.state === 'final' && a.pts !== b.pts;
  const bench = slot === 'BN';      // an uneven bench just leaves the short side blank
  return `<div class="lu-row">
    ${h2hPlayer(a, 'a', bench)}${h2hPoints(a, 'a', final, both && a.pts < b.pts)}
    <div class="lu-slot">${esc(SLOT_SHORT[slot] || slot)}</div>
    ${h2hPoints(b, 'b', final, both && b.pts < a.pts)}${h2hPlayer(b, 'b', bench)}
  </div>`;
}

/** The selected matchup: a face-off header and both lineups, slot by slot. */
function matchupPanel(s, wk, m, proj, final, id, hidden) {
  const ta = s.byRoster[m.a], tb = s.byRoster[m.b];
  if (!ta || !tb) return '';
  const A = sideLineup(s, wk, m.a, proj, final), B = sideLineup(s, wk, m.b, proj, final);
  const done = m.final || m.decided;
  const aw = done && m.ap > m.bp, bw = done && m.bp > m.ap;
  const live = m.pA != null && !done;
  const toPlay = L => L.starters.filter(x => x.p && x.p.state !== 'final').length;
  const team = (t, side, p) => `<div class="md-team ${side}">
      ${avatar(t.ownerId, 'av md-av')}
      <div class="md-id"><div class="md-nm">${mgrLink(t.ownerId)}${youBadge(t.ownerId)}</div>
        <div class="md-rec">${wl(t)}${live ? ` <span class="md-odds" title="Moneyline ${moneyline(p)}"><b>${pct0(p)}</b> to win</span>` : ''}</div></div>
    </div>`;
  const score = (pts, sd, side, won, lost) => `<div class="md-score ${side}${won ? ' won' : ''}${lost ? ' lost' : ''}">
      <b>${m.played || m.final ? n2(pts) : '&ndash;'}</b>
      <span>${m.final ? '' : sd.fallback ? `avg ${n1(sd.expected)}` : sd.remaining > 0 ? `${n1(sd.expected)} proj` : m.played ? 'done' : ''}</span>
    </div>`;
  const lead = m.sa.expected >= m.sb.expected ? ta : tb;
  const margin = Math.abs(m.sa.expected - m.sb.expected);
  const story = done
    ? (m.ap === m.bp ? 'A tie' : `${esc(mgr((m.ap > m.bp ? ta : tb).ownerId).name)} wins by ${n2(Math.abs(m.ap - m.bp))}${m.decided ? ', all games over' : ''}`)
    : margin >= 0.05 ? `${esc(mgr(lead.ownerId).name)} by ${n1(margin)} projected` : 'Dead even';
  const rows = A.starters.map((x, k) => h2hRow(x.p, (B.starters[k] || {}).p, x.slot, final)).join('');
  const nb = Math.max(A.bench.length, B.bench.length);
  const bench = nb ? Array.from({ length: nb }, (_, k) => h2hRow(A.bench[k] || null, B.bench[k] || null, 'BN', final)).join('') : '';
  const benchPts = L => sum(L.bench.map(x => x.pts));
  return `<div class="mdetail${isYou(ta.ownerId) || isYou(tb.ownerId) ? ' you' : ''}" id="${id}" role="tabpanel"${hidden ? ' hidden' : ''}>
    <div class="md-head">
      ${team(ta, 'a', m.pA)}${score(m.ap, m.sa, 'a', aw, bw)}
      <div class="md-vs">${done ? 'Final' : 'vs'}</div>
      ${score(m.bp, m.sb, 'b', bw, aw)}${team(tb, 'b', m.pA == null ? null : 1 - m.pA)}
    </div>
    ${live ? `<div class="md-wp"><i style="width:${(m.pA * 100).toFixed(1)}%"></i></div>` : ''}
    <div class="md-story">
      <span>${!done && m.played ? `${toPlay(A)} yet to play` : ''}</span>
      <strong>${story}</strong>
      <span>${!done && m.played ? `${toPlay(B)} yet to play` : ''}</span>
    </div>
    <div class="h2h" role="table" aria-label="Starting lineups">${rows}</div>
    ${bench ? `<details class="md-bench">
      <summary>Bench${final ? ` <span class="dim">${n2(benchPts(A))} points vs ${n2(benchPts(B))}</span>` : ` <span class="dim">${A.bench.length} and ${B.bench.length} players</span>`}${CHEV}</summary>
      <div class="h2h">${bench}</div>
    </details>` : ''}
  </div>`;
}

views.week = async params => {
  const live = MODEL.liveSeason;
  if (!live || !MODEL.currentWeek) {
    const last = MODEL.completedSeasons[MODEL.completedSeasons.length - 1];
    return `${draftCountdown()}${empty(`No games this week. ${last
      ? `The ${esc(last.season)} season is in the books: see the <a href="#/playoffs?season=${esc(last.season)}">bracket</a> or the <a href="#/standings">final standings</a>.`
      : ''}`)}`;
  }
  const cur = MODEL.currentWeek;
  // once every game of the current week is over, next week's matchups open up too
  const lastShown = weekIsFinal(live, cur) ? cur + 1 : cur;
  const weeks = Object.keys(live.pairings || {}).map(Number).filter(w => w <= lastShown && w < live.playoffStart + 3).sort((a, b) => a - b);
  const wk = params.week && weeks.indexOf(Number(params.week)) !== -1 ? Number(params.week) : cur;
  const final = weekIsFinal(live, wk);
  const proj = final ? {} : await loadProjections(live.season, wk);
  const ms = viewerFirst(live, weekMatchups(live, wk, proj));
  const me = viewerId();
  const myTeam = me ? live.teams.find(t => t.ownerId === me) : null;

  // The matchup on show: the team in the link (?t=), else yours, else the first.
  const want = Number(params.t);
  const has = rid => m => m.a === rid || m.b === rid;
  const sel = (want && ms.find(has(want))) || (myTeam && ms.find(has(myTeam.rosterId))) || ms[0];

  const chips = `<div class="pills">${weeks.map(w => `<a class="pill-btn ${w === wk ? 'active' : ''}" href="${hrefWith('week', { week: w, t: params.t })}">Wk ${w}${
    weekIsFinal(live, w) ? '' : w === cur ? ' &middot; live' : ' &middot; next'}</a>`).join('')}</div>`;
  const tips = myTeam && !final ? lineupCheck(live, wk, myTeam.rosterId, proj) : '';

  const board = ms.length ? `<div class="scoreboard" role="tablist" aria-label="Week ${wk} matchups" data-pick-group=".mdetail">
      ${ms.map((m, i) => scoreTile(live, m, { panel: 'mu-' + i, sel: m === sel })).join('')}
    </div>
    ${ms.map((m, i) => matchupPanel(live, wk, m, proj, final, 'mu-' + i, m !== sel)).join('')}` : empty('No matchups this week.');

  const note = final ? `Final scores from Week ${wk}.`
    : `Scores update when you reload. Projections are Sleeper's, for whoever hasn't played yet, added to what's already on the board.
       Win % treats each final score as that projection plus or minus the league's usual weekly swing (${n1(MODEL.spread)} points), narrowing as games finish.`;

  return `${chips}
    ${tips}
    ${!me ? `<div class="note" style="margin:0 0 14px">Pick yourself under <strong>Viewing as</strong> to open on your matchup and get lineup tips.</div>` : ''}
    ${section(`Week ${wk} Matchups`, `${board}<p class="note">${note}</p>`, { tight: true })}
    ${wk >= cur ? bountySection(live) : ''}
    ${section('Recent Activity', deferred('weekActivity', () => activityList(live, 8)), { act: '<a href="#/waivers">All moves &rarr;</a>' })}`;
};

function bountySection(live) {
  const cfg = (typeof PAYOUTS !== 'undefined' && PAYOUTS[live.season]) || null;
  const wh = cfg && cfg.weeklyHigh;
  if (!wh) return '';
  /* Reads live.games (real scores the moment they're reported), not the
     finished-weeks list, so a week that's over shows up before Sleeper's week
     counter rolls over. The newest week is labelled "so far". */
  const lastW = Math.min(MODEL.currentWeek || wh.from, wh.to);
  const ws = [];
  for (let w = wh.from; w <= lastW; w++) {
    const rows = [];
    live.games.filter(g => g.week === w).forEach(g => rows.push({ rid: g.a, pts: g.ap }, { rid: g.b, pts: g.bp }));
    if (!rows.length) continue;
    const top = rows.sort((a, b) => b.pts - a.pts)[0];
    const t = live.byRoster[top.rid];
    if (!t || !(top.pts > 0)) continue;
    ws.push({ week: w, ownerId: t.ownerId, pts: top.pts, settled: w <= (MODEL.lastFinal || 0) });
  }
  if (!ws.length) return '';
  const now = ws[ws.length - 1];
  const settled = ws.filter(x => x.settled);
  const tally = {};
  settled.forEach(x => { tally[x.ownerId] = (tally[x.ownerId] || 0) + 1; });
  const mx = Math.max.apply(null, Object.values(tally).concat([0]));
  const leaders = Object.keys(tally).filter(id => tally[id] === mx);
  return section(`$${wh.amount} Weekly High Score`, `<div class="card">
    <div style="display:flex;align-items:center;gap:12px">${avatar(now.ownerId, 'av-lg')}
      <div><div class="stat-label">${now.settled ? `Week ${now.week} winner` : `Week ${now.week}: leading so far`}</div>
        <div class="stat-value" style="color:var(--gold)">${esc(mgr(now.ownerId).name)}${youBadge(now.ownerId)}</div>
        <div class="stat-sub">${n2(now.pts)} points &middot; ${now.settled ? `won $${wh.amount}` : `$${wh.amount} on the line`}</div></div></div>
    <div class="chips" style="margin-top:12px">${ws.map(x => `<span class="chip static">Wk ${x.week} ${mgrLink(x.ownerId)} <span class="dim">${n1(x.pts)}</span></span>`).join('')}</div>
    <p class="note">${money0(settled.length * wh.amount)} paid across ${settled.length} of ${wh.to - wh.from + 1} weeks${mx > 1
      ? `. ${leaders.map(id => mgrLink(id)).join(', ')} lead${leaders.length === 1 ? 's' : ''} with ${mx}` : ''}. <a href="#/money">Full ledger &rarr;</a></p>
  </div>`);
}

async function activityList(s, n) {
  const txns = (await loadTransactions(s)).slice(0, n);
  if (!txns.length) return empty('No moves yet this season.');
  const ownerOf = rid => (s.byRoster[rid] || {}).ownerId || null;
  const nm = pid => esc(playerMeta(pid).name);
  return `<div class="panel activity">${txns.map(t => {
    let icon = '⇄', cls = 'ai-trade', text;
    if (t.type === 'trade') {
      const names = t.rosters.map(rid => mgrLink(ownerOf(rid)));
      const got = rid => Object.keys(t.adds || {}).filter(p => t.adds[p] === rid).map(nm).join(', ') || 'FAAB';
      text = `${names.join(' and ')} traded: ${t.rosters.map(rid => `${mgrLink(ownerOf(rid))} gets ${got(rid)}`).join('; ')}`;
    } else {
      const added = Object.keys(t.adds || {}), dropped = Object.keys(t.drops || {});
      const rid = t.rosters[0];
      icon = added.length ? '+' : '−'; cls = added.length ? 'ai-add' : 'ai-drop';
      text = added.length
        ? `${mgrLink(ownerOf(rid))} added ${added.map(nm).join(', ')}${t.type === 'waiver' && t.bid ? ` for $${t.bid}` : ''}${dropped.length ? `, dropped ${dropped.map(nm).join(', ')}` : ''}`
        : `${mgrLink(ownerOf(rid))} dropped ${dropped.map(nm).join(', ')}`;
    }
    return `<div class="ai"><span class="ai-icon ${cls}">${icon}</span><span class="ai-text">${text}</span><span class="ai-when">${esc(timeAgo(t.created))}</span></div>`;
  }).join('')}</div>`;
}

/* ============================== OUTLOOK ============================ */
async function getOutlook() {
  return memo('outlook', async () => {
    const s = MODEL.liveSeason;
    const asOf = MODEL.lastFinal;
    const wk = asOf + 1;                      // the week being played, or the next one up
    const live = wk === MODEL.currentWeek;     // under way (or about to be) vs. not started
    const regEnd = s.playoffStart - 1;
    const proj = wk <= regEnd ? await loadProjections(s.season, wk) : {};
    const hasProj = Object.keys(proj).length > 0;
    const prior = {}, current = {};
    if (hasProj) {
      const today = todayISO();
      s.teams.forEach(t => {
        const lu = (s.lineups[wk] || {})[t.rosterId] || {};
        const st = (lu.st && lu.st.length) ? lu.st : t.starters;
        prior[t.rosterId] = sum((st || []).map(pid => (proj[pid] && proj[pid].proj) || 0));
        if (live) current[t.rosterId] = projectSide(lu.st, lu.sp, proj, today, weekStatus(wk));
      });
    }
    const opts = { asOf, spread: MODEL.spread, prior: hasProj ? prior : null, current: hasProj && live ? current : null, sims: 10000 };
    const sim = simulateSeason(s, opts);
    const prev = asOf >= 1 ? simulateSeason(s, Object.assign({}, opts, { asOf: asOf - 1, current: null, sims: 6000 })) : null;
    return { s, sim, prev, asOf, wk, hasProj };
  });
}

views.outlook = async params => {
  const s = MODEL.liveSeason;
  if (!s || !MODEL.currentWeek) {
    return empty(`Playoff odds return when the next season kicks off.${MODEL.completedSeasons.length
      ? ` Meanwhile, here’s how <a href="#/playoffs">last postseason</a> played out.` : ''}`);
  }
  if ((MODEL.lastFinal || 0) + 1 >= s.playoffStart) {
    return empty(`The regular season is over. <a href="#/playoffs?season=${esc(s.season)}">See the bracket &rarr;</a>`);
  }
  const O = await getOutlook();
  const T = O.sim.teams;
  const me = viewerId();
  const focusTeam = s.teams.find(t => t.ownerId === (params.team || me)) || null;
  const order = s.teams.slice().sort((a, b) => T[b.rosterId].wins - T[a.rosterId].wins || T[b.rosterId].playoffs - T[a.rosterId].playoffs);
  const rankOf = rid => order.findIndex(t => t.rosterId === rid) + 1;
  const regWeeks = s.playoffStart - 1;
  const delta = (rid, k) => O.prev ? T[rid][k] - O.prev.teams[rid][k] : null;
  const dtxt = v => v == null ? '' : `<span class="${v > 0.0005 ? 'pos-t' : v < -0.0005 ? 'neg-t' : 'dim'}">${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%</span>`;

  let mine = '';
  if (focusTeam) {
    const r = T[focusTeam.rosterId];
    const w = Math.round(r.wins), l = regWeeks - w;
    // remaining schedule with plain head-to-head odds
    const sched = [];
    range(O.asOf + 1, regWeeks).forEach(w2 => {
      const p = (s.pairings[w2] || []).find(x => x.a === focusTeam.rosterId || x.b === focusTeam.rosterId);
      if (!p) return;
      const opp = p.a === focusTeam.rosterId ? p.b : p.a;
      const pr = rateOdds(O.sim.mu[focusTeam.rosterId], O.sim.mu[opp], MODEL.spread);
      sched.push({ w: w2, opp, pr });
    });
    const cell = x => `<div class="sched-cell"><div class="wk">Wk ${x.w}</div>
      <div class="op">vs ${esc(mgr(s.byRoster[x.opp].ownerId).name)}</div>
      <div class="p ${x.pr >= 0.55 ? 'pos-t' : x.pr <= 0.45 ? 'neg-t' : ''}">${pct0(x.pr)}</div></div>`;
    const d = r.dist;
    const segs = [['Champion', d.champ, '#e8c060'], ['Runner-up', d.runner, '#cbd5e1'], ['Semifinals', d.semi, '#60a5fa'],
      ['First round', d.r1, '#2dd4bf'], ['Missed playoffs', d.miss, '#475569']];
    const isMe = isYou(focusTeam.ownerId);
    const teamPicker = `<select class="select" data-param="team">${s.teams.slice().sort((a, b) => mgr(a.ownerId).name.localeCompare(mgr(b.ownerId).name))
      .map(t => `<option value="${esc(t.ownerId)}" ${t === focusTeam ? 'selected' : ''}>${esc(mgr(t.ownerId).name)}</option>`).join('')}</select>`;
    mine = `<div class="you-banner" style="margin-bottom:14px">
        <div class="you-banner-label">${isMe ? 'Your outlook' : 'Outlook'} &middot; ${esc(mgr(focusTeam.ownerId).name)}</div>
        <div class="you-banner-row">
          <span>Projected rank <b>#${rankOf(focusTeam.rosterId)}</b> of ${s.teams.length}</span>
          <span>Proj. record <b>${w}-${l}</b></span>
          <span>Playoffs <b>${pct0(r.playoffs)}</b></span>
          <span>Bye <b>${pct0(r.bye)}</b></span>
          <span>Title <b>${pct0(r.title)}</b></span>
        </div>
        ${O.prev ? `<div class="small muted" style="margin-top:4px">Playoff odds ${dtxt(delta(focusTeam.rosterId, 'playoffs'))} &middot; title odds ${dtxt(delta(focusTeam.rosterId, 'title'))} since Week ${O.asOf - 1 >= 1 ? O.asOf - 1 : 1}${O.asOf - 1 >= 1 ? '' : ''} ended</div>` : ''}
      </div>
      ${sched.length ? section('Remaining Schedule', `<div class="sched">${sched.map(cell).join('')}</div>`, { tight: true, sub: 'Chance to win each game, from both teams’ season scoring so far.' }) : ''}
      ${section('Where the Season Could Go', `<div class="card">
        <div class="toolbar" style="margin-bottom:4px"><span class="small muted">Team</span>${teamPicker}</div>
        <div class="dist">${segs.map(([k, v, c]) => v > 0.004 ? `<i style="width:${(v * 100).toFixed(2)}%;background:${c}" title="${k}: ${pct(v)}">${v > 0.07 ? pct0(v) : ''}</i>` : '').join('')}</div>
        <div class="dist-legend">${segs.map(([k, v, c]) => `<span><span class="dot" style="background:${c}"></span>${k} <b>${pct(v)}</b></span>`).join('')}</div>
      </div>`)}`;

    // rooting guide for this week
    const myGame = O.sim.rooting.find(g => g.a === focusTeam.rosterId || g.b === focusTeam.rosterId);
    const rid = focusTeam.rosterId;
    const roots = O.sim.rooting.filter(g => g !== myGame).map(g => {
      const ia = g.ifA(rid), ib = g.ifB(rid);
      if (ia == null || ib == null) return null;
      const pick = ia >= ib ? g.a : g.b, other = ia >= ib ? g.b : g.a;
      return { pick, other, gain: Math.abs(ia - ib) };
    }).filter(Boolean).sort((a, b) => b.gain - a.gain);
    if (O.sim.rooting.length) {
      const w = myGame ? (myGame.a === rid ? myGame.ifA(rid) : myGame.ifB(rid)) : null;
      const lz = myGame ? (myGame.a === rid ? myGame.ifB(rid) : myGame.ifA(rid)) : null;
      mine += section(`Week ${O.asOf + 1} Rooting Guide`, `<div class="card">
        ${myGame && w != null && lz != null ? `<p style="margin:0 0 8px">${isMe ? 'Your' : 'Their'} matchup vs <strong>${esc(mgr(s.byRoster[myGame.a === rid ? myGame.b : myGame.a].ownerId).name)}</strong>:
          win and ${isMe ? 'you’re' : 'they’re'} at <b class="pos-t">${pct0(w)}</b> to make the playoffs, lose and it’s <b class="neg-t">${pct0(lz)}</b>.</p>` : ''}
        ${roots.map(x => `<div class="root-row"><span>Root for <strong>${esc(mgr(s.byRoster[x.pick].ownerId).name)}</strong> over ${esc(mgr(s.byRoster[x.other].ownerId).name)}</span>
          <span class="pos-t strong">+${(x.gain * 100).toFixed(1)}%</span></div>`).join('')}
      </div>`, { sub: 'How this week’s other results move the playoff odds, from the same simulations. The number is the swing between the two outcomes.' });
    }
  }

  const rows = order.map((t, i) => {
    const r = T[t.rosterId];
    const d = delta(t.rosterId, 'playoffs');
    return `<tr class="${youRow(t.ownerId)}">
      <td class="rank">${i + 1}</td>
      <td>${mgrCell(t.ownerId, t.teamName)}</td>
      ${tdv(t.wins + t.ties / 2, wl(t))}
      ${tdv(r.wins, `<strong>${n1(r.wins)}</strong> <span class="dim small">${Math.round(r.wins)}-${regWeeks - Math.round(r.wins)}</span>`)}
      ${tdv(r.playoffs, `<div class="barcell"><div class="bar"><i style="width:${(r.playoffs * 100).toFixed(1)}%"></i></div><span style="min-width:40px">${pct0(r.playoffs)}</span></div>`)}
      ${tdv(d == null ? 0 : d, d == null ? '' : dtxt(d))}
      ${tdv(r.bye, pct0(r.bye))}
      ${tdv(r.title, pct0(r.title))}
      ${tdv(r.mu, n1(r.mu))}
      ${tdv(r.sos == null ? 0 : r.sos, r.sos == null ? '&mdash;' : n1(r.sos))}
    </tr>`;
  });

  return `${mine}
    ${section('Playoff Odds', `${table(['#', { label: 'Team', sort: 'text' }, { label: 'Record', num: 1 }, { label: 'Est. Wins', num: 1 },
      { label: 'Playoff %', num: 1 }, { label: 'Δ Wk', num: 1, title: 'Change in playoff odds since last week' },
      { label: 'Bye %', num: 1 }, { label: 'Title %', num: 1 },
      { label: 'Rating', num: 1, title: 'Expected points per game used by the simulation' },
      { label: 'Rem. SOS', num: 1, title: 'Average rating of remaining opponents (higher is harder)' }], rows, { sortable: true })}
      <p class="note">Monte Carlo simulation of the rest of the regular season and the playoffs, run 10,000 times. Each team’s rating
        is its scoring so far, pulled toward this week’s projected lineup${O.hasProj ? '' : ' (projections unavailable, so toward the league average)'} by four games’ worth, so early-season
        odds lean on roster strength and later ones on results. Every game is that rating plus or minus the league’s usual
        week-to-week swing of ${n1(MODEL.spread)} points. Ties in the standings go to points for; the top ${s.playoffTeams} make it${s.playoffTeams === 6 ? ' and the top two get byes' : ''}.
        ${O.hasProj ? `Week ${O.asOf + 1} uses live scores plus Sleeper’s projections for whoever hasn’t played.` : ''}</p>`)}
    ${!focusTeam ? `<p class="note">Pick yourself under <strong>Viewing as</strong> for your schedule, rooting guide and season outcomes.</p>` : ''}`;
};
