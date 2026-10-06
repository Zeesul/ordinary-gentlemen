# The League of Ordinary Gentlemen

A static website for the league: standings, head-to-head records, champions, an all-time
record book, manager profiles and full draft history — going back to the league's first
season in 2022.

There is no server and no database. Every page is built in the browser from the **public
Sleeper API**, so the site updates itself as the season goes on. You never have to
re-upload data.

---

## Pages

The menu runs down the left side (a slide-out drawer on phones). Pick yourself under
**Viewing as** and every page highlights you, adds a "your stats" line at the top, and
fills in the personal parts (your season history, your matchup, your playoff odds).
The choice is remembered in that browser only.

| Page | What's on it |
|---|---|
| Overview | Reigning champion, the live week's scores, headline stat cards, an all-time (or one-season) standings table with 18 sortable columns (efficiency, all-play, luck, max PF, consistency…), season history, 15 awards, trade highlights, best and worst weeks. The **Advanced** tab charts weekly scoring, weekly power rankings, each team's score distribution and year-over-year PPG |
| This Week | Every matchup with live scores, Sleeper projections and win odds; your lineup next to your opponent's, a "points left on your bench" check and free-agent upgrades; the weekly high-score bounty; recent moves. Tap any matchup for both lineups |
| Outlook | Playoff, bye and title odds from 10,000 simulations of the rest of the season, change since last week, your remaining schedule, a rooting guide for this week, and where your season could end up |
| Standings | Any season's standings with efficiency, all-play and luck, the season race chart (points, wins or power rank) and every week's scoreboard |
| Playoffs | Real brackets with scores and seeds, championship and consolation sides |
| Champions | Trophy room, each title team, and how everyone has finished |
| Managers | Career table, sortable; click a name for the full profile (record showcase, career form, season by season, trading, draft report cards, rivals, best/worst weeks, winnings, this season's moves) |
| Rosters | Every roster's market value, last 30 days of value for your team, and positional strengths |
| Head to Head | All-time grid (playoffs included); click any cell for every meeting |
| Trades | Every trade, graded (see below), filterable by manager, season and grade; a League Overview with each manager's trade record, a trade-partner grid and the most-traded players |
| Waivers | Every pickup graded on what it scored in your lineup; team summary, biggest bids, best pickups |
| Draft | Every draft board with hindsight grades on each pick, a by-manager view, report cards, steals and busts |
| Record Book | Highs, lows, blowouts, nail-biters, weekly crowns, Hall of Shame, filterable by manager and season |
| Money | Career winnings, buy-ins and net for everyone, plus each season's prize structure |

## Files

```
index.html                 page shell + sidebar menu
serve.bat                  double-click to preview the site locally
assets/style.css           all styling (colours are tokens at the top)
assets/data.js             config, Sleeper API calls, market values, caching
assets/payouts.js          buy-ins and prize structure for each season
assets/model.js            core statistics: standings, head-to-head, records, money
assets/analytics.js        efficiency, all-play, luck, power ranks, awards, odds, the playoff simulation
assets/grades.js           trade, waiver and draft grades
assets/charts.js           the SVG charts and their crosshair tooltip
assets/ui.js               shared pieces: tables, cards, pills, grade chips
assets/views-overview.js   Overview, This Week, Outlook
assets/views-league.js     Standings, Playoffs, Champions, Head to Head, Record Book, Managers, Money
assets/views-moves.js      Trades, Waivers, Draft, Rosters
assets/app.js              routing, startup, sidebar, sortable tables
assets/values-history.json weekly market values back to 2022 (see "Market values" below)
tools/build_values.py      rebuilds values-history.json
```

## Viewing it locally

Double-click **`serve.bat`**. It starts a small local server and opens the site at
<http://localhost:8000>. Leave that window open while browsing, and close it when done.

(Opening `index.html` directly mostly works too, but browsers block a page opened from a
file from reading other files next to it, so the trade grades lose their market-value
history that way.)

## Naming managers who left the league

When someone leaves, Sleeper erases them completely: the roster loses its owner, they
disappear from the members list, and even the draft board forgets who made their picks.
Their team still has a real record, so the site keeps it and calls it **Unknown (year)**.

You can name them. Open `assets/data.js`, find `MANAGER_OVERRIDES` near the top, and add
an entry. The key is the season plus that team's roster number — hover an Unknown manager
on the Managers page and it'll show you the exact key to use:

```js
const MANAGER_OVERRIDES = {
  '2022:5': { name: 'Danny', team: 'Danny Dynasty' },
  '2024:7': { name: 'Pat' },
};
```

If that person also played under a known Sleeper account in other years, add
`mergeWith: '<their sleeper user id>'` and both stints will combine into one manager.

---

## Publishing it to the web (GitHub + Cloudflare Pages, free)

The code lives in a GitHub repository; Cloudflare Pages serves it at **tloogff.com** and
redeploys automatically whenever the repo changes. No command line needed.

**1. Make a GitHub account.** Go to <https://github.com> and sign up if you haven't. Your
username becomes part of the web address, so pick something you don't mind sharing.

**2. Create the repository.** Click the **+** in the top right → **New repository**.

- **Repository name:** `ordinary-gentlemen` (this also becomes part of the address)
- **Visibility:** **Public** — required for free GitHub Pages
- Leave everything else alone and click **Create repository**

**3. Upload the site.** On the empty repo page, click **uploading an existing file**.
Open this folder in File Explorer and drag over:

- `index.html`
- the **`assets` folder itself** — drag the folder icon, not the files inside it
- `.nojekyll`

> **This is the one step that goes wrong.** If you open the `assets` folder and select the
> seven files inside, GitHub uploads them loose into the root and the site loads as plain
> unstyled text. Drag the *folder*. Before committing, check the file list on screen reads
> `assets/style.css`, `assets/data.js`, and so on. If it just says `style.css`, start the
> upload over.

You do **not** need to upload `serve.bat` or `README.md`, though they do no harm. Scroll
down and click **Commit changes**.

> If `.nojekyll` is hidden on your computer, open File Explorer → **View** → tick
> **Hidden items**. This file tells GitHub not to mangle folders starting with an
> underscore. The site works without it, but include it to be safe.

**4. Connect Cloudflare Pages.** The site lives at **tloogff.com**, served by Cloudflare
Pages, which watches the GitHub repo and republishes automatically on every commit.

1. Sign in at <https://dash.cloudflare.com> (free plan is plenty).
2. In the left sidebar go to **Workers & Pages** → **Create** → **Pages** tab →
   **Connect to Git**.
3. Authorize GitHub when prompted and pick the **ordinary-gentlemen** repository.
4. On the build screen, change nothing:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
5. Click **Save and Deploy**. A minute later the site is live at a
   `*.pages.dev` address.

**5. Attach the domain.** In the new Pages project, open the **Custom domains** tab →
**Set up a custom domain** → enter `tloogff.com`. Then do it once more for
`www.tloogff.com` so both forms work.

- If the domain was bought **through Cloudflare**, it's already in the account —
  Cloudflare creates the DNS records itself and the domain goes live in a few minutes.
- If it was bought **elsewhere** (Namecheap, GoDaddy…), Cloudflare first asks you to add
  the domain to your account and point the registrar's **nameservers** at the two it
  gives you. Change those at the registrar, wait for the confirmation email (minutes to
  a few hours), then the custom-domain step completes normally.

HTTPS is automatic — no certificate to manage.

**6. (Optional) turn off GitHub Pages** if you enabled it earlier, so there's only one
copy of the site: repo **Settings → Pages → Source: None**. The repo itself stays — it's
what Cloudflare deploys from.

---

## Maintaining the site

### During the season: nothing

Scores, standings, records, playoff brackets, trades and weekly prize money all read live
from Sleeper every time someone opens the page. You never upload results. The 2026 season
starts filling in by itself the moment the draft happens.

The site keeps a 3-hour cache of league history in each visitor's browser so repeat visits
are instant, and re-pulls the live season in the background every few minutes. The circular
**refresh** button at the top right reloads everything from Sleeper.

### Once a year: add the payouts

The only genuinely annual task. Open `assets/payouts.js` and add the new season's block
(see *Adding next season's payouts* below). If you forget, everything still works — the
Money page just won't show that year.

### When someone joins or leaves

Nothing to do. New managers appear automatically. Someone who leaves keeps their history,
though Sleeper erases their name — see *Naming managers who left the league* below.

### How to make any change

1. Edit the file on your computer and check it locally with `serve.bat`.
2. In your GitHub repo, click the file → the pencil icon → paste the new contents →
   **Commit changes**. Or use **Add file → Upload files** to replace it wholesale.
3. Cloudflare notices the commit and redeploys on its own — about a minute. Hard-refresh
   (**Ctrl+Shift+R**) to see it live at tloogff.com. You can watch the deploy under
   **Workers & Pages → your project → Deployments**.

That last step matters: browsers cache the JavaScript aggressively, so a normal refresh
will often show you the old version.

### Common edits

| You want to | Do this |
|---|---|
| Add this year's prize money | `assets/payouts.js` |
| Name a departed manager | `MANAGER_OVERRIDES` in `assets/data.js` |
| Change colors or fonts | the `:root` block at the top of `assets/style.css` |
| Rename a page or reorder the menu | the sidebar `<nav>` block in `index.html` (and `TITLES` in `assets/app.js`) |
| Tune trade/waiver/draft grades | `TRADE_BANDS`, `waiverTier` and `DRAFT_BANDS` in `assets/grades.js` |
| Start a brand-new league | `CONFIG.leagueId` in `assets/data.js` |
| Change how long data is cached | `CONFIG.cacheHours` in `assets/data.js` |

### The site loads as plain text with no colors

The CSS and JavaScript aren't being found. Almost always this means the `assets` folder
got flattened during upload — the files are sitting in the repo root instead of inside
`assets/`. Open your repo and look: if you see `style.css` and `data.js` at the top level
rather than a single `assets` folder, that's it.

Fix it by re-uploading the `assets` **folder** (see step 3 above), then deleting the loose
copies from the root so you don't edit the wrong file later.

To confirm what the live site can actually see, open the site, press **F12**, and look at
the **Network** tab after a refresh — anything in red with a 404 is a file the browser
couldn't find, and the path it tried tells you where it expected the file to be.

### If something breaks

Press **F12** in your browser and look at the **Console** tab — errors show up there in
red and usually name the file and line. The most common causes are a missing comma in
`payouts.js` or a typo in `data.js`. Reverting your last commit on GitHub (click the
file's **History**, open the previous version, copy it back) always gets you working
again.

---

## How it works

`app.js` starts at the current league ID and follows Sleeper's `previous_league_id`
links backwards to find every season the league has ever played. For each season it
pulls managers, rosters, weekly matchups, the playoff bracket and the draft board, then
computes everything else locally:

- **Standings** come from each season's final roster records, sorted by wins then points.
- **Head-to-head** is rebuilt game by game from matchups, with playoff games taken from the
  championship bracket.
- **Champions** come from the playoff bracket (the match flagged as the championship),
  with a fallback to the league's recorded winner.
- **Consolation champion** is the winner of the losers-bracket final. **Last place** is
  *not* taken from that bracket — its placings depend on league settings and routinely
  disagree with reality, so last place is simply the worst regular-season record.
- **Records** are calculated across every regular-season team-week in league history.
- **Efficiency** compares each week's score with the best lineup that roster could have set,
  filling every slot with its highest scorer who's eligible.
- **All-play** is each team's record against every other team's score, every week.
- **Luck** is wins while scoring under the weekly median minus losses while scoring over it.
- **Win odds** treat each team's final score as points so far plus Sleeper's projection for
  whoever hasn't played, give or take the league's usual week-to-week swing.
- **Playoff odds** simulate the rest of the season 10,000 times from each team's scoring so
  far, pulled toward its projected lineup early in the year.

### Adding next season's payouts

Every year, open `assets/payouts.js` and add a block for the new season:

```js
'2027': {
  buyIn: 150,
  places: { champion: 1000, runnerUp: 300, third: 150, consolation: 50 },
  weeklyHigh: { amount: 25, from: 1, to: 14 }   // optional
},
```

The Money page checks each season's prizes against what the league collected
(`buyIn × teams`) and shows a green **Balances** tag or a red **Off by $X** warning, so a
structure that doesn't add up can't quietly slip through. Weekly high-score prizes are
awarded as the season is played, not at the end.

Prize names map to results the site already knows: `champion` and `runnerUp` come from the
championship game, `third` from the third-place game, and `consolation` from the losers
bracket final.

### Two win percentages

Raw win % punishes nobody for a small sample, which makes it misleading: a manager with
one strong 14-game season can outrank someone who has been solid for four years.

So the site also computes **adjusted win %**, which regresses every record toward .500 by
14 games (roughly one season). Play a lot and your adjusted number converges on your real
one; play a little and it stays near the middle until you've earned otherwise. Rankings
sort on the adjusted figure, both are always shown, and the "best win %" honour on the
home page requires at least two completed seasons.

Those two numbers are set by `MIN_SEASONS` and `REGRESS` at the top of `buildModel()` in
`assets/model.js` if you ever want to tune them.

### Playoff games in career records

Career records, win percentages and head-to-head include playoff games. Sleeper's matchup
data doesn't mark which games were playoffs, so they're rebuilt from the championship
bracket: each decided match, scored from its round's week. Consolation-bracket games don't
count. Points-for, PPG and the Record Book stay regular season.

### Trade grades

Every trade is measured three ways, the same three the site this was modelled on uses:

1. **Value at trade**: what each side received, at market value the week the trade went
   through (DynastyProcess's weekly trade values, built from FantasyPros rankings).
2. **Value change**: how those values moved afterwards, to this week for the live season and
   to the end of the season for past ones.
3. **Starter points**: what the players scored in the receiving team's starting lineup, from
   the trade until they left that roster. Bench points don't count; playoff weeks count while
   the team was still playing for the title or third place.

Finished seasons are graded on starter points; the live season is graded on current market
value until it ends. The gap between the two sides maps to Even, Slight Edge, Good Win,
Clear Win or Fleece (and the matching loss on the other side). The cut-offs are
`TRADE_BANDS` in `assets/grades.js`. FAAB is shown but not valued.

Waiver pickups are graded on the starter points they produced for you against the FAAB paid
(`waiverTier` in `assets/grades.js`). Draft picks are graded in hindsight: points over a
replacement-level player at the position, against what that draft slot usually returns in
this league (`DRAFT_BANDS`).

### Market values

DynastyProcess publishes new values every week. The site reads this week's file straight
from GitHub, and `assets/values-history.json` holds every in-season week back to 2022 so a
trade can be priced the week it happened. Trades made after that file was built look up
their week on GitHub automatically and remember it, so the file never has to be updated.
If you ever want to refresh it anyway (once a season is plenty), run
`python3 tools/build_values.py` and commit the result. The values are dynasty values, so
young players carry a premium a redraft league wouldn't pay; that's why finished seasons are
graded on points instead.

### Live scores and "is this week over?"

History is cached for 3 hours, but the live season is re-pulled in the background on every
visit after 3 minutes, so scores stay current. Sleeper's own week counter can lag a full day
behind Monday night; the site also reads Sleeper's NFL schedule, which marks every game
`complete`, and treats a week as final the moment its last game ends. The same schedule tells
the win odds which players are still playing.

Results are cached in your browser for 3 hours so repeat visits load instantly. The
**refresh** button at the top right clears that cache.

## Changing things

| What | Where |
|---|---|
| Colors, fonts, spacing | the `:root` variables at the top of `assets/style.css` |
| League ID (if you ever start a fresh league) | `CONFIG.leagueId` at the top of `assets/app.js` |
| How long data is cached | `CONFIG.cacheHours` in `assets/app.js` |
| Page order in the nav | the sidebar `<nav>` block in `index.html` |

Each page is a function in the `views` object (in one of the `views-*.js` files) that returns
HTML. To add a page, write `views.myPage = () => '...'`, add a matching
`<a class="nav-link" href="#/myPage" data-route="myPage">` link and a title in `TITLES`.

## Notes and limits

- Only seasons played **on Sleeper** are available. The league's Sleeper history starts
  in 2022; anything older would have to be entered by hand.
- The 2026 season shows as upcoming until the draft happens, at which point it starts
  populating on its own.
- Player names on the draft board come from the draft data itself, so no large player
  database needs to be downloaded.
