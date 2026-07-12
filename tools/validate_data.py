#!/usr/bin/env python3
"""Validate data/draws.json before it is committed.

Run by the import/add workflows (and usable locally). Exits non-zero with a
clear message on the first structural problem, so a malformed upstream CSV or
a bad manual entry can never reach the live app.

Checks:
  * top-level schema and source fields present
  * every draw: known operator, parseable date, 3 four-digit top prizes,
    optional special/consolation lists of 4-digit strings (max 10 each)
  * no duplicate (operator, date) pairs
  * draws sorted by (date, operator)
  * per-operator draw counts and date ranges printed for the workflow log
"""

import datetime as dt
import json
import pathlib
import re
import sys

DATA = pathlib.Path(__file__).resolve().parent.parent / "data" / "draws.json"
NUM = re.compile(r"^\d{4}$")
OPS = {"M", "D", "T"}


def fail(msg):
    print(f"VALIDATION FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def main():
    try:
        ds = json.loads(DATA.read_text())
    except Exception as e:  # noqa: BLE001
        fail(f"cannot parse {DATA}: {e}")

    if ds.get("schema") != "my4d-draws-v1":
        fail(f"unexpected schema: {ds.get('schema')!r}")
    draws = ds.get("draws")
    if not isinstance(draws, list) or not draws:
        fail("draws missing or empty")

    seen = set()
    prev_key = None
    stats = {}
    for i, d in enumerate(draws):
        where = f"draw #{i} ({d.get('o')}/{d.get('d')})"
        if d.get("o") not in OPS:
            fail(f"{where}: unknown operator")
        try:
            dt.date.fromisoformat(d.get("d", ""))
        except ValueError:
            fail(f"{where}: bad date")
        key = (d["o"], d["d"])
        if key in seen:
            fail(f"{where}: duplicate operator+date")
        seen.add(key)
        sort_key = (d["d"], d["o"])
        if prev_key is not None and sort_key < prev_key:
            fail(f"{where}: draws not sorted by (date, operator)")
        prev_key = sort_key
        p = d.get("p")
        if not (isinstance(p, list) and len(p) == 3 and all(isinstance(x, str) and NUM.match(x) for x in p)):
            fail(f"{where}: top prizes must be exactly 3 four-digit strings, got {p!r}")
        for k, label in (("s", "special"), ("c", "consolation")):
            v = d.get(k)
            if v is None:
                continue
            if not (isinstance(v, list) and 0 < len(v) <= 10 and all(isinstance(x, str) and NUM.match(x) for x in v)):
                fail(f"{where}: bad {label} list {v!r}")
        s = stats.setdefault(d["o"], {"n": 0, "lo": d["d"], "hi": d["d"]})
        s["n"] += 1
        s["lo"] = min(s["lo"], d["d"])
        s["hi"] = max(s["hi"], d["d"])

    print(f"OK: {len(draws)} draws, source={ds.get('source')}, generated={ds.get('generated')}")
    for op, s in sorted(stats.items()):
        print(f"  {op}: {s['n']} draws, {s['lo']} .. {s['hi']}")
        if s["n"] < 100 and ds.get("source") == "scraped":
            fail(f"operator {op} has suspiciously few draws ({s['n']})")


if __name__ == "__main__":
    main()
