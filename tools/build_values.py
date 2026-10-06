#!/usr/bin/env python3
"""
Builds assets/values-history.json: weekly market values for every player,
taken from DynastyProcess's public data repo (github.com/dynastyprocess/data,
GPL-3.0), which snapshots FantasyPros-derived trade values every week.

The site uses it to grade trades: what each player was worth the week a
trade happened, and at the end of that season. Values for the current week
are fetched live in the browser, and trades newer than this file look up
their week's snapshot on GitHub, so re-running this is optional. Run it
once a season (or whenever) to keep everything local:

    python3 tools/build_values.py

Needs git and network access to github.com. Takes a minute or two.
"""
import csv, io, json, os, subprocess, sys, tempfile, datetime

REPO = 'https://github.com/dynastyprocess/data'
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'values-history.json')
FIRST_SEASON = 2022
# Only in-season snapshots matter (trades happen August through December),
# plus January so every season has an end-of-season value.
def in_window(d):
    return (d.month >= 8) or (d.month == 1)

def git(*args, cwd):
    return subprocess.run(['git', *args], cwd=cwd, check=True,
                          capture_output=True).stdout

def main():
    tmp = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'dpdata')
    if not os.path.isdir(os.path.join(tmp, '.git')):
        subprocess.run(['git', 'clone', '--filter=blob:none', '--no-checkout', '-q', REPO, tmp], check=True)
    else:
        git('fetch', '-q', 'origin', cwd=tmp)
    head = git('rev-parse', 'origin/HEAD', cwd=tmp).decode().strip()

    # FantasyPros id -> Sleeper id, from DynastyProcess's own id database
    ids_csv = git('show', f'{head}:files/db_playerids.csv', cwd=tmp).decode('utf-8', 'replace')
    fp2sl = {}
    for row in csv.DictReader(io.StringIO(ids_csv)):
        fp, sl = row.get('fantasypros_id'), row.get('sleeper_id')
        if fp and sl and fp != 'NA' and sl != 'NA':
            fp2sl[fp] = sl

    log = git('log', '--format=%H %cs', head, '--', 'files/values-players.csv', cwd=tmp).decode().split('\n')
    snaps = []
    seen_dates = set()
    for line in reversed([l for l in log if l.strip()]):
        sha, day = line.split()
        d = datetime.date.fromisoformat(day)
        if d.year < FIRST_SEASON or (d.year == FIRST_SEASON and d.month < 8) or not in_window(d):
            continue
        if day in seen_dates:
            continue
        seen_dates.add(day)
        text = git('show', f'{sha}:files/values-players.csv', cwd=tmp).decode('utf-8', 'replace')
        rows = {}
        for r in csv.DictReader(io.StringIO(text)):
            sl = fp2sl.get(r.get('fp_id', ''))
            if not sl:
                continue
            try:
                v = int(round(float(r.get('value_1qb') or 0)))
            except ValueError:
                continue
            if v > 0:
                rows[sl] = v
        # the file's own scrape date is the real "as of" date
        snaps.append((day, rows))

    dates = [d for d, _ in snaps]
    players = sorted({pid for _, rows in snaps for pid in rows}, key=lambda x: (len(x), x))
    # values are stored in tens (a 10,000-point scale fits in 4 digits)
    vals = {}
    for pid in players:
        vals[pid] = [round(rows.get(pid, 0) / 10) for _, rows in snaps]
        # trim trailing zeros
    out = {
        'source': 'DynastyProcess values (github.com/dynastyprocess/data, GPL-3.0), value_1qb',
        'built': datetime.date.today().isoformat(),
        'scale': 10,
        'dates': dates,
        'v': vals,
        'fp': {fp: sl for fp, sl in fp2sl.items() if sl in vals}
    }
    with open(OUT, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'{len(dates)} snapshots, {len(players)} players, {os.path.getsize(OUT)//1024} KB -> {OUT}')

if __name__ == '__main__':
    main()
