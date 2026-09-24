#!/usr/bin/env python3
"""Scrape the 千字图 / 万字图 charts from 4dluckybook.com into library.json.

4dluckybook serves each chart as server-rendered HTML pages of 20 entries:
    https://4dluckybook.com/home/bookitemlist?id=<book>&offset=<0,20,40,…>
Each entry has the number and a 3-line description:
    simplified Chinese / traditional Chinese / English
which becomes {"n", "t": simplified, "k": [traditional, english]}.

The output is the plaintext library (gitignored). Publish it with
tools/encrypt_library.py, which validates and encrypts it to data/library.enc.

  python3 tools/scrape_library.py                  # all charts -> library.json
  python3 tools/scrape_library.py --only tpk gy    # just some charts
  python3 tools/scrape_library.py --out x.json --delay 2

Scrape politely: one request at a time with a delay, and every fetched page is
cached in .library-cache/ (gitignored) so a re-run or a resumed run never
fetches a page twice. Pass --fresh to ignore the cache. Standard library only.
"""

import argparse
import datetime as dt
import hashlib
import html
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / ".library-cache"
BASE = "https://4dluckybook.com/home/bookitemlist?id={book}&offset={offset}"
PAGE = 20
UA = ("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36")

# Our source id -> 4dluckybook book id. Order here is the order shown in the app.
CHARTS = {
    "tpk": {"book": 1, "name": "大伯公千字图", "name_en": "Tua Pek Kong", "digits": 3},
    "gy": {"book": 2, "name": "观音千字图", "name_en": "Guan Yin", "digits": 3},
    "wz": {"book": 3, "name": "万字图", "name_en": "4D Dream Dictionary", "digits": 4},
}

ENTRY = re.compile(
    r'id="bookitemitemname"><b>\s*(\d+)\s*</b></div>\s*'
    r'<div id="bookitemitemdescription">(.*?)</div>', re.S)


def fetch(url, delay, fresh):
    """GET with an on-disk cache; retries transient failures."""
    path = CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".html")
    if path.exists() and not fresh:
        return path.read_text(encoding="utf-8")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"})
    for attempt in range(4):
        time.sleep(delay * (2 ** attempt))
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read().decode("utf-8", "replace")
            break
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"  retry {attempt + 1}/3 after {e}", file=sys.stderr)
    else:
        raise SystemExit(f"giving up on {url}")
    CACHE.mkdir(exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return body


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def parse(page):
    """[(number, simplified, traditional, english)] from one list page."""
    out = []
    for num, desc in ENTRY.findall(page):
        lines = [clean(x) for x in re.split(r"\r?\n|<br\s*/?>", desc)]
        lines = [x for x in lines if x]
        if not lines:
            continue
        simp = lines[0]
        trad = lines[1] if len(lines) > 1 else ""
        eng = " ".join(lines[2:]) if len(lines) > 2 else ""
        out.append((num, simp, trad, eng))
    return out


def scrape_chart(sid, meta, delay, fresh):
    digits = meta["digits"]
    entries, seen = [], set()
    offset = 0
    limit = 10 ** digits + 10 * PAGE  # hard stop in case the site never runs dry
    while offset < limit:
        rows = parse(fetch(BASE.format(book=meta["book"], offset=offset), delay, fresh))
        if not rows:
            break
        for num, simp, trad, eng in rows:
            if len(num) != digits:
                print(f"  {sid}: skipping {num!r} (expected {digits} digits)", file=sys.stderr)
                continue
            key = (num, simp)
            if key in seen:
                continue
            seen.add(key)
            k = [x for x in (trad, eng) if x and x != simp]
            entries.append({"n": num, "t": simp, **({"k": k} if k else {})})
        offset += PAGE
        if offset % 1000 == 0:
            print(f"  {sid}: {len(entries)} entries so far")
    entries.sort(key=lambda e: e["n"])
    covered = len({e["n"] for e in entries})
    print(f"{sid} {meta['name']}: {len(entries)} entries, {covered}/{10 ** digits} numbers")
    return entries


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(ROOT / "library.json"))
    ap.add_argument("--only", nargs="+", choices=list(CHARTS))
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between requests (default 1)")
    ap.add_argument("--fresh", action="store_true", help="ignore the page cache")
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    wanted = args.only or list(CHARTS)
    # Keep charts that weren't re-scraped this run.
    lib = json.loads(out.read_text(encoding="utf-8")) if out.exists() and args.only else {"entries": {}}
    entries = lib.get("entries", {})
    for sid in wanted:
        entries[sid] = scrape_chart(sid, CHARTS[sid], args.delay, args.fresh)

    lib = {
        "schema": "my4d-library-v1",
        "generated": dt.date.today().isoformat(),
        "sources": [
            {"id": sid, "name": m["name"], "name_en": m["name_en"], "digits": m["digits"],
             "from": "4dluckybook.com", "count": len(entries[sid])}
            for sid, m in CHARTS.items() if sid in entries
        ],
        "entries": {sid: entries[sid] for sid in CHARTS if sid in entries},
    }
    out.write_text(json.dumps(lib, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
