# Malaysia 4D Insights (PWA)

An installable, offline-capable Progressive Web App for exploring Malaysia's three national 4D
lotteries — **Magnum 4D**, **Da Ma Cai 1+3D** and **Sports Toto 4D**.

Pure static HTML/CSS/JS — no build step, no framework, deployable on GitHub Pages.

## Features

| # | Goal | Where |
|---|------|-------|
| 1 | Latest / per-date results for all three operators | **Results** tab (data refreshed by scheduled scrapers) |
| 2 | Statistics of historical results (hot numbers, digit-position heatmap, cold/overdue) | **Statistics** tab |
| 3 | "When did number X win?" — full win history with date, operator, prize tier | **Check number** tab |
| 4 | Winning-probability statistics (theoretical odds, expected value, empirical frequency) | **Analyzer** tab |
| 5 | Enter a 4D number → statistical profile vs. history | **Analyzer** tab |
| 6 | Weekday probability model (χ² fairness test + naive-Bayes digit model per draw day) | **Weekday model** tab |
| 7 | Works with top-3-prize-only data | every statistic has a *Top 3 prizes only* mode |
| 8 | PWA | `manifest.webmanifest` + `sw.js` (installable, offline, auto-refreshing data) |

## Use it on your phone

The app deploys automatically to **https://kth2.github.io/4D-number-app/** on every push to
`main` (see `.github/workflows/deploy-pages.yml`).

- **Android (Chrome):** open the URL → ⋮ menu → **Add to Home screen** (or tap the install prompt).
- **iPhone (Safari):** open the URL → Share button → **Add to Home Screen**.

It then launches full-screen like a native app and keeps working offline.

## Run it locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

(A server is needed — service workers and `fetch()` don't run from `file://`.)

`.github/workflows/update-results.yml` refreshes `data/draws.json` on a schedule after every
draw (Wed / Sat / Sun + special Tuesdays) once the scraper endpoints are verified; the service
worker picks up new data with a stale-while-revalidate strategy.

## Data

`data/draws.json` (schema `my4d-draws-v1`) holds one record per operator per draw date with the
full 23-prize structure (1st/2nd/3rd, 10 special, 10 consolation). **The bundled file is
synthetic sample data** produced by `tools/generate_sample_data.py` — it reproduces the real
draw calendar and prize structure so the whole app works out of the box, but the numbers are
simulated (the About tab shows a warning while sample data is loaded).

To load real history, adapt and run the reference scrapers:

```bash
pip install beautifulsoup4
python3 scrapers/scrape_magnum.py 2020-01-01    # backfill
python3 scrapers/scrape_damacai.py 2020-01-01
python3 scrapers/scrape_toto.py 2020-01-01
```

Each scraper is incremental by default (fetches only draws newer than the last one stored) and
rate-limited. The operators occasionally change their endpoints/markup — each script marks the
spots to verify (`TODO(verify)`). Scrape responsibly and within each site's terms of use.

## Reference repositories & sources

- [deadboy18/malaysia-4d](https://github.com/deadboy18/malaysia-4d) — historical draw data + analytics
  dashboard for all three operators (15,900+ draws back to 1985); its scrapers (JSON APIs for
  Magnum/Da Ma Cai, HTML for Sports Toto) are the model for `scrapers/`.
- [hongster/damacai](https://github.com/hongster/damacai) — Da Ma Cai API & scraper reference.
- [Solvve/ml_lottery_eda](https://github.com/Solvve/ml_lottery_eda) — exploratory data analysis of a 4D
  lottery testing the fairness/uniformity assumption; the statistical approach behind the Weekday
  model tab.
- Official result pages: [magnum4d.my](https://www.magnum4d.my),
  [damacai.com.my](https://www.damacai.com.my), [sportstoto.com.my](https://www.sportstoto.com.my).
- Commercial aggregator APIs also exist (e.g. "4D Results" on RapidAPI) if you prefer not to scrape.

## Honesty box (please read)

A fair 4D draw is **uniform and independent**: every number has a 1/10,000 chance of first prize
in every draw, regardless of history, weekday, or how "hot" or "overdue" it looks. The χ² page
exists to *test* that assumption — with real data it is consistently confirmed. The statistics
and the weekday model describe the past; they do not and cannot improve your odds. The expected
return of a RM1 Big bet is ≈ RM0.64.

This project is for information and education. It is not affiliated with Magnum, Da Ma Cai or
Sports Toto. Play responsibly and only if you are of legal age in your jurisdiction.

## Structure

```
├── index.html               # single-page app (6 tabs)
├── css/styles.css           # theme-aware styles (light/dark)
├── js/data.js               # data loading + indexes
├── js/stats.js              # frequency, gaps, χ², naive-Bayes weekday model, odds/EV
├── js/charts.js             # dependency-free SVG charts (columns, heatmap) with tooltips
├── js/app.js                # view wiring
├── data/draws.json          # draw history (sample data — replace via scrapers)
├── tools/generate_sample_data.py
├── scrapers/                # reference scrapers (Magnum, Da Ma Cai, Sports Toto)
├── .github/workflows/
│   ├── deploy-pages.yml     # auto-deploy to GitHub Pages
│   └── update-results.yml   # scheduled result refresh
├── manifest.webmanifest
├── sw.js                    # offline shell + stale-while-revalidate data
└── icons/
```
