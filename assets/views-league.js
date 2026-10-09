/* ===================================================================
   views-league.js — Standings, Playoffs, Champions, Head to Head,
   Record Book, Managers, a manager's profile, and Money.
   =================================================================== */

/* ============================ STANDINGS ============================ */
views.standings = params => {
  const list = MODEL.seasons.filter(s => s.started).slice().reverse();
  if (!list.length) return empty('No seasons have been played yet.');
  const season = params.season && list.find(s => s.season === params.season) ? params.season : list[0].season;
  const s = list.find(x => x.season === season);
  const mode = ['pts', 'wins', 'rank'].indexOf(params.chart) !== -1 ? params.chart : 'pts';

  const rows = s.standings.map(t => {
    const st = (s.stats && s.stats[t.rosterId]) || {};
    const g = st.g || 0;
    const cls = [youRow(t.ownerId), t.seed === s.playoffTeams && s.standings.length > s.playoffTeams ? 'cut' : ''].join(' ');
    const row = {
      champion: s.championRoster === t.rosterId, runnerUp: s.runnerUpRoster === t.rosterId,
      third: s.thirdRoster === t.rosterId, playoffs: s.playoffRosters.includes(t.rosterId),
      finish: t.finish, complete: s.complete
    };
    const allPct = st.allW != null && (st.allW + st.allL + st.allT) ? (st.allW + st.allT / 2) / (st.allW + st.allL + st.allT) : null;
    return `<tr class="${cls}">
      <td class="rank">${t.seed}</td>
      <td>${mgrCell(t.ownerId, t.teamName)}</td>
      ${tdv(t.wins + t.ties / 2, wl(t))}
      ${tdv(t.pf, n2(t.pf))}
      ${tdv(t.pa, n2(t.pa))}
      ${tdv(t.pf - t.pa, colorNum(t.pf - t.pa, n1))}
      ${tdv(g ? st.pf / g : 0, g ? n2(st.pf / g) : '&mdash;')}
      ${tdv(st.maxPf ? st.pfMaxWeeks / st.maxPf : 0, st.maxPf ? pct(st.pfMaxWeeks / st.maxPf) : '&mdash;')}
      ${tdv(allPct, allPct == null ? '&mdash;' : pct(allPct))}
      ${tdv((st.luckyW || 0) - (st.unluckyL || 0), colorNum((st.luckyW || 0) - (st.unluckyL || 0), n0))}
      ${tdv(st.maxPf || 0, st.maxPf ? n1(st.maxPf) : '&mdash;')}
      <td>${s.complete ? finishLabel(row) : (s.playoffsUnderway && row.playoffs ? lbl('Playoffs', 'blue') : '')}</td>
    </tr>`;
  });

  const prog = seasonProgression(s);
  const pr = weeklyPowerRanks(s);
  const series = s.standings.map((t, i) => {
    let values;
    if (mode === 'rank') values = pr.ranks[t.rosterId] || [];
    else values = (prog.series[t.rosterId] || { pts: [], wins: [] })[mode];
    return { id: 'r' + t.rosterId, name: mgr(t.ownerId).name, color: isYou(t.ownerId) ? '#60a5fa' : seriesColor(i + 1), values, you: isYou(t.ownerId) };
  }).filter(x => x.values.length);
  const me = s.teams.find(t => isYou(t.ownerId));
  const chart = prog.weeks.length
    ? lineChart((mode === 'rank' ? pr.weeks : prog.weeks).map(w => w), series, {
      zeroBased: mode !== 'rank', invert: mode === 'rank', focus: me ? 'r' + me.rosterId : null,
      title: mode === 'pts' ? 'Cumulative points' : mode === 'wins' ? 'Cumulative wins' : 'Power rank after each week',
      sub: 'Hover a name to isolate it; click to lock.'
    })
    : empty('No games played yet this season.');
  const chartTabs = tabs('standings', { season }, [['pts', 'Points'], ['wins', 'Wins'], ['rank', 'Power rank']], mode, 'chart');

  const weeks = {};
  (s.finalGames || s.games).forEach(g => { (weeks[g.week] = weeks[g.week] || []).push(g); });
  const scoreboard = Object.keys(weeks).sort((a, b) => b - a).map(w => {
    const inner = weeks[w].map(g => {
      const ta = s.byRoster[g.a], tb = s.byRoster[g.b];
      if (!ta || !tb) return '';
      const aw = g.ap > g.bp, bw = g.bp > g.ap;
      return `<tr class="${isYou(ta.ownerId) || isYou(tb.ownerId) ? 'you' : ''}">
        <td>${mgrLink(ta.ownerId)}</td>
        <td class="num ${aw ? 'pos-t strong' : 'muted'}">${n2(g.ap)}</td>
        <td class="dim" style="text-align:center">&ndash;</td>
        <td class="num ${bw ? 'pos-t strong' : 'muted'}">${n2(g.bp)}</td>
        <td>${mgrLink(tb.ownerId)}</td>
      </tr>`;
    }).join('');
    const top = weeks[w].reduce((b, g) => [{ r: g.a, p: g.ap }, { r: g.b, p: g.bp }].reduce((x, y) => (y.p > x.p ? y : x), b), { r: null, p: -1 });
    return `<details class="tcard"><summary><div class="tcard-main"><div class="tcard-title">Week ${w}</div>
      <div class="tcard-gist">High score: ${top.r != null ? esc(mgr(s.byRoster[top.r].ownerId).name) + ' ' + n2(top.p) : '&mdash;'}</div></div>
      <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary>
      <div class="tcard-body"><div class="table-wrap"><table><tbody>${inner}</tbody></table></div></div></details>`;
  }).join('');

  return `${seasonPills('standings', { chart: params.chart }, list, season)}
    ${section(`${esc(season)} Standings`, `${table(['Seed', { label: 'Team', sort: 'text' }, { label: 'Record', num: 1 }, { label: 'PF', num: 1 },
      { label: 'PA', num: 1 }, { label: '+/-', num: 1 }, { label: 'Avg PF', num: 1 }, { label: 'Eff%', num: 1 },
      { label: 'PWin%', num: 1 }, { label: 'Luck', num: 1 }, { label: 'Max PF', num: 1 }, 'Finish'], rows, { sortable: true })}
      <p class="note">Dashed line marks the ${s.playoffTeams}-team playoff cut. ${s.numTeams} teams this season.
        Eff%, PWin% and Luck are explained on the <a href="#/home?focus=howto">Overview</a>.</p>`, { tight: true })}
    ${section('Season Race', chartTabs + chart)}
    ${scoreboard ? section('Weekly Scoreboard', scoreboard) : ''}`;
};

