#!/usr/bin/env python3
"""Import real draw history from a CSV file into data/draws.json.

Built for the CSV layout used by github.com/deadboy18/malaysia-4d
(one row per draw: a date, 1st/2nd/3rd prize, ten special, ten consolation
numbers), but column detection is heuristic so most result CSVs work:

  * date        - first column whose header contains 'date' (or --date-col),
                  or separate year/month/day columns
  * 1st/2nd/3rd - headers containing 1st/first, 2nd/second, 3rd/third
  * special     - headers containing 'special' or 'starter' (up to 10)
  * consolation - headers containing 'consolation' (up to 10)

Rows whose prize cells aren't 4-digit numbers are skipped and reported.
Existing draws (same operator + date) are kept; only new dates are added.

Usage:
  python3 tools/import_csv.py --op M --csv magnum_draws.csv
  python3 tools/import_csv.py --op T --csv sportstoto_draws.csv
  python3 tools/import_csv.py --op D --csv damacai_draws.csv

Then commit data/draws.json and push - the app redeploys automatically.
"""

import argparse
import csv
import datetime as dt
import re
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scrapers"))
from common import load_dataset, merge_draws, save_dataset  # noqa: E402

NUM_RE = re.compile(r"^\d{4}$")


def find_cols(headers):
    """Map header names to roles by keyword."""
    cols = {"p1": None, "p2": None, "p3": None, "date": None,
            "y": None, "m": None, "d": None, "n": None, "s": [], "c": []}
    for h in headers:
        k = h.strip().lower()
        if cols["date"] is None and "date" in k:
            cols["date"] = h
        elif k in ("year", "yyyy"):
            cols["y"] = h
        elif k in ("month", "mm"):
            cols["m"] = h
        elif k in ("day", "dd"):
            cols["d"] = h
        elif "draw" in k and ("no" in k or "num" in k or "seq" in k):
            cols["n"] = h
        elif "1st" in k or "first" in k:
            cols["p1"] = cols["p1"] or h
        elif "2nd" in k or "second" in k:
            cols["p2"] = cols["p2"] or h
        elif "3rd" in k or "third" in k:
            cols["p3"] = cols["p3"] or h
        elif "special" in k or "starter" in k:
            cols["s"].append(h)
        elif "consolation" in k:
            cols["c"].append(h)
    return cols


def parse_date(row, cols):
    if cols["date"]:
        raw = row[cols["date"]].strip()
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y", "%d.%m.%Y"):
            try:
                return dt.datetime.strptime(raw, fmt).date()
            except ValueError:
                continue
        return None
    if cols["y"] and cols["m"] and cols["d"]:
        try:
            return dt.date(int(row[cols["y"]]), int(row[cols["m"]]), int(row[cols["d"]]))
        except ValueError:
            return None
    return None


def clean(v):
    v = (v or "").strip()
    if v.isdigit() and len(v) < 4:  # restore leading zeros lost to spreadsheets
        v = v.zfill(4)
    return v if NUM_RE.match(v) else None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--op", required=True, choices=["M", "D", "T"],
                    help="operator: M=Magnum, D=Da Ma Cai, T=Sports Toto")
    ap.add_argument("--csv", required=True)
    ap.add_argument("--date-col", default=None, help="force a specific date column name")
    args = ap.parse_args()

    with open(args.csv, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        cols = find_cols(reader.fieldnames)
        if args.date_col:
            cols["date"] = args.date_col
        if not (cols["p1"] and cols["p2"] and cols["p3"]):
            sys.exit(f"could not find 1st/2nd/3rd prize columns in: {reader.fieldnames}")
        if not (cols["date"] or (cols["y"] and cols["m"] and cols["d"])):
            sys.exit(f"could not find a date column in: {reader.fieldnames}")

        new, skipped = [], 0
        for row in reader:
            date = parse_date(row, cols)
            top = [clean(row.get(cols["p1"])), clean(row.get(cols["p2"])), clean(row.get(cols["p3"]))]
            if not date or None in top:
                skipped += 1
                continue
            rec = {"o": args.op, "d": date.isoformat(),
                   "n": (row.get(cols["n"]) or "").strip(), "p": top}
            s = [clean(row.get(h)) for h in cols["s"]]
            c = [clean(row.get(h)) for h in cols["c"]]
            s = [x for x in s if x][:10]
            c = [x for x in c if x][:10]
            if s:
                rec["s"] = s
            if c:
                rec["c"] = c
            new.append(rec)

    ds = load_dataset()
    if ds.get("source") == "synthetic-sample":
        # never mix real history with sample data: drop all synthetic draws
        print("dataset was synthetic sample data - dropping it before import")
        ds["draws"] = []
    added = merge_draws(ds, new)
    save_dataset(ds)
    print(f"imported {added} draws for operator {args.op} "
          f"({skipped} rows skipped), dataset now has {len(ds['draws'])} draws")


if __name__ == "__main__":
    main()
