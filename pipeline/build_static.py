#!/usr/bin/env python3
"""Build the public multi-page site into docs/ (served by GitHub Pages).

Every page (overview, browse, mechanisms, genes, elements, methods, about, and one page per mechanism, element,
gene and case) is pre-rendered to its own docs/<path>/index.html with a page-specific <title>, description,
canonical URL and social-card tags, so search engines can index each one. The same script then takes over in
the browser for filtering, search and in-page navigation. Also writes atlas.json, sitemap.xml, robots.txt,
404.html and .nojekyll.

Usage: python pipeline/build_static.py [--base /mei-disease-atlas/] [--url https://julianayuebcm.github.io/mei-disease-atlas/]
"""
import argparse
import html
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="/mei-disease-atlas/")
    ap.add_argument("--url", default="https://julianayuebcm.github.io/mei-disease-atlas/")
    ap.add_argument("--out", default=str(ROOT / "docs"))
    args = ap.parse_args()
    base, url, out = args.base, args.url.rstrip("/") + "/", Path(args.out)

    tpl = (ROOT / "site/template.html").read_text()
    m = re.match(r"<title>.*?</title>\s*(.*?)(<style>.*?</style>)\s*(.*?)<script>\n(let ATLAS.*?)</script>\s*<script>\n(.*?)</script>\s*$", tpl, re.S)
    if not m:
        raise SystemExit("template layout not recognised")
    font_links, style, body, site_js, helix_js = m.groups()

    if out.exists():
        shutil.rmtree(out)
    (out / "assets").mkdir(parents=True)
    (out / "assets/site.js").write_text(site_js)
    (out / "assets/helix.js").write_text(helix_js)
    (out / "assets/site.css").write_text(style.removeprefix("<style>").removesuffix("</style>"))
    shutil.copy(ROOT / "data/atlas.json", out / "atlas.json")
    shutil.copy(ROOT / "data/atlas_cases.tsv", out / "atlas_cases.tsv")

    res = subprocess.run(["node", str(ROOT / "pipeline/prerender.js"), str(out / "assets/site.js"), str(out / "atlas.json"), base, url],
                         capture_output=True, text=True, check=True)
    pre = json.loads(res.stdout)

    # header/footer links -> real paths
    body_static = re.sub(r'href="#([a-z][a-z-]*)"', lambda mm: f'href="{pre["links"].get(mm.group(1), base)}"', body)

    def page(title, desc, canonical, main_html, robots="index,follow"):
        b = body_static.replace('<main id="app"></main>', f'<main id="app">{main_html}</main>')
        t, d = html.escape(title), html.escape(desc)
        return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{t}</title>
<meta name="description" content="{d}">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MEI Disease Atlas">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:url" content="{canonical}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23111a2b'/%3E%3Cpath d='M4 19h24' stroke='%23aab5c8' stroke-width='2'/%3E%3Crect x='6' y='14' width='5' height='10' rx='1' fill='%23e9eef8'/%3E%3Crect x='20' y='14' width='6' height='10' rx='1' fill='%23e9eef8'/%3E%3Cpath d='M12 5h7l-3.5 6z' fill='%23f0763f'/%3E%3C/svg%3E">
{font_links.strip()}
<link rel="stylesheet" href="{base}assets/site.css">
<script>window.ATLAS_STATIC = {{ base: "{base}", url: "{url}" }};</script>
</head>
<body>
{b.strip()}
<script src="{base}assets/site.js"></script>
<script src="{base}assets/helix.js"></script>
</body>
</html>
"""

    urls = []
    for p in pre["pages"]:
        path = p["path"].split("#")[0]
        target = out / path / "index.html" if path else out / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        canonical = url + path
        target.write_text(page(p["title"], p["desc"], canonical, p["html"]))
        urls.append(canonical)
    (out / "404.html").write_text(page("Page not found · MEI Disease Atlas", "", url, pre["notFound"], robots="noindex"))
    built = json.loads((ROOT / "data/atlas.json").read_text()).get("built", "")
    (out / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                                     "".join(f"  <url><loc>{html.escape(u)}</loc><lastmod>{built}</lastmod></url>\n" for u in urls) + "</urlset>\n")
    (out / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {url}sitemap.xml\n")
    (out / ".nojekyll").write_text("")
    for f in (ROOT / "site/static").glob("*"):   # files served as-is (e.g. Google Search Console verification)
        shutil.copy(f, out / f.name)
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file()) / 1e6
    print(f"docs/: {len(urls)} pages, sitemap with {len(urls)} URLs, {size:.1f} MB total")


if __name__ == "__main__":
    main()
