#!/usr/bin/env python3
"""Step 1 of the MEI disease atlas pipeline: collect candidate papers from PubMed.

Runs a fixed set of PubMed queries (QUERIES below), takes the union of PMIDs, and
fetches title / abstract / journal / year / publication types / PMCID for each.

Output: data/raw/candidates.jsonl  (one paper per line)
        data/raw/query_hits.tsv     (which query found which PMID)

Usage:  python pipeline/pubmed_harvest.py [--min-date 2026/01/01] [--extra-pmids file.txt]
Set NCBI_API_KEY in the environment to raise the NCBI rate limit (optional).
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "raw"

QUERIES = {
    "mesh_insertion": (
        '("Alu Elements"[MeSH] OR "Long Interspersed Nucleotide Elements"[MeSH] OR '
        '"Short Interspersed Nucleotide Elements"[MeSH] OR "Retroelements"[MeSH]) '
        'AND (insertion[tiab] OR inserted[tiab]) AND humans[MeSH]'
    ),
    "tiab_mei_disease": (
        '("mobile element insertion"[tiab] OR "mobile element insertions"[tiab] OR '
        '"retrotransposon insertion"[tiab] OR "retrotransposition"[tiab] OR '
        '"Alu insertion"[tiab] OR "L1 insertion"[tiab] OR "LINE-1 insertion"[tiab] OR '
        '"SVA insertion"[tiab] OR "SVA retrotransposon"[tiab] OR "processed pseudogene insertion"[tiab]) '
        'AND (patient*[tiab] OR disease[tiab] OR syndrome[tiab] OR pathogenic[tiab] OR "case report"[pt])'
    ),
    "older_wording": (
        '("retrotransposal"[tiab] OR "L1 sequence"[tiab] OR "L1 sequences"[tiab] OR "LINE-1 sequence"[tiab] OR '
        '"Alu sequence"[tiab] OR "Alu repeat insertion"[tiab] OR "Alu element insertion"[tiab] OR '
        '"de novo insertion"[tiab] OR "SVA element"[tiab]) AND (mutation[tiab] OR patient*[tiab] OR deficiency[tiab] OR disease[tiab])'
    ),
    "reviews": (
        '("mobile element insertion"[tiab] OR retrotransposon*[tiab]) AND '
        '("human disease"[tiab] OR "genetic disease"[tiab]) AND review[pt]'
    ),
}


def _get(url, params, retries=4):
    key = os.environ.get("NCBI_API_KEY")
    if key:
        params = {**params, "api_key": key}
    full = url + "?" + urllib.parse.urlencode(params)
    for i in range(retries):
        try:
            with urllib.request.urlopen(full, timeout=60) as r:
                return r.read()
        except Exception as e:  # transient NCBI errors are common
            if i == retries - 1:
                raise
            time.sleep(2 * (i + 1))
    return b""


def esearch(term, min_date=None, datetype="pdat"):
    """datetype: "pdat" = publication date, "edat" = date the record was added to PubMed."""
    params = {"db": "pubmed", "term": term, "retmode": "json", "retmax": 100000}
    if min_date:
        params.update({"datetype": datetype, "mindate": min_date, "maxdate": "3000"})
    res = json.loads(_get(f"{EUTILS}/esearch.fcgi", params))
    return res["esearchresult"]["idlist"]


# Papers that cite these reviews are added as candidates (catches newer case reports).
CITED_BY_SEEDS = {
    "27158268": "Hancks & Kazazian 2016, Mob DNA - Roles for retrotransposon insertions in human disease",
}


def cited_by(pmid):
    res = json.loads(_get(f"{EUTILS}/elink.fcgi", {"dbfrom": "pubmed", "db": "pubmed", "id": pmid,
                                                  "linkname": "pubmed_pubmed_citedin", "retmode": "json"}))
    out = []
    for ls in res.get("linksets", []):
        for db in ls.get("linksetdbs", []):
            out += db.get("links", [])
    return out


def _text(el):
    return "".join(el.itertext()).strip() if el is not None else ""


def efetch(pmids):
    """Yield dicts for a batch of PMIDs."""
    xml = _get(f"{EUTILS}/efetch.fcgi", {"db": "pubmed", "id": ",".join(pmids), "retmode": "xml"})
    root = ET.fromstring(xml)
    for art in root.findall(".//PubmedArticle"):
        pmid = _text(art.find(".//PMID"))
        abstract = " ".join(
            (f"{a.get('Label')}: " if a.get("Label") else "") + _text(a)
            for a in art.findall(".//Abstract/AbstractText")
        )
        year = _text(art.find(".//JournalIssue/PubDate/Year")) or _text(art.find(".//ArticleDate/Year"))
        # only the article's own IDs (PubmedData/ArticleIdList) -- ".//ArticleIdList" would also match
        # the ID lists of every cited reference and pick up a reference's PMCID/DOI
        own = art.find("PubmedData/ArticleIdList")
        ids = {i.get("IdType"): _text(i) for i in (own.findall("ArticleId") if own is not None else [])}
        authors = art.findall(".//AuthorList/Author")
        first = _text(authors[0].find("LastName")) if authors else ""
        yield {
            "pmid": pmid,
            "pmcid": ids.get("pmc", ""),
            "doi": ids.get("doi", ""),
            "title": _text(art.find(".//ArticleTitle")),
            "abstract": abstract,
            "journal": _text(art.find(".//Journal/ISOAbbreviation")),
            "year": year,
            "first_author": first,
            "pub_types": [_text(p) for p in art.findall(".//PublicationType")],
        }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-date", help="only papers published on/after YYYY/MM/DD (incremental update)")
    ap.add_argument("--extra-pmids", help="file with extra PMIDs (one per line), e.g. from review tables")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    hits = {}
    for name, q in QUERIES.items():
        ids = esearch(q, args.min_date)
        print(f"{name}: {len(ids)} PMIDs", file=sys.stderr)
        for p in ids:
            hits.setdefault(p, set()).add(name)
        time.sleep(0.4)
    for seed in CITED_BY_SEEDS:
        ids = cited_by(seed)
        print(f"cited_by_{seed}: {len(ids)} PMIDs", file=sys.stderr)
        for p in ids:
            hits.setdefault(p, set()).add(f"cited_by_{seed}")
        time.sleep(0.4)
    if args.extra_pmids:
        for p in Path(args.extra_pmids).read_text().split():
            hits.setdefault(p.strip(), set()).add("extra")

    pmids = sorted(hits, key=int)
    print(f"union: {len(pmids)} PMIDs", file=sys.stderr)
    with open(OUT_DIR / "query_hits.tsv", "w") as f:
        f.write("pmid\tqueries\n")
        for p in pmids:
            f.write(f"{p}\t{','.join(sorted(hits[p]))}\n")

    n = 0
    with open(OUT_DIR / "candidates.jsonl", "w") as out:
        for i in range(0, len(pmids), 200):
            for rec in efetch(pmids[i:i + 200]):
                rec["queries"] = sorted(hits.get(rec["pmid"], []))
                out.write(json.dumps(rec) + "\n")
                n += 1
            time.sleep(0.4)
    print(f"wrote {n} records to {OUT_DIR / 'candidates.jsonl'}", file=sys.stderr)


if __name__ == "__main__":
    main()
