#!/usr/bin/env python3
"""Sports Toto 4D scraper (reference template).

Sports Toto publishes past results at https://www.sportstoto.com.my — unlike
Magnum/Da Ma Cai there is no stable public JSON API, so this template parses
the past-results HTML page (the deadboy18/malaysia-4d repo takes the same
approach). Inspect the current page markup and adjust PAST_RESULTS_URL and
parse_page() before first use. Requires: pip install beautifulsoup4.

Usage mirrors scrape_damacai.py (incremental by default, optional start date).
"""

import datetime as dt
import re
import sys
import time
import urllib.request

from common import load_dataset, merge_draws, save_dataset, last_date_for

# TODO(verify): confirm against the live site before first run.
PAST_RESULTS_URL = "https://www.sportstoto.com.my/results_past.asp?drawdate={date}"
DELAY_SECONDS = 2.0
DRAW_WEEKDAYS = {1, 2, 5, 6}
NUM_RE = re.compile(r"^\d{4}$")


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "my4d-insights/1.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", "replace")


def parse_page(html: str, date: dt.date) -> dict | None:
    """Extract the 4D game block. Adjust selectors to the live markup."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    nums = [td.get_text(strip=True) for td in soup.select("td") if NUM_RE.match(td.get_text(strip=True))]
    if len(nums) < 3:
        return None
    rec = {"o": "T", "d": date.isoformat(), "n": "", "p": nums[0:3]}
    if len(nums) >= 13:
        rec["s"] = nums[3:13]
    if len(nums) >= 23:
        rec["c"] = nums[13:23]
    return rec


def main() -> None:
    ds = load_dataset()
    if len(sys.argv) > 1:
        start = dt.date.fromisoformat(sys.argv[1])
    else:
        last = last_date_for(ds, "T")
        start = dt.date.fromisoformat(last) + dt.timedelta(days=1) if last else dt.date.today() - dt.timedelta(days=30)

    new = []
    day = start
    while day <= dt.date.today():
        if day.weekday() in DRAW_WEEKDAYS:
            try:
                rec = parse_page(fetch_html(PAST_RESULTS_URL.format(date=day.strftime("%d/%m/%Y"))), day)
                if rec:
                    new.append(rec)
                    print("fetched", day)
            except Exception as e:  # noqa: BLE001
                print("skip", day, e)
            time.sleep(DELAY_SECONDS)
        day += dt.timedelta(days=1)

    added = merge_draws(ds, new)
    if added:
        save_dataset(ds)
    print(f"added {added} draws")


if __name__ == "__main__":
    main()
