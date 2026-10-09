#!/usr/bin/env python3
"""
Saves today's FantasyCalc trade values and Sleeper's rest-of-season
projections into assets/values/, where the site reads them for trade grades
and roster values.

    python3 tools/update_values.py

You don't need to run this yourself: a GitHub Action
(.github/workflows/fantasycalc-values.yml) runs it every morning and commits
the result, which Cloudflare then deploys like any other commit.

Why a saved copy instead of calling FantasyCalc from the browser: FantasyCalc's
terms ask sites to cache its API on their own server and pull it about once a
day. League mates' browsers only ever read the copy in this repo.

Format: redraft, 1 QB, 12 teams, full PPR, no TE premium, matching the league's
Sleeper settings. Change FORMAT below if the league ever changes.

Writes:
  assets/values/current.json           today's value and FantasyCalc's 30-day
                                       trend for every player, by Sleeper id
  assets/values/history-<season>.json  one snapshot a day from August through
                                       January, for trade-day and end-of-season
                                       values (FantasyCalc only publishes
                                       today's numbers, so this is the history)
  assets/values/projections.json       Sleeper's projected points for every
                                       remaining regular-season week of the
                                       live season, scored with the league's own
                                       settings (live trades are graded on
                                       points so far plus these)

The league id is read from CONFIG.leagueId in assets/data.js, so this always
follows whatever league the site itself points at.

Standard library only. Needs network access to api.fantasycalc.com and
api.sleeper.app. If one source fails, the other is still saved and the
script exits with an error so the GitHub Action reports it.
"""
import datetime
import glob
import json
import os
import re
import sys
import urllib.parse
import urllib.request

API = 'https://api.fantasycalc.com/values/current'
FORMAT = {'isDynasty': 'false', 'numQbs': '1', 'numTeams': '12', 'ppr': '1', 'tep': 'none'}
# The same settings, as they're recorded in the saved files.
FORMAT_NOTE = {'isDynasty': False, 'numQbs': 1, 'numTeams': 12, 'ppr': 1, 'tep': 'none'}
SOURCE = 'FantasyCalc (https://fantasycalc.com), /values/current'
USER_AGENT = 'tloogff.com league site (github.com/Zeesul/ordinary-gentlemen)'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'values')
DATA_JS = os.path.join(ROOT, 'assets', 'data.js')
MIN_PLAYERS = 100   # fewer than this means something is wrong upstream
SLEEPER = 'https://api.sleeper.app'
PROJ_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']


def get_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.load(res)


def fetch():
    """Today's values as (sleeper_id, value, trend_30_day) rows."""
    data = get_json(API + '?' + urllib.parse.urlencode(FORMAT))
    rows, seen = [], set()
    for r in data if isinstance(data, list) else []:
        p = r.get('player') or {}
        sid = str(p.get('sleeperId') or '').strip()
        value = r.get('value')
        if not sid or sid in seen or not isinstance(value, (int, float)) or value <= 0:
            continue
        seen.add(sid)
        rows.append((sid, int(round(value)), int(round(r.get('trend30Day') or 0))))
    if len(rows) < MIN_PLAYERS:
        raise RuntimeError(f'FantasyCalc returned {len(rows)} usable players; keeping the saved values as they are.')
    return rows


def in_history_window(day):
    """Trades happen from the August draft through the January championship."""
    return day.month >= 8 or day.month == 1


def season_of(day):
    return day.year if day.month >= 8 else day.year - 1


