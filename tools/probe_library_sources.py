#!/usr/bin/env python3
"""One-off reconnaissance of candidate 千字图 / 万字图 sites.

Prints, per page: HTTP status, size, scripts, links and any API-looking URLs
(also searched inside same-site JS files), plus a short excerpt of the HTML
and its visible text. The output is only used to decide how to write
tools/scrape_library.py; it fetches a handful of pages and stores nothing.

Standard library only:  python3 tools/probe_library_sources.py [url ...]
"""

import html
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PAGES = [
    "https://4dluckybook.com/",
    "https://4dluckybook.com/home/?menu=bookitem&id=3",
    "https://4d.tickalook.io/",
    "https://dream.4dnum.com/",
    "https://4dmanager.net/search/database",
    "https://4dpanda.com/dictionary",
]
UA = ("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36")
API_HINT = re.compile(
    r"""["'`]([^"'`\s]*(?:/api/|\.json|\.php|ajax|graphql|search|query|dict|dream|book)[^"'`\s]*)["'`]""",
    re.I)


def get(url, limit=3_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            body = r.read(limit)
            return r.status, r.headers.get("Content-Type", ""), r.geturl(), body
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), url, e.read(20_000)
    except Exception as e:  # noqa: BLE001 - recon: report anything
        return None, str(e), url, b""


def text_of(doc):
    doc = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", " ", doc)
    doc = re.sub(r"(?s)<[^>]+>", " ", doc)
    return re.sub(r"\s+", " ", html.unescape(doc)).strip()


def probe(url):
    print("=" * 100)
    print("URL:", url)
    status, ctype, final, body = get(url)
    print(f"status={status} type={ctype} final={final} bytes={len(body)}")
    if not body:
        return
    doc = body.decode("utf-8", "replace")
    host = urllib.parse.urlparse(final).netloc

    scripts = re.findall(r"""<script[^>]+src=["']([^"']+)""", doc, re.I)
    print("\n-- scripts:", *scripts[:25], sep="\n  ")
    links = list(dict.fromkeys(re.findall(r"""href=["']([^"'#]+)""", doc, re.I)))
    print(f"\n-- links ({len(links)} unique, first 80):", *links[:80], sep="\n  ")
    hints = sorted(set(API_HINT.findall(doc)))
    print("\n-- api-looking strings in page:", *hints[:60], sep="\n  ")
    inline = re.findall(r"(?is)<script(?![^>]*src)[^>]*>(.*?)</script>", doc)
    big = [s for s in inline if len(s) > 2000]
    print(f"\n-- inline scripts: {len(inline)} ({len(big)} over 2KB, sizes {[len(s) for s in big][:10]})")
    for s in big[:3]:
        print("   excerpt:", s.strip()[:600].replace("\n", " "))

    for src in scripts[:8]:
        js_url = urllib.parse.urljoin(final, src)
        if urllib.parse.urlparse(js_url).netloc != host:
            continue
        time.sleep(1)
        st, _, _, js = get(js_url)
        found = sorted(set(API_HINT.findall(js.decode("utf-8", "replace"))))
        print(f"\n-- JS {js_url} status={st} bytes={len(js)} api-looking:", *found[:40], sep="\n  ")

    print("\n-- HTML head (2500 chars):\n", doc[:2500])
    print("\n-- visible text (3000 chars):\n", text_of(doc)[:3000])


def main():
    for url in sys.argv[1:] or PAGES:
        probe(url)
        time.sleep(2)


if __name__ == "__main__":
    main()
