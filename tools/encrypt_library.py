#!/usr/bin/env python3
"""Validate library.json and publish it as the encrypted data/library.enc.

The plaintext library (千字图 / 万字图 entries) never enters the repo: it is
gitignored, and only this passphrase-encrypted copy is committed. The app
decrypts it in the browser (js/library.js) with the passphrase shared via an
unlock link, so it stays private to the people given the passphrase even though
the repo and the site are public.

Format (my4d-library-enc-v1):
  gzip(UTF-8 JSON)  ->  AES-256-GCM, key = PBKDF2-HMAC-SHA256(passphrase, salt)

  python3 tools/encrypt_library.py                 # library.json -> data/library.enc
  python3 tools/encrypt_library.py --in x.json --out y.enc
  python3 tools/encrypt_library.py --check         # decrypt data/library.enc, print summary

The passphrase is read from $LIBRARY_PASSPHRASE. If the existing output already
decrypts to the same content, the file is left untouched so an unchanged
re-scrape doesn't produce a new commit.

Requires: pip install cryptography
"""

import argparse
import base64
import gzip
import hashlib
import json
import os
import pathlib
import re
import sys
import unicodedata

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA = "my4d-library-v1"
ENC_SCHEMA = "my4d-library-enc-v1"
ITERATIONS = 310_000  # OWASP 2023 recommendation for PBKDF2-HMAC-SHA256


def fail(msg):
    print(f"LIBRARY ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def passphrase():
    p = os.environ.get("LIBRARY_PASSPHRASE", "")
    # Same normalisation as the browser: trim + NFC.
    p = unicodedata.normalize("NFC", p.strip())
    if len(p) < 8:
        fail("set LIBRARY_PASSPHRASE (at least 8 characters)")
    return p


def derive(p, salt, iterations):
    return hashlib.pbkdf2_hmac("sha256", p.encode("utf-8"), salt, iterations, dklen=32)


def validate(lib):
    """Check structure; return per-source summary lines."""
    if lib.get("schema") != SCHEMA:
        fail(f"schema must be {SCHEMA!r}")
    sources = lib.get("sources")
    entries = lib.get("entries")
    if not isinstance(sources, list) or not sources:
        fail("'sources' must be a non-empty list")
    if not isinstance(entries, dict):
        fail("'entries' must be an object keyed by source id")
    ids = set()
    lines = []
    for s in sources:
        sid, digits = s.get("id"), s.get("digits")
        if not sid or not isinstance(sid, str) or sid in ids:
            fail(f"bad or duplicate source id: {sid!r}")
        ids.add(sid)
        if digits not in (3, 4):
            fail(f"{sid}: digits must be 3 or 4")
        if not s.get("name"):
            fail(f"{sid}: missing name")
        rows = entries.get(sid)
        if not isinstance(rows, list):
            fail(f"{sid}: no entries list")
        num = re.compile(rf"^\d{{{digits}}}$")
        seen = set()
        for i, e in enumerate(rows):
            if not isinstance(e, dict) or not num.match(str(e.get("n", ""))):
                fail(f"{sid}[{i}]: 'n' must be exactly {digits} digits: {e!r}")
            if not isinstance(e.get("t"), str) or not e["t"].strip():
                fail(f"{sid}[{i}] ({e['n']}): 't' must be non-empty text")
            k = e.get("k", [])
            if not isinstance(k, list) or not all(isinstance(x, str) for x in k):
                fail(f"{sid}[{i}] ({e['n']}): 'k' must be a list of strings")
            seen.add(e["n"])
        full = 10 ** digits
        lines.append(f"  {sid:4} {s['name']}: {len(rows)} entries, "
                     f"{len(seen)}/{full} numbers covered ({100 * len(seen) / full:.1f}%)")
    extra = set(entries) - ids
    if extra:
        fail(f"entries for unknown sources: {sorted(extra)}")
    return lines


def decrypt(enc, p):
    if enc.get("schema") != ENC_SCHEMA:
        fail(f"not a {ENC_SCHEMA} file")
    kdf = enc["kdf"]
    key = derive(p, base64.b64decode(kdf["salt"]), kdf["iter"])
    try:
        plain = AESGCM(key).decrypt(base64.b64decode(enc["iv"]), base64.b64decode(enc["ct"]), None)
    except Exception:  # noqa: BLE001 - InvalidTag: wrong passphrase or corrupt file
        return None
    return json.loads(gzip.decompress(plain))


def encrypt(lib, p):
    raw = json.dumps(lib, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    salt, iv = os.urandom(16), os.urandom(12)
    ct = AESGCM(derive(p, salt, ITERATIONS)).encrypt(iv, gzip.compress(raw, 9, mtime=0), None)
    b64 = lambda b: base64.b64encode(b).decode("ascii")  # noqa: E731
    return {
        "schema": ENC_SCHEMA,
        "kdf": {"name": "PBKDF2", "hash": "SHA-256", "iter": ITERATIONS, "salt": b64(salt)},
        "cipher": "AES-GCM", "iv": b64(iv), "z": "gzip", "ct": b64(ct),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="src", default=str(ROOT / "library.json"))
    ap.add_argument("--out", default=str(ROOT / "data" / "library.enc"))
    ap.add_argument("--check", action="store_true", help="decrypt --out and print a summary")
    args = ap.parse_args()
    p = passphrase()
    out = pathlib.Path(args.out)

    if args.check:
        lib = decrypt(json.loads(out.read_text()), p)
        if lib is None:
            fail("wrong passphrase or corrupt file")
        print(f"{out} decrypts OK — generated {lib.get('generated', '?')}")
        print("\n".join(validate(lib)))
        return

    lib = json.loads(pathlib.Path(args.src).read_text(encoding="utf-8"))
    summary = validate(lib)
    print("Library OK:\n" + "\n".join(summary))

    if out.exists():
        try:
            old = decrypt(json.loads(out.read_text()), p)
            same = lambda a, b: {**a, "generated": None} == {**b, "generated": None}  # noqa: E731
            if old is not None and same(old, lib):
                print(f"{out} already up to date — not rewritten")
                return
        except (ValueError, KeyError):
            pass  # unreadable old file: just overwrite it
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(encrypt(lib, p), separators=(",", ":")) + "\n")
    print(f"wrote {out} ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