def read_json(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def write_json(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, separators=(',', ':'))
        f.write('\n')
    os.replace(tmp, path)


def add_snapshot(rows, day):
    """Put today's values into this season's history file (replacing today's
    snapshot if the script already ran today)."""
    season = str(season_of(day))
    path = os.path.join(OUT, f'history-{season}.json')
    hist = read_json(path) or {'source': SOURCE, 'format': FORMAT_NOTE, 'season': season, 'dates': [], 'v': {}}
    dates, vals = hist['dates'], hist['v']
    iso = day.isoformat()
    if iso in dates:
        i = dates.index(iso)
    else:
        dates.append(iso)
        dates.sort()
        i = dates.index(iso)
        for arr in vals.values():
            arr.insert(i, 0)
    today = {sid: value for sid, value, _ in rows}
    for sid in today:
        if sid not in vals:
            vals[sid] = [0] * len(dates)
    for sid, arr in vals.items():
        arr[i] = today.get(sid, 0)
    write_json(path, hist)
    return path


def build(rows, day):
    os.makedirs(OUT, exist_ok=True)
    hist_path = add_snapshot(rows, day) if in_history_window(day) else None
    seasons = sorted(m.group(1) for m in (re.search(r'history-(\d{4})\.json$', f)
                                          for f in glob.glob(os.path.join(OUT, 'history-*.json'))) if m)
    current = {
        'source': SOURCE,
        'format': FORMAT_NOTE,
        'date': day.isoformat(),
        'fields': ['value', 'trend30Day'],
        'history': seasons,
        'v': {sid: [value, trend] for sid, value, trend in rows},
    }
    write_json(os.path.join(OUT, 'current.json'), current)
    top = max(rows, key=lambda r: r[1])
    print(f'{day}: {len(rows)} players (top value {top[1]}), current.json'
          + (f' + {os.path.basename(hist_path)}' if hist_path else ' (outside the August-January history window)'))


# ------------------------------------------------------------------ projections

def league_id():
    with open(DATA_JS, encoding='utf-8') as f:
        m = re.search(r"leagueId:\s*'(\d+)'", f.read())
    if not m:
        raise RuntimeError('Could not find CONFIG.leagueId in assets/data.js')
    return m.group(1)


def score(stats, scoring):
    """Fantasy points for a projected stat line under the league's scoring."""
    return sum(v * scoring[k] for k, v in stats.items()
               if isinstance(v, (int, float)) and isinstance(scoring.get(k), (int, float)))


def fetch_projections(day):
    """Projected points per player for each regular-season week still to
    play. Empty outside the season."""
    league = get_json(f'{SLEEPER}/v1/league/{league_id()}')
    state = get_json(f'{SLEEPER}/v1/state/nfl')
    season = str(league.get('season') or '')
    scoring = league.get('scoring_settings') or {}
    last = int((league.get('settings') or {}).get('playoff_week_start') or 15) - 1
    weeks = []
    if (str(state.get('season')) == season and league.get('status') != 'complete'
            and state.get('season_type') in ('pre', 'regular')):
        # Sleeper's week counter can lag a day; the site skips weeks already final.
        first = max(1, int(state.get('week') or 1)) if state.get('season_type') == 'regular' else 1
        weeks = list(range(first, last + 1))
    qs = '&'.join('position[]=' + p for p in PROJ_POSITIONS)
    v = {}
    for i, week in enumerate(weeks):
        rows = get_json(f'{SLEEPER}/projections/nfl/{season}/{week}?season_type=regular&{qs}&order_by=ppr')
        for r in rows if isinstance(rows, list) else []:
            pid = str(r.get('player_id') or '')
            stats = r.get('stats') or {}
            pts = score(stats, scoring) if scoring else (stats.get('pts_ppr') or 0)
            if not pid or pts <= 0:
                continue
            v.setdefault(pid, [0] * len(weeks))[i] = round(pts, 1)
    if weeks and len(v) < MIN_PLAYERS:
        raise RuntimeError(f'Sleeper returned projections for only {len(v)} players; keeping the saved file.')
    return {
        'source': "Sleeper weekly projections, scored with the league's settings",
        'season': season,
        'date': day.isoformat(),
        'weeks': weeks,
        'v': v,
    }


def build_projections(day):
    proj = fetch_projections(day)
    write_json(os.path.join(OUT, 'projections.json'), proj)
    span = f"weeks {proj['weeks'][0]}-{proj['weeks'][-1]}" if proj['weeks'] else 'no weeks left to project'
    print(f"{day}: projections for {len(proj['v'])} players, {proj['season']} {span}")


def main():
    day = datetime.datetime.now(datetime.timezone.utc).date()
    os.makedirs(OUT, exist_ok=True)
    failed = []
    for name, step in (('FantasyCalc values', lambda: build(fetch(), day)),
                       ('Sleeper projections', lambda: build_projections(day))):
        try:
            step()
        except Exception as err:   # keep going: one source failing shouldn't block the other
            print(f'{name} failed: {err}', file=sys.stderr)
            failed.append(name)
    if failed:
        sys.exit('Not updated: ' + ', '.join(failed))


if __name__ == '__main__':
    main()
