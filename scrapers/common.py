"""Shared helpers for the operator scrapers.

All scrapers normalize draws into the app's `my4d-draws-v1` record shape:

    {"o": "M", "d": "2026-07-12", "n": "1234/26",
     "p": ["1234", "5678", "9012"],      # 1st, 2nd, 3rd
     "s": [... up to 10 special ...],    # optional
     "c": [... up to 10 consolation ...],# optional
     "x": 1}                             # optional: special (off-calendar) draw

If a source only exposes the top three prizes, omit "s"/"c" — the app's
"Top 3 prizes only" mode keeps every statistic working (goal #7).
"""

import json
import pathlib

DATA_FILE = pathlib.Path(__file__).resolve().parent.parent / "data" / "draws.json"


def load_dataset() -> dict:
    if DATA_FILE.exists():
        with open(DATA_FILE) as fh:
            return json.load(fh)
    return {
        "schema": "my4d-draws-v1",
        "source": "scraped",
        "operators": {"M": "Magnum 4D", "D": "Da Ma Cai 1+3D", "T": "Sports Toto 4D"},
        "draws": [],
    }


def merge_draws(dataset: dict, new_draws: list) -> int:
    """Insert draws that aren't already present (keyed by operator+date). Returns count added."""
    seen = {(d["o"], d["d"]) for d in dataset["draws"]}
    added = 0
    for d in new_draws:
        if (d["o"], d["d"]) not in seen:
            dataset["draws"].append(d)
            seen.add((d["o"], d["d"]))
            added += 1
    dataset["draws"].sort(key=lambda d: (d["d"], d["o"]))
    return added


def save_dataset(dataset: dict) -> None:
    dataset["source"] = "scraped"
    import datetime
    dataset["generated"] = datetime.date.today().isoformat()
    dataset.pop("note", None)
    DATA_FILE.parent.mkdir(exist_ok=True)
    with open(DATA_FILE, "w") as fh:
        json.dump(dataset, fh, separators=(",", ":"))


def last_date_for(dataset: dict, op: str) -> str | None:
    dates = [d["d"] for d in dataset["draws"] if d["o"] == op]
    return max(dates) if dates else None