/* ============================= PLAYOFFS ============================ */
views.playoffs = params => {
  // playoffsUnderway keeps Sleeper's pre-seeded next-season bracket out of here.
  const list = MODEL.seasons.filter(s => s.playoffsUnderway && s.winnersBracket.length).slice().reverse();
  if (!list.length) return empty('No playoff brackets yet. They appear once a season reaches its playoff weeks.');
  const season = params.season && list.find(s => s.season === params.season) ? params.season : list[0].season;
  const s = list.find(x => x.season === season);

  const renderBracket = (bracket, label, isConsolation) => {
    const rounds = bracketRounds(bracket, s);
    if (!rounds.length) return '';
    const cols = rounds.map(r => {
      const matches = r.matches.map(m => {
        const side = (rid, pts, from) => {
          const t = rid != null ? s.byRoster[rid] : null;
          const won = rid != null && m.w === rid;
          const name = t ? `<span class="bk-seed">${t.seed}</span>${mgrLink(t.ownerId)}${youBadge(t.ownerId)}`
            : `<span class="dim">${from && from.w ? 'Winner of match ' + from.w : from && from.l ? 'Loser of match ' + from.l : 'TBD'}</span>`;
          return `<div class="bk-team ${won ? 'won' : (m.w ? 'lost' : '')}"><span>${name}</span>
            <span class="bk-pts">${pts != null ? n2(pts) : ''}</span></div>`;
        };
        const tag = isConsolation
          ? (m.place === 1 ? 'Consolation final' : m.place === 3 ? 'Consolation 3rd' : m.place === 5 ? 'Consolation 5th' : '')
          : (m.place === 1 ? 'Championship' : m.place === 3 ? '3rd place' : m.place === 5 ? '5th place' : '');
        return `<div class="bk-match">${tag ? `<div class="bk-tag">${tag}</div>` : ''}
          ${side(m.t1, m.t1Pts, m.t1From)}${side(m.t2, m.t2Pts, m.t2From)}</div>`;
      }).join('');
      return `<div class="bk-round"><div class="bk-round-title">Round ${r.round} &middot; ${r.weeks.length > 1
        ? `Weeks ${r.weeks[0]}&ndash;${r.weeks[r.weeks.length - 1]}` : `Week ${r.week}`}</div>${matches}</div>`;
    }).join('');
    return section(label, `<div class="bracket-wrap"><div class="bracket">${cols}</div></div>`);
  };

  const champ = s.byRoster[s.championRoster];
  const banner = champ ? `<div class="hero gold">
      <div class="hero-art">${avatar(champ.ownerId, 'av-lg')}</div>
      <div><div class="hero-eyebrow">${esc(s.season)} Champion</div>
        <h2>${mgrLink(champ.ownerId)}${youBadge(champ.ownerId)}</h2>
        <p>${esc(champ.teamName)} &middot; ${wl(champ)} regular season &middot; ${ordinal(champ.seed)} seed &middot; ${n2(champ.pf)} points for</p></div>
    </div>` : '';

  return `${seasonPills('playoffs', {}, list, season)}
    ${banner}
    ${renderBracket(s.winnersBracket, 'Championship Bracket', false)}
    ${renderBracket(s.losersBracket, 'Consolation Bracket', true)}
    <p class="note">Scores come from each playoff week's matchups. Byes show as blank slots.</p>`;
};

/* ============================ CHAMPIONS ============================ */
const TROPHY_SVG = `<svg viewBox="0 0 240 260" class="trophy-svg" aria-hidden="true">
  <defs><linearGradient id="cupG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f7e6a3"/>
    <stop offset="50%" stop-color="#d4af37"/><stop offset="100%" stop-color="#8a6b1e"/></linearGradient></defs>
  <path d="M46,54 C18,60 16,98 50,108" fill="none" stroke="url(#cupG)" stroke-width="11" stroke-linecap="round"/>
  <path d="M194,54 C222,60 224,98 190,108" fill="none" stroke="url(#cupG)" stroke-width="11" stroke-linecap="round"/>
  <path d="M60,34 C60,78 80,126 120,136 C160,126 180,78 180,34 C180,43 154,49 120,49 C86,49 60,43 60,34 Z" fill="url(#cupG)" stroke="#5c4a1f" stroke-width="3"/>
  <path d="M107,136 L133,136 L140,178 L100,178 Z" fill="url(#cupG)" stroke="#5c4a1f" stroke-width="3"/>
  <path d="M88,178 L152,178 L166,200 L74,200 Z" fill="url(#cupG)" stroke="#5c4a1f" stroke-width="3"/>
  <rect x="66" y="200" width="108" height="20" rx="5" fill="#8a6b1e" stroke="#5c4a1f" stroke-width="3"/></svg>`;

views.champions = () => {
  const seasons = MODEL.completedSeasons.slice().reverse();
  const plaques = seasons.filter(s => s.byRoster[s.championRoster]).map(s => {
    const c = s.byRoster[s.championRoster];
    return `<a class="plaque" href="#/manager?id=${encodeURIComponent(c.ownerId)}"><b>${esc(s.season)}</b>${esc(mgr(c.ownerId).name)}</a>`;
  }).join('');
  const hero = `<div class="hero gold"><div class="hero-art">${TROPHY_SVG}</div>
    <div><div class="hero-eyebrow">Trophy Room</div><h2>Hall of Champions</h2>
      <p>Every champion in league history.</p><div class="plaques">${plaques || '<span class="muted">No champion crowned yet.</span>'}</div></div></div>`;

  const cards = seasons.map(s => {
    const c = s.byRoster[s.championRoster];
    if (!c) return '';
    const r = s.byRoster[s.runnerUpRoster], t3 = s.byRoster[s.thirdRoster], top = s.standings[0];
    const st = s.stats && s.stats[c.rosterId];
    return `<div class="trophy">
      <div class="trophy-year">${esc(s.season)}</div>
      <a class="trophy-mgr" href="#/manager?id=${encodeURIComponent(c.ownerId)}">${avatar(c.ownerId)}
        <div><div class="trophy-name">${esc(mgr(c.ownerId).name)}${youBadge(c.ownerId)}</div><div class="trophy-team">${esc(c.teamName)}</div></div></a>
      <div class="kv"><span>Regular season</span><strong>${wl(c)} (${ordinal(c.seed)} seed)</strong></div>
      <div class="kv"><span>Points for</span><strong>${n2(c.pf)}</strong></div>
      ${st && st.maxPf ? `<div class="kv"><span>Lineup efficiency</span><strong>${pct(st.pfMaxWeeks / st.maxPf)}</strong></div>` : ''}
      <div class="kv"><span>Beat in the final</span><strong>${r ? mgrLink(r.ownerId) : '&mdash;'}</strong></div>
      <div class="kv"><span>Third place</span><strong>${t3 ? mgrLink(t3.ownerId) : '&mdash;'}</strong></div>
      <div class="kv"><span>Top seed</span><strong>${top ? mgrLink(top.ownerId) : '&mdash;'}</strong></div>
      <div class="kv"><span>Consolation champ</span><strong>${s.byRoster[s.consolationRoster] ? mgrLink(s.byRoster[s.consolationRoster].ownerId) : '&mdash;'}</strong></div>
      <div style="margin-top:10px"><a class="small" href="#/playoffs?season=${esc(s.season)}">See the bracket &rarr;</a></div>
    </div>`;
  }).join('');

  const counts = MODEL.managerList.slice().sort((a, b) =>
    b.titles.length - a.titles.length || b.finals - a.finals || b.thirds - a.thirds || b.playoffs - a.playoffs
  ).map(m => `<tr class="${youRow(m.id)}">
    <td>${mgrCell(m.id)}</td>
    ${tdv(m.titles.length, m.titles.length ? lbl(m.titles.length, 'gold') : '<span class="dim">0</span>')}
    ${tdv(m.finals, m.finals || '<span class="dim">0</span>')}
    ${tdv(m.thirds, m.thirds || '<span class="dim">0</span>')}
    ${tdv(m.consolations, m.consolations || '<span class="dim">0</span>')}
    ${tdv(m.fullPlayoffs, m.fullPlayoffs)}
    ${tdv(m.fullSeasons ? m.fullPlayoffs / m.fullSeasons : 0, m.fullSeasons ? pct0(m.fullPlayoffs / m.fullSeasons) : '&mdash;')}
    ${tdv(m.regularTitles, m.regularTitles || '<span class="dim">0</span>')}
    <td class="small muted">${m.titles.join(', ') || '&mdash;'}</td>
  </tr>`);

  return `${hero}<div class="grid g3">${cards}</div>
    ${section('How Everyone Has Finished', table(['Manager', { label: 'Titles', num: 1 }, { label: 'Lost Final', num: 1 },
      { label: 'Third', num: 1 }, { label: 'Consolation', num: 1 }, { label: 'Playoff Trips', num: 1 },
      { label: 'Playoff Rate', num: 1 }, { label: 'Top Seed', num: 1 }, 'Title Years'], counts, { sortable: true }),
      { sub: 'Career finishes, finished seasons only. Top seed means finishing the regular season first, which doesn’t always end in a title.' })}`;
};

