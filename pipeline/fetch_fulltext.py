#!/usr/bin/env python3
"""Step 3: fetch full text (PubMed Central) for papers that passed screening.

For each PMID with a PMCID, downloads the PMC XML and writes plain text (title, abstract,
body sections, table captions + table text, figure captions) to data/fulltext/<pmid>.txt.
Papers without PMC full text get an abstract-only file so extraction still has input.

Usage: python pipeline/fetch_fulltext.py data/screen/to_extract.txt [--records new_candidates.jsonl]
(--records supplies title/abstract/pmcid for papers not in data/raw/candidates.jsonl, e.g. on GitHub Actions)
"""
import json
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "fulltext"
EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&rettype=xml&id={}"
MAX_CHARS = 120_000  # keep prompts bounded (~30k tokens)


def txt(el):
    return " ".join("".join(el.itertext()).split()) if el is not None else ""


def pmc_text(pmcid):
    with urllib.request.urlopen(EFETCH.format(pmcid), timeout=90) as r:
        root = ET.fromstring(r.read())
    art = root.find(".//article")
    if art is None or art.find(".//body") is None:
        return None
    parts = [f"TITLE: {txt(art.find('.//article-title'))}",
             f"ABSTRACT: {txt(art.find('.//abstract'))}"]
    tables = [f"TABLE: {txt(t.find('caption'))} | {txt(t.find('.//table'))}" for t in art.iter("table-wrap")]
    figs = [f"FIGURE: {txt(f.find('label'))} {txt(f.find('caption'))}" for f in art.iter("fig")]
    body = []
    for sec in art.find(".//body").iter("sec"):
        title = txt(sec.find("title"))
        paras = " ".join(txt(p) for p in sec.findall("p"))
        if paras:
            body.append(f"## {title}\n{paras}")
    # tables/figure captions before body: case details (gene, exon, element, size) usually live there
    text = "\n\n".join(parts + tables + figs + body)
    return text[:MAX_CHARS]


def main():
    pmids = Path(sys.argv[1]).read_text().split()
    cand = {}
    local = ROOT / "data/raw/candidates.jsonl"
    if local.exists():
        cand.update({json.loads(l)["pmid"]: json.loads(l) for l in open(local)})
    if "--records" in sys.argv:
        cand.update({json.loads(l)["pmid"]: json.loads(l) for l in open(sys.argv[sys.argv.index("--records") + 1])})
    src_file = ROOT / "data/text_sources.json"
    sources = json.loads(src_file.read_text()) if src_file.exists() else {}
    OUT.mkdir(parents=True, exist_ok=True)
    n_full = n_abs = 0
    for pmid in pmids:
        out = OUT / f"{pmid}.txt"
        if out.exists():
            sources.setdefault(pmid, out.read_text()[:30].split("\n")[0].replace("SOURCE: ", ""))
            continue
        rec = cand.get(pmid, {})
        text = None
        if rec.get("pmcid"):
            try:
                text = pmc_text(rec["pmcid"])
            except Exception as e:
                print(f"[warn] {pmid} {rec['pmcid']}: {e}", file=sys.stderr)
            time.sleep(0.35)
        if text:
            out.write_text("SOURCE: full_text\n" + text)
            sources[pmid] = "full_text"
            n_full += 1
        else:
            out.write_text(f"SOURCE: abstract_only\nTITLE: {rec.get('title','')}\nABSTRACT: {rec.get('abstract','')}")
            sources[pmid] = "abstract_only"
            n_abs += 1
    src_file.write_text(json.dumps(sources, sort_keys=True, indent=0))
    print(f"full text: {n_full}, abstract only: {n_abs}", file=sys.stderr)


if __name__ == "__main__":
    main()
