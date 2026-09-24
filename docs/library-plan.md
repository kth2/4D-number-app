# Plan: 字图 Library (千字图 / 万字图)

Status: **proposal**, nothing implemented yet. The open decisions are listed at the end.

## Goal

Add a searchable reference of the traditional Malaysian Chinese number charts:

| Source | Range | Digits |
|---|---|---|
| 大伯公千字图 (Tua Pek Kong) | 000–999 | 3 |
| 观音千字图 (Guan Yin) | 000–999 | 3 |
| 万字图 / 解梦图 | 0000–9999 | 4 |

Users can search in both directions (keyword → numbers, number → meanings), browse each
chart, and move from a chart entry to that number's real win history.

## Principles

1. **Present it as folk culture, never as prediction.** This matches the app's Honesty box. The
   Library tab gets a short note saying so. Chart meanings never feed into Predict, Analyzer or
   any other statistic.
2. **Every entry records its source.** A number can mean different things in different charts
   and editions, so we never merge them into one "蛇 → 1234" list.
3. **Only use data we have rights to.** We do not bulk-scrape another site's database (see
   "Data acquisition").
4. **Keep the current stack.** Static JSON and plain JS, with no build step, no SQLite and no
   framework. 12k short entries fit comfortably in JSON.
5. **Load it lazily.** Draw data loads at startup today. Library data loads only when the Library
   tab (or a cross-link) first needs it.

## Data format

Files live in `data/library/` and use compact keys like `draws.json`.

`data/library/index.json`: the source registry:

```json
{
  "schema": "my4d-library-v1",
  "sources": [
    {
      "id": "tpk",
      "name": "大伯公千字图",
      "name_en": "Tua Pek Kong 1000-character chart",
      "digits": 3,
      "edition": "《大伯公千字文图解书》, publisher/year as printed",
      "provenance": "manual entry from owned copy",
      "license": "personal reference / permission from X",
      "file": "tpk.json",
      "count": 1000
    }
  ]
}
```

`data/library/tpk.json`: the entries for one source:

```json
{
  "source": "tpk",
  "entries": [
    { "n": "001", "t": "天", "k": ["sky", "tian"], "c": "nature", "v": 1, "pg": 3 }
  ]
}
```

| Key | Meaning |
|---|---|
| `n` | number string, exactly `digits` long |
| `t` | headword or title as printed |
| `k` | optional aliases and search terms (simplified/traditional variants, English, pinyin) |
| `c` | optional category, only when the source itself defines one |
| `v` | 1 once checked against the source by a second pass (audit trail) |
| `pg` | optional page number in the source, for re-checking |

The richer schema ChatGPT suggested (sources / entries / keywords / aliases / categories /
number_relations) collapses into this format. The keyword → entry index is built in memory at
load time, which is how `js/data.js` already builds `byNumber` for draws.

## Tooling (Python, like the existing `tools/`)

- `tools/import_library_csv.py --source tpk --csv tpk.csv`: data is typed or proofread in a
  spreadsheet (Google Sheets or Excel, which handle Chinese well), exported to CSV and converted
  to JSON. This is the practical way to enter the data.
- `tools/validate_library.py`, modelled on `validate_data.py`. It checks:
  - every source in `index.json` has a file
  - `n` is exactly `digits` long
  - no duplicate `n` within a source (unless the source really lists alternatives)
  - `count` matches
  - text is valid UTF-8
  - it prints coverage per source (e.g. "tpk: 1000/1000, 812 verified")
- Run the validator in CI on any change under `data/library/`.

## App changes

| File | Change |
|---|---|
| `js/library.js` (new) | `LIB` module: `load()` fetches `index.json` plus the source files on first use; `byNumber(n)`, `search(q)`, `browse(sourceId, block)`. Search normalises full-width digits and matches `t` and `k` by substring; digits-only input means a number lookup. |
| `index.html` | new `<section id="view-library">` and nav button `📚 字图 / Library`: search box, result cards grouped by source, a browse view per source in pages of 100 numbers, and the folk-culture note |
| `js/app.js` | add `library: renderLibrary` to the dispatch map; add a **"In the charts"** card to the Check-number results (3-digit meaning of the last three digits and the 4-digit 万字图 meaning); each Library entry gets a "When did this win?" link that opens the Check tab with the number filled in |
| `js/i18n.js` | new `lib.*` keys (EN + 中) |
| `sw.js` | add `js/library.js` to `SHELL`; bump `VERSION`; **extend the stale-while-revalidate branch to `/data/library/*.json`**. Today only `draws.json` is cached at runtime and other files are never stored, so without this change the library would not work offline. |
| `css/styles.css` | entry card and browse-grid styles using the existing tokens |
| `README.md` | feature row, data section, sources and permissions |

