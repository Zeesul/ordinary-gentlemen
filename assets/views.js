/* ===================================================================
   views.js — every page. Each view returns an HTML string (or a
   promise of one, for pages that fetch extra data on demand).
   =================================================================== */

const mgr = id => MODEL.managers[id] ||
  { id: id, name: 'Unknown', avatar: '', teamNames: [], titles: [] };

function mgrCell(id, sub, noLink) {
  const m = mgr(id);
  const inner = `<div class="mgr">
    <img src="${esc(m.avatar)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
    <div><div class="mgr-name">${esc(m.name)}</div>
    ${sub ? `<div class="mgr-team">${esc(sub)}</div>` : ''}</div>
  </div>`;
  return noLink ? inner
    : `<a class="mgr-link" href="#/manager?id=${encodeURIComponent(id)}">${inner}</a>`;
}

/** A manager's name (or any label) as a link to their profile. */
function mgrLink(id, text) {
  const label = text != null ? text : mgr(id).name;
  if (!id) return esc(label);
  return `<a class="name-link" href="#/manager?id=${encodeURIComponent(id)}">${esc(label)}</a>`;
}

const money0 = v => (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString();

function recCard(label, value, who, when, tone) {
  return `<div class="rec ${tone || ''}">
    <div class="rec-label">${esc(label)}</div>
    <div class="rec-value">${value}</div>
    <div class="rec-who">${who}</div>
    <div class="rec-when">${esc(when)}</div>
  </div>`;
}

function table(headers, rows, cls) {
  const head = headers.map(h =>
    `<th class="${h && h.num ? 'num' : ''}">${esc(h && h.label != null ? h.label : h)}</th>`).join('');
  return `<div class="table-wrap"><table class="${cls || ''}">
    <thead><tr>${head}</tr></thead><tbody>${rows.join('') ||
      '<tr><td colspan="' + headers.length + '" class="muted" style="text-align:center;padding:26px">Nothing here yet.</td></tr>'}</tbody></table></div>`;
}

const recordStr = m => `${m.w}-${m.l}${m.ties ? '-' + m.ties : ''}`;
const wl = t => `${t.wins}-${t.losses}${t.ties ? '-' + t.ties : ''}`;

function seasonChips(list, active, route) {
  return `<div class="chip-row" id="seasonChips" data-route="${esc(route)}">` +
    list.map(x => `<button class="chip ${x.season === active ? 'active' : ''}"
      data-season="${esc(x.season)}">${esc(x.season)}</button>`).join('') + `</div>`;
}

function medal(row) {
  if (row.champion) return '<span class="pill pill-gold">Champion</span>';
  if (row.runnerUp) return '<span class="pill pill-silver">Runner-up</span>';
  if (row.third) return '<span class="pill pill-bronze">3rd</span>';
  if (row.playoffs) return '<span class="pill pill-dim">Playoffs</span>';
  if (row.consolation) return '<span class="pill pill-teal">Consolation</span>';
  if (row.lastPlace) return '<span class="pill pill-red">Last</span>';
  return '';
}

const views = {};

/* ============================== HOME ============================== */
views.home = () => {
  const last = MODEL.completedSeasons[MODEL.completedSeasons.length - 1];
  const champTeam = last && last.byRoster[last.championRoster];
  const champ = champTeam ? mgr(champTeam.ownerId) : null;
  const mostTitles = MODEL.managerList.slice().sort((a, b) =>
    b.titles.length - a.titles.length || b.winPct - a.winPct)[0];
  const topScore = MODEL.records.topWeeks[0];
  const live = MODEL.liveSeason;
  const upcoming = !live && MODEL.currentSeason && !MODEL.currentSeason.complete
    ? MODEL.currentSeason : null;

  const bestPct = MODEL.qualifiedList.slice()
    .sort((a, b) => b.winPct - a.winPct || b.pf - a.pf)[0] || MODEL.managerList[0];

  const leaders = MODEL.managerList.slice(0, 6).map((m, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td>${mgrCell(m.id)}</td>
      <td class="num">${m.games}</td>
      <td class="num">${recordStr(m)}</td>
      <td class="num">${pct(m.winPct)}</td>
      <td class="num"><strong>${pct(m.adjWinPct)}</strong></td>
      <td class="num">${n1(m.ppg)}</td>
      <td class="num">${m.titles.length ? `<span class="pill pill-gold">${m.titles.length}</span>` : '<span class="muted">&mdash;</span>'}</td>
    </tr>`);

  const titleRows = MODEL.completedSeasons.slice().reverse().map(s => {
    const t = s.byRoster[s.championRoster], r = s.byRoster[s.runnerUpRoster];
    return `<tr>
      <td><strong>${esc(s.season)}</strong></td>
      <td>${t ? mgrCell(t.ownerId, t.teamName) : '<span class="muted">Unknown</span>'}</td>
      <td>${r ? mgrLink(r.ownerId) : '<span class="muted">&mdash;</span>'}</td>
      <td class="num">${t ? wl(t) : ''}</td>
    </tr>`;
  });

  // --- live season block -------------------------------------------
  let liveBlock = '';
  if (live) {
    const weeksPlayed = Array.from(new Set(live.games.map(g => g.week)));
    const curWeek = weeksPlayed.length ? Math.max.apply(null, weeksPlayed) : 0;
    const bubble = live.standings.slice(0, live.playoffTeams + 2).map((t, i) => `
      <tr class="${i === live.playoffTeams - 1 ? 'playoff-line' : ''}">
        <td class="rank">${t.seed}</td>
        <td>${mgrCell(t.ownerId, t.teamName)}</td>
        <td class="num">${wl(t)}</td>
        <td class="num">${n2(t.pf)}</td>
        <td>${t.seed <= live.playoffTeams ? '<span class="pill pill-dim">In</span>' : '<span class="muted small">Bubble</span>'}</td>
      </tr>`);
    const lastWeek = live.games.filter(g => g.week === curWeek).map(g => {
      const ta = live.byRoster[g.a], tb = live.byRoster[g.b];
      if (!ta || !tb) return '';
      const aw = g.ap > g.bp;
      return `<tr>
        <td class="${aw ? 'win' : 'muted'}">${mgrLink(ta.ownerId)}</td>
        <td class="num ${aw ? 'win' : ''}">${n2(g.ap)}</td>
        <td class="muted" style="text-align:center">&ndash;</td>
        <td class="num ${!aw ? 'win' : ''}">${n2(g.bp)}</td>
        <td class="${!aw ? 'win' : 'muted'}">${mgrLink(tb.ownerId)}</td>
      </tr>`;
    }).join('');

    liveBlock = `
      <h3 class="section-title">${esc(live.season)} Season &mdash; In Progress</h3>
      <div class="grid g2">
        <div>
          <div class="small muted" style="margin-bottom:8px">Playoff picture (top ${live.playoffTeams} make it)</div>
          ${table(['#', 'Manager', { label: 'Record', num: 1 }, { label: 'PF', num: 1 }, ''], bubble)}
        </div>
        <div>
          <div class="small muted" style="margin-bottom:8px">Week ${curWeek} results</div>
          <div class="table-wrap"><table>${lastWeek ||
        '<tr><td class="muted" style="padding:20px">No games played yet.</td></tr>'}</table></div>
        </div>
      </div>`;
  }

  return `
  <div class="hero">
    <div class="hero-eyebrow">Established ${esc(MODEL.seasons[0].season)}</div>
    <h2>${esc(MODEL.leagueName)}</h2>
    <p>${MODEL.totals.seasons} completed seasons, ${MODEL.totals.games.toLocaleString()} games played and
       ${Math.round(MODEL.totals.points).toLocaleString()} fantasy points scored. Every number on this site is
       pulled straight from Sleeper the moment you load the page.</p>
  </div>

  ${upcoming && upcoming.draftStart && upcoming.draftStatus === 'pre_draft' ? (() => {
      const d = new Date(upcoming.draftStart);
      const when = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) +
        ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return `<div class="draft-hero" id="draftCountdown" data-ts="${upcoming.draftStart}">
      <div class="draft-hero-info">
        <div class="hero-eyebrow">${esc(upcoming.season)} Draft</div>
        <div class="draft-date">${esc(when)}</div>
        <a class="small" href="https://sleeper.com/draft/nfl/${esc(upcoming.draftId)}"
          target="_blank" rel="noopener">Open the draft room &rarr;</a>
      </div>
      <div class="draft-timer">
        <div class="dt-tile"><span class="dt-num" data-u="d">&ndash;</span><span class="dt-label">days</span></div>
        <div class="dt-tile"><span class="dt-num" data-u="h">&ndash;</span><span class="dt-label">hours</span></div>
        <div class="dt-tile"><span class="dt-num" data-u="m">&ndash;</span><span class="dt-label">min</span></div>
        <div class="dt-tile"><span class="dt-num" data-u="s">&ndash;</span><span class="dt-label">sec</span></div>
      </div>
    </div>`;
    })() : ''}

  ${upcoming ? `<div class="notice"><strong>${esc(upcoming.season)} season:</strong>
      ${upcoming.status === 'pre_draft'
        ? (upcoming.draftStart ? 'the draft is scheduled — countdown above.' : 'the draft hasn\'t been scheduled yet.')
        : 'getting started.'}
      ${last ? `Everything below covers ${esc(MODEL.completedSeasons[0].season)}&ndash;${esc(last.season)}.` : ''}
      This page fills in on its own once games are played.</div>` : ''}

  <div class="grid g4">
    <div class="stat">
      <div class="stat-label">Reigning Champion</div>
      <div class="stat-value gold">${champ ? esc(champ.name) : '&mdash;'}</div>
      <div class="stat-meta">${champTeam ? esc(champTeam.teamName) + ' &middot; ' + esc(last.season) : ''}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Most Titles</div>
      <div class="stat-value">${mostTitles ? esc(mostTitles.name) : '&mdash;'}</div>
      <div class="stat-meta">${mostTitles ? mostTitles.titles.length + ' championship' + (mostTitles.titles.length === 1 ? '' : 's') : ''}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Best Win % <span class="stat-note">${MODEL.minSeasons}+ seasons</span></div>
      <div class="stat-value">${bestPct ? esc(bestPct.name) : '&mdash;'}</div>
      <div class="stat-meta">${bestPct ? pct(bestPct.winPct) + ' &middot; ' + recordStr(bestPct) +
        ' &middot; ' + bestPct.fullSeasons + ' seasons' : ''}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Highest Score Ever</div>
      <div class="stat-value">${topScore ? n2(topScore.pts) : '&mdash;'}</div>
      <div class="stat-meta">${topScore ? esc(mgr(topScore.ownerId).name) + ' &middot; ' + topScore.season + ' Wk ' + topScore.week : ''}</div>
    </div>
  </div>

  ${liveBlock}

  <h3 class="section-title">All-Time Leaders</h3>
  ${table(['#', 'Manager', { label: 'GP', num: 1 }, { label: 'Record', num: 1 },
    { label: 'Win %', num: 1 }, { label: 'Adj %', num: 1 },
    { label: 'PPG', num: 1 }, { label: 'Titles', num: 1 }], leaders)}
  <p class="small muted" style="margin-top:10px">
    Ranked by <strong>adjusted win %</strong> &mdash; each record is regressed toward .500 by
    ${MODEL.regressGames} games, so a short career has to earn its place instead of riding a
    hot half-season. <a href="#/managers">See every manager &rarr;</a></p>

  <h3 class="section-title">Champions</h3>
  ${table(['Season', 'Champion', 'Runner-Up', { label: 'Record', num: 1 }], titleRows)}
  <p class="small muted" style="margin-top:10px"><a href="#/champions">Full trophy room &rarr;</a></p>`;
};

/* ============================ STANDINGS ============================ */
views.standings = params => {
  const list = MODEL.seasons.filter(s => s.started).slice().reverse();
  if (!list.length) return `<div class="empty">No seasons have been played yet.</div>`;
  const season = params.season && list.find(s => s.season === params.season)
    ? params.season : list[0].season;
  const s = list.find(x => x.season === season);
  const mode = params.chart === 'wins' ? 'wins' : 'pts';

  const rows = s.standings.map(t => {
    const isChamp = s.championRoster === t.rosterId;
    const cls = [isChamp ? 'row-champ' : '', t.seed === s.playoffTeams ? 'playoff-line' : ''].join(' ');
    const gp = t.wins + t.losses + t.ties;
    return `<tr class="${cls}">
      <td class="rank">${t.seed}</td>
      <td>${mgrCell(t.ownerId, t.teamName)}</td>
      <td class="num">${wl(t)}</td>
      <td class="num">${n2(t.pf)}</td>
      <td class="num">${n2(t.pa)}</td>
      <td class="num" style="color:${t.pf - t.pa >= 0 ? 'var(--green)' : 'var(--red)'}">
        ${t.pf - t.pa >= 0 ? '+' : ''}${n1(t.pf - t.pa)}</td>
      <td class="num">${gp ? n1(t.pf / gp) : '&mdash;'}</td>
      <td>${medal({
      champion: isChamp,
      runnerUp: s.runnerUpRoster === t.rosterId,
      third: s.thirdRoster === t.rosterId,
      consolation: s.consolationRoster === t.rosterId,
      playoffs: s.playoffRosters.includes(t.rosterId),
      lastPlace: s.lastPlaceRoster === t.rosterId
    })}</td>
    </tr>`;
  });

  // ---- charts -------------------------------------------------------
  const prog = seasonProgression(s);
  const series = s.standings.map((t, i) => ({
    id: 'r' + t.rosterId,
    name: mgr(t.ownerId).name,
    color: seriesColor(i),
    values: (prog.series[t.rosterId] || { pts: [], wins: [] })[mode]
  })).filter(x => x.values.length);

  const chart = prog.weeks.length
    ? lineChart(prog.weeks, series, {
      zeroBased: true,
      title: mode === 'pts' ? 'Cumulative points by week' : 'Cumulative wins by week'
    })
    : '<div class="empty">No games played yet this season.</div>';

  // ---- weekly scoreboard --------------------------------------------
  const weeks = {};
  s.games.forEach(g => { (weeks[g.week] = weeks[g.week] || []).push(g); });
  const scoreboard = Object.keys(weeks).sort((a, b) => a - b).map(w => {
    const inner = weeks[w].map(g => {
      const ta = s.byRoster[g.a], tb = s.byRoster[g.b];
      if (!ta || !tb) return '';
      const aw = g.ap > g.bp;
      return `<tr>
        <td class="${aw ? 'win' : 'muted'}">${mgrLink(ta.ownerId)}</td>
        <td class="num ${aw ? 'win' : ''}">${n2(g.ap)}</td>
        <td class="muted" style="text-align:center">&ndash;</td>
        <td class="num ${!aw ? 'win' : ''}">${n2(g.bp)}</td>
        <td class="${!aw ? 'win' : 'muted'}">${mgrLink(tb.ownerId)}</td>
      </tr>`;
    }).join('');
    return `<details class="panel" style="margin-bottom:10px">
      <summary>Week ${w}</summary>
      <table style="margin-top:10px">${inner}</table></details>`;
  }).join('');

  return `
  <div class="page-head">
    <h1 class="page-title">Standings</h1>
    <p class="page-sub">Regular-season standings, season by season.</p>
  </div>
  ${seasonChips(list, season, 'standings')}
  ${table(['Seed', 'Manager', { label: 'Record', num: 1 }, { label: 'PF', num: 1 },
    { label: 'PA', num: 1 }, { label: 'Diff', num: 1 }, { label: 'PPG', num: 1 }, ''], rows)}
  <p class="small muted" style="margin-top:10px">
    Dashed line marks the ${s.playoffTeams}-team playoff cut &middot; ${s.numTeams} teams this season.</p>

  <h3 class="section-title">${esc(season)} Season Race</h3>
  <div class="chip-row" id="chartChips" data-season="${esc(season)}" style="margin-bottom:14px">
    <button class="chip ${mode === 'pts' ? 'active' : ''}" data-chart="pts">Cumulative points</button>
    <button class="chip ${mode === 'wins' ? 'active' : ''}" data-chart="wins">Cumulative wins</button>
  </div>
  ${chart}
  <p class="small muted" style="margin-top:8px">Click a name in the key to isolate that manager.</p>

  ${scoreboard ? `<h3 class="section-title">${esc(season)} Weekly Scoreboard</h3>${scoreboard}` : ''}`;
};

/* ============================= PLAYOFFS ============================ */
views.playoffs = params => {
  const list = MODEL.seasons.filter(s => s.winnersBracket.length).slice().reverse();
  if (!list.length) return `
    <div class="page-head"><h1 class="page-title">Playoffs</h1></div>
    <div class="empty">No playoff brackets available yet.</div>`;

  const season = params.season && list.find(s => s.season === params.season)
    ? params.season : list[0].season;
  const s = list.find(x => x.season === season);

  const nameFor = rid => {
    const t = s.byRoster[rid];
    return t ? mgrLink(t.ownerId) : null;
  };
  const seedFor = rid => {
    const t = s.byRoster[rid];
    return t ? t.seed : null;
  };

  const renderBracket = (bracket, label, isConsolation) => {
    const rounds = bracketRounds(bracket, s);
    if (!rounds.length) return '';
    const cols = rounds.map(r => {
      const matches = r.matches.map(m => {
        const side = (rid, pts, from) => {
          const nm = rid ? nameFor(rid) : null;
          const won = rid && m.w === rid;
          const label = nm
            ? `<span class="bk-seed">${seedFor(rid) || ''}</span> ${nm}`
            : `<span class="muted">${from && from.w ? 'Winner of match ' + from.w
              : from && from.l ? 'Loser of match ' + from.l : 'TBD'}</span>`;
          return `<div class="bk-team ${won ? 'won' : (m.w ? 'lost' : '')}">
            <span>${label}</span>
            <span class="bk-pts">${pts != null ? n2(pts) : ''}</span></div>`;
        };
        const tag = isConsolation
          ? (m.place === 1 ? 'Consolation Final'
            : m.place === 3 ? 'Consolation 3rd'
              : m.place === 5 ? 'Consolation 5th' : '')
          : (m.place === 1 ? 'Championship'
            : m.place === 3 ? '3rd place'
              : m.place === 5 ? '5th place' : '');
        return `<div class="bk-match">
          ${tag ? `<div class="bk-tag">${tag}</div>` : ''}
          ${side(m.t1, m.t1Pts, m.t1From)}
          ${side(m.t2, m.t2Pts, m.t2From)}
        </div>`;
      }).join('');
      return `<div class="bk-round">
        <div class="bk-round-title">Round ${r.round} &middot; Week ${r.week}</div>
        ${matches}</div>`;
    }).join('');
    return `<h3 class="section-title">${esc(label)}</h3>
      <div class="bracket-wrap"><div class="bracket">${cols}</div></div>`;
  };

  const champ = s.byRoster[s.championRoster];
  const banner = champ ? `<div class="hero" style="margin-bottom:20px">
      <div class="hero-eyebrow">${esc(s.season)} Champion</div>
      <h2>${mgrLink(champ.ownerId)}</h2>
      <p>${esc(champ.teamName)} &middot; ${wl(champ)} regular season &middot;
         ${ordinal(champ.seed)} seed &middot; ${n2(champ.pf)} points for</p>
    </div>` : '';

  return `
  <div class="page-head">
    <h1 class="page-title">Playoffs</h1>
    <p class="page-sub">How every postseason actually played out.</p>
  </div>
  ${seasonChips(list, season, 'playoffs')}
  ${banner}
  ${renderBracket(s.winnersBracket, 'Championship Bracket', false)}
  ${renderBracket(s.losersBracket, 'Consolation Bracket', true)}
  <p class="small muted" style="margin-top:12px">
    Scores come from the matchup data for each playoff week. Byes show as blank slots.</p>`;
};

/* ============================ CHAMPIONS ============================ */
views.champions = () => {
  const seasons = MODEL.completedSeasons.slice().reverse();
  const cards = seasons.map(s => {
    const c = s.byRoster[s.championRoster];
    if (!c) return '';
    const r = s.byRoster[s.runnerUpRoster], t3 = s.byRoster[s.thirdRoster];
    const top = s.standings[0];
    return `<div class="trophy">
      <div class="trophy-year">${esc(s.season)}</div>
      <a class="trophy-mgr" href="#/manager?id=${encodeURIComponent(c.ownerId)}">
        <img src="${esc(mgr(c.ownerId).avatar)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <div>
          <div class="trophy-name">${esc(mgr(c.ownerId).name)}</div>
          <div class="trophy-team">${esc(c.teamName)}</div>
        </div>
      </a>
      <div class="trophy-row"><span>Regular season</span>
        <strong>${wl(c)} (${ordinal(c.seed)} seed)</strong></div>
      <div class="trophy-row"><span>Points for</span><strong>${n2(c.pf)}</strong></div>
      <div class="trophy-row"><span>Beat in the final</span>
        <strong>${r ? mgrLink(r.ownerId) : '&mdash;'}</strong></div>
      <div class="trophy-row"><span>Third place</span>
        <strong>${t3 ? mgrLink(t3.ownerId) : '&mdash;'}</strong></div>
      <div class="trophy-row"><span>Top seed</span>
        <strong>${top ? mgrLink(top.ownerId) : '&mdash;'}</strong></div>
      <div class="trophy-row"><span>Consolation champ</span>
        <strong>${s.byRoster[s.consolationRoster]
        ? mgrLink(s.byRoster[s.consolationRoster].ownerId) : '&mdash;'}</strong></div>
      <div style="margin-top:12px"><a class="small" href="#/playoffs?season=${esc(s.season)}">See the bracket &rarr;</a></div>
    </div>`;
  });

  const counts = MODEL.managerList.slice().sort((a, b) =>
    b.titles.length - a.titles.length || b.finals - a.finals || b.playoffs - a.playoffs
  ).map(m => `<tr class="${m.titles.length ? 'row-champ' : ''}">
    <td>${mgrCell(m.id)}</td>
    <td class="num">${m.titles.length ? `<span class="pill pill-gold">${m.titles.length}</span>` : '<span class="muted">0</span>'}</td>
    <td class="num">${m.finals || '<span class="muted">0</span>'}</td>
    <td class="num">${m.thirds || '<span class="muted">0</span>'}</td>
    <td class="num">${m.consolations || '<span class="muted">0</span>'}</td>
    <td class="num">${m.playoffs}</td>
    <td class="num">${m.regularTitles || '<span class="muted">0</span>'}</td>
    <td class="small muted">${m.titles.join(', ') || '&mdash;'}</td>
  </tr>`);

  return `
  <div class="page-head">
    <h1 class="page-title">Trophy Room</h1>
    <p class="page-sub">Every champion in league history.</p>
  </div>
  <div class="grid g3">${cards.join('')}</div>

  <h3 class="section-title">How Everyone Has Finished</h3>
  <p class="small muted" style="margin-top:-6px;margin-bottom:14px">
    Every manager's career finishes, best to worst. "Top seed" means finishing the regular
    season in first place, which doesn't always end in a title.</p>
  ${table(['Manager', { label: 'Titles', num: 1 }, { label: 'Lost Final', num: 1 },
    { label: 'Third', num: 1 }, { label: 'Consolation', num: 1 },
    { label: 'Playoff Trips', num: 1 },
    { label: 'Top Seed', num: 1 }, 'Championship Years'], counts)}`;
};

/* =========================== HEAD TO HEAD ========================== */
views.h2h = params => {
  const onlyActive = params.active === '1';
  const ms = MODEL.managerList
    .filter(m => !onlyActive || m.active)
    .slice().sort((a, b) => a.name.localeCompare(b.name));
  const head = ['<th>Manager</th>'].concat(ms.map(m =>
    `<th title="${esc(m.name)}">${esc(m.name.slice(0, 7))}</th>`)).join('');

  const rows = ms.map(a => {
    const cells = ms.map(b => {
      if (a.id === b.id) return `<td class="cell self">&mdash;</td>`;
      const r = MODEL.h2h[a.id + '|' + b.id];
      if (!r) return `<td class="cell none">&middot;</td>`;
      const cls = r.w > r.l ? 'pos' : (r.w < r.l ? 'neg' : 'evn');
      const sel = params.a === a.id && params.b === b.id ? ' sel' : '';
      const title = `${a.name} vs ${b.name}: ${r.w}-${r.l}${r.t ? '-' + r.t : ''}, ${n1(r.pf)} to ${n1(r.pa)}`;
      return `<td class="cell ${cls}${sel}" title="${esc(title)}"
        data-a="${esc(a.id)}" data-b="${esc(b.id)}">${r.w}-${r.l}${r.t ? '-' + r.t : ''}</td>`;
    }).join('');
    const tot = ms.reduce((acc, b) => {
      const r = MODEL.h2h[a.id + '|' + b.id];
      if (r) { acc.w += r.w; acc.l += r.l; acc.t += r.t; }
      return acc;
    }, { w: 0, l: 0, t: 0 });
    return `<tr><th>${esc(a.name)}</th>${cells}
      <td class="cell"><strong>${tot.w}-${tot.l}${tot.t ? '-' + tot.t : ''}</strong></td></tr>`;
  });

  const seen = new Set();
  const pairs = [];
  MODEL.managerList.forEach(a => MODEL.managerList.forEach(b => {
    if (a.id === b.id) return;
    const k = [a.id, b.id].sort().join('~');
    if (seen.has(k)) return;
    seen.add(k);
    const r = MODEL.h2h[a.id + '|' + b.id];
    if (!r) return;
    pairs.push({ a, b, g: r.w + r.l + r.t, w: r.w, l: r.l, t: r.t, pf: r.pf, pa: r.pa });
  }));

  const lopsided = pairs.filter(p => p.g >= 3)
    .map(p => Object.assign({}, p, { gap: Math.abs(p.w - p.l) }))
    .sort((x, y) => y.gap - x.gap || y.g - x.g).slice(0, 10)
    .map(p => {
      const dom = p.w >= p.l ? p.a : p.b, sub = p.w >= p.l ? p.b : p.a;
      const rec = p.w >= p.l ? `${p.w}-${p.l}` : `${p.l}-${p.w}`;
      return `<tr>
        <td>${mgrCell(dom.id)}</td><td class="muted">owns</td><td>${mgrCell(sub.id)}</td>
        <td class="num win">${rec}${p.t ? '-' + p.t : ''}</td>
        <td class="num">${n1(Math.abs(p.pf - p.pa))}</td></tr>`;
    });

  const most = pairs.slice().sort((x, y) => y.g - x.g).slice(0, 10).map(p => `<tr>
    <td>${mgrCell(p.a.id)}</td><td>${mgrCell(p.b.id)}</td>
    <td class="num">${p.g}</td>
    <td class="num">${p.w}-${p.l}${p.t ? '-' + p.t : ''}</td>
    <td class="num">${n1(p.pf)} &ndash; ${n1(p.pa)}</td></tr>`);

  /* ---- matchup detail when a cell is picked ---- */
  let detail = '';
  const A = params.a && MODEL.managers[params.a];
  const B = params.b && MODEL.managers[params.b];
  if (A && B) {
    const r = MODEL.h2h[A.id + '|' + B.id];
    if (r) {
      const games = r.games.slice().sort((x, y) =>
        y.season.localeCompare(x.season) || y.week - x.week);
      const gRows = games.map(g => `<tr>
        <td>${esc(g.season)}</td>
        <td class="muted">Week ${g.week}</td>
        <td class="num ${g.pts > g.oppPts ? 'win' : ''}">${n2(g.pts)}</td>
        <td class="num ${g.oppPts > g.pts ? 'win' : ''}">${n2(g.oppPts)}</td>
        <td class="num">${n1(Math.abs(g.pts - g.oppPts))}</td>
        <td>${g.pts > g.oppPts ? '<span class="win">W</span>' :
          g.pts < g.oppPts ? '<span class="loss">L</span>' : '<span class="muted">T</span>'}</td>
      </tr>`);
      detail = `
      <h3 class="section-title">${esc(A.name)} vs ${esc(B.name)}</h3>
      <div class="grid g4" style="margin-bottom:16px">
        <div class="stat"><div class="stat-label">Series Record</div>
          <div class="stat-value gold">${r.w}-${r.l}${r.t ? '-' + r.t : ''}</div>
          <div class="stat-meta">from ${esc(A.name)}'s side</div></div>
        <div class="stat"><div class="stat-label">Points Scored</div>
          <div class="stat-value">${n1(r.pf)}</div>
          <div class="stat-meta">vs ${n1(r.pa)} allowed</div></div>
        <div class="stat"><div class="stat-label">Average Margin</div>
          <div class="stat-value">${games.length ? n1(games.reduce((a, g) =>
            a + (g.pts - g.oppPts), 0) / games.length) : '&mdash;'}</div>
          <div class="stat-meta">per meeting</div></div>
        <div class="stat"><div class="stat-label">Meetings</div>
          <div class="stat-value">${games.length}</div>
          <div class="stat-meta">regular season only</div></div>
      </div>
      ${table(['Season', 'Week', { label: A.name, num: 1 }, { label: B.name, num: 1 },
        { label: 'Margin', num: 1 }, ''], gRows)}
      <p class="small muted" style="margin-top:10px">
        <button class="linklike" id="h2hClear">Clear this matchup</button></p>`;
    }
  }

  return `
  <div class="page-head">
    <h1 class="page-title">Head to Head</h1>
    <p class="page-sub">All-time regular-season records. Read across: the row manager's record against each column.</p>
  </div>
  <div class="toolbar">
    <label class="toggle"><input type="checkbox" id="h2hActive" ${onlyActive ? 'checked' : ''}>
      <span>Current managers only</span></label>
  </div>
  <div class="h2h-wrap"><table class="h2h">
    <thead><tr>${head}<th>Total</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>
  <p class="small muted" style="margin-top:10px">
    <strong>Click any cell</strong> to see every meeting between those two.
    Playoff games are excluded.</p>
  ${detail}
  <h3 class="section-title">Most Lopsided Rivalries</h3>
  ${table(['Manager', '', 'Manager', { label: 'Record', num: 1 }, { label: 'Pt Diff', num: 1 }], lopsided)}
  <h3 class="section-title">Most Played Matchups</h3>
  ${table(['Manager', 'Opponent', { label: 'Games', num: 1 }, { label: 'Record', num: 1 },
    { label: 'Points', num: 1 }], most)}`;
};

/* =========================== RECORD BOOK =========================== */
views.records = params => {
  const R = MODEL.records;
  const fM = params.mgr || '';
  const fS = params.season || '';
  const filtered = !!(fM || fS);

  const keepWk = x => (!fM || x.ownerId === fM) && (!fS || x.season === fS);
  const keepGm = x => (!fM || x.winner === fM || x.loser === fM) && (!fS || x.season === fS);
  const keepSn = x => (!fM || x.ownerId === fM) && (!fS || x.season === fS);
  const top = (list, keep) => list.filter(keep).slice(0, 10);

  const topWeeks = top(R.topWeeks, keepWk);
  const lowWeeks = top(R.lowWeeks, keepWk);
  const blowouts = top(R.blowouts, keepGm);
  const nailbiters = top(R.nailbiters, keepGm);
  const shootouts = top(R.shootouts, keepGm);
  const mostInLoss = top(R.mostInLoss, keepWk);
  const fewestInWin = top(R.fewestInWin, keepWk);
  const bestPF = top(R.bestSeasonPF, keepSn);
  const bestRec = top(R.bestSeasonRec, keepSn);

  const w = topWeeks[0], lo = lowWeeks[0], bl = blowouts[0],
    nb = nailbiters[0], sh = shootouts[0], bp = bestPF[0], ml = mostInLoss[0];

  const cards = [
    w ? recCard('Highest Single Week', n2(w.pts), esc(mgr(w.ownerId).name), `${w.season} · Week ${w.week}`, 'hot') : '',
    lo ? recCard('Lowest Single Week', n2(lo.pts), esc(mgr(lo.ownerId).name), `${lo.season} · Week ${lo.week}`, 'cold') : '',
    bl ? recCard('Biggest Blowout', n2(bl.margin), `${esc(mgr(bl.winner).name)} over ${esc(mgr(bl.loser).name)}`, `${bl.season} · Week ${bl.week}`, 'hot') : '',
    nb ? recCard('Closest Game', n2(nb.margin), `${esc(mgr(nb.winner).name)} over ${esc(mgr(nb.loser).name)}`, `${nb.season} · Week ${nb.week}`) : '',
    sh ? recCard('Highest Combined', n2(sh.total), `${esc(mgr(sh.winner).name)} vs ${esc(mgr(sh.loser).name)}`, `${sh.season} · Week ${sh.week}`) : '',
    ml ? recCard('Most Points in a Loss', n2(ml.pts), esc(mgr(ml.ownerId).name), `${ml.season} · Week ${ml.week}`, 'cold') : '',
    bp ? recCard('Most Points, Season', n2(bp.pf), esc(mgr(bp.ownerId).name), `${bp.season} regular season`, 'hot') : '',
    (!filtered && R.longestWinStreak) ? recCard('Longest Win Streak', R.longestWinStreak.n + ' games',
      esc(mgr(R.longestWinStreak.id).name), `through ${R.longestWinStreak.end.season} Week ${R.longestWinStreak.end.week}`, 'hot') : ''
  ].join('');

  const mgrOpts = MODEL.managerList.slice().sort((a, b) => a.name.localeCompare(b.name))
    .map(m => `<option value="${esc(m.id)}" ${m.id === fM ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const snOpts = MODEL.completedSeasons.slice().reverse()
    .map(s => `<option value="${esc(s.season)}" ${s.season === fS ? 'selected' : ''}>${esc(s.season)}</option>`).join('');

  const weekRows = (list, cls) => list.map((x, i) => `<tr>
    <td class="rank">${i + 1}</td>
    <td>${mgrCell(x.ownerId)}</td>
    <td class="num ${cls || ''}">${n2(x.pts)}</td>
    <td class="muted">${esc(x.season)} &middot; Wk ${x.week}</td>
    <td>${mgrLink(x.opp)}</td>
    <td class="num muted">${n2(x.oppPts)}</td>
    <td>${x.won ? '<span class="win">W</span>' : '<span class="loss">L</span>'}</td>
  </tr>`);

  const gameRows = list => list.map((x, i) => `<tr>
    <td class="rank">${i + 1}</td>
    <td>${mgrCell(x.winner)}</td>
    <td class="num win">${n2(x.hi)}</td>
    <td>${mgrCell(x.loser)}</td>
    <td class="num">${n2(x.lo)}</td>
    <td class="num"><strong>${n2(x.margin)}</strong></td>
    <td class="muted">${esc(x.season)} &middot; Wk ${x.week}</td>
  </tr>`);

  const seasonRows = list => list.map((x, i) => `<tr>
    <td class="rank">${i + 1}</td>
    <td>${mgrCell(x.ownerId, x.teamName)}</td>
    <td>${esc(x.season)}</td>
    <td class="num">${x.wins}-${x.losses}${x.ties ? '-' + x.ties : ''}</td>
    <td class="num">${n2(x.pf)}</td>
    <td class="num">${n2(x.pa)}</td>
    <td>${x.champion ? '<span class="pill pill-gold">Champ</span>' : ''}</td>
  </tr>`);

  /* ---- weekly awards ---- */
  const crownRows = MODEL.managerList.slice()
    .filter(m => !fM || m.id === fM)
    .sort((a, b) => b.crowns - a.crowns).slice(0, 12)
    .map((m, i) => `<tr>
      <td class="rank">${i + 1}</td>
      <td>${mgrCell(m.id)}</td>
      <td class="num">${m.crowns}</td>
      <td class="num">${m.weeks}</td>
      <td class="num">${m.weeks ? pct(m.crowns / m.weeks) : '&mdash;'}</td>
    </tr>`);

  /* ---- hall of shame ---- */
  const shameRows = MODEL.managerList.slice()
    .filter(m => !fM || m.id === fM)
    .sort((a, b) => (b.lastPlace - a.lastPlace) || (b.blowoutLosses - a.blowoutLosses))
    .map(m => `<tr>
      <td>${mgrCell(m.id)}</td>
      <td class="num">${m.lastPlace || '<span class="muted">0</span>'}</td>
      <td class="num">${m.worstWeek ? n2(m.worstWeek.pts) : '&mdash;'}</td>
      <td class="num">${m.blowoutLosses}</td>
      <td class="num">${m.closeLosses}</td>
      <td class="num">${m.seasons.length - m.playoffs}</td>
    </tr>`);

  return `
  <div class="page-head">
    <h1 class="page-title">Record Book</h1>
    <p class="page-sub">All-time highs, lows and oddities. Regular season only.</p>
  </div>

  <div class="toolbar" id="recFilters">
    <label class="small muted">Manager</label>
    <select id="recMgr"><option value="">Everyone</option>${mgrOpts}</select>
    <label class="small muted">Season</label>
    <select id="recSeason"><option value="">All seasons</option>${snOpts}</select>
    ${filtered ? `<button class="btn" id="recClear">Clear filters</button>` : ''}
  </div>

  <div class="grid g4">${cards || '<div class="empty">No records match that filter.</div>'}</div>

  <h3 class="section-title">Top Single-Week Scores</h3>
  ${table(['#', 'Manager', { label: 'Points', num: 1 }, 'When', 'Opponent', { label: 'Opp', num: 1 }, ''],
    weekRows(topWeeks, 'win'))}

  <h3 class="section-title">Lowest Single-Week Scores</h3>
  ${table(['#', 'Manager', { label: 'Points', num: 1 }, 'When', 'Opponent', { label: 'Opp', num: 1 }, ''],
    weekRows(lowWeeks, 'loss'))}

  <h3 class="section-title">Most Points in a Loss</h3>
  ${table(['#', 'Manager', { label: 'Points', num: 1 }, 'When', 'Opponent', { label: 'Opp', num: 1 }, ''],
    weekRows(mostInLoss, 'loss'))}

  <h3 class="section-title">Fewest Points in a Win</h3>
  ${table(['#', 'Manager', { label: 'Points', num: 1 }, 'When', 'Opponent', { label: 'Opp', num: 1 }, ''],
    weekRows(fewestInWin, 'win'))}

  <h3 class="section-title">Biggest Blowouts</h3>
  ${table(['#', 'Winner', { label: 'Score', num: 1 }, 'Loser', { label: 'Score', num: 1 },
    { label: 'Margin', num: 1 }, 'When'], gameRows(blowouts))}

  <h3 class="section-title">Closest Finishes</h3>
  ${table(['#', 'Winner', { label: 'Score', num: 1 }, 'Loser', { label: 'Score', num: 1 },
    { label: 'Margin', num: 1 }, 'When'], gameRows(nailbiters))}

  <h3 class="section-title">Weekly Crowns</h3>
  <p class="small muted" style="margin-top:-6px;margin-bottom:12px">
    How often each manager posted the highest score of the week.</p>
  ${table(['#', 'Manager', { label: 'Crowns', num: 1 }, { label: 'Weeks', num: 1 },
    { label: 'Rate', num: 1 }], crownRows)}

  <h3 class="section-title">Highest Scoring Seasons</h3>
  ${table(['#', 'Manager', 'Season', { label: 'Record', num: 1 }, { label: 'PF', num: 1 },
    { label: 'PA', num: 1 }, ''], seasonRows(bestPF))}

  <h3 class="section-title">Best Regular Seasons</h3>
  ${table(['#', 'Manager', 'Season', { label: 'Record', num: 1 }, { label: 'PF', num: 1 },
    { label: 'PA', num: 1 }, ''], seasonRows(bestRec))}

  <h3 class="section-title">Hall of Shame</h3>
  ${table(['Manager', { label: 'Last Place', num: 1 }, { label: 'Worst Week', num: 1 },
    { label: 'Blowout L', num: 1 }, { label: 'Heartbreak L', num: 1 },
    { label: 'Missed Playoffs', num: 1 }], shameRows)}
  <p class="small muted" style="margin-top:10px">
    Blowout losses are 40+ point defeats. Heartbreak losses were decided by under 5 points.</p>`;
};

/* ============================ MANAGERS ============================= */
views.managers = params => {
  const sortKey = params.sort || 'adj';
  const onlyQual = params.qual === '1';

  const sorters = {
    adj: (a, b) => b.adjWinPct - a.adjWinPct,
    pct: (a, b) => b.winPct - a.winPct,
    pf: (a, b) => b.pf - a.pf,
    ppg: (a, b) => b.ppg - a.ppg,
    titles: (a, b) => b.titles.length - a.titles.length || b.adjWinPct - a.adjWinPct,
    games: (a, b) => b.games - a.games
  };

  const list = MODEL.managerList
    .filter(m => !onlyQual || m.qualified)
    .slice().sort(sorters[sortKey] || sorters.adj);

  const rows = list.map((m, i) => `<tr>
    <td class="rank">${i + 1}</td>
    <td ${m.orphanKey ? `title="Left the league — override key ${esc(m.orphanKey)}"` : ''}>
      ${mgrCell(m.id, m.teamNames[m.teamNames.length - 1])}</td>
    <td class="num">${m.seasons.length}${m.rookie ?
      ` <span class="pill pill-dim" title="First season was ${esc(m.firstSeason)}">rookie</span>` : ''}</td>
    <td class="num">${m.games}</td>
    <td class="num">${recordStr(m)}</td>
    <td class="num">${pct(m.winPct)}</td>
    <td class="num"><strong>${pct(m.adjWinPct)}</strong></td>
    <td class="num">${n1(m.pf)}</td>
    <td class="num">${n1(m.ppg)}</td>
    <td class="num" style="color:${m.diff >= 0 ? 'var(--green)' : 'var(--red)'}">
      ${m.diff >= 0 ? '+' : ''}${n1(m.diff)}</td>
    <td class="num">${m.bestWeek ? n2(m.bestWeek.pts) : '&mdash;'}</td>
    <td class="num">${m.crowns}</td>
    <td class="num">${m.playoffs}</td>
    <td class="num">${m.titles.length ? `<span class="pill pill-gold">${m.titles.length}</span>` : '<span class="muted">0</span>'}</td>
  </tr>`);

  const sortChip = (k, label) =>
    `<button class="chip ${sortKey === k ? 'active' : ''}" data-sort="${k}">${label}</button>`;

  return `
  <div class="page-head">
    <h1 class="page-title">Managers</h1>
    <p class="page-sub">Career numbers for everyone who has ever fielded a team. Click a name for the full profile.</p>
  </div>

  <div class="toolbar" id="mgrTools">
    <span class="small muted">Sort by</span>
    <div class="chip-row">
      ${sortChip('adj', 'Adjusted win %')}
      ${sortChip('pct', 'Raw win %')}
      ${sortChip('ppg', 'Points per game')}
      ${sortChip('pf', 'Total points')}
      ${sortChip('titles', 'Titles')}
      ${sortChip('games', 'Games played')}
    </div>
    <label class="toggle">
      <input type="checkbox" id="qualOnly" ${onlyQual ? 'checked' : ''}>
      <span>${MODEL.minSeasons}+ seasons only</span>
    </label>
  </div>

  ${table(['#', 'Manager', { label: 'Yrs', num: 1 }, { label: 'GP', num: 1 },
    { label: 'Record', num: 1 }, { label: 'Win %', num: 1 }, { label: 'Adj %', num: 1 },
    { label: 'PF', num: 1 }, { label: 'PPG', num: 1 },
    { label: 'Diff', num: 1 }, { label: 'Best Wk', num: 1 }, { label: 'Crowns', num: 1 },
    { label: 'Playoffs', num: 1 }, { label: 'Titles', num: 1 }], rows)}

  <div class="notice" style="margin-top:16px">
    <strong>Why two win percentages?</strong> Raw win % rewards small samples &mdash; a manager
    with one good season can sit above someone with four solid ones. <strong>Adjusted win %</strong>
    regresses every record toward .500 by ${MODEL.regressGames} games (about one season). Play more,
    and your adjusted number converges on your real one; play a little, and it stays near the middle.
  </div>`;
};

/* ========================= MANAGER PROFILE ========================= */
views.manager = params => {
  const m = MODEL.managers[params.id];
  if (!m) return `<div class="empty">Manager not found. <a href="#/managers">Back to the list</a></div>`;

  const rank = MODEL.managerList.findIndex(x => x.id === m.id) + 1;
  const holds = (MODEL.recordHolders || []).filter(r => r.owners.includes(m.id));

  const seasonRows = m.seasons.slice().reverse().map(s => `<tr class="${s.champion ? 'row-champ' : ''}">
    <td><strong>${esc(s.season)}</strong></td>
    <td>${esc(s.teamName)}</td>
    <td class="num">${s.wins}-${s.losses}${s.ties ? '-' + s.ties : ''}</td>
    <td class="num">${ordinal(s.seed)}</td>
    <td class="num">${n2(s.pf)}</td>
    <td class="num">${n2(s.pa)}</td>
    <td>${medal(s)}</td>
  </tr>`);

  const rivals = MODEL.managerList.filter(o => o.id !== m.id).map(o => {
    const r = MODEL.h2h[m.id + '|' + o.id];
    if (!r) return null;
    return { o, r, g: r.w + r.l + r.t, pct: (r.w + r.t * .5) / Math.max(r.w + r.l + r.t, 1) };
  }).filter(Boolean).sort((a, b) => b.g - a.g);

  const rivalRows = rivals.map(x => `<tr>
    <td>${mgrCell(x.o.id)}</td>
    <td class="num">${x.r.w}-${x.r.l}${x.r.t ? '-' + x.r.t : ''}</td>
    <td class="num" style="color:${x.pct >= .5 ? 'var(--green)' : 'var(--red)'}">${pct(x.pct)}</td>
    <td class="num">${n1(x.r.pf)}</td>
    <td class="num">${n1(x.r.pa)}</td>
    <td class="num" style="color:${x.r.pf - x.r.pa >= 0 ? 'var(--green)' : 'var(--red)'}">
      ${x.r.pf - x.r.pa >= 0 ? '+' : ''}${n1(x.r.pf - x.r.pa)}</td>
  </tr>`);

  const best = MODEL.weekly.filter(w => w.ownerId === m.id)
    .sort((a, b) => b.pts - a.pts);
  const bestRows = best.slice(0, 5).map((x, i) => `<tr>
    <td class="rank">${i + 1}</td><td class="num win">${n2(x.pts)}</td>
    <td class="muted">${esc(x.season)} &middot; Wk ${x.week}</td>
    <td>${mgrLink(x.opp)}</td><td class="num muted">${n2(x.oppPts)}</td></tr>`);
  const worstRows = best.slice(-5).reverse().map((x, i) => `<tr>
    <td class="rank">${i + 1}</td><td class="num loss">${n2(x.pts)}</td>
    <td class="muted">${esc(x.season)} &middot; Wk ${x.week}</td>
    <td>${mgrLink(x.opp)}</td><td class="num muted">${n2(x.oppPts)}</td></tr>`);

  // career form: every week they've played, against the league average
  const career = MODEL.weekly.filter(w => w.ownerId === m.id)
    .sort((a, b) => a.season.localeCompare(b.season) || a.week - b.week);
  const leagueAvgByWeek = {};
  MODEL.weekly.forEach(w => {
    const k = w.season + '|' + w.week;
    const a = leagueAvgByWeek[k] || (leagueAvgByWeek[k] = { sum: 0, n: 0 });
    a.sum += w.pts; a.n++;
  });
  const formChart = career.length ? lineChart(
    career.map(w => `'${String(w.season).slice(2)} W${w.week}`),
    [
      { id: 'me', name: m.name, color: 'var(--gold)', values: career.map(w => w.pts) },
      {
        id: 'avg', name: 'League average', color: '#5c6b7f',
        values: career.map(w => {
          const a = leagueAvgByWeek[w.season + '|' + w.week];
          return a ? a.sum / a.n : 0;
        })
      }
    ],
    { title: 'Weekly scores across their career', xLabel: '', decimals: true, maxXLabels: 10 }
  ) : '';

  // draft picks by season (first three rounds)
  const drafted = MODEL.seasons.filter(s => s.draft).map(s => {
    const row = m.seasons.find(x => x.season === s.season);
    if (!row) return '';
    const picks = s.draft.picks.filter(p => p.rosterId === row.rosterId && p.round <= 3)
      .sort((a, b) => a.pick - b.pick);
    if (!picks.length) return '';
    return `<tr><td><strong>${esc(s.season)}</strong></td>
      <td>${picks.map(p => `${esc(p.player)} <span class="muted small">(${esc(p.position)})</span>`).join(' &middot; ')}</td></tr>`;
  }).filter(Boolean).reverse();

  return `
  <div class="profile-head">
    <img src="${esc(m.avatar)}" alt="" onerror="this.style.visibility='hidden'">
    <div>
      <h1 class="page-title" style="margin:0">${esc(m.name)}</h1>
      <p class="page-sub">${m.teamNames.map(esc).join(' &middot; ')}</p>
      <div class="chip-row" style="margin-top:10px">
        ${m.titles.map(y => `<span class="pill pill-gold">${esc(y)} Champion</span>`).join('')}
        ${m.finals ? `<span class="pill pill-silver">${m.finals}&times; runner-up</span>` : ''}
        ${m.thirds ? `<span class="pill pill-bronze">${m.thirds}&times; third place</span>` : ''}
        ${m.consolations ? `<span class="pill pill-teal">${m.consolations}&times; consolation champ</span>` : ''}
        ${m.regularTitles ? `<span class="pill pill-dim">${m.regularTitles}&times; top seed</span>` : ''}
        ${holds.length ? `<span class="pill pill-gold">${holds.length} league record${holds.length === 1 ? '' : 's'}</span>` : ''}
        ${m.lastPlace ? `<span class="pill pill-red">${m.lastPlace}&times; last place</span>` : ''}
      </div>
    </div>
  </div>

  <div class="grid g4" style="margin-top:20px">
    <div class="stat"><div class="stat-label">All-Time Record</div>
      <div class="stat-value">${recordStr(m)}</div>
      <div class="stat-meta">${pct(m.winPct)} &middot; ${ordinal(rank)} of ${MODEL.managerList.length}</div></div>
    <div class="stat"><div class="stat-label">Points Per Game</div>
      <div class="stat-value">${n1(m.ppg)}</div>
      <div class="stat-meta">${n1(m.pf)} total &middot; ${n1(m.papg)} against</div></div>
    <div class="stat"><div class="stat-label">Best Week</div>
      <div class="stat-value gold">${m.bestWeek ? n2(m.bestWeek.pts) : '&mdash;'}</div>
      <div class="stat-meta">${m.bestWeek ? m.bestWeek.season + ' Week ' + m.bestWeek.week : ''}</div></div>
    <div class="stat"><div class="stat-label">Career Winnings</div>
      <div class="stat-value ${m.winnings ? 'gold' : ''}">${money0(m.winnings || 0)}</div>
      <div class="stat-meta">${money0(m.paidIn || 0)} paid in &middot;
        <span style="color:${m.net > 0 ? 'var(--green)' : m.net < 0 ? 'var(--red)' : 'inherit'}">
        ${m.net > 0 ? '+' : ''}${money0(m.net || 0)} net</span></div></div>
  </div>

  <h3 class="section-title">Record Showcase</h3>
  ${holds.length ? `
    <p class="small muted" style="margin-top:-6px;margin-bottom:14px">
      League records currently held. These update themselves the moment someone breaks one.</p>
    <div class="grid g4">${holds.map(r => `
      <div class="rec showcase ${r.tone}">
        <div class="rec-label">${esc(r.label)}</div>
        <div class="rec-value">${esc(r.display)}</div>
        <div class="rec-who">${esc(r.detail || 'all-time')}</div>
        <div class="rec-when">${r.owners.length > 1
        ? 'shared with ' + r.owners.filter(o => o !== m.id).map(o => esc(mgr(o).name)).join(', ')
        : 'sole holder'}</div>
      </div>`).join('')}</div>`
      : `<div class="empty" style="padding:26px">No league records held &mdash; yet.
        The <a href="#/records">record book</a> shows what's up for grabs.</div>`}

  ${formChart ? `<h3 class="section-title">Career Form</h3>${formChart}
    <p class="small muted" style="margin-top:8px">Every week they've played, against what the
      rest of the league averaged that same week.</p>` : ''}

  <h3 class="section-title">Season by Season</h3>
  ${table(['Season', 'Team Name', { label: 'Record', num: 1 }, { label: 'Seed', num: 1 },
    { label: 'PF', num: 1 }, { label: 'PA', num: 1 }, ''], seasonRows)}

  <h3 class="section-title">Against Everyone Else</h3>
  ${table(['Opponent', { label: 'Record', num: 1 }, { label: 'Win %', num: 1 },
    { label: 'PF', num: 1 }, { label: 'PA', num: 1 }, { label: 'Diff', num: 1 }], rivalRows)}

  <div class="grid g2">
    <div>
      <h3 class="section-title">Best Weeks</h3>
      ${table(['#', { label: 'Points', num: 1 }, 'When', 'Opponent', { label: 'Opp', num: 1 }], bestRows)}
    </div>
    <div>
      <h3 class="section-title">Worst Weeks</h3>
      ${table(['#', { label: 'Points', num: 1 }, 'When', 'Opponent', { label: 'Opp', num: 1 }], worstRows)}
    </div>
  </div>

  ${(() => {
      const row = MODEL.money && MODEL.money.byManager[m.id];
      if (!row || !row.awards.length) return '';
      const awards = row.awards.map(a => `<tr>
        <td>${esc(a.season)}</td>
        <td>${esc(a.label)}</td>
        <td class="num gold-text">${money0(a.amount)}</td>
      </tr>`);
      return `<h3 class="section-title">Winnings</h3>
        ${table(['Season', 'Prize', { label: 'Amount', num: 1 }], awards)}
        <p class="small muted" style="margin-top:10px">
          ${money0(row.total)} won against ${money0(row.buyIns)} in buy-ins &mdash;
          <strong style="color:${row.net > 0 ? 'var(--green)' : 'var(--red)'}">
          ${row.net > 0 ? '+' : ''}${money0(row.net)}</strong> lifetime.
          <a href="#/money">Full ledger &rarr;</a></p>`;
    })()}

  ${drafted.length ? `<h3 class="section-title">Early-Round Draft Picks</h3>
    ${table(['Season', 'Rounds 1-3'], drafted)}` : ''}

  <p style="margin-top:22px"><a href="#/managers">&larr; All managers</a></p>`;
};

/* ============================== DRAFT ============================== */
views.draft = params => {
  const list = MODEL.seasons.filter(s => s.draft && s.draft.picks.length).slice().reverse();
  if (!list.length) return `
    <div class="page-head"><h1 class="page-title">Draft History</h1></div>
    <div class="empty">No completed drafts found yet.</div>`;

  const season = params.season && list.find(s => s.season === params.season)
    ? params.season : list[0].season;
  const s = list.find(x => x.season === season);

  const rounds = {};
  s.draft.picks.forEach(p => { (rounds[p.round] = rounds[p.round] || []).push(p); });

  const posColor = p => ({
    QB: '#e5615f', RB: '#35c48a', WR: '#5aa9e6', TE: '#d4af37', K: '#9b8ec4', DEF: '#7f8fa4'
  }[p] || '#7f8fa4');

  const blocks = Object.keys(rounds).sort((a, b) => a - b).map(r => {
    const rows = rounds[r].sort((a, b) => a.pick - b.pick).map(p => {
      const t = s.byRoster[p.rosterId];
      return `<tr>
        <td class="rank">${p.pick}</td>
        <td>${t ? mgrCell(t.ownerId, t.teamName) : '<span class="muted">Unknown</span>'}</td>
        <td><strong>${esc(p.player)}</strong>${p.keeper ? ' <span class="pill pill-gold">Keeper</span>' : ''}</td>
        <td><span style="color:${posColor(p.position)};font-weight:700">${esc(p.position)}</span></td>
        <td class="muted">${esc(p.team)}</td>
      </tr>`;
    }).join('');
    return `<details class="panel" style="margin-bottom:10px" ${r === '1' ? 'open' : ''}>
      <summary>Round ${r}</summary>
      <table style="margin-top:10px">
        <thead><tr><th>Pick</th><th>Manager</th><th>Player</th><th>Pos</th><th>Team</th></tr></thead>
        <tbody>${rows}</tbody></table></details>`;
  }).join('');

  const firstRound = (rounds[1] || []).sort((a, b) => a.pick - b.pick).map(p => {
    const t = s.byRoster[p.rosterId];
    return `<div class="stat">
      <div class="stat-label">Pick ${p.pick}</div>
      <div class="stat-value" style="font-size:20px">${esc(p.player)}</div>
      <div class="stat-meta">${esc(p.position)} &middot; ${esc(p.team)} &mdash; ${t ? mgrLink(t.ownerId) : '?'}</div>
    </div>`;
  }).join('');

  const keepers = s.draft.picks.filter(p => p.keeper).map(p => {
    const t = s.byRoster[p.rosterId];
    return `<tr><td>${t ? mgrCell(t.ownerId) : '?'}</td>
      <td><strong>${esc(p.player)}</strong></td>
      <td>${esc(p.position)}</td><td class="num">Rd ${p.round}</td></tr>`;
  });

  return `
  <div class="page-head">
    <h1 class="page-title">Draft History</h1>
    <p class="page-sub">${esc(s.draft.rounds)}-round ${esc(s.draft.type)} draft &middot; ${s.draft.picks.length} picks.</p>
  </div>
  ${seasonChips(list, season, 'draft')}
  <h3 class="section-title">${esc(season)} First Round</h3>
  <div class="grid g4">${firstRound}</div>
  ${keepers.length ? `<h3 class="section-title">Keepers</h3>
    ${table(['Manager', 'Player', 'Pos', { label: 'Round', num: 1 }], keepers)}` : ''}
  <h3 class="section-title">Full Draft Board</h3>
  ${blocks}`;
};

/* ============================== TRADES ============================= */
views.trades = async params => {
  const list = MODEL.seasons.filter(s => s.started).slice().reverse();
  if (!list.length) return `
    <div class="page-head"><h1 class="page-title">Transactions</h1></div>
    <div class="empty">No seasons with transactions yet.</div>`;

  const season = params.season && list.find(s => s.season === params.season)
    ? params.season : list[0].season;
  const s = list.find(x => x.season === season);

  await loadPlayers();
  const txns = await loadTransactions(s);

  const nameOf = rid => {
    const t = s.byRoster[rid];
    return t ? mgr(t.ownerId).name : 'Roster ' + rid;
  };
  const ownerOf = rid => {
    const t = s.byRoster[rid];
    return t ? t.ownerId : null;
  };

  const trades = txns.filter(t => t.type === 'trade');
  const waivers = txns.filter(t => t.type === 'waiver');
  const freeAgents = txns.filter(t => t.type === 'free_agent');
  const faabSpent = waivers.reduce((a, t) => a + (t.bid || 0), 0);

  /* ---- trade cards ---- */
  const tradeCards = trades.map(t => {
    const sides = t.rosters.map(rid => {
      const gotPlayers = Object.keys(t.adds || {}).filter(pid => t.adds[pid] === rid);
      const gotFaab = t.faab.filter(f => f.receiver === rid);
      const gotPicks = t.picks.filter(p => p.owner_id === rid);
      const items = []
        .concat(gotPlayers.map(pid => {
          const p = playerMeta(pid);
          return `<li><strong>${esc(p.name)}</strong>
            <span class="muted small">${esc([p.pos, p.team].filter(Boolean).join(' · '))}</span></li>`;
        }))
        .concat(gotPicks.map(p =>
          `<li><span class="pill pill-dim">Pick</span> ${esc(p.season)} round ${esc(p.round)}
            <span class="muted small">from ${esc(nameOf(p.previous_owner_id))}</span></li>`))
        .concat(gotFaab.map(f =>
          `<li><span class="pill pill-gold">FAAB</span> $${f.amount}
            <span class="muted small">from ${esc(nameOf(f.sender))}</span></li>`));
      return `<div class="trade-side">
        <div class="trade-mgr">${mgrCell(ownerOf(rid), null)}</div>
        <div class="trade-label">receives</div>
        <ul class="trade-items">${items.join('') || '<li class="muted">Nothing</li>'}</ul>
      </div>`;
    }).join('<div class="trade-arrow">&harr;</div>');

    return `<div class="trade">
      <div class="trade-head">
        <span class="pill pill-dim">Week ${t.week}</span>
        <span class="muted small">${esc(fmtDate(t.created))}</span>
      </div>
      <div class="trade-body">${sides}</div>
    </div>`;
  }).join('');

  /* ---- biggest waiver bids ---- */
  const bidRows = waivers.filter(t => t.bid > 0)
    .sort((a, b) => b.bid - a.bid).slice(0, 15).map((t, i) => {
      const rid = t.rosters[0];
      const added = Object.keys(t.adds || {})[0];
      const dropped = t.drops ? Object.keys(t.drops)[0] : null;
      return `<tr>
        <td class="rank">${i + 1}</td>
        <td>${mgrCell(ownerOf(rid))}</td>
        <td><strong>${esc(added ? playerMeta(added).name : '&mdash;')}</strong>
          <span class="muted small">${esc(added ? playerMeta(added).pos : '')}</span></td>
        <td class="num gold-text">$${t.bid}</td>
        <td class="muted">Wk ${t.week}</td>
        <td class="muted small">${dropped ? 'dropped ' + esc(playerMeta(dropped).name) : ''}</td>
      </tr>`;
    });

  /* ---- activity by manager ---- */
  const activity = {};
  s.teams.forEach(t => {
    activity[t.rosterId] = { t, trades: 0, waivers: 0, fa: 0, spent: 0 };
  });
  txns.forEach(t => {
    t.rosters.forEach(rid => {
      const a = activity[rid];
      if (!a) return;
      if (t.type === 'trade') a.trades++;
      else if (t.type === 'waiver') { a.waivers++; a.spent += t.bid || 0; }
      else a.fa++;
    });
  });
  const actRows = Object.values(activity)
    .sort((a, b) => (b.trades + b.waivers + b.fa) - (a.trades + a.waivers + a.fa))
    .map(a => `<tr>
      <td>${mgrCell(a.t.ownerId, a.t.teamName)}</td>
      <td class="num">${a.trades}</td>
      <td class="num">${a.waivers}</td>
      <td class="num">${a.fa}</td>
      <td class="num">$${a.spent}</td>
      <td class="num">${a.trades + a.waivers + a.fa}</td>
    </tr>`);

  return `
  <div class="page-head">
    <h1 class="page-title">Transactions</h1>
    <p class="page-sub">Every trade, waiver claim and free-agent move.</p>
  </div>
  ${seasonChips(list, season, 'trades')}

  <div class="grid g4">
    <div class="stat"><div class="stat-label">Trades</div>
      <div class="stat-value gold">${trades.length}</div>
      <div class="stat-meta">completed in ${esc(season)}</div></div>
    <div class="stat"><div class="stat-label">Waiver Claims</div>
      <div class="stat-value">${waivers.length}</div>
      <div class="stat-meta">successful claims</div></div>
    <div class="stat"><div class="stat-label">Free Agent Moves</div>
      <div class="stat-value">${freeAgents.length}</div>
      <div class="stat-meta">adds and drops</div></div>
    <div class="stat"><div class="stat-label">FAAB Spent</div>
      <div class="stat-value">$${faabSpent}</div>
      <div class="stat-meta">across the league</div></div>
  </div>

  <h3 class="section-title">Trade Ledger</h3>
  ${trades.length ? `<div class="trade-list">${tradeCards}</div>`
      : '<div class="empty">No trades were completed this season.</div>'}

  <h3 class="section-title">Biggest Waiver Bids</h3>
  ${table(['#', 'Manager', 'Player', { label: 'Bid', num: 1 }, 'Week', ''], bidRows)}

  <h3 class="section-title">Activity by Manager</h3>
  ${table(['Manager', { label: 'Trades', num: 1 }, { label: 'Waivers', num: 1 },
    { label: 'FA Moves', num: 1 }, { label: 'FAAB', num: 1 }, { label: 'Total', num: 1 }], actRows)}`;
};

/* ============================== MONEY ============================== */
views.money = () => {
  const M = MODEL.money;
  if (!M || !M.seasons.length) return `
    <div class="page-head"><h1 class="page-title">Money</h1></div>
    <div class="empty">No payout structures have been set up yet.
      Add them in <code>assets/payouts.js</code>.</div>`;

  const played = MODEL.managerList.filter(m => m.paidIn > 0 || m.winnings > 0);
  const byNet = played.slice().sort((a, b) => b.net - a.net || b.winnings - a.winnings);
  const richest = byNet[0];
  const winners = played.filter(m => m.winnings > 0);
  const biggest = Object.values(M.byManager)
    .reduce((best, r) => r.awards.reduce((b, a) => (!b || a.amount > b.amount) ? a : b, best), null);

  /* ---- all-time ledger ---- */
  const ledger = byNet.map((m, i) => `<tr class="${m.net > 0 ? 'row-champ' : ''}">
    <td class="rank">${i + 1}</td>
    <td>${mgrCell(m.id, m.teamNames[m.teamNames.length - 1])}</td>
    <td class="num">${m.seasons.filter(s => s.complete || s.season === MODEL.currentSeason.season).length}</td>
    <td class="num muted">${money0(m.paidIn)}</td>
    <td class="num ${m.winnings ? 'gold-text' : 'muted'}">${money0(m.winnings)}</td>
    <td class="num" style="font-weight:700;color:${m.net > 0 ? 'var(--green)' :
      m.net < 0 ? 'var(--red)' : 'var(--ink-2)'}">
      ${m.net > 0 ? '+' : ''}${money0(m.net)}</td>
    <td class="num">${m.cashes || '<span class="muted">0</span>'}</td>
  </tr>`);

  /* ---- season by season ---- */
  const seasonBlocks = M.seasons.slice().reverse().map(s => {
    const cfg = s.config;
    const places = cfg.places || {};
    const winnerOf = type => {
      const a = s.awards.find(x => x.type === type);
      return a ? mgrLink(a.ownerId) : (s.complete
        ? '<span class="muted">&mdash;</span>'
        : '<span class="muted">to be decided</span>');
    };

    const rows = Object.keys(places).map(type => `<tr>
      <td>${esc(PAYOUT_LABELS[type] || type)}</td>
      <td class="num gold-text">${money0(places[type])}</td>
      <td>${winnerOf(type)}</td>
    </tr>`);

    const wh = cfg.weeklyHigh;
    const whAwards = s.awards.filter(a => a.type === 'weeklyHigh');
    if (wh) {
      rows.push(`<tr>
        <td>High scorer, weeks ${wh.from}&ndash;${wh.to}</td>
        <td class="num gold-text">${money0(wh.amount)} &times; ${s.weeklyWeeks}
          = ${money0(wh.amount * s.weeklyWeeks)}</td>
        <td>${whAwards.length
          ? `${whAwards.length} of ${s.weeklyWeeks} paid so far`
          : '<span class="muted">not started</span>'}</td>
      </tr>`);
    }

    const whDetail = whAwards.length ? `
      <div class="small muted" style="margin-top:12px">Weekly winners</div>
      <div class="chip-row" style="margin-top:6px">
        ${whAwards.slice().sort((a, b) => a.week - b.week).map(a =>
      `<span class="chip" style="cursor:default">Wk ${a.week} &mdash;
          ${mgrLink(a.ownerId)} <span class="muted">${n1(a.pts)}</span></span>`).join('')}
      </div>` : '';

    const status = s.balanced
      ? '<span class="pill pill-teal">Balances</span>'
      : `<span class="pill pill-red">Off by ${money0(Math.abs(s.difference))}</span>`;

    return `<div class="panel" style="margin-bottom:14px">
      <div class="money-head">
        <div>
          <div class="money-year">${esc(s.season)}</div>
          <div class="small muted">${s.teams} teams &times; ${money0(s.buyIn)}
            = ${money0(s.collected)} collected &middot; ${money0(s.scheduled)} in prizes</div>
        </div>
        ${status}
      </div>
      <table style="margin-top:12px">
        <thead><tr><th>Prize</th><th class="num">Amount</th><th>Winner</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
      ${whDetail}
    </div>`;
  }).join('');

  return `
  <div class="page-head">
    <h1 class="page-title">Money</h1>
    <p class="page-sub">Who has actually made money in this league, and who has been donating.</p>
  </div>

  <div class="grid g4">
    <div class="stat">
      <div class="stat-label">Paid Out All-Time</div>
      <div class="stat-value gold">${money0(M.totalPaid)}</div>
      <div class="stat-meta">across ${M.seasons.filter(s => s.complete).length} finished seasons</div>
    </div>
    <div class="stat">
      <div class="stat-label">Most Profitable</div>
      <div class="stat-value">${richest ? esc(richest.name) : '&mdash;'}</div>
      <div class="stat-meta">${richest ? (richest.net > 0 ? '+' : '') + money0(richest.net) + ' net' : ''}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Biggest Single Payday</div>
      <div class="stat-value">${biggest ? money0(biggest.amount) : '&mdash;'}</div>
      <div class="stat-meta">${biggest ? esc(mgr(biggest.ownerId).name) + ' &middot; ' +
      esc(biggest.season) + ' ' + esc(biggest.label) : ''}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Managers In The Black</div>
      <div class="stat-value">${byNet.filter(m => m.net > 0).length}
        <span class="muted" style="font-size:18px">of ${byNet.length}</span></div>
      <div class="stat-meta">${winners.length} have cashed at least once</div>
    </div>
  </div>

  <h3 class="section-title">All-Time Ledger</h3>
  ${table(['#', 'Manager', { label: 'Seasons', num: 1 }, { label: 'Paid In', num: 1 },
    { label: 'Won', num: 1 }, { label: 'Net', num: 1 }, { label: 'Cashes', num: 1 }], ledger)}
  <p class="small muted" style="margin-top:10px">
    Buy-ins are counted for every season a manager fielded a team. Weekly prizes are paid
    as they are won, so the current season fills in week by week.</p>

  <h3 class="section-title">Season by Season</h3>
  ${seasonBlocks}

  ${M.unbalanced.length ? `<div class="notice">
    <strong>Heads up:</strong> ${M.unbalanced.map(s => esc(s.season)).join(', ')}
    ${M.unbalanced.length === 1 ? "doesn't" : "don't"} balance &mdash; the prize structure and the
    money collected disagree. Fix the buy-in or the prizes in
    <code>assets/payouts.js</code>.</div>` : ''}`;
};