/* =========================== HEAD TO HEAD ========================== */
views.h2h = params => {
  const onlyActive = params.active === '1';
  const ms = MODEL.managerList.filter(m => !onlyActive || m.active).slice().sort((a, b) => a.name.localeCompare(b.name));
  const head = ['<th scope="col">Manager</th>'].concat(ms.map(m =>
    `<th scope="col" title="${esc(m.name)}">${esc(m.name.slice(0, 8))}</th>`)).join('');

  const heat = r => {
    const g = r.w + r.l + r.t;
    const p = g ? (r.w + r.t / 2) / g : 0.5;
    const a = Math.min(0.55, Math.abs(p - 0.5) * 1.2 + (g > 1 ? 0.06 : 0.03));
    return p > 0.5 ? `background:rgba(34,197,94,${a.toFixed(2)})` : p < 0.5 ? `background:rgba(239,68,68,${a.toFixed(2)})` : 'background:rgba(148,163,184,.12)';
  };
  const rows = ms.map(a => {
    const cells = ms.map(b => {
      if (a.id === b.id) return `<td class="cell self">&mdash;</td>`;
      const r = MODEL.h2h[a.id + '|' + b.id];
      if (!r) return `<td class="cell self">&middot;</td>`;
      const sel = params.a === a.id && params.b === b.id ? ' sel' : '';
      const po = (r.pw || 0) + (r.pl || 0);
      const title = `${a.name} vs ${b.name}: ${r.w}-${r.l}${r.t ? '-' + r.t : ''}` +
        (po ? ` (${r.pw || 0}-${r.pl || 0} in the playoffs)` : '') + `, ${n1(r.pf)} to ${n1(r.pa)}`;
      return `<td class="cell heat${sel}" style="${heat(r)}" title="${esc(title)}" data-a="${esc(a.id)}" data-b="${esc(b.id)}">${r.w}-${r.l}${r.t ? '-' + r.t : ''}${po ? '<sup class="po-mark">P</sup>' : ''}</td>`;
    }).join('');
    const tot = ms.reduce((acc, b) => {
      const r = MODEL.h2h[a.id + '|' + b.id];
      if (r) { acc.w += r.w; acc.l += r.l; acc.t += r.t; }
      return acc;
    }, { w: 0, l: 0, t: 0 });
    return `<tr class="${youRow(a.id)}"><th scope="row">${esc(a.name)}${youBadge(a.id)}</th>${cells}
      <td class="cell"><strong>${wlt(tot.w, tot.l, tot.t)}</strong></td></tr>`;
  });
  after(host => {
    const t = $('.h2h', host);
    if (t) t.addEventListener('click', e => {
      const c = e.target.closest('td.cell[data-a]');
      if (c) setHash('h2h', { a: c.dataset.a, b: c.dataset.b, active: params.active, focus: 'h2hDetail' });
    });
  });

  const seen = new Set(), pairs = [];
  MODEL.managerList.forEach(a => MODEL.managerList.forEach(b => {
    if (a.id === b.id) return;
    const k = [a.id, b.id].sort().join('~');
    if (seen.has(k)) return;
    seen.add(k);
    const r = MODEL.h2h[a.id + '|' + b.id];
    if (r) pairs.push({ a, b, g: r.w + r.l + r.t, w: r.w, l: r.l, t: r.t, pf: r.pf, pa: r.pa });
  }));
  const lopsided = pairs.filter(p => p.g >= 3).map(p => Object.assign({}, p, { gap: Math.abs(p.w - p.l) }))
    .sort((x, y) => y.gap - x.gap || y.g - x.g).slice(0, 10).map(p => {
      const dom = p.w >= p.l ? p.a : p.b, sub = p.w >= p.l ? p.b : p.a;
      return `<tr class="${isYou(dom.id) || isYou(sub.id) ? 'you' : ''}"><td>${mgrCell(dom.id)}</td><td class="muted">owns</td><td>${mgrCell(sub.id)}</td>
        <td class="num pos-t strong">${p.w >= p.l ? p.w + '-' + p.l : p.l + '-' + p.w}${p.t ? '-' + p.t : ''}</td>
        <td class="num">${n1(Math.abs(p.pf - p.pa))}</td></tr>`;
    });
  const most = pairs.slice().sort((x, y) => y.g - x.g).slice(0, 10).map(p => `<tr class="${isYou(p.a.id) || isYou(p.b.id) ? 'you' : ''}">
    <td>${mgrCell(p.a.id)}</td><td>${mgrCell(p.b.id)}</td><td class="num">${p.g}</td>
    <td class="num">${wlt(p.w, p.l, p.t)}</td><td class="num">${n1(p.pf)} &ndash; ${n1(p.pa)}</td></tr>`);

  let detail = '';
  const A = params.a && MODEL.managers[params.a], B = params.b && MODEL.managers[params.b];
  if (A && B && MODEL.h2h[A.id + '|' + B.id]) {
    const r = MODEL.h2h[A.id + '|' + B.id];
    const games = r.games.slice().sort((x, y) => y.season.localeCompare(x.season) || y.week - x.week);
    const res = g => g.won != null ? (g.won ? 'W' : 'L') : g.pts > g.oppPts ? 'W' : g.pts < g.oppPts ? 'L' : 'T';
    const gRows = games.map(g => `<tr>
      <td>${esc(g.season)}</td>
      <td>Week ${g.week}${g.playoff ? ' ' + lbl(esc(g.playoff), 'gold') : ''}</td>
      <td class="num ${res(g) === 'W' ? 'pos-t strong' : ''}">${n2(g.pts)}</td>
      <td class="num ${res(g) === 'L' ? 'pos-t strong' : ''}">${n2(g.oppPts)}</td>
      <td class="num">${n1(Math.abs(g.pts - g.oppPts))}</td>
      <td>${res(g) === 'W' ? lbl('W', 'green') : res(g) === 'L' ? lbl('L', 'red') : lbl('T')}</td></tr>`);
    const po = games.filter(g => g.playoff).length;
    detail = section(`${esc(A.name)} vs ${esc(B.name)}`, `<div class="grid g4" style="margin-bottom:12px">
      ${statCard({ label: 'Series', value: wlt(r.w, r.l, r.t), sub: `from ${esc(A.name)}'s side${po ? ` · ${r.pw || 0}-${r.pl || 0} playoffs` : ''}`, acc: 'blue' })}
      ${statCard({ label: 'Points', value: n1(r.pf), sub: `vs ${n1(r.pa)} allowed`, acc: 'violet' })}
      ${statCard({ label: 'Avg Margin', value: games.length ? signed(mean(games.map(g => g.pts - g.oppPts))) : '&mdash;', sub: 'per meeting', acc: 'amber' })}
      ${statCard({ label: 'Meetings', value: games.length, sub: po ? `${games.length - po} regular, ${po} playoff` : 'all regular season', acc: 'teal' })}
    </div>${table(['Season', 'Week', { label: A.name, num: 1 }, { label: B.name, num: 1 }, { label: 'Margin', num: 1 }, ''], gRows)}
    <p class="note"><a href="${hrefWith('h2h', { active: params.active })}">Clear this matchup</a></p>`, { id: 'h2hDetail' });
  }

  return `<div class="toolbar"><label class="toggle"><input type="checkbox" data-param="active" ${onlyActive ? 'checked' : ''}> Current managers only</label>
      <span class="small muted">Read across: the row manager's record against each column. Click a cell for every meeting.</span></div>
    <div class="h2h-wrap"><table class="h2h"><thead><tr>${head}<th>Total</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <p class="note">Playoffs included. A <sup class="po-mark">P</sup> marks a series with a playoff meeting. Consolation games don't count.</p>
    ${detail}
    <div class="grid g2 gap-lg section">
      <div>${section('Most Lopsided Rivalries', table(['Manager', '', 'Manager', { label: 'Record', num: 1 }, { label: 'Pt Diff', num: 1 }], lopsided), { tight: true })}</div>
      <div>${section('Most Played Matchups', table(['Manager', 'Opponent', { label: 'GP', num: 1 }, { label: 'Record', num: 1 }, { label: 'Points', num: 1 }], most), { tight: true })}</div>
    </div>`;
};

/* =========================== RECORD BOOK =========================== */
views.records = params => {
  const R = MODEL.records;
  const fM = params.mgr || '', fS = params.season || '';
  const filtered = !!(fM || fS);
  const keepWk = x => (!fM || x.ownerId === fM) && (!fS || x.season === fS);
  const keepGm = x => (!fM || x.winner === fM || x.loser === fM) && (!fS || x.season === fS);
  const keepSn = x => (!fM || x.ownerId === fM) && (!fS || x.season === fS);
  const top = (list, keep) => list.filter(keep).slice(0, 10);

  const topWeeks = top(R.topWeeks, keepWk), lowWeeks = top(R.lowWeeks, keepWk);
  const blowouts = top(R.blowouts, keepGm), nailbiters = top(R.nailbiters, keepGm);
  const shootouts = top(R.shootouts, keepGm), mostInLoss = top(R.mostInLoss, keepWk);
  const fewestInWin = top(R.fewestInWin, keepWk);
  const bestPF = top(R.bestSeasonPF, keepSn), bestRec = top(R.bestSeasonRec, keepSn);

  const rc = (label, value, who, when, acc) => `<div class="rec acc-${acc || 'blue'}"><div class="rec-label">${label}</div>
    <div class="rec-value">${value}</div><div class="rec-who">${who}</div><div class="rec-when">${esc(when)}</div></div>`;
  const w = topWeeks[0], lo = lowWeeks[0], bl = blowouts[0], nb = nailbiters[0], sh = shootouts[0], bp = bestPF[0], ml = mostInLoss[0];
  const cards = [
    w ? rc('Highest Single Week', n2(w.pts), mgrLink(w.ownerId), `${w.season} · Week ${w.week}`, 'green') : '',
    lo ? rc('Lowest Single Week', n2(lo.pts), mgrLink(lo.ownerId), `${lo.season} · Week ${lo.week}`, 'red') : '',
    bl ? rc('Biggest Blowout', n2(bl.margin), `${mgrLink(bl.winner)} over ${mgrLink(bl.loser)}`, `${bl.season} · Week ${bl.week}`, 'amber') : '',
    nb ? rc('Closest Game', n2(nb.margin), `${mgrLink(nb.winner)} over ${mgrLink(nb.loser)}`, `${nb.season} · Week ${nb.week}`, 'violet') : '',
    sh ? rc('Highest Combined', n2(sh.total), `${mgrLink(sh.winner)} vs ${mgrLink(sh.loser)}`, `${sh.season} · Week ${sh.week}`, 'teal') : '',
    ml ? rc('Most Points in a Loss', n2(ml.pts), mgrLink(ml.ownerId), `${ml.season} · Week ${ml.week}`, 'pink') : '',
    bp ? rc('Most Points, Season', n2(bp.pf), mgrLink(bp.ownerId), `${bp.season} regular season`, 'blue') : '',
    (!filtered && R.longestWinStreak) ? rc('Longest Win Streak', R.longestWinStreak.n + ' games', mgrLink(R.longestWinStreak.id),
      `through ${R.longestWinStreak.end.season} Week ${R.longestWinStreak.end.week}`, 'orange') : ''
  ].join('');

  const mgrOpts = MODEL.managerList.slice().sort((a, b) => a.name.localeCompare(b.name))
    .map(m => `<option value="${esc(m.id)}" ${m.id === fM ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const snOpts = MODEL.seasons.filter(s => s.started).slice().reverse()
    .map(s => `<option value="${esc(s.season)}" ${s.season === fS ? 'selected' : ''}>${esc(s.season)}</option>`).join('');

  const weekRows = (list, cls) => list.map((x, i) => `<tr class="${youRow(x.ownerId)}">
    <td class="rank">${i + 1}</td><td>${mgrCell(x.ownerId)}</td>
    <td class="num ${cls}"><strong>${n2(x.pts)}</strong></td>
    <td class="muted">${esc(x.season)} &middot; Wk ${x.week}</td>
    <td>${mgrLink(x.opp)}</td><td class="num muted">${n2(x.oppPts)}</td>
    <td>${x.won ? lbl('W', 'green') : lbl('L', 'red')}</td></tr>`);
  const gameRows = list => list.map((x, i) => `<tr class="${isYou(x.winner) || isYou(x.loser) ? 'you' : ''}">
    <td class="rank">${i + 1}</td><td>${mgrCell(x.winner)}</td><td class="num pos-t">${n2(x.hi)}</td>
    <td>${mgrCell(x.loser)}</td><td class="num">${n2(x.lo)}</td>
    <td class="num"><strong>${n2(x.margin)}</strong></td><td class="muted">${esc(x.season)} &middot; Wk ${x.week}</td></tr>`);
  const seasonRows = list => list.map((x, i) => `<tr class="${youRow(x.ownerId)}">
    <td class="rank">${i + 1}</td><td>${mgrCell(x.ownerId, x.teamName)}</td><td>${esc(x.season)}</td>
    <td class="num">${wlt(x.wins, x.losses, x.ties)}</td><td class="num">${n2(x.pf)}</td><td class="num">${n2(x.pa)}</td>
    <td>${x.champion ? lbl('Champion', 'gold') : ''}</td></tr>`);

  const crownRows = MODEL.managerList.slice().filter(m => !fM || m.id === fM)
    .sort((a, b) => b.crowns - a.crowns).slice(0, 12).map((m, i) => `<tr class="${youRow(m.id)}">
      <td class="rank">${i + 1}</td><td>${mgrCell(m.id)}</td><td class="num">${m.crowns}</td>
      <td class="num">${m.weeks}</td><td class="num">${m.weeks ? pct(m.crowns / m.weeks) : '&mdash;'}</td></tr>`);
  const shameRows = MODEL.managerList.slice().filter(m => !fM || m.id === fM)
    .sort((a, b) => (b.lastPlace - a.lastPlace) || (b.blowoutLosses - a.blowoutLosses)).map(m => `<tr class="${youRow(m.id)}">
      <td>${mgrCell(m.id)}</td>${tdv(m.lastPlace, m.lastPlace || '<span class="dim">0</span>')}
      ${tdv(m.worstWeek ? m.worstWeek.pts : null, m.worstWeek ? n2(m.worstWeek.pts) : '&mdash;')}
      <td class="num">${m.blowoutLosses}</td><td class="num">${m.closeLosses}</td>
      <td class="num">${m.fullSeasons - m.fullPlayoffs}</td></tr>`);

  const wkH = ['#', 'Manager', { label: 'Points', num: 1 }, 'When', 'Opponent', { label: 'Opp', num: 1 }, ''];
  const gmH = ['#', 'Winner', { label: 'Score', num: 1 }, 'Loser', { label: 'Score', num: 1 }, { label: 'Margin', num: 1 }, 'When'];
  const snH = ['#', 'Manager', 'Season', { label: 'Record', num: 1 }, { label: 'PF', num: 1 }, { label: 'PA', num: 1 }, ''];
  const jump = ['Top Weeks', 'Low Weeks', 'Blowouts', 'Nail-biters', 'Crowns', 'Seasons', 'Hall of Shame'];

  return `<div class="toolbar">
      <span class="small muted">Manager</span>
      <select class="select" data-param="mgr"><option value="">Everyone</option>${mgrOpts}</select>
      <span class="small muted">Season</span>
      <select class="select" data-param="season"><option value="">All seasons</option>${snOpts}</select>
      ${filtered ? `<a class="chip" href="#/records">Clear filters</a>` : ''}
    </div>
    <div class="jumpbar"><span class="jumpbar-label">Jump to</span><div class="chips">${jump.map((j, i) => `<a class="chip" href="${hrefWith('records', Object.assign({}, params, { focus: 'rb' + i }))}">${j}</a>`).join('')}</div></div>
    <div class="grid g4">${cards || empty('No records match that filter.')}</div>
    <div class="grid g2 gap-lg">
      ${section('Top Single-Week Scores', table(wkH, weekRows(topWeeks, 'pos-t')), { id: 'rb0' })}
      ${section('Lowest Single-Week Scores', table(wkH, weekRows(lowWeeks, 'neg-t')), { id: 'rb1' })}
      ${section('Most Points in a Loss', table(wkH, weekRows(mostInLoss, '')))}
      ${section('Fewest Points in a Win', table(wkH, weekRows(fewestInWin, '')))}
    </div>
    ${section('Biggest Blowouts', table(gmH, gameRows(blowouts)), { id: 'rb2' })}
    ${section('Closest Finishes', table(gmH, gameRows(nailbiters)), { id: 'rb3' })}
    ${section('Weekly Crowns', table(['#', 'Manager', { label: 'Crowns', num: 1 }, { label: 'Weeks', num: 1 }, { label: 'Rate', num: 1 }], crownRows),
      { id: 'rb4', sub: 'How often each manager posted the highest score of the week.' })}
    <div class="grid g2 gap-lg">
      ${section('Highest Scoring Seasons', table(snH, seasonRows(bestPF)), { id: 'rb5' })}
      ${section('Best Regular Seasons', table(snH, seasonRows(bestRec)))}
    </div>
    ${section('Hall of Shame', table(['Manager', { label: 'Last Place', num: 1 }, { label: 'Worst Week', num: 1 },
      { label: 'Blowout L', num: 1 }, { label: 'Heartbreak L', num: 1 }, { label: 'Missed Playoffs', num: 1 }], shameRows, { sortable: true }),
      { id: 'rb6', sub: 'Blowout losses are 40+ point defeats. Heartbreaks were decided by under 5. Missed playoffs counts finished seasons only.' })}
    <p class="note">Regular season only.</p>`;
};

/* ============================ MANAGERS ============================= */
views.managers = params => {
  const onlyQual = params.qual === '1';
  const list = MODEL.managerList.filter(m => !onlyQual || m.qualified);
  const rows = list.map((m, i) => {
    const a = MODEL.allStatsBy[m.id] || {};
    return `<tr class="${youRow(m.id)}">
      <td class="rank">${i + 1}</td>
      <td ${m.orphanKey ? `title="Left the league (override key ${esc(m.orphanKey)})"` : ''}>${mgrCell(m.id, m.teamNames[m.teamNames.length - 1])}</td>
      ${tdv(m.seasons.length, m.seasons.length + (m.rookie ? ' ' + lbl('rookie', 'blue') : ''))}
      <td class="num">${m.games}</td>
      ${tdv(m.winPct, recordStr(m))}
      ${tdv(m.winPct, pct(m.winPct))}
      ${tdv(m.adjWinPct, `<strong>${pct(m.adjWinPct)}</strong>`)}
      ${tdv(m.ppg, n1(m.ppg))}
      ${tdv(m.diff, colorNum(m.diff, n0))}
      ${tdv(a.eff || 0, a.eff ? pct(a.eff) : '&mdash;')}
      ${tdv(a.allPct || 0, a.allPct ? pct(a.allPct) : '&mdash;')}
      ${tdv(a.luck || 0, colorNum(a.luck || 0, n0))}
      ${tdv(m.bestWeek ? m.bestWeek.pts : 0, m.bestWeek ? n2(m.bestWeek.pts) : '&mdash;')}
      <td class="num">${m.crowns}</td>
      <td class="num">${m.playoffs}</td>
      ${tdv(m.pw - m.pl, m.playoffGames ? `${m.pw}-${m.pl}` : '<span class="dim">&mdash;</span>')}
      ${tdv(m.titles.length, m.titles.length ? lbl(m.titles.length, 'gold') : '<span class="dim">0</span>')}
    </tr>`;
  });
  return `<div class="toolbar"><label class="toggle"><input type="checkbox" data-param="qual" ${onlyQual ? 'checked' : ''}>
      ${MODEL.minSeasons}+ finished seasons only</label><span class="small muted">Click a column to sort, a name for the full profile.</span></div>
    ${table(['#', { label: 'Manager', sort: 'text' }, { label: 'Yrs', num: 1 }, { label: 'GP', num: 1 }, { label: 'Record', num: 1 },
      { label: 'Win%', num: 1 }, { label: 'Adj%', num: 1, title: 'Win % regressed toward .500 by one season of games' },
      { label: 'PPG', num: 1 }, { label: '+/-', num: 1 }, { label: 'Eff%', num: 1 }, { label: 'PWin%', num: 1 },
      { label: 'Luck', num: 1 }, { label: 'Best Wk', num: 1 }, { label: 'Crowns', num: 1, title: 'Weeks with the league’s top score' },
      { label: 'Playoffs', num: 1 }, { label: 'Playoff W-L', num: 1 }, { label: 'Titles', num: 1 }], rows, { sortable: true })}
    <p class="note">Record, GP and both win percentages include playoff games; points, Eff%, PWin% and Luck are regular season.
      <strong>Adj%</strong> regresses every record toward .500 by ${MODEL.regressGames} games, so a short career has to earn its spot.
      The list is ranked by it.</p>`;
};

/* ========================= MANAGER PROFILE ========================= */
views.manager = async params => {
  const m = MODEL.managers[params.id];
  if (!m) return empty('Manager not found. <a href="#/managers">Back to the list</a>');
  const a = MODEL.allStatsBy[m.id] || {};
  const rank = MODEL.managerList.findIndex(x => x.id === m.id) + 1;
  const holds = (MODEL.recordHolders || []).filter(r => r.owners.includes(m.id));

  const header = `<div class="profile-head">${avatar(m.id, 'av-lg')}
    <div style="min-width:0"><h2>${esc(m.name)}${youBadge(m.id)}</h2>
      <div class="teams">${m.teamNames.map(esc).join(' &middot; ')}</div>
      <div class="chips" style="margin-top:8px">
        ${m.titles.map(y => lbl(esc(y) + ' Champion', 'gold')).join('')}
        ${m.finals ? lbl(m.finals + '× runner-up', 'silver') : ''}
        ${m.thirds ? lbl(m.thirds + '× third', 'bronze') : ''}
        ${m.consolations ? lbl(m.consolations + '× consolation champ', 'teal') : ''}
        ${m.regularTitles ? lbl(m.regularTitles + '× top seed', 'blue') : ''}
        ${holds.length ? lbl(holds.length + ' league record' + (holds.length === 1 ? '' : 's'), 'gold') : ''}
        ${m.lastPlace ? lbl(m.lastPlace + '× last place', 'red') : ''}
      </div></div>
    ${viewerId() !== m.id ? `<button class="chip" style="margin-left:auto" id="beMe">This is me</button>` : ''}</div>`;
  after(host => {
    const b = $('#beMe', host);
    if (b) b.addEventListener('click', () => { setViewer(m.id); $('#viewer').value = m.id; render(); });
  });

  const cards = `<div class="grid g6">
    ${statCard({ label: 'All-Time Record', value: recordStr(m), sub: `${pct(m.winPct)} · ${ordinal(rank)} of ${MODEL.managerList.length}`, acc: 'blue' })}
    ${statCard({ label: 'Points / Game', value: n1(m.ppg), sub: `${n0(m.pf)} total`, acc: 'amber' })}
    ${statCard({ label: 'Efficiency', value: a.eff ? pct(a.eff) : '—', sub: 'of max possible points', acc: 'purple' })}
    ${statCard({ label: 'All-Play', value: a.allPct ? pct(a.allPct) : '—', sub: `${a.allW || 0}-${a.allL || 0} vs everyone`, acc: 'violet' })}
    ${statCard({ label: 'Luck', value: signed(a.luck || 0, n0) || '0', sub: `${a.luckyW || 0} lucky W · ${a.unluckyL || 0} unlucky L`, acc: (a.luck || 0) >= 0 ? 'green' : 'red' })}
    ${statCard({ label: 'Winnings', value: money0(m.winnings || 0), sub: `<span class="${m.net > 0 ? 'pos-t' : m.net < 0 ? 'neg-t' : ''}">${m.net > 0 ? '+' : ''}${money0(m.net || 0)} net</span>`, acc: 'gold' })}
  </div>`;

  // season by season
  const seasonRows = m.seasons.slice().reverse().map(r => {
    const s = MODEL.seasons.find(x => x.season === r.season);
    const st = s && s.stats && s.stats[r.rosterId];
    return `<tr class="${r.champion ? 'you' : ''}">
      <td><strong>${esc(r.season)}</strong></td><td class="wrap">${esc(r.teamName)}</td>
      <td class="num">${wlt(r.wins, r.losses, r.ties)}</td><td class="num">${ordinal(r.seed)}</td>
      <td class="num">${n2(r.pf)}</td><td class="num">${n2(r.pa)}</td>
      <td class="num">${st && st.maxPf ? pct(st.pfMaxWeeks / st.maxPf) : '&mdash;'}</td>
      <td class="num">${r.playoffW + r.playoffL ? `${r.playoffW}-${r.playoffL}` : '<span class="dim">&mdash;</span>'}</td>
      <td>${finishLabel(r) || medal(r)}</td></tr>`;
  });

  const rivals = MODEL.managerList.filter(o => o.id !== m.id).map(o => {
    const r = MODEL.h2h[m.id + '|' + o.id];
    return r ? { o, r, g: r.w + r.l + r.t, pct: (r.w + r.t * .5) / Math.max(r.w + r.l + r.t, 1) } : null;
  }).filter(Boolean).sort((x, y) => y.g - x.g);
  const rivalRows = rivals.map(x => `<tr class="${youRow(x.o.id)}">
    <td>${mgrCell(x.o.id)}</td>
    ${tdv(x.pct, `<a class="name-link" href="#/h2h?a=${encodeURIComponent(m.id)}&b=${encodeURIComponent(x.o.id)}&focus=h2hDetail">${wlt(x.r.w, x.r.l, x.r.t)}</a>${(x.r.pw || x.r.pl) ? ` <span class="dim small">${x.r.pw || 0}-${x.r.pl || 0} PO</span>` : ''}`)}
    ${tdv(x.pct, `<span class="${x.pct >= .5 ? 'pos-t' : 'neg-t'}">${pct(x.pct)}</span>`)}
    <td class="num">${n1(x.r.pf)}</td><td class="num">${n1(x.r.pa)}</td>
    ${tdv(x.r.pf - x.r.pa, colorNum(x.r.pf - x.r.pa, n1))}</tr>`);

  const best = MODEL.weekly.filter(w => w.ownerId === m.id).sort((x, y) => y.pts - x.pts);
  const wkRow = (x, i, cls) => `<tr><td class="rank">${i + 1}</td><td class="num ${cls}"><strong>${n2(x.pts)}</strong></td>
    <td class="muted">${esc(x.season)} &middot; Wk ${x.week}</td><td>${mgrLink(x.opp)}</td><td class="num muted">${n2(x.oppPts)}</td></tr>`;

  // career form
  const career = MODEL.weekly.filter(w => w.ownerId === m.id).sort((x, y) => x.season.localeCompare(y.season) || x.week - y.week);
  const avgBy = {};
  MODEL.weekly.forEach(w => { const k = w.season + '|' + w.week; const q = avgBy[k] || (avgBy[k] = { s: 0, n: 0 }); q.s += w.pts; q.n++; });
  const form = career.length ? lineChart(career.map(w => `'${String(w.season).slice(2)} W${w.week}`), [
    { id: 'me', name: m.name, color: '#60a5fa', values: career.map(w => w.pts), you: true },
    { id: 'avg', name: 'League average', color: '#94a3b8', values: career.map(w => { const q = avgBy[w.season + '|' + w.week]; return q ? q.s / q.n : null; }) }
  ], { title: 'Career Form', sub: 'Every regular-season week against the league average that week.', decimals: true, maxXLabels: 10, xLabel: '', dashed: ['avg'], height: 260 }) : '';

  // live roster
  let roster = '';
  const liveS = MODEL.liveSeason;
  const myTeam = liveS ? liveS.teams.find(t => t.ownerId === m.id) : null;
  if (myTeam && MODEL.currentWeek) {
    const wk = MODEL.currentWeek;
    const proj = await loadProjections(liveS.season, wk);
    const side = projectSide(((liveS.lineups[wk] || {})[myTeam.rosterId] || {}).st, ((liveS.lineups[wk] || {})[myTeam.rosterId] || {}).sp, proj, todayISO(), weekStatus(wk));
    roster = section(`Current Roster`, lineupBlock(liveS, wk, myTeam.rosterId, proj, side, { final: weekIsFinal(liveS, wk) }),
      { sub: `${esc(liveS.season)} season, week ${wk}. Points fill in as games are played.`, act: `<a href="#/week">This week &rarr;</a>` });
  }

  const showcase = holds.length ? `<div class="grid g4">${holds.map(r => `<div class="rec acc-${r.tone === 'cold' ? 'red' : 'gold'}">
      <div class="rec-label">${esc(r.label)}</div><div class="rec-value">${esc(r.display)}</div>
      <div class="rec-who">${esc(r.detail || 'all-time')}</div>
      <div class="rec-when">${r.owners.length > 1 ? 'shared with ' + r.owners.filter(o => o !== m.id).map(o => esc(mgr(o).name)).join(', ') : 'sole holder'}</div>
    </div>`).join('')}</div>` : empty('No league records held yet. The <a href="#/records">record book</a> shows what’s up for grabs.');

  const winnings = (() => {
    const row = MODEL.money && MODEL.money.byManager[m.id];
    if (!row || !row.awards.length) return '';
    return section('Winnings', table(['Season', 'Prize', { label: 'Amount', num: 1 }], row.awards.map(x => `<tr>
      <td>${esc(x.season)}</td><td>${esc(x.label)}</td><td class="num gold-t">${money0(x.amount)}</td></tr>`), { limit: 8 }) +
      `<p class="note">${money0(row.total)} won against ${money0(row.buyIns)} in buy-ins: <strong class="${row.net > 0 ? 'pos-t' : 'neg-t'}">${row.net > 0 ? '+' : ''}${money0(row.net)}</strong> lifetime. <a href="#/money">Full ledger &rarr;</a></p>`);
  })();

  const trades = section('Trading', deferred('mgrTrades', async () => {
    const all = await getTrades();
    const mine = all.filter(g => g.graded && g.sides.some(sd => sd.ownerId === m.id));
    if (!mine.length) return empty('No graded trades yet.');
    const r = tradeSummary(mine).find(x => x.ownerId === m.id);
    const ranked = tradeSummary(all.filter(g => g.graded)).filter(x => x.trades >= 3).sort((x, y) => y.netPts - x.netPts);
    const pos = ranked.findIndex(x => x.ownerId === m.id) + 1;
    return `<div class="grid g4" style="margin-bottom:12px">
      ${statCard({ label: 'Trades', value: r.trades, sub: `${r.w}W-${r.l}L-${r.e}E`, acc: 'blue' })}
      ${statCard({ label: 'Net Starter Pts', value: signed(r.netPts, n0), sub: pos ? `${ordinal(pos)} of ${ranked.length} traders` : 'fewer than 3 trades', acc: r.netPts >= 0 ? 'green' : 'red' })}
      ${statCard({ label: 'Value at Trade', value: r.priced ? signed(r.netThen, n0) : '—', sub: r.priced ? `FantasyCalc value gained on paper, ${r.priced} trade${r.priced === 1 ? '' : 's'}` : 'no FantasyCalc trade-day values yet', acc: 'violet' })}
      ${statCard({ label: 'Best Trade', value: r.best ? esc(r.best.side.label) : '—', sub: r.best ? `${esc(r.best.trade.season)} Wk ${r.best.trade.week}` : '', acc: 'amber' })}
    </div>${mine.slice(0, 5).map(g => tradeCard(g, { perspective: m.id })).join('')}
    <p class="note"><a href="${hrefWith('trades', { mgr: m.id })}">All of ${esc(m.name)}'s trades &rarr;</a></p>`;
  }));

  const drafts = getDrafts();
  const draftRows = Object.values(drafts).sort((x, y) => y.s.season.localeCompare(x.s.season)).map(d => {
    const row = Object.values(d.byRoster).find(r => r.ownerId === m.id);
    if (!row) return '';
    return `<tr><td><strong>${esc(d.s.season)}</strong>${d.provisional ? ' ' + lbl('so far', 'slate') : ''}</td>
      <td class="num">${gradeLetter(row.letter)}</td>
      <td class="num">${row.gpa != null ? row.gpa.toFixed(2) : '&mdash;'}</td>
      <td>${row.steal ? playerCell(row.steal.playerId, { pos: row.steal.pos, meta: { name: row.steal.player, pos: row.steal.pos }, after: ` <span class="dim small">${row.steal.round}.${String(row.steal.pick - (row.steal.round - 1) * d.teams).padStart(2, '0')}</span>` }) : ''}</td>
      <td>${row.bust ? playerCell(row.bust.playerId, { pos: row.bust.pos, meta: { name: row.bust.player, pos: row.bust.pos } }) : ''}</td></tr>`;
  }).filter(Boolean);

  return `${header}${cards}
    ${roster}
    ${section('Record Showcase', showcase, { sub: holds.length ? 'League records currently held. They move the moment someone breaks one.' : '' })}
    ${form ? `<div class="section">${form}</div>` : ''}
    ${section('Season by Season', table(['Season', 'Team', { label: 'Record', num: 1 }, { label: 'Seed', num: 1 }, { label: 'PF', num: 1 },
      { label: 'PA', num: 1 }, { label: 'Eff%', num: 1 }, { label: 'Playoffs', num: 1 }, 'Finish'], seasonRows))}
    ${trades}
    ${draftRows.length ? section('Draft Report Cards', table(['Season', { label: 'Grade', num: 1 }, { label: 'GPA', num: 1 }, 'Best pick', 'Biggest miss'], draftRows),
      { act: `<a href="#/draft?tab=summary">Draft grades &rarr;</a>` }) : ''}
    ${section('Against Everyone Else', table(['Opponent', { label: 'Record', num: 1 }, { label: 'Win%', num: 1 }, { label: 'PF', num: 1 },
      { label: 'PA', num: 1 }, { label: '+/-', num: 1 }], rivalRows, { sortable: true }), { sub: 'Includes playoff meetings. Click a record for every game.' })}
    <div class="grid g2 gap-lg">
      ${section('Best Weeks', table(['#', { label: 'Points', num: 1 }, 'When', 'Opponent', { label: 'Opp', num: 1 }], best.slice(0, 5).map((x, i) => wkRow(x, i, 'pos-t'))))}
      ${section('Worst Weeks', table(['#', { label: 'Points', num: 1 }, 'When', 'Opponent', { label: 'Opp', num: 1 }], best.slice(-5).reverse().map((x, i) => wkRow(x, i, 'neg-t'))))}
    </div>
    ${winnings}
    ${myTeam ? section('Moves This Season', deferred('mgrMoves', async () => {
      const txns = (await loadTransactions(liveS)).filter(t => (t.rosters || []).indexOf(myTeam.rosterId) !== -1);
      if (!txns.length) return empty('No moves yet this season.');
      const nm = pid => `${esc(playerMeta(pid).name)} <span class="dim small">${esc(playerMeta(pid).pos)}</span>`;
      const rows = txns.map(t => {
        const got = Object.keys(t.adds || {}).filter(pid => t.adds[pid] === myTeam.rosterId);
        const lost = Object.keys(t.drops || {}).filter(pid => t.drops[pid] === myTeam.rosterId);
        const kind = t.type === 'trade' ? lbl('Trade', 'gold') : t.type === 'waiver' ? lbl('Waiver', 'teal') : lbl('Free agent', 'slate');
        const partners = (t.rosters || []).filter(r => r !== myTeam.rosterId).map(r => mgrLink(ownerOfRoster(liveS.season, r)));
        return `<tr>${tdv(t.created, `Wk ${t.week}<div class="dim xsmall">${esc(fmtDate(t.created))}</div>`)}
          <td>${kind}${t.bid ? ` <span class="gold-t small">$${t.bid}</span>` : ''}</td>
          <td class="wrap">${got.length ? `<div class="pos-t">+ ${got.map(nm).join(', ')}</div>` : ''}${lost.length ? `<div class="neg-t">&minus; ${lost.map(nm).join(', ')}</div>` : ''}
            ${partners.length ? `<div class="dim small">with ${partners.join(', ')}</div>` : ''}</td></tr>`;
      });
      return table([{ label: 'When', num: 1 }, 'Type', 'Players'], rows, { limit: 10 });
    }), { sub: `Every trade, claim and pickup in ${esc(liveS.season)}.` }) : ''}
    <p class="note"><a href="#/managers">&larr; All managers</a></p>`;
};

/* ============================== MONEY ============================== */
views.money = () => {
  const M = MODEL.money;
  if (!M || !M.seasons.length) return empty('No payout structures have been set up yet. Add them in <code>assets/payouts.js</code>.');
  const played = MODEL.managerList.filter(m => m.paidIn > 0 || m.winnings > 0);
  const byNet = played.slice().sort((a, b) => b.net - a.net || b.winnings - a.winnings);
  const richest = byNet[0];
  const biggest = Object.values(M.byManager).reduce((best, r) => r.awards.reduce((b, x) => (!b || x.amount > b.amount) ? x : b, best), null);

  const ledger = byNet.map((m, i) => `<tr class="${youRow(m.id)}">
    <td class="rank">${i + 1}</td><td>${mgrCell(m.id, m.teamNames[m.teamNames.length - 1])}</td>
    <td class="num">${m.seasons.filter(s => s.complete || s.season === MODEL.currentSeason.season).length}</td>
    ${tdv(m.paidIn, money0(m.paidIn), 'num muted')}
    ${tdv(m.winnings, `<span class="${m.winnings ? 'gold-t' : 'dim'}">${money0(m.winnings)}</span>`)}
    ${tdv(m.net, `<strong class="${m.net > 0 ? 'pos-t' : m.net < 0 ? 'neg-t' : ''}">${m.net > 0 ? '+' : ''}${money0(m.net)}</strong>`)}
    <td class="num">${m.cashes || '<span class="dim">0</span>'}</td></tr>`);

  const blocks = M.seasons.slice().reverse().map(s => {
    const cfg = s.config, places = cfg.places || {};
    const winnerOf = type => {
      const x = s.awards.find(q => q.type === type);
      return x ? mgrLink(x.ownerId) + youBadge(x.ownerId) : (s.complete ? '<span class="dim">&mdash;</span>' : '<span class="dim">to be decided</span>');
    };
    const rows = Object.keys(places).map(type => `<tr><td>${esc(PAYOUT_LABELS[type] || type)}</td>
      <td class="num gold-t">${money0(places[type])}</td><td>${winnerOf(type)}</td></tr>`);
    const wh = cfg.weeklyHigh;
    const whA = s.awards.filter(x => x.type === 'weeklyHigh');
    if (wh) rows.push(`<tr><td>High score, weeks ${wh.from}&ndash;${wh.to}</td>
      <td class="num gold-t">${money0(wh.amount)} &times; ${s.weeklyWeeks} = ${money0(wh.amount * s.weeklyWeeks)}</td>
      <td>${whA.length ? `${whA.length} of ${s.weeklyWeeks} paid so far` : '<span class="dim">not started</span>'}</td></tr>`);
    const chips = whA.length ? `<div class="chips" style="margin-top:10px">${whA.slice().sort((a, b) => a.week - b.week).map(x =>
      `<span class="chip static">Wk ${x.week} ${mgrLink(x.ownerId)} <span class="dim">${n1(x.pts)}</span></span>`).join('')}</div>` : '';
    return `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div><div class="strong" style="font-size:16px">${esc(s.season)}</div>
          <div class="small muted">${s.teams} teams &times; ${money0(s.buyIn)} = ${money0(s.collected)} collected &middot; ${money0(s.scheduled)} in prizes</div></div>
        ${s.balanced ? lbl('Balances', 'green') : lbl('Off by ' + money0(Math.abs(s.difference)), 'red')}</div>
      <div style="margin-top:10px">${table(['Prize', { label: 'Amount', num: 1 }, 'Winner'], rows)}</div>${chips}</div>`;
  }).join('');

  return `<div class="grid g4">
    ${statCard({ label: 'Paid Out All-Time', value: money0(M.totalPaid), sub: `across ${M.seasons.filter(s => s.complete).length} finished seasons`, acc: 'gold' })}
    ${statCard({ label: 'Most Profitable', value: richest ? esc(richest.name) : '—', sub: richest ? `${richest.net > 0 ? '+' : ''}${money0(richest.net)} net` : '', acc: 'green', you: richest && isYou(richest.id) })}
    ${statCard({ label: 'Biggest Payday', value: biggest ? money0(biggest.amount) : '—', sub: biggest ? `${esc(mgr(biggest.ownerId).name)} · ${esc(biggest.season)} ${esc(biggest.label)}` : '', acc: 'amber' })}
    ${statCard({ label: 'In the Black', value: `${byNet.filter(m => m.net > 0).length} <span class="dim" style="font-size:15px">of ${byNet.length}</span>`, sub: `${played.filter(m => m.winnings > 0).length} have cashed at least once`, acc: 'teal' })}
  </div>
  ${section('All-Time Ledger', table(['#', 'Manager', { label: 'Seasons', num: 1 }, { label: 'Paid In', num: 1 },
    { label: 'Won', num: 1 }, { label: 'Net', num: 1 }, { label: 'Cashes', num: 1 }], ledger, { sortable: true }),
    { sub: 'Buy-ins count for every season a manager fielded a team. Weekly prizes are paid as they’re won.' })}
  ${section('Season by Season', blocks)}
  ${M.unbalanced.length ? `<div class="tip tip-amber"><div class="tip-title">Heads up</div><div class="tip-body">${M.unbalanced.map(s => esc(s.season)).join(', ')}
    ${M.unbalanced.length === 1 ? "doesn't" : "don't"} balance: the prizes and the money collected disagree. Fix it in <code>assets/payouts.js</code>.</div></div>` : ''}`;
};
