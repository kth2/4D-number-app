#!/usr/bin/env python3
"""Scrape Malaysia 4D results from 4d2ulive.com into data/draws.json.

4d2ulive serves results as server-rendered cards, one per game. We read the
three plain-4D cards:

    Magnum 4D          -> operator M
    Da Ma Cai 1+3D     -> operator D   (NOT "3+3D", which is 6-digit)
    SportsToto 4D      -> operator T   (NOT "5D, 6D, Lotto")

Today's draw appears on the HOMEPAGE (https://4d2ulive.com/) within minutes;
older draws live at date pages (https://4d2ulive.com/past-results/YYYY-MM-DD),
which lag the homepage by about a day. So the scraper reads the homepage for
the latest draw (taking the date from each card) and uses the dated pages only
to backfill. One request per page yields all three operators, so this single
scraper replaces the three per-operator stubs. Cards are identified by header
text and parsed with the stable bilingual labels (首獎/二獎/三獎 for the top
three prizes, 特別獎 for special, 安慰獎 for consolation).

Usage:
  python3 scrapers/scrape_4d2u.py                       # incremental: since last stored draw
  python3 scrapers/scrape_4d2u.py 2026-07-01            # backfill from date -> today
  python3 scrapers/scrape_4d2u.py 2026-07-01 2026-07-15 # explicit range
  python3 scrapers/scrape_4d2u.py --dry-run 2026-07-12  # print records, don't save

Please scrape responsibly: the delay between requests is deliberate, and
incremental runs (the default) fetch only the few missing dates.
"""

import datetime as dt
import gzip
import io
import json
import re
import sys
import time
import urllib.request

from bs4 import BeautifulSoup

from common import load_dataset, merge_draws, save_dataset, last_date_for

HOMEPAGE = "https://4d2ulive.com/"
BASE = "https://4d2ulive.com/past-results/{date}"
UA = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"),
    "Accept-Encoding": "gzip",
}
DELAY_SECONDS = 2.0
DRAW_WEEKDAYS = {1, 2, 5, 6}  # Tue (special draws), Wed, Sat, Sun

# Card header pattern -> our operator code. Order matters only for reporting.
# Patterns are specific enough to skip the non-4D games (Life, Jackpot Gold,
# 3+3D, 5D/6D/Lotto) that share a brand name.
OPERATORS = [
    ("M", re.compile(r"magnum\s*4d", re.I)),
    ("D", re.compile(r"da\s*ma\s*cai\s*1\s*\+\s*3d", re.I)),
    ("T", re.compile(r"sports?\s*toto\s*4d", re.I)),
]


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as res:
        raw = res.read()
        if res.headers.get("Content-Encoding") == "gzip":
            raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
        return raw.decode("utf-8", "replace")


def parse_card(text: str, code: str, date: str | None) -> dict | None:
    """Extract a my4d-draws-v1 record from one operator's card text.
    If date is None, read it from the card's own "Date: DD-MM-YYYY" field."""
    if date is None:
        dd = re.search(r"Date:\s*(\d{2})-(\d{2})-(\d{4})", text)
        if not dd:
            return None
        date = f"{dd.group(3)}-{dd.group(2)}-{dd.group(1)}"

    p1 = re.search(r"首獎\s*(\d{4})", text)
    p2 = re.search(r"二獎\s*(\d{4})", text)
    p3 = re.search(r"三獎\s*(\d{4})", text)
    if not (p1 and p2 and p3):
        return None

    rec = {"o": code, "d": date, "n": "", "p": [p1.group(1), p2.group(1), p3.group(1)]}

    dm = re.search(r"Draw\s*No\.?\s*[:：]?\s*([0-9]+/[0-9]+)", text)
    if dm:
        rec["n"] = dm.group(1)

    # Special: numbers between 特別獎 and 安慰獎 (placeholders ---- / **** are not digits).
    sp = re.search(r"特別獎(.*?)安慰獎", text, re.S)
    if sp:
        special = re.findall(r"(?<!\d)\d{4}(?!\d)", sp.group(1))[:10]
        if special:
            rec["s"] = special
    # Consolation: the 10 numbers after 安慰獎 (stop before any Jackpot / RM figures).
    parts = re.split(r"安慰獎", text, maxsplit=1)
    if len(parts) > 1:
        tail = re.split(r"Jackpot|積寶|RM\s", parts[1])[0]
        consol = re.findall(r"(?<!\d)\d{4}(?!\d)", tail)[:10]
        if consol:
            rec["c"] = consol
    return rec


def scrape_page(url: str, date: str | None) -> list:
    """Fetch a page and return the operator records found on it. When date is
    None (homepage), each card's own date is used."""
    try:
        html = fetch(url)
    except Exception as e:  # noqa: BLE001
        print(f"  {url}: fetch error {e}")
        return []
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "iframe", "ins"]):
        tag.decompose()

    out = []
    seen = set()
    for card in soup.select("div.card.outer-box"):
        text = re.sub(r"\s+", " ", card.get_text(" ", strip=True))
        header = text[:60]
        for code, pat in OPERATORS:
            if code in seen:
                continue
            if pat.search(header):
                rec = parse_card(text, code, date)
                if rec:
                    out.append(rec)
                    seen.add(code)
                break
    return out


def daterange(start: dt.date, end: dt.date):
    d = start
    while d <= end:
        if d.weekday() in DRAW_WEEKDAYS:
            yield d
        d += dt.timedelta(days=1)


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry = "--dry-run" in sys.argv
    today = dt.date.today()

    if len(args) >= 2:
        start, end = dt.date.fromisoformat(args[0]), dt.date.fromisoformat(args[1])
    elif len(args) == 1:
        start, end = dt.date.fromisoformat(args[0]), today
    else:
        ds = load_dataset()
        lasts = [last_date_for(ds, o) for o in ("M", "D", "T")]
        lasts = [x for x in lasts if x]
        start = (dt.date.fromisoformat(min(lasts)) + dt.timedelta(days=1)) if lasts else today - dt.timedelta(days=7)
        end = today

    lo, hi = start.isoformat(), end.isoformat()
    all_new = []
    got_dates = set()

    # Homepage carries the latest draw (today's, before it reaches the archive).
    # Include it whenever the requested window extends to today.
    if end >= today:
        for r in scrape_page(HOMEPAGE, None):
            if lo <= r["d"] <= hi:
                all_new.append(r)
                got_dates.add(r["d"])
        if got_dates:
            print(f"  homepage: {sorted(got_dates)}")

    # Backfill older draw days from their dated pages.
    for d in daterange(start, end):
        iso = d.isoformat()
        if iso in got_dates:
            continue
        recs = scrape_page(BASE.format(date=iso), iso)
        if recs:
            print(f"  {iso}: {', '.join(r['o'] for r in recs)}")
            all_new.extend(recs)
        time.sleep(DELAY_SECONDS)

    if dry:
        print(json.dumps(all_new, indent=1, ensure_ascii=False))
        print(f"dry-run: {len(all_new)} records parsed (not saved)")
        return

    ds = load_dataset()
    added = merge_draws(ds, all_new)
    if added:
        save_dataset(ds)
    print(f"added {added} new draws")


if __name__ == "__main__":
    main()