Size check: 12k entries at about 40 bytes each is roughly 0.5 MB raw and about 150 KB gzipped
(GitHub Pages gzips). That is smaller than `draws.json` (3 MB), so no sharding is needed at first.
If 万字图 grows large, split it by first digit (`wz-0.json` … `wz-9.json`).

## Data acquisition (the real bottleneck)

The code work is small. The data is what's hard. The ChatGPT routes, in order of preference:

1. **Enter data from a physical copy we own.** This is the cleanest route. 1000 rows per 千字图
   is a few evenings of work in a spreadsheet. Claude can OCR photos of our own pages into a
   draft CSV, then a person proofreads it (`v: 1`). The printed editions may still be under
   copyright, so do not publish page scans or illustrations. Only the number → word mapping is
   planned, and its copyright status is also unclear (see Risks).
2. **Get permission or a licence** from an existing database owner (4D Manager, the
   千字图 & 万字图 app, etc.). This is the fastest route to full 万字图 coverage, and the
   ChatGPT message template is a good start.
3. **Cross-check against public sites, not copy from them.** Look up a sample of entries
   by hand to catch typos in our own data and to note where charts disagree.
4. **Don't bulk-scrape** another site's compiled database. It is their copyrighted compilation,
   the result has no reliable provenance, and it goes against how the app handles sources today.

Suggested order: 大伯公 (3D, most widely used) → 观音 → 万字图 (10k rows, needs route 2 or a
long data-entry project).

## Phases

| Phase | Deliverable | Depends on |
|---|---|---|
| 0 | Decide on data rights and sources (below) | you |
| 1 | Setup with a **seed dataset** (~20–50 real entries per source): `library.js`, tab, search, Check-tab card, SW caching, validator, CSV importer | nothing, can start now |
| 2 | Complete 大伯公千字图 000–999, verified | phase 1 + a data source |
| 3 | 观音千字图 | same |
| 4 | 万字图 (possibly split by first digit) | licence or a long data entry |
| 5 | Extras: traditional ↔ simplified search, pinyin/English aliases, favourites alongside the watchlist, share an entry | as needed |

Phase 1 ships a working feature. A source that is still incomplete shows "812 / 1000 entries" in
the UI instead of pretending to be complete.

## Where I disagree with the ChatGPT draft

- **The citations can't be verified.** The `:chatgpt-content-reference` markers are broken and
  the example numbers (`蛇 → 007`, `XXXX`) are placeholders. Treat every "site X has Y" claim
  as a lead to check, not a fact.
- **SQLite / 7 tables is over-built** for a static, no-build PWA. Two JSON shapes and an
  in-memory index do the same job.
- **Categories (动物 / 人物 / 神明 …) shouldn't be invented.** Include them only when a source
  defines them, or clearly label them as our own tags.
- **The Library shouldn't be a separate app mode.** Its value here is the link between a
  chart meaning and the real draw history, which the Check-tab card and the "When did this win?"
  link provide.

## Risks

- **Copyright** of the number → word mapping in a specific edition is unclear. Keep provenance
  per source so a source can be removed cleanly if needed.
- **Charts differ between editions.** Keep `edition` and `pg`, and show the source on every
  result.
- **Traditional vs simplified characters.** Older books may use traditional forms. Store the
  text as printed and add the other form in `k`.
- **Tab crowding.** There are already 7 tabs. Library becomes the 8th, and the nav row already
  scrolls horizontally on phones. Check on a small screen.

## Open decisions (Phase 0)

1. Which physical books do we have, and which edition or publisher?
2. Is the app public (GitHub Pages) with the full data, or should the chart data stay private
   until rights are clear?
3. For a 4-digit number, should the Check-tab card show the 千字图 entry for its **last 3
   digits** (the 3D convention the Check tab already uses)? Or only the 万字图 entry?
4. Is 万字图 in scope now, or only after a licence?
