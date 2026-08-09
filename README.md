# The League of Ordinary Gentlemen

A static website for the league: standings, head-to-head records, champions, an all-time
record book, manager profiles and full draft history — going back to the league's first
season in 2022.

There is no server and no database. Every page is built in the browser from the **public
Sleeper API**, so the site updates itself as the season goes on. You never have to
re-upload data.

---

## Pages

| Page | What's on it |
|---|---|
| Home | League totals, reigning champion, all-time leaders, and a live playoff picture during the season |
| Standings | Final standings for any season, an interactive season race chart, and every week's scores |
| Playoffs | Real brackets with scores and seeds, championship and consolation sides |
| Champions | Trophy room, plus hardware counts for everyone |
| Head to Head | All-time grid; click any cell for every meeting between those two |
| Record Book | Highs, lows, blowouts, nail-biters, weekly crowns, Hall of Shame — filterable by manager and season |
| Managers | Career table with sorting; click a name for a full profile and career-form chart |
| Draft | Every draft board, first-round highlights, and keepers |
| Trades | Trade ledger with players/FAAB/picks, biggest waiver bids, and activity per manager |
| Money | Career winnings, buy-ins and net profit for everyone, plus each season's prize structure |

## Files

```
index.html          page shell + navigation
serve.bat           double-click to preview the site locally
assets/style.css    all styling
assets/data.js      config, Sleeper API calls, caching
assets/payouts.js   buy-ins and prize structure for each season
assets/model.js     all statistics are computed here
assets/charts.js    the SVG charts and their crosshair tooltip
assets/views.js     one function per page
assets/app.js       routing and startup
```

## Viewing it locally

Double-click `index.html`. That's it.

If your browser blocks the data request when opening the file directly, double-click
**`serve.bat`** instead — it starts a small local server and opens the site at
<http://localhost:8000>. Leave that window open while browsing, and close it when done.

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

The site keeps a 3-hour cache in each visitor's browser so repeat visits are instant. If
someone wants the very latest mid-game numbers, the **Force refresh data** link in the
footer clears it.

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
| Rename a page or reorder the menu | the `<nav>` block in `index.html` |
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
- **Head-to-head** is rebuilt game by game from regular-season matchups. Playoff games
  are excluded so the grid stays comparable across years.
- **Champions** come from the playoff bracket (the match flagged as the championship),
  with a fallback to the league's recorded winner.
- **Consolation champion** is the winner of the losers-bracket final. **Last place** is
  *not* taken from that bracket — its placings depend on league settings and routinely
  disagree with reality, so last place is simply the worst regular-season record.
- **Records** are calculated across every regular-season team-week in league history.

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

Results are cached in your browser for 3 hours so repeat visits load instantly. The
**Force refresh data** link in the footer clears that cache.

## Changing things

| What | Where |
|---|---|
| Colors, fonts, spacing | the `:root` variables at the top of `assets/style.css` |
| League ID (if you ever start a fresh league) | `CONFIG.leagueId` at the top of `assets/app.js` |
| How long data is cached | `CONFIG.cacheHours` in `assets/app.js` |
| Page order in the nav | the `<nav>` block in `index.html` |

Each page is a function in the `views` object in `app.js` that returns HTML. To add a
page, write `views.myPage = () => '...'` and add a matching `<a href="#/myPage">` link.

## Notes and limits

- Only seasons played **on Sleeper** are available. The league's Sleeper history starts
  in 2022; anything older would have to be entered by hand.
- The 2026 season shows as upcoming until the draft happens, at which point it starts
  populating on its own.
- Player names on the draft board come from the draft data itself, so no large player
  database needs to be downloaded.
