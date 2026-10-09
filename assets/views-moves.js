/* ===================================================================
   views-moves.js — Trades, Waivers, Draft and Rosters.
   =================================================================== */

const CHEV = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>`;

/* ============================== TRADE CARD ========================= */
function tradeTitle(g) {
  const name = sd => `<span>${esc(mgr(sd.ownerId).name)}</span>${youBadge(sd.ownerId)}`;
  if (g.winner && g.loser) {
    return `${name(g.winner)} <span class="verb">${TRADE_TIERS[g.tierIndex].verb}</span> ${name(g.loser)}`;
  }
  return g.sides.map(name).join(' <span class="verb">&harr;</span> ');
}

function tradeGist(g, side) {
  const sd = side || g.winner || g.sides[0];
  const other = g.sides.filter(o => o !== sd);
  const list = arr => {
    if (!arr.length) return 'nothing';
    const first = esc(playerMeta(arr[0].pid || arr[0]).name);
    return arr.length > 1 ? `${first} +${arr.length - 1}` : first;
  };
  const got = sd.players.length ? list(sd.players) : (sd.faab ? `$${sd.faab} FAAB` : 'nothing');
  const gave = other.reduce((a, o) => a.concat(o.players), []);
  const gaveTxt = gave.length ? list(gave) : (sd.faabSent ? `$${sd.faabSent} FAAB` : 'nothing');
  return `Got ${got} <span class="sep">|</span> Gave ${gaveTxt}`;
}

const DASH = '<span class="dim">&mdash;</span>';
/* Which columns a trade card can fill. Trades from before the site started
   saving FantasyCalc values (October 2026) have no trade-day value, so Then
   is left off; finished seasons from then have no closing value either, so
   they show starter points only. Live trades graded on projections add a
   Proj column: Sleeper's projected points for the rest of the regular season. */
const tradeCols = g => ({ then: !!g.hasThen, now: !!g.hasNow, proj: g.basis === 'projected' });
const weekSpan = ws => !ws || !ws.length ? '' : ws.length === 1 ? `week ${ws[0]}` : `weeks ${ws[0]}–${ws[ws.length - 1]}`;

/** "9,563 → 8,280 -1,283", or whichever end of that the trade has. */
function valueMoveCell(sd, c) {
  if (c.then && c.now) {
    return `<td class="num"><span class="muted">${n0(sd.then)}</span> &rarr; ${n0(sd.now)}
      <div class="xsmall">${colorNum(sd.gl, n0)}</div></td>`;
  }
  return `<td class="num">${c.then ? n0(sd.then) : n0(sd.now)}</td>`;
}

function tradeSideTable(g, sd) {
  const c = tradeCols(g);
  const gl = c.then && c.now && !c.proj;      // keeps a live card to five columns
  const cols = 2 + c.then + c.now + gl + c.proj;
  const rows = sd.players.map(p => {
    const mark = p.left ? (p.left.type === 'traded' ? ' <span class="pl-left" title="traded away in week ' + p.left.week + '">&harr;</span>'
      : ' <span class="pl-left" title="dropped in week ' + p.left.week + '">&#10005;</span>') : '';
    return `<tr>
      <td>${playerCell(p.pid, { pos: p.pos, face: false, after: mark })}</td>
      ${c.then ? `<td class="num">${p.then ? n0(p.then) : DASH}</td>` : ''}
      ${c.now ? `<td class="num">${p.now ? n0(p.now) : DASH}</td>` : ''}
      ${gl ? `<td class="num">${p.then || p.now ? colorNum(p.gl, n0) : ''}</td>` : ''}
      <td class="num" title="${p.started} of ${p.weeks} weeks in the starting lineup">${p.weeks ? n1(p.pts) : DASH}</td>
      ${c.proj ? `<td class="num">${p.proj ? n1(p.proj) : DASH}</td>` : ''}
    </tr>`;
  });
  if (sd.faab) rows.push(`<tr><td colspan="${cols}">${lbl('FAAB', 'gold')} $${sd.faab}</td></tr>`);
  sd.picks.forEach(pk => rows.push(`<tr><td colspan="${cols}">${lbl('Pick', 'slate')} ${esc(pk.season)} round ${esc(pk.round)}</td></tr>`));
  const heads = ['Player'].concat(c.then ? [{ label: 'Then', num: 1 }] : [], c.now ? [{ label: g.live ? 'Now' : 'End', num: 1 }] : [],
    gl ? [{ label: 'G/L', num: 1 }] : [], [{ label: 'Pts', num: 1, title: 'Points scored in their starting lineup' }],
    c.proj ? [{ label: 'Proj', num: 1, title: 'Projected starter points for the rest of the regular season' }] : []);
  return `<div class="tside">
    <div class="tside-head"><span class="who">${esc(mgr(sd.ownerId).name)}${youBadge(sd.ownerId)} received</span>${g.graded ? tierChip(sd, g.basis) : ''}</div>
    ${table(heads, rows.length ? rows : [`<tr><td colspan="${cols}" class="dim">Nothing</td></tr>`])}
  </div>`;
}

function tradeCard(g, opts) {
  opts = opts || {};
  const persp = opts.perspective ? g.sides.find(sd => sd.ownerId === opts.perspective) : null;
  const chipSide = persp || g.winner || g.sides[0];
  const chip = g.graded ? tierChip(chipSide, g.basis, true) : lbl(g.live && !g.hasNow ? 'Values unavailable' : 'Not graded', 'slate');
  const s = MODEL.seasons.find(x => x.season === g.season);
  const c = tradeCols(g);
  const mkt = c.then || c.now;
  const summary = g.sides.map(sd => `<tr class="${youRow(sd.ownerId)}">
    <td>${mgrCell(sd.ownerId, null, true)}</td>
    ${mkt ? valueMoveCell(sd, c) : ''}
    <td class="num">${c.proj ? n1(sd.pts) : `<strong>${n1(sd.pts)}</strong>`}</td>
    ${c.proj ? `<td class="num">${n1(sd.proj)}</td><td class="num"><strong>${n1(sd.pts + sd.proj)}</strong></td>` : ''}
    <td>${g.graded ? tierChip(sd, g.basis) : ''}</td></tr>`);
  const valueHead = c.then && c.now ? (g.live ? 'Value then → now' : 'Value then → end') : c.then ? 'Value at trade' : g.live ? 'Value now' : 'Value at season end';
  const sumHeads = ['Team'].concat(mkt ? [{ label: valueHead, num: 1, title: 'FantasyCalc market value of what each side received' }] : [],
    [{ label: c.proj ? 'Pts so far' : 'Starter pts', num: 1, title: 'Points scored in their new starting lineup' }],
    c.proj ? [{ label: 'Proj. rest', num: 1, title: 'Projected starter points for the rest of the regular season, players still on the roster' },
      { label: 'Total', num: 1 }] : [], ['Result']);
  const span = weekSpan(g.projWeeks);
  const legend = [].concat(
    c.then ? [`Then: ${fcLink()} value the day of the trade`] : [],
    c.now ? [g.live ? `Now: ${fcLink()} value today` : `End: ${fcLink()} value after the season`] : [],
    ['Pts: points scored in their new starting lineup'],
    c.proj ? [span ? `Proj: Sleeper’s projections for ${span}: in full when he’s in his team’s best projected lineup, a quarter when he’s not` : 'Proj: no regular-season weeks left'] : [],
    ['&harr; traded away', '&#10005; dropped', 'no mark: kept'],
    g.live && !c.then ? ['No trade-day value: the site started saving FantasyCalc values in Oct 2026'] : []);
  const note = !g.graded
    ? (g.live && !g.hasNow && g.sides.some(sd => sd.players.length) ? 'Today’s FantasyCalc values couldn’t load, so this trade isn’t graded right now.' : 'FAAB-only trades aren’t graded.')
    : g.basis === 'realized'
      ? `Graded on starter points: ${g.winner ? `${esc(mgr(g.winner.ownerId).name)} came out ${n1(Math.abs(g.winner.net))} points ahead` : `within ${TRADE_BANDS.realized[0]} points, an even trade`}.`
    : g.basis === 'projected'
      ? `Live season: graded on starter points so far plus projected starter points for the rest of the regular season${g.winner ? `, ${esc(mgr(g.winner.ownerId).name)} ahead by ${n1(Math.abs(g.winner.net))}` : `, within ${TRADE_BANDS.projected[0]} points, even`}. The grade becomes final once ${esc(g.season)} is over.`
      : `Live season: graded on ${fcLink()} value today${g.winner ? `, ${esc(mgr(g.winner.ownerId).name)} ahead by ${n0(Math.abs(g.winner.net))}` : `, within ${n0(TRADE_BANDS.market[0])}, even`}. Switches to starter points once ${esc(g.season)} is over.`;
  return `<details class="tcard" ${opts.open ? 'open' : ''}>
    <summary>
      <div class="tcard-main">
        <div class="tcard-meta"><span>${esc(g.season)}</span><span class="sep">|</span><span>Wk ${g.week}</span><span class="sep">|</span><span>${esc(fmtDate(g.created))}</span>
          ${g.live ? '<span class="sep">|</span><span class="blue-t">live season</span>' : ''}</div>
        <div class="tcard-title">${tradeTitle(g)}</div>
        <div class="tcard-gist">${tradeGist(g, persp)}</div>
      </div>
      <div class="tcard-right">${chip}${CHEV}</div>
    </summary>
    <div class="tcard-body">
      <div class="tsides">${g.sides.map(sd => tradeSideTable(g, sd)).join('')}</div>
      <div class="legend">${legend.map(x => `<span>${x}</span>`).join('')}</div>
      <div class="tsum">${table(sumHeads, summary)}</div>
      <p class="note">${note}
        ${s ? `<a href="${hrefWith('trades', { season: g.season })}">${esc(g.season)} trades &rarr;</a>` : ''}</p>
    </div>
  </details>`;
}

/* ================================ TRADES =========================== */
views.trades = async params => {
  const tab = params.tab === 'overview' ? 'overview' : 'history';
  const started = MODEL.seasons.filter(s => s.started).slice().reverse();
  const season = params.season && started.find(s => s.season === params.season) ? params.season : '';
  const head = `${seasonPills('trades', { tab: params.tab, mgr: params.mgr, grade: params.grade, sort: params.sort }, started, season, { all: 'All seasons' })}
    ${learn(`Graded on starter points: what each side’s new players score in their new lineup. This season’s trades add Sleeper’s projections for the weeks still to come. ${fcLink()} market values are shown alongside. <a href="${hrefWith('trades', Object.assign({}, params, { focus: 'gradeHow' }))}">How grades work</a>`)}
    ${tabs('trades', { season, mgr: params.mgr }, [['history', 'Trade History'], ['overview', 'League Overview']], tab)}`;

  const all = await getTrades();
  const pool = all.filter(g => !season || g.season === season);
  if (!pool.length) return head + empty('No trades in this span.');
  return head + (tab === 'overview' ? tradesOverview(pool, season) : tradesHistory(pool, params, season)) + gradeHow();
};

function tradesHistory(pool, params, season) {
  const me = viewerId();
  const owners = Array.from(new Set(pool.reduce((a, g) => a.concat(g.sides.map(sd => sd.ownerId)), []).filter(Boolean)))
    .sort((a, b) => mgr(a).name.localeCompare(mgr(b).name));
  const fm = params.mgr && owners.indexOf(params.mgr) !== -1 ? params.mgr : '';
  const grade = TRADE_TIERS.find(t => t.key === params.grade) ? params.grade : '';
  const sort = params.sort === 'lopsided' ? 'lopsided' : 'recent';
  let list = pool.filter(g => !fm || g.sides.some(sd => sd.ownerId === fm));
  if (grade) list = list.filter(g => g.graded && g.tier === grade);
  if (sort === 'lopsided') list = list.slice().sort((a, b) => (b.graded - a.graded) || b.tierIndex - a.tierIndex ||
    Math.abs(b.winner ? b.winner.net : 0) - Math.abs(a.winner ? a.winner.net : 0));
  const base = { season, grade, sort };
  const chip = (id, label) => `<a class="chip ${fm === id ? 'active' : ''}" href="${hrefWith('trades', Object.assign({}, base, { mgr: fm === id ? '' : id }))}">${label}</a>`;
  const shown = 25;
  const cards = list.map((g, i) => {
    const html = tradeCard(g, { perspective: fm || null });
    return i >= shown ? html.replace('<details class="tcard"', '<details class="tcard" data-extra="1"') : html;
  }).join('');
  return `<div class="toolbar">
      <div class="chips">${me && owners.indexOf(me) !== -1 ? chip(me, 'My trades') : ''}${owners.map(o => chip(o, esc(mgr(o).name))).join('')}</div>
    </div>
    <div class="toolbar">
      <select class="select" data-param="grade"><option value="">All grades</option>${TRADE_TIERS.map(t => `<option value="${t.key}" ${grade === t.key ? 'selected' : ''}>${t.key === 'even' ? 'Even' : t.win + ' / ' + t.lose}</option>`).join('')}</select>
      <select class="select" data-param="sort"><option value="recent" ${sort === 'recent' ? 'selected' : ''}>Most recent</option><option value="lopsided" ${sort === 'lopsided' ? 'selected' : ''}>Most lopsided</option></select>
      <span class="small muted">${list.length} trade${list.length === 1 ? '' : 's'}</span>
    </div>
    <div class="tlist" id="tradeList">${cards || empty('No trades match.')}</div>
    ${list.length > shown ? `<button class="table-more" style="border:1px solid var(--line);border-radius:8px" data-expand="#tradeList" data-more-label="Show all ${list.length}" data-less="Show fewer">Show all ${list.length}</button>` : ''}`;
}

function tradesOverview(pool, season) {
  const graded = pool.filter(g => g.graded);
  const sumr = tradeSummary(pool).sort((a, b) => b.netPts - a.netPts);
  // The market columns need trade-day values, which only exist from October 2026 on.
  const priced = sumr.some(r => r.priced);
  const mktTd = (r, v) => r.priced ? tdv(v, colorNum(v, n0)) : tdv(null, DASH);
  const rows = sumr.map(r => `<tr class="${youRow(r.ownerId)}">
    <td>${mgrCell(r.ownerId)}</td>
    ${tdv(r.w - r.l, `<span class="pos-t">${r.w}</span>-<span class="neg-t">${r.l}</span>${r.e ? `-<span class="muted">${r.e}</span>` : ''}`)}
    <td class="num">${r.trades}</td>
    ${tdv(r.netPts, `<strong>${colorNum(r.netPts, n1)}</strong>`)}
    ${tdv(r.trades ? r.netPts / r.trades : 0, colorNum(r.trades ? r.netPts / r.trades : 0, n1))}
    ${priced ? mktTd(r, r.netThen) + mktTd(r, r.moves) : ''}
    <td class="num">${r.acquired}</td><td class="num">${r.sent}</td></tr>`);
  const mktHeads = priced ? [{ label: 'Value at Trade', num: 1, title: 'FantasyCalc value received minus sent, the day of each trade (trades since Oct 2026)' },
    { label: 'Value Moves', num: 1, title: 'How much FantasyCalc value moved in your favor since: buying low and selling high' }] : [];

  const partners = tradePartners(pool);
  const owners = Array.from(new Set(pool.reduce((a, g) => a.concat(g.sides.map(sd => sd.ownerId)), []).filter(Boolean)))
    .sort((a, b) => mgr(a).name.localeCompare(mgr(b).name));
  const maxP = Math.max.apply(null, Object.values(partners).concat([1]));
  const matrix = `<div class="h2h-wrap"><table class="h2h"><thead><tr><th>Manager</th>${owners.map(o => `<th title="${esc(mgr(o).name)}">${esc(mgr(o).name.slice(0, 8))}</th>`).join('')}</tr></thead>
    <tbody>${owners.map(a => `<tr class="${youRow(a)}"><th scope="row">${esc(mgr(a).name)}</th>${owners.map(b => {
      if (a === b) return '<td class="self">&mdash;</td>';
      const n = partners[a + '|' + b] || 0;
      return n ? `<td class="heat" style="background:rgba(59,130,246,${(0.12 + 0.5 * n / maxP).toFixed(2)})">${n}</td>` : '<td></td>';
    }).join('')}</tr>`).join('')}</tbody></table></div>`;

  const most = mostTraded(pool);
  const mostRows = most.map((r, i) => `<tr><td class="rank">${i + 1}</td>
    <td>${playerCell(r.pid, { pos: r.pos })}</td>
    <td class="num"><strong>${r.n}&times;</strong></td>
    <td class="num">${esc(fmtMonth(r.last))}</td>
    <td class="num">${r.owners.size}</td></tr>`);

  const tierCounts = TRADE_TIERS.map(t => [t, graded.filter(g => g.tier === t.key).length]);
  return `<div class="grid g6">
      ${statCard({ label: 'Trades', value: pool.length, sub: `${graded.length} graded`, acc: 'blue' })}
      ${tierCounts.map(([t, n], i) => statCard({ label: t.key === 'even' ? 'Even' : t.win, value: n, sub: graded.length ? pct0(n / graded.length) + ' of graded' : '', acc: ['slate', 'teal', 'green', 'amber', 'red'][i] })).join('')}
    </div>
    ${section('Team Summary', table([{ label: 'Team', sort: 'text' }, { label: 'Record', num: 1, title: 'Wins, losses and evens by trade grade' },
      { label: 'Trades', num: 1 }, { label: 'Net Starter Pts', num: 1, title: 'Points your new players scored in your lineup, minus what the players you sent scored in theirs' },
      { label: 'Avg / Trade', num: 1 }].concat(mktHeads, [
      { label: 'Acquired', num: 1 }, { label: 'Sent', num: 1 }]), rows, { sortable: true }),
      { sub: `Record counts each trade’s grade. Net starter points is the scoreboard: what your new players put in your lineup versus what you gave up put in theirs.${priced
        ? ` Value columns use ${fcLink()} values and only count trades made since October 2026, when the site started saving them.` : ''}` })}
    ${section('Trade Partners', matrix, { sub: 'How many trades each pair has made.' })}
    ${section('Most Traded', table(['#', 'Player', { label: 'Times', num: 1 }, { label: 'Last traded', num: 1 }, { label: 'Owners', num: 1 }], mostRows, { limit: 10 }),
      { sub: 'Players traded two or more times.' })}`;
}

function gradeHow() {
  const b = TRADE_BANDS;
  return section('How Grades Work', `<div class="card small" style="line-height:1.7;color:var(--ink-2)">
    <p style="margin-top:0"><strong>Starter points decide the grade.</strong> For every player a team received: the points he scored in that team’s
      starting lineup, from the trade until he left the roster. Bench points don’t count. Playoff weeks count while the team was still playing
      for the title or third place. The difference between the two sides sets the grade: within ${b.realized[0]} points is <em>Even</em>,
      then ${b.realized[0]}+ <em>Slight Edge</em>, ${b.realized[1]}+ <em>Good Win</em>, ${b.realized[2]}+ <em>Clear Win</em> and ${b.realized[3]}+ <em>Fleece</em>.</p>
    <p><strong>This season: points so far plus projections.</strong> A trade from this season hasn’t played out yet, so the rest of the regular season is filled in
      with Sleeper’s weekly projections, scored with this league’s settings, for players still on the roster that got them. Each week, a player counts in full
      if he’s in his team’s best projected lineup and for a quarter of his projection if he’s on the bench, since bench players only start now and then.
      Same cut-offs. Each week a little more is real points and a little less is projection, and the grade becomes final when the season ends.
      Why projections and not trade values: on this league’s 70 past trades with a clear winner, projections picked the eventual winner about two times in three.
      The dynasty trade values this site used before were a coin flip.</p>
    <p><strong>Market value, for context.</strong> ${fcLink('FantasyCalc')}’s redraft trade values, built from real fantasy trades and set to this league’s
      format (1 QB, 12 teams, full PPR, no TE premium): what each side received the day of the trade, and what it’s worth now (or at the end of a past season).
      FantasyCalc only publishes today’s values, so the site saves a copy every morning, starting October 2026; older trades don’t have a trade-day value.
      If the projections ever fail to load, this season’s trades fall back to being graded on FantasyCalc value today:
      ${n0(b.market[0])}+ slight, ${n0(b.market[1])}+ good, ${n0(b.market[2])}+ clear, ${n0(b.market[3])}+ fleece.</p>
    <p style="margin-bottom:0">FAAB that changes hands is shown but not valued, and FAAB-only trades aren’t graded.
      A trade record counts each grade: a win for the side that came out ahead, a loss for the other, even when it’s close.</p>
  </div>`, { id: 'gradeHow' });
}

/* ================================ WAIVERS ========================== */
views.waivers = async params => {
  const tab = ['history', 'summary', 'hits'].indexOf(params.tab) !== -1 ? params.tab : 'history';
  const started = MODEL.seasons.filter(s => s.started).slice().reverse();
  const season = params.season && started.find(s => s.season === params.season) ? params.season : (started[0] ? started[0].season : '');
  const seasonAll = params.season === 'all';
  const head = `<div class="pills">
      <a class="pill-btn ${seasonAll ? 'active' : ''}" href="${hrefWith('waivers', { tab: params.tab, season: 'all' })}">All seasons</a>
      ${started.map(s => `<a class="pill-btn ${!seasonAll && s.season === season ? 'active' : ''}" href="${hrefWith('waivers', { tab: params.tab, season: s.season })}">${esc(s.season)}${s.inProgress ? ' &middot; live' : ''}</a>`).join('')}
    </div>
    ${learn(`Pickups are graded on the points they scored in your starting lineup while you had them. <a href="${hrefWith('waivers', Object.assign({}, params, { focus: 'waiverHow' }))}">How it works</a>`)}
    ${tabs('waivers', { season: params.season }, [['history', 'Waiver History'], ['summary', 'League Summary'], ['hits', 'Best Pickups']], tab)}`;
  const all = await getWaivers();
  const pool = all.filter(c => seasonAll || c.season === season);
  if (!pool.length) return head + empty('No pickups in this span.');
  const body = tab === 'summary' ? waiverSummaryView(pool) : tab === 'hits' ? waiverHits(pool) : waiverHistory(pool, params);
  return head + body + waiverHow();
};

function claimRow(c) {
  const drop = c.dropped.length ? c.dropped.map(pid => esc(playerMeta(pid).name)).join(', ') : '<span class="dim">open spot</span>';
  return `<tr class="${youRow(c.ownerId)}">
    ${tdv(c.created, `<span class="nowrap">Wk ${c.week}</span><div class="dim xsmall">${esc(fmtDate(c.created))}</div>`, 'num')}
    <td>${mgrCell(c.ownerId)}</td>
    <td>${playerCell(c.pid, { pos: c.pos, after: c.left ? ` <span class="pl-left">${c.left.type === 'traded' ? '&harr;' : '&#10005;'}</span>` : '' })}</td>
    <td class="small muted wrap" style="max-width:180px">${drop}</td>
    ${tdv(c.bid, c.type === 'waiver' ? (c.bid ? `<span class="gold-t">$${c.bid}</span>` : '$0') : '<span class="dim">FA</span>')}
    ${tdv(c.pts, `<strong>${n1(c.pts)}</strong> <span class="dim xsmall">${c.started}/${c.weeks} wk</span>`)}
    ${tdv(WAIVER_ORDER.indexOf(c.tier), waiverChip(c.tier), '')}
  </tr>`;
}

function waiverHistory(pool, params) {
  const owners = Array.from(new Set(pool.map(c => c.ownerId).filter(Boolean))).sort((a, b) => mgr(a).name.localeCompare(mgr(b).name));
  const fm = params.mgr && owners.indexOf(params.mgr) !== -1 ? params.mgr : '';
  const type = params.type === 'waiver' || params.type === 'free_agent' ? params.type : '';
  const grade = WAIVER_TIERS[params.grade] ? params.grade : '';
  const list = pool.filter(c => (!fm || c.ownerId === fm) && (!type || c.type === type) && (!grade || c.tier === grade));
  const me = viewerId();
  return `<div class="toolbar">
      ${me && owners.indexOf(me) !== -1 ? `<a class="chip ${fm === me ? 'active' : ''}" href="${hrefWith('waivers', Object.assign({}, params, { mgr: fm === me ? '' : me }))}">My claims</a>` : ''}
      <select class="select" data-param="mgr"><option value="">All teams</option>${owners.map(o => `<option value="${esc(o)}" ${fm === o ? 'selected' : ''}>${esc(mgr(o).name)}</option>`).join('')}</select>
      <select class="select" data-param="type"><option value="">All types</option><option value="waiver" ${type === 'waiver' ? 'selected' : ''}>Waiver</option><option value="free_agent" ${type === 'free_agent' ? 'selected' : ''}>Free agent</option></select>
      <select class="select" data-param="grade"><option value="">All grades</option>${WAIVER_ORDER.map(k => `<option value="${k}" ${grade === k ? 'selected' : ''}>${WAIVER_TIERS[k].label}</option>`).join('')}</select>
      <span class="small muted">${list.length.toLocaleString()} pickups</span>
    </div>
    ${table([{ label: 'When', num: 1 }, { label: 'Team', sort: 'text' }, { label: 'Added', sort: 'text' }, { label: 'Dropped', sort: 'text' },
      { label: 'FAAB', num: 1 }, { label: 'Starter Pts', num: 1, title: 'Points scored in your starting lineup while on your roster, and weeks started / rostered' },
      { label: 'Grade', num: 1 }], list.map(claimRow), { sortable: true, limit: 50, more: `Show all ${list.length.toLocaleString()}` })}`;
}

function waiverSummaryView(pool) {
  const sumr = waiverSummary(pool).sort((a, b) => b.pts - a.pts);
  const rows = sumr.map(r => `<tr class="${youRow(r.ownerId)}">
    <td>${mgrCell(r.ownerId)}</td>
    <td class="num">${r.claims}</td><td class="num">${r.waivers}</td><td class="num">${r.fa}</td>
    ${tdv(r.spent, '$' + r.spent)}
    ${tdv(r.pts, `<strong>${n1(r.pts)}</strong>`)}
    ${tdv(r.perDollar == null ? -1 : r.perDollar, r.perDollar == null ? '<span class="dim">&mdash;</span>' : n1(r.perDollar))}
    <td class="num">${r.hits}</td>
    <td>${r.best && r.best.pts > 0 ? playerCell(r.best.pid, { pos: r.best.pos, after: ` <span class="dim small">${n1(r.best.pts)} &middot; ${esc(r.best.season)}</span>` }) : '<span class="dim">&mdash;</span>'}</td>
  </tr>`);
  const top = sumr[0], spender = sumr.slice().sort((a, b) => b.spent - a.spent)[0];
  const eff = sumr.filter(r => r.spent >= 20).sort((a, b) => b.perDollar - a.perDollar)[0];
  const busiest = sumr.slice().sort((a, b) => b.claims - a.claims)[0];
  return `<div class="grid g4">
      ${top ? statCard({ label: 'Most Starter Pts', value: n0(top.pts), sub: `<span>${esc(mgr(top.ownerId).name)}</span>${youBadge(top.ownerId)}`, acc: 'green', you: isYou(top.ownerId) }) : ''}
      ${busiest ? statCard({ label: 'Busiest', value: busiest.claims + ' adds', sub: `<span>${esc(mgr(busiest.ownerId).name)}</span>${youBadge(busiest.ownerId)}`, acc: 'blue', you: isYou(busiest.ownerId) }) : ''}
      ${spender ? statCard({ label: 'Biggest Spender', value: '$' + spender.spent, sub: `<span>${esc(mgr(spender.ownerId).name)}</span>${youBadge(spender.ownerId)}`, acc: 'amber', you: isYou(spender.ownerId) }) : ''}
      ${eff ? statCard({ label: 'Best Value', value: n1(eff.perDollar) + ' pts/$', sub: `<span>${esc(mgr(eff.ownerId).name)}</span>${youBadge(eff.ownerId)}`, acc: 'teal', you: isYou(eff.ownerId) }) : ''}
    </div>
    ${section('Team Summary', table([{ label: 'Team', sort: 'text' }, { label: 'Adds', num: 1 }, { label: 'Waiver', num: 1 }, { label: 'FA', num: 1 },
      { label: 'FAAB', num: 1 }, { label: 'Starter Pts', num: 1 }, { label: 'Pts / $', num: 1 },
      { label: 'Hits', num: 1, title: 'Great Adds and Jackpots' }, 'Best pickup'], rows, { sortable: true }))}
    ${section('Biggest Bids', table([{ label: 'When', num: 1 }, 'Team', 'Added', 'Dropped', { label: 'FAAB', num: 1 }, { label: 'Starter Pts', num: 1 }, { label: 'Grade', num: 1 }],
      pool.filter(c => c.bid > 0).sort((a, b) => b.bid - a.bid).slice(0, 15).map(claimRow)))}`;
}

function waiverHits(pool) {
  const top = pool.slice().sort((a, b) => b.pts - a.pts).slice(0, 30);
  return section('Best Pickups', table([{ label: 'When', num: 1 }, 'Team', 'Added', 'Dropped', { label: 'FAAB', num: 1 },
    { label: 'Starter Pts', num: 1 }, { label: 'Grade', num: 1 }], top.map(claimRow), { limit: 15 }),
    { sub: 'The pickups that put the most points in a starting lineup.' });
}

function waiverHow() {
  return section('How Pickups Are Graded', `<div class="card small" style="line-height:1.7;color:var(--ink-2)">
    <p style="margin-top:0">Each player added off waivers or free agency is followed from that week until he leaves the roster.
      Only weeks he was in the starting lineup count; bench points don’t win games.</p>
    <p style="margin-bottom:0"><strong>Jackpot</strong>: 75+ starter points. <strong>Great Add</strong>: 40+. <strong>Good Add</strong>: 15+.
      <strong>Paid Up</strong>: 15&ndash;40 but cost $15 or more. <strong>Depth</strong>: under 15, cheap or free.
      <strong>Miss</strong>: under 15 after real FAAB. <strong>Too Soon</strong>: hasn’t played a week for you yet.
      The live season’s grades fill in as the weeks go by.</p></div>`, { id: 'waiverHow' });
}

/* ================================= DRAFT =========================== */
views.draft = params => {
  const list = MODEL.seasons.filter(s => s.draft && s.draft.picks.length).slice().reverse();
  if (!list.length) return empty('No completed drafts yet.');
  const season = params.season && list.find(s => s.season === params.season) ? params.season : list[0].season;
  const s = list.find(x => x.season === season);
  const tab = ['summary', 'managers'].indexOf(params.tab) !== -1 ? params.tab : 'board';
  const drafts = getDrafts();
  const d = drafts[season];
  const head = `${seasonPills('draft', { tab: params.tab }, list, season)}
    ${learn(`Grades are hindsight: what each pick produced over a replacement-level player, against what that draft slot usually returns here. <a href="${hrefWith('draft', Object.assign({}, params, { focus: 'draftHow' }))}">How it works</a>`)}
    ${tabs('draft', { season }, [['board', 'Draft Board'], ['managers', 'By Manager'], ['summary', 'Report Cards']], tab)}`;
  return head + (tab === 'summary' ? draftSummaryView(s, d, drafts) : draftBoard(s, d, tab === 'managers')) + draftHow();
};

function pickLabel(p, teams) {
  const inRound = p.pick - (p.round - 1) * teams;
  return p.round + '.' + String(inRound).padStart(2, '0');
}

function draftBoard(s, d, byManager) {
  const picks = d ? d.picks : s.draft.picks;
  const teams = s.numTeams || s.teams.length;
  const slots = Array.from(new Set(picks.map(p => p.slot))).sort((a, b) => a - b);
  const rosterAt = {};
  picks.forEach(p => { if (rosterAt[p.slot] == null) rosterAt[p.slot] = p.rosterId; });
  const rounds = Array.from(new Set(picks.map(p => p.round))).sort((a, b) => a - b);
  const cell = {};
  rounds.forEach(r => { cell[r] = {}; picks.filter(p => p.round === r).forEach(p => { cell[r][p.slot] = p; }); });
  const head = slots.map(sl => {
    const t = s.byRoster[rosterAt[sl]];
    return `<th>${t ? `<a href="#/manager?id=${encodeURIComponent(t.ownerId)}">${esc(mgr(t.ownerId).name)}</a>${isYou(t.ownerId) ? '<span class="you-badge">YOU</span>' : ''}` : 'Slot ' + sl}</th>`;
  }).join('');
  const body = rounds.map(r => `<tr><th class="dround">${r}</th>${slots.map(sl => {
    const p = cell[r][sl];
    if (!p) return '<td></td>';
    const t = s.byRoster[p.rosterId];
    const gcls = p.grade ? 'gr-' + p.grade[0].toLowerCase() : '';
    return `<td><div class="dcell ${gcls} ${t && isYou(t.ownerId) ? 'mine' : ''}" data-pos="${esc(p.pos || p.position)}" data-name="${esc(String(p.player).toLowerCase())}"
      title="${esc(p.player)}${p.pts != null ? ` · ${n1(p.pts)} pts` : ''}${p.surplus != null ? ` · ${signed(p.surplus, n0)} vs slot` : ''}">
      <div class="dtop"><span class="dpick">${pickLabel(p, teams)}${p.keeper ? ' <span class="dkeep">K</span>' : ''}</span>${p.grade ? gradeLetter(p.grade) : ''}</div>
      <div class="dname">${esc(p.player)}</div>
      <div class="dmeta"><span>${posBadge(p.pos || p.position)} ${esc(p.team)}</span><span>${p.pts != null ? n0(p.pts) : ''}</span></div>
    </div></td>`;
  }).join('')}</tr>`).join('');
  const cards = byManager ? slots.map(sl => {
    const t = s.byRoster[rosterAt[sl]];
    const mine = picks.filter(p => p.slot === sl).sort((a, b) => a.pick - b.pick);
    const r = d && d.byRoster[rosterAt[sl]];
    return `<div class="card ${t && isYou(t.ownerId) ? 'you' : ''}" style="${t && isYou(t.ownerId) ? 'border-color:var(--blue)' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">${t ? mgrCell(t.ownerId, 'Draft slot ' + sl) : 'Slot ' + sl}
        ${r && r.letter ? gradeLetter(r.letter, true) : ''}</div>
      <ol class="dlist">${mine.map(p => `<li class="dcell-li" data-pos="${esc(p.pos || p.position)}" data-name="${esc(String(p.player).toLowerCase())}">
        <span class="dp">${pickLabel(p, teams)}</span>${posBadge(p.pos || p.position)}<span class="dn">${esc(p.player)}${p.keeper ? ' <span class="dkeep">K</span>' : ''}</span>
        <span class="dim small">${p.pts != null ? n0(p.pts) : ''}</span>${p.grade ? gradeLetter(p.grade) : ''}</li>`).join('')}</ol>
    </div>`;
  }).join('') : '';
  after(host => {
    const tools = $('#draftTools', host);
    if (!tools) return;
    const search = $('#draftSearch', host), count = $('#draftCount', host);
    const apply = () => {
      const pos = tools.dataset.pos || 'ALL';
      const q = (search.value || '').trim().toLowerCase();
      const items = $$('.dcell, .dcell-li', host);
      let shown = 0;
      items.forEach(el => {
        const hit = (pos === 'ALL' || el.dataset.pos === pos) && (!q || el.dataset.name.indexOf(q) !== -1);
        el.classList.toggle('dim', !hit);
        if (hit) shown++;
      });
      count.textContent = pos === 'ALL' && !q ? '' : `${shown} of ${items.length} picks`;
    };
    tools.addEventListener('click', e => {
      const b = e.target.closest('.chip[data-pos]');
      if (!b) return;
      tools.dataset.pos = b.dataset.pos;
      $$('.chip[data-pos]', tools).forEach(x => x.classList.toggle('active', x === b));
      apply();
    });
    search.addEventListener('input', apply);
  });
  const keepers = picks.filter(p => p.keeper);
  return `<div class="toolbar" id="draftTools" data-pos="ALL">
      <div class="chips">${['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(k => `<button class="chip ${k === 'ALL' ? 'active' : ''}" data-pos="${k}">${k === 'ALL' ? 'All' : k}</button>`).join('')}</div>
      <input id="draftSearch" class="input" type="search" placeholder="Find a player…" autocomplete="off" aria-label="Find a player in this draft">
      <span class="small muted" id="draftCount"></span>
    </div>
    ${byManager ? `<div class="grid dmgrs">${cards}</div>`
      : `<div class="dboard-wrap"><table class="dboard"><thead><tr><th class="dround">Rd</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`}
    <p class="note">${esc(String(s.draft.rounds))}-round ${esc(s.draft.type)} draft${s.draftStart ? ' on ' + esc(fmtDate(s.draftStart)) : ''}. Card colour is the hindsight grade;
      the number is regular-season points scored while rostered${d && d.provisional ? ` (season in progress, grades are provisional)` : ''}. Kickers and defenses aren’t graded.</p>
    ${keepers.length ? section('Keepers', table(['Manager', 'Player', { label: 'Round', num: 1 }, { label: 'Grade', num: 1 }], keepers.map(p => {
      const t = s.byRoster[p.rosterId];
      return `<tr class="${t ? youRow(t.ownerId) : ''}"><td>${t ? mgrCell(t.ownerId) : '?'}</td><td>${playerCell(p.playerId, { pos: p.pos, meta: { name: p.player, pos: p.pos } })}</td>
        <td class="num">Rd ${p.round}</td><td class="num">${gradeLetter(p.grade)}</td></tr>`;
    }))) : ''}`;
}

function draftSummaryView(s, d, drafts) {
  if (!d) return empty('No grades for this draft.');
  const teams = d.teams;
  const rows = Object.values(d.byRoster).filter(r => r.gpa != null).sort((a, b) => b.gpa - a.gpa).map((r, i) => `<tr class="${youRow(r.ownerId)}">
    <td class="rank">${i + 1}</td><td>${mgrCell(r.ownerId)}</td>
    ${tdv(r.gpa, gradeLetter(r.letter))}
    ${tdv(r.gpa, r.gpa.toFixed(2))}
    ${tdv(r.surplus, colorNum(r.surplus, n0))}
    <td>${r.steal ? playerCell(r.steal.playerId, { pos: r.steal.pos, meta: { name: r.steal.player, pos: r.steal.pos }, after: ` <span class="dim small">${pickLabel(r.steal, teams)} ${gradeLetter(r.steal.grade)}</span>` }) : ''}</td>
    <td>${r.bust ? playerCell(r.bust.playerId, { pos: r.bust.pos, meta: { name: r.bust.player, pos: r.bust.pos }, after: ` <span class="dim small">${pickLabel(r.bust, teams)} ${gradeLetter(r.bust.grade)}</span>` }) : ''}</td>
  </tr>`);
  const graded = d.picks.filter(p => p.grade);
  const pr = p => `<tr><td class="num">${pickLabel(p, teams)}</td><td>${playerCell(p.playerId, { pos: p.pos, meta: { name: p.player, pos: p.pos } })}</td>
    <td>${mgrLink(ownerOfRoster(s.season, p.rosterId))}</td><td class="num">${n1(p.pts)}</td><td class="num">${colorNum(p.surplus, n0)}</td><td class="num">${gradeLetter(p.grade)}</td></tr>`;
  const steals = graded.slice().sort((a, b) => b.surplus - a.surplus).slice(0, 8).map(pr);
  const busts = graded.filter(p => p.round <= 6).sort((a, b) => a.surplus - b.surplus).slice(0, 8).map(pr);
  const done = MODEL.completedSeasons.map(x => x.season).filter(x => drafts[x]);
  const allTime = draftSummary(drafts, done).sort((a, b) => b.gpa - a.gpa).map((r, i) => `<tr class="${youRow(r.ownerId)}">
    <td class="rank">${i + 1}</td><td>${mgrCell(r.ownerId)}</td><td class="num">${r.drafts}</td>
    ${tdv(r.gpa, gradeLetter(r.letter))}${tdv(r.gpa, r.gpa.toFixed(2))}${tdv(r.surplus, colorNum(r.surplus, n0))}</tr>`);
  const pH = [{ label: 'Pick', num: 1 }, 'Player', 'Manager', { label: 'Pts', num: 1 }, { label: 'vs Slot', num: 1 }, { label: 'Grade', num: 1 }];
  return `${section(`${esc(s.season)} Report Cards${d.provisional ? ' <span class="tag">so far</span>' : ''}`, table(['#', { label: 'Manager', sort: 'text' }, { label: 'Grade', num: 1 }, { label: 'GPA', num: 1 },
      { label: 'vs Slot', num: 1, title: 'Points over replacement above what those draft slots usually return, summed' }, 'Best pick', 'Biggest miss (Rd 1–6)'], rows, { sortable: true }), { tight: true })}
    <div class="grid g2 gap-lg">
      ${section('Steals', table(pH, steals))}
      ${section('Busts', table(pH, busts), { sub: '' })}
    </div>
    ${done.length ? section('All-Time Draft Report Card', table(['#', { label: 'Manager', sort: 'text' }, { label: 'Drafts', num: 1 }, { label: 'Grade', num: 1 },
      { label: 'GPA', num: 1 }, { label: 'vs Slot', num: 1 }], allTime, { sortable: true }), { sub: `Finished seasons: ${done.join(', ')}.` }) : ''}`;
}

function draftHow() {
  return section('How Draft Grades Work', `<div class="card small" style="line-height:1.7;color:var(--ink-2)">
    <p style="margin-top:0">Each pick is scored on what the player produced in the regular season while on a roster,
      minus what a replacement-level player at his position produced (the first player past the league’s starters: about the 12th QB,
      the 29th RB, the 30th WR, the 13th TE). That’s his value over replacement.</p>
    <p>Then it’s compared with what that draft slot usually returns in this league, from every finished draft: a smoothed curve,
      so a first-rounder has to be great to grade well and a 12th-rounder only has to be useful. The gap maps to a letter, A+ to F.
      Kickers and defenses aren’t graded.</p>
    <p style="margin-bottom:0">A season in progress is graded on the weeks played so far, scaled toward a full season, and will move a lot.
      Grades are hindsight on purpose: they say how the pick turned out, not whether it was a good bet on draft day.</p></div>`, { id: 'draftHow' });
}

/* ================================ ROSTERS ========================== */
views.rosters = async params => {
  const s = MODEL.liveSeason || MODEL.currentSeason;
  if (!s || !s.teams.some(t => (t.players || []).length)) return empty('Rosters appear once the draft is done.');
  await loadValues();
  const scope = params.scope === 'starters' ? 'starters' : 'total';
  const outlook = MODEL.liveSeason && MODEL.currentWeek && MODEL.currentWeek < s.playoffStart ? await getOutlook().catch(() => null) : null;
  if (!VALUES.live) return empty(`Today’s ${fcLink()} values couldn’t load. Try the refresh button in a minute.`);
  const wk = MODEL.currentWeek;
  const posOf = MODEL.posOf;

  const teams = s.teams.map(t => {
    const lu = wk && s.lineups[wk] && s.lineups[wk][t.rosterId];
    const starters = new Set(((lu && lu.st && lu.st.length) ? lu.st : t.starters).filter(p => p && p !== '0'));
    // "was" is 30 days ago, from FantasyCalc's own 30-day trend
    const players = (t.players || []).map(pid => ({
      pid, pos: posOf(pid), v: valueNow(pid), was: valueNow(pid) - trendNow(pid), starter: starters.has(pid)
    })).sort((a, b) => b.v - a.v);
    const total = sum(players.map(p => p.v));
    const st = sum(players.filter(p => p.starter).map(p => p.v));
    const byPos = {};
    ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
      byPos[pos] = sum(players.filter(p => p.pos === pos && (scope === 'total' || p.starter)).map(p => p.v));
    });
    const odds = outlook ? outlook.sim.teams[t.rosterId] : null;
    return { t, players, total, st, bench: total - st, byPos, odds, change: sum(players.map(p => p.v - p.was)) };
  }).sort((a, b) => (scope === 'starters' ? b.st - a.st : b.total - a.total));

  const tierOf = x => !x.odds ? null : x.odds.playoffs >= 0.7 ? ['Contender', 'green'] : x.odds.playoffs >= 0.4 ? ['In the Hunt', 'blue']
    : x.odds.playoffs >= 0.2 ? ['Bubble', 'amber'] : ['Long Shot', 'red'];
  const maxV = Math.max.apply(null, teams.map(x => scope === 'starters' ? x.st : x.total).concat([1]));

  const me = viewerId();
  const mine = teams.find(x => isYou(x.t.ownerId));
  let you = '';
  if (mine) {
    const moves = mine.players.filter(p => p.was || p.v).map(p => Object.assign({ d: p.v - p.was }, p));
    const up = moves.slice().sort((a, b) => b.d - a.d).filter(p => p.d > 0).slice(0, 3);
    const down = moves.slice().sort((a, b) => a.d - b.d).filter(p => p.d < 0).slice(0, 3);
    const li = p => `<div class="root-row">${playerCell(p.pid, { pos: p.pos, face: false })}<span class="${p.d > 0 ? 'pos-t' : 'neg-t'} strong">${signed(p.d, n0)}</span></div>`;
    you = `<div class="card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <div class="stat-label">Your last 30 days &middot; market value</div>
        <div class="${mine.change >= 0 ? 'pos-t' : 'neg-t'} strong" style="font-size:20px">${signed(mine.change, n0)}</div></div>
      <div class="small muted">Players on your roster now: how their ${fcLink()} value moved over the last 30 days.</div>
      <div class="grid g2" style="margin-top:8px"><div><div class="small strong pos-t">Gained</div>${up.map(li).join('') || '<div class="dim small">Nobody up.</div>'}</div>
        <div><div class="small strong neg-t">Lost</div>${down.map(li).join('') || '<div class="dim small">Nobody down.</div>'}</div></div></div>`;
  }

  const rows = teams.map((x, i) => {
    const tier = tierOf(x);
    const v = scope === 'starters' ? x.st : x.total;
    return `<details class="tcard" id="ros-${x.t.rosterId}">
      <summary>
        <span class="strong" style="width:20px;color:var(--ink-4)">${i + 1}</span>
        <div class="tcard-main">
          <div class="tcard-title">${esc(mgr(x.t.ownerId).name)}${youBadge(x.t.ownerId)} ${tier ? lbl(tier[0], tier[1]) : ''}</div>
          <div class="tcard-gist">${x.odds ? `${pct0(x.odds.playoffs)} playoff odds &middot; ` : ''}Starters ${n0(x.st)} &middot; Bench ${n0(x.bench)} &middot; 30d ${signed(x.change, n0)}</div>
        </div>
        <div style="flex:0 0 38%;max-width:360px" class="barcell"><div class="bar blue" style="flex:1 1 auto"><i style="width:${(v / maxV * 100).toFixed(1)}%"></i></div>
          <strong style="min-width:58px;text-align:right">${n0(v)}</strong></div>
        ${CHEV}
      </summary>
      <div class="tcard-body">${table(['Player', { label: 'Role', num: 0 }, { label: 'Value', num: 1 }, { label: '30d', num: 1 }],
        x.players.map(p => `<tr><td>${playerCell(p.pid, { pos: p.pos })}</td><td>${p.starter ? lbl('Starter', 'blue') : '<span class="dim small">Bench</span>'}</td>
          <td class="num">${p.v ? n0(p.v) : '<span class="dim">&mdash;</span>'}</td><td class="num">${p.v || p.was ? colorNum(p.v - p.was, n0) : ''}</td></tr>`))}
        <p class="note"><a href="#/manager?id=${encodeURIComponent(x.t.ownerId)}">Profile &rarr;</a></p></div>
    </details>`;
  }).join('');

  // positional strengths, with each team's rank at each position
  const POS = ['QB', 'RB', 'WR', 'TE'];
  const rankAt = {};
  POS.forEach(pos => {
    teams.slice().sort((a, b) => b.byPos[pos] - a.byPos[pos]).forEach((x, i) => { (rankAt[x.t.rosterId] = rankAt[x.t.rosterId] || {})[pos] = i + 1; });
  });
  const n = teams.length;
  const heat = rk => {
    const t = (rk - 1) / Math.max(1, n - 1);
    return t <= 0.5 ? `background:rgba(34,197,94,${(0.38 - t * 0.6).toFixed(2)})` : `background:rgba(239,68,68,${((t - 0.5) * 0.7).toFixed(2)})`;
  };
  const posRows = teams.map(x => `<tr class="${youRow(x.t.ownerId)}"><td>${mgrCell(x.t.ownerId)}</td>${POS.map(pos =>
    `<td class="heat" data-v="${x.byPos[pos]}" style="${heat(rankAt[x.t.rosterId][pos])}">${n0(x.byPos[pos])} <span class="dim xsmall">#${rankAt[x.t.rosterId][pos]}</span></td>`).join('')}</tr>`);

  return `${you}
    ${tabs('rosters', {}, [['total', 'Total roster'], ['starters', 'Starters only']], scope, 'scope')}
    ${section('Roster Values', rows, { tight: true, sub: `Market value of every player on each roster: ${fcLink()} redraft values (1 QB, 12 teams, PPR) as of ${esc(fmtValuesDate(VALUES.live.date))}.${outlook ? ' Tags come from the playoff odds on the Outlook page.' : ''} FantasyCalc ranks about 200 players; anyone past that, plus kickers and defenses, carries no value.` })}
    ${section('Positional Strengths', table([{ label: 'Team', sort: 'text' }].concat(POS.map(p => ({ label: p, num: 1 }))), posRows, { sortable: true }),
      { sub: `${scope === 'starters' ? 'Starters only' : 'Whole roster'}, ${fcLink()} value by position, with each team’s rank. Green is a strength, red a hole.` })}`;
};
