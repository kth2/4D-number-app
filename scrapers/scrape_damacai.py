#!/usr/bin/env python3
"""Da Ma Cai 1+3D scraper (reference template).

Da Ma Cai publishes past results on https://www.damacai.com.my/past-draw-result
and the site is backed by a JSON endpoint that returns one draw per date.
The endpoint URL and response shape change occasionally — open the past-result
page with browser devtools (Network tab), copy the request the page makes, and
update ENDPOINT/parse_payload() below to match. The hongster/damacai repo on
GitHub documents an older version of this API and is a useful reference.

Usage:
    python3 scrapers/scrape_damacai.py            # incremental: since last stored draw
    python3 scrapers/scrape_damacai.py 2024-01-01 # backfill from a date

Only scrape in line with the site's terms of use, keep the delay between
requests, and prefer incremental runs.
"""

import datetime as dt
import sys
import time
import urllib.request

from common import load_dataset, merge_draws, save_dataset, last_date_for

# TODO(verify): confirm against the live site before first run.
ENDPOINT = "https://www.damacai.com.my/wp-json/pastresult/v1/result/{date}"
DELAY_SECONDS = 2.0
DRAW_WEEKDAYS = {1, 2, 5, 6}  # Tue (special), Wed, Sat, Sun


def fetch_json(url: str):
    import json
    req = urllib.request.Request(url, headers={"User-Agent": "my4d-insights/1.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def parse_payload(payload: dict, date: dt.date) -> dict | None:
    """Map the API payload to a my4d-draws-v1 record. Adjust keys to the live schema."""
    try:
        return {
            "o": "D",
            "d": date.isoformat(),
            "n": payload.get("drawNo", ""),
            "p": [payload["1stPrizeNo"], payload["2ndPrizeNo"], payload["3rdPrizeNo"]],
            "s": [v for k, v in sorted(payload.items()) if k.startswith("starter")][:10],
            "c": [v for k, v in sorted(payload.items()) if k.startswith("consolation")][:10],
        }
    except KeyError:
        return None


def main() -> None:
    ds = load_dataset()
    if len(sys.argv) > 1:
        start = dt.date.fromisoformat(sys.argv[1])
    else:
        last = last_date_for(ds, "D")
        start = dt.date.fromisoformat(last) + dt.timedelta(days=1) if last else dt.date.today() - dt.timedelta(days=30)

    new = []
    day = start
    while day <= dt.date.today():
        if day.weekday() in DRAW_WEEKDAYS:
            try:
                payload = fetch_json(ENDPOINT.format(date=day.isoformat()))
                rec = parse_payload(payload, day)
                if rec:
                    new.append(rec)
                    print("fetched", day)
            except Exception as e:  # noqa: BLE001 - a missing date is normal (no draw)
                print("skip", day, e)
            time.sleep(DELAY_SECONDS)
        day += dt.timedelta(days=1)

    added = merge_draws(ds, new)
    if added:
        save_dataset(ds)
    print(f"added {added} draws")


if __name__ == "__main__":
    main()
