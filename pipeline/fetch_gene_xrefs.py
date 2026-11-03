#!/usr/bin/env python3
"""Look up database identifiers for every gene in the atlas from HGNC (genenames.org REST API).

Writes data/gene_xrefs.json: {SYMBOL: {"hgnc_id", "name", "omim_id", "entrez_id", "ensembl_id"}}.
Symbols not found as an approved symbol are retried as previous/alias symbols. Already-known genes are kept,
so reruns only query new genes.
Usage: python pipeline/fetch_gene_xrefs.py
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/gene_xrefs.json"


def hgnc(field, symbol):
    url = f"https://rest.genenames.org/fetch/{field}/{urllib.parse.quote(symbol)}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "mei-disease-atlas"})
    with urllib.request.urlopen(req, timeout=30) as r:
        docs = json.load(r)["response"]["docs"]
    return docs[0] if len(docs) == 1 else None


def main():
    genes = sorted({e["gene"] for e in json.loads((ROOT / "data/atlas.json").read_text())["events"]})
    known = json.loads(OUT.read_text()) if OUT.exists() else {}
    for g in genes:
        if g in known or g == "UNKNOWN":
            continue
        doc = None
        for field in ("symbol", "prev_symbol", "alias_symbol"):
            try:
                doc = hgnc(field, g)
            except Exception as e:
                print(f"[warn] {g} {field}: {e}")
            time.sleep(0.12)
            if doc:
                break
        if not doc:
            print(f"not found in HGNC: {g}")
            continue
        known[g] = {"hgnc_id": doc.get("hgnc_id"), "name": doc.get("name"), "approved_symbol": doc.get("symbol"),
                    "omim_id": (doc.get("omim_id") or [None])[0], "entrez_id": doc.get("entrez_id"),
                    "ensembl_id": doc.get("ensembl_gene_id")}
    OUT.write_text(json.dumps(known, indent=1, sort_keys=True))
    print(f"{len(known)} genes with identifiers; with OMIM gene ID: {sum(1 for v in known.values() if v.get('omim_id'))}")


if __name__ == "__main__":
    main()
