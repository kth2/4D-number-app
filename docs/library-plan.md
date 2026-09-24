# Plan: 字图 Library (千字图 / 万字图)

Status: **proposal**, nothing implemented yet.

## Decisions so far

- **Data comes from existing online databases**, not from typing up books.
- **Shared with family and friends** through the public app, locked with a passphrase. No licence will be sought.
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

## Access: passphrase-locked library inside the app (option B)

The repo and GitHub Pages site are public, and the app is shared with family and friends. So the
library ships **inside the app, encrypted**:

```
GitHub Action (scrape) → library.json (never committed)
   → tools/encrypt_library.py (AES-256-GCM, key from LIBRARY_PASSPHRASE secret)
   → data/library.enc (committed, public but unreadable)
   → app: unlock once via  …/#unlock=<passphrase>  → remembered on the device
```

- Without the passphrase, the Library tab shows a locked message and a passphrase box.
  Everything else in the app works as before.
- The `#…` part of a link never reaches a server. The app strips it from the address bar.
- A new `library.enc` is picked up automatically (service-worker stale-while-revalidate plus a
  `library-updated` message).
- To revoke access, re-encrypt with a new passphrase and send the new link to the people who
  should keep access.
- Limit: anyone with the passphrase can pass it on. This keeps the data from being public;
  it is not strong access control.

## Getting the data (scraper)

Candidate sources found (see "Probe findings" below for what inspection showed):

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
5. **Validate** with `tools/encrypt_library.py`, which checks coverage (e.g. "tpk: 1000/1000"),
   number length and duplicates.

Size: 1000 + 1000 + 10,000 entries is about 0.5 MB of JSON, about 12k requests at worst if every
number is a separate page. At a 1 s delay that is ~3.5 hours, run once. With block pages or a
JSON endpoint it takes minutes.

### Probe findings (GitHub Action `probe-library.yml`)

This session can't reach these sites, but GitHub Actions can:

| Site | Finding |
|---|---|
| dream.4dnum.com | React app on a JSON API, `https://backend.4dnum.com/api/v1`, with `dictionary1/2/3`; entries have `number`, `content`, `cat`, `image`. **Most promising.** |
| 4dluckybook.com | Server-rendered HTML: number + simplified + traditional + English per entry (e.g. `0001 父亲去世 / 父親去世 / Father Passed Away`); more rows load from `home/bookitemlist?id=`. `id=3` is 万字图. |
| 4d.tickalook.io | Search-only UI with a `/search` endpoint (filters 大伯公 / 万字解梦 / 观音) |
| 4dmanager.net | 403 to bots, skip |
| 4dpanda.com/dictionary | 404, skip |

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
terms (English, traditional/simplified variants). The in-memory search index is built when the library is unlocked.

## App changes (done)

| File | Change |
|---|---|
| `js/library.js` | `LIB`: fetch plus WebCrypto decrypt of `data/library.enc`, passphrase in localStorage, `forNumber`, `search`, `browse`, HTML-escaping of scraped text |
| `index.html` / `js/app.js` | **Charts 字图** tab (search, browse in blocks of 100, lock/remove), **In the charts** card on Check-number (4 digits → 万字图 + 千字图 for the last 3 digits; 3 digits → 千字图 + 万字图 numbers ending in them), number links → win history, `#unlock=` handling |
| `js/i18n.js`, `css/styles.css` | EN/中 strings, styles |
| `sw.js` | precache `library.js`, stale-while-revalidate for `library.enc` |
| `tools/encrypt_library.py` | validate → gzip → encrypt; `--check` to decrypt; skips rewriting unchanged content |

## Phases

| Phase | Deliverable | Status |
|---|---|---|
| 1 | App side + encryption tool, tested with a sample file | done |
| 2 | Probe the sites (round 1 done, round 2 running) → `tools/scrape_library.py` for 大伯公 + 观音 | next |
| 3 | 万字图 (10k) + `update-library.yml` workflow (scrape → encrypt with the `LIBRARY_PASSPHRASE` secret → commit `library.enc`) | |
| 4 | Extras: cross-source disagreement view, traditional ↔ simplified search, favourites | |
