# Plan: 字图 Library (千字图 / 万字图)

Status: **proposal**, nothing implemented yet.

## Decisions so far

- **Data comes from existing online databases**, not from typing up books.
- **Personal use only.** No licence will be sought.
- **A 4-digit number also shows the 千字图 meaning of its last 3 digits** (the same 3D rule the
  Check tab uses).

## Goal

Add a searchable reference of the traditional number charts:

| Source | Range | Digits |
|---|---|---|
| 大伯公千字图 (Tua Pek Kong) | 000–999 | 3 |
| 观音千字图 (Guan Yin) | 000–999 | 3 |
| 万字图 / 解梦图 | 0000–9999 | 4 |

Users can search in both directions (keyword → numbers, number → meanings), browse each
chart, and move from a chart entry to that number's real win history.

## The key constraint: this repo is public

`kth2/4D-number-app` is a **public** repo, and the app is served publicly on GitHub Pages (a
free account's Pages only work from public repos). Anything committed to `data/`, including a
scrape run by a GitHub Action, is republished to the world. "Own use only" is only true if
**the library data never enters the repo**.

So the design keeps the chart data on your device:

```
your PC                                 your phone (the PWA)
─────────                               ─────────────────────
python3 tools/scrape_library.py   →     library.json (~0.5 MB)
  writes library.json (gitignored)          │ send it to your phone
                                            ▼
                                        About → "Import library file"
                                            │ stored in IndexedDB, on this device only
                                            ▼
                                        Library tab + Check-tab card
```

- The public app ships **the code, with no chart data**. Until a file is imported, the Library
  tab says "No library loaded" and shows an Import button.
- The scraper script can live in the repo (it is just code, like `scrapers/scrape_4d2u.py`), but
  its output path is in `.gitignore`.
- Re-importing a newer file replaces the old one. Export/backup isn't needed, because the file
  on your PC is the backup.

Alternatives, not recommended:
- A private repo for the data, loaded with a token: Pages can't fetch from a private repo without
  putting the token in the app, which is public.
- Making the whole app repo private: Pages would stop working on a free plan.

## Getting the data (scraper)

Candidate sources found (still to be inspected, see "Blocker" below):

| Site | Advertised content |
|---|---|
| 4dluckybook.com | 大伯公千字图, 观音千字图, 万字图/万字解梦图, category browse |
| 4d.tickalook.io | 千字图 · 万字图: 大伯公千字图, 万字解梦图, 观音千字图 |
| dream.4dnum.com | 大伯公萬字圖, 觀音千字圖, 大伯公千字圖 |
| 4dmanager.net/search/database | 大伯公千字图・观音千字图・万字图, keyword search |
| 4dpanda.com/dictionary | Tua Pek Kong 4D dictionary (EN) |

Approach:
1. **Inspect** each site's page source and network calls, and pick the one that is easiest to
   scrape. The ideal is one JSON endpoint or a JS data file (a single request). Next best is
   HTML pages per number block (000–099, …). Keyword-search-only sites are the worst, because
   they can't be enumerated.
2. **Write `tools/scrape_library.py`** with the same conventions as the existing scraper: a
   polite per-request delay, a cache of raw pages in a local folder so a re-run fetches nothing
   twice, and a `--source tpk|gy|wz` option.
3. **Record the source site and scrape date** in the output, so you know where each chart
   came from.
4. **Cross-check** a second site on ~50 random numbers and report the disagreements. Different
   sites often copy different editions.
5. **Validate** with `tools/validate_library.py`, which checks coverage (e.g. "tpk: 1000/1000"),
   number length and duplicates.

Size: 1000 + 1000 + 10,000 entries is about 0.5 MB of JSON, about 12k requests at worst if every
number is a separate page. At a 1 s delay that is ~3.5 hours, run once. With block pages or a
JSON endpoint it takes minutes.

### Blocker

This Claude Code cloud session's network policy blocks all of these domains, so the sites
couldn't be inspected yet. Either:
- allow the domains in the cloud environment's network settings, or
- run the inspection and scraper on your own PC (the script needs only Python and
  `beautifulsoup4`, the same as the existing scraper).

## Data format (`library.json`)

```json
{
  "schema": "my4d-library-v1",
  "generated": "2026-09-24",
  "sources": [
    { "id": "tpk", "name": "大伯公千字图", "digits": 3, "from": "4dluckybook.com", "count": 1000 },
    { "id": "gy",  "name": "观音千字图",   "digits": 3, "from": "…", "count": 1000 },
    { "id": "wz",  "name": "万字图",       "digits": 4, "from": "…", "count": 10000 }
  ],
  "entries": {
    "tpk": [ { "n": "001", "t": "天", "k": ["sky"] } ],
    "gy":  [ … ],
    "wz":  [ … ]
  }
}
```

`n` is the number, `t` is the meaning as shown on the site, and `k` holds optional extra search
terms (English, traditional/simplified variants). The in-memory search index is built at import
time.

## App changes

| File | Change |
|---|---|
| `js/library.js` (new) | `LIB` module. `importFile(file)` validates and saves the file to IndexedDB. `load()` reads it back. Lookups: `byNumber(n)`, `search(q)`, `browse(sourceId, block)`. Search matches `t`/`k` by substring; digits-only input means a number lookup. |
| `index.html` | a new Library tab (`<section id="view-library">`): search box, result cards grouped by source, browse view in pages of 100 numbers, and an empty state with an Import button |
| `js/app.js` | Add `library: renderLibrary` to the dispatch map. Add an **"In the charts"** card to the Check-tab results: for `1234` it shows the 万字图 entry for `1234` plus the 大伯公/观音 entries for `234`, labelled "last 3 digits". Each Library entry gets a "When did this win?" link to the Check tab. |
| `js/i18n.js` | `lib.*` keys (EN + 中) |
| `sw.js` | Add `js/library.js` to `SHELL` and bump `VERSION`. IndexedDB already works offline, so no data caching is needed. |
| `.gitignore` | `library.json`, `.library-cache/` |
| `README.md` | Feature row, plus how to run the scraper and import the file |

Chart meanings never feed into Predict, Analyzer or any statistic. The Library tab carries a short
"folk culture, not prediction" note, in line with the Honesty box.

## Phases

| Phase | Deliverable |
|---|---|
| 1 | App side: `library.js`, IndexedDB import, Library tab, Check-tab card, tested with a small hand-made sample file (not committed) |
| 2 | Inspect the sites and write `tools/scrape_library.py` for 大伯公 + 观音 (3-digit, small) |
| 3 | Extend the scraper to 万字图 (10k) |
| 4 | Extras: cross-source disagreement view, traditional ↔ simplified search, favourites |

Phase 1 doesn't depend on network access and can start now.
