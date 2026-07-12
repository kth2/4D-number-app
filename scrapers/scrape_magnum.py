#!/usr/bin/env python3
"""Magnum 4D scraper (reference template).

Magnum's past results live at https://www.magnum4d.my/en/results — the page is
driven by a JSON API that takes a draw date. As with the other operators, the
exact endpoint/fields drift over time: open the results page with browser
devtools, copy the XHR the page fires, and update ENDPOINT/parse_payload().
The deadboy18/malaysia-4d repo scrapes Magnum via its JSON API and is a good
working reference for the payload shape.

Usage mirrors scrape_damacai.py (incremental by default, optional start date).
"""

import datetime as dt
import sys
import time
import urllib.request

from common import load_dataset, merge_draws, save_dataset, last_date_for

# TODO(verify): confirm against the live site before first run.
ENDPOINT = "https://www.magnum4d.my/api/results?date={date}"
DELAY_SECONDS = 2.0
DRAW_WEEKDAYS = {1, 2, 5, 6}


def fetch_json(url: str):
    import json
    req = urllib.request.Request(url, headers={"User-Agent": "my4d-insights/1.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def parse_payload(payload: dict, date: dt.date) -> dict | None:
    try:
        r = payload["fourDResults"] if "fourDResults" in payload else payload
        return {
            "o": "M",
            "d": date.isoformat(),
            "n": str(r.get("drawNo", "")),
            "p": [r["first"], r["second"], r["third"]],
            "s": list(r.get("special", []))[:10],
            "c": list(r.get("consolation", []))[:10],
        }
    except KeyError:
        return None


def main() -> None:
    ds = load_dataset()
    if len(sys.argv) > 1:
        start = dt.date.fromisoformat(sys.argv[1])
    else:
        last = last_date_for(ds, "M")
        start = dt.date.fromisoformat(last) + dt.timedelta(days=1) if last else dt.date.today() - dt.timedelta(days=30)

    new = []
    day = start
    while day <= dt.date.today():
        if day.weekday() in DRAW_WEEKDAYS:
            try:
                rec = parse_payload(fetch_json(ENDPOINT.format(date=day.strftime("%d-%m-%Y"))), day)
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
