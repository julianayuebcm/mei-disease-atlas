#!/usr/bin/env python3
"""Step 5: merge per-paper extractions into the atlas dataset used by the website.

- Collects every case from data/extracted/*.json and attaches paper metadata (title, year, journal, authors).
- Groups records describing the same insertion (same gene, MEI class, region and exon/intron, compatible
  size/HGVS) into one *event*; an event keeps every supporting paper.
- Attaches the gene's canonical GENCODE v38 model and a diagram placement for the insertion.
- Writes data/atlas.json and a flat data/atlas_cases.tsv, and prints recall against the Hancks & Kazazian 2016 table.
"""
import csv
import gzip
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MECH_ORDER = ["coding_disruption", "exon_skipping", "exonization", "aberrant_splicing", "intron_retention",
              "iralu_structure", "premature_polyadenylation", "expression_loss", "epigenetic_silencing",
              "utr_effect", "insertion_associated_deletion", "transduction_effect", "aberrant_transcript_other",
              "unknown"]
CONF_RANK = {"high": 0, "medium": 1, "low": 2}


GENE_ALIAS = {"FVIII": "F8", "FIX": "F9", "ZFHX1B": "ZEB2", "LDRAP1": "LDLRAP1", "ARH": "LDLRAP1", "ABDH5": "ABHD5",
              "NT5C3": "NT5C3A", "TNFRSF6": "FAS", "FCMD": "FKTN", "SUZ1P": "SUZ12P1", "SUZ12P": "SUZ12P1"}


def norm_gene(g):
    g = (g or "").strip().upper().replace(" ", "")
    return GENE_ALIAS.get(g, g)


def _eq_or_missing(x, y, missing=(None, "", "unknown", "multiple")):
    return x in missing or y in missing or x == y


def informative(r):
    return any(r.get(k) not in (None, "", "unknown") for k in
               ("exon_number", "intron_number", "insertion_length_bp", "subfamily", "hgvs", "pos")) or \
        r.get("region") not in (None, "unknown")


def hgvs_core(h):
    """'NM_000059.4:c.156_157ins[...]' and 'c.156_157insAlu' -> 'c.156_157'."""
    m = re.search(r"c\.([-*]?\d+(?:[+-]\d+)?(?:_[-*]?\d+(?:[+-]\d+)?)?)", h or "")
    return m.group(1) if m else None


def exon_from_cdna(h, model):
    """Exon number (canonical transcript) containing coding position c.N; None for intronic/UTR offsets."""
    m = re.search(r"c\.(\d+)(?![+-]\d)", h or "")
    if not m or not model or not model.get("cds"):
        return None
    n, (cs, ce), plus = int(m.group(1)), model["cds"], model["strand"] == "+"
    done = 0
    for i, (s_, e_) in enumerate(model["exons"]):
        lo, hi = max(s_, cs), min(e_, ce)
        if lo > hi:
            continue
        if done < n <= done + (hi - lo + 1):
            return i + 1
        done += hi - lo + 1
    return None


def compatible(a, b):
    """Same insertion unless class, location, size, HGVS, coordinate or subfamily clearly differ.
    'unknown' element class (abstract said only "retrotransposal insertion") is compatible with any class."""
    if not _eq_or_missing(a.get("mei_class"), b.get("mei_class")):
        return False
    ra, rb = a.get("region"), b.get("region")
    exonic = ("coding_exon", "exon_UTR5", "exon_UTR3", "exon_unspecified")
    if not (_eq_or_missing(ra, rb) or (ra in exonic and rb in exonic and "exon_unspecified" in (ra, rb))):
        return False
    for k in ("exon_number", "intron_number"):
        if not _eq_or_missing(a.get(k), b.get(k)):
            return False
    la, lb = a.get("insertion_length_bp"), b.get("insertion_length_bp")
    if la and lb and abs(la - lb) > max(30, 0.15 * max(la, lb)):
        return False
    ha, hb = hgvs_core(a.get("hgvs")), hgvs_core(b.get("hgvs"))
    if ha and hb and ha != hb:
        return False
    pa, pb = a.get("pos"), b.get("pos")
    if pa and pb and a.get("genome_build") == b.get("genome_build") and abs(pa - pb) > 50:
        return False
    sa, sb = (a.get("subfamily") or "").upper(), (b.get("subfamily") or "").upper()
    if sa and sb and not (sa.startswith(sb) or sb.startswith(sa)):
        return False
    return True


HANCKS_PMID = "27158268"
HANCKS_SKIP_ROWS = {"27", "95", "99", "112", "114", "118", "119"}  # somatic tumour or association-only rows (out of scope)
HANCKS_CLASS = {"Alu": "Alu", "L1": "L1", "SVA": "SVA", "Processed Pseudogene": "processed_pseudogene", "pA": "polyA_only"}


def hancks_records():
    """Rows of Hancks & Kazazian 2016 Table 1 as low-confidence records attributed to the primary paper they cite."""
    out = []
    for r in csv.DictReader(open(ROOT / "data/raw/hancks2016_table1.tsv"), delimiter="\t"):
        if r[""] in HANCKS_SKIP_ROWS:
            continue
        col = r["Exon/Intron/Mechanism"]
        mech, region = ["unknown"], "unknown"
        if col == "E":
            region = "exon_unspecified"
        elif col.startswith("I"):
            region = "intron"
        if "Splicing" in col:
            mech = ["aberrant_splicing"]
        if "Loss of mRNA" in col:
            mech = ["expression_loss"]
        if "Deletion" in col:
            mech = ["insertion_associated_deletion"]
        if col.startswith("5"):
            region = "exon_UTR5"
        size = r["Size"]
        trunc = r["Truncation"]
        pmids = [x for x in r["ref_pmids"].split(";") if x]
        out.append({
            "pmid": pmids[0] if pmids else HANCKS_PMID, "gene": norm_gene(r["Gene"]), "disease": r["Disease"],
            "mei_class": HANCKS_CLASS.get(r["Insertion"], "unknown"),
            "subfamily": None if r["Subfamily"] in ("N/A", "") else r["Subfamily"],
            "insertion_length_bp": int(size) if size.isdigit() else None,
            "full_length": True if (size == "FL" or trunc == "FL") else (False if trunc.startswith("Y") else None),
            "orientation_vs_gene": {"S": "sense", "AS": "antisense"}.get(r["Strand"]),
            "tsd": None if r["Target-site duplication (TSD)"] in ("N/A", "", "No TSD") else r["Target-site duplication (TSD)"],
            "region": region, "exon_number": None, "intron_number": None, "mechanisms": mech,
            "origin": "unknown", "inheritance": "unknown", "confidence": "low", "text_source": "review_table",
            "evidence": [], "quote": None, "case_label": f"{r['Insertion']} in {r['Gene']} ({r['Reference']})",
            "mechanism_detail": f"Listed in Hancks & Kazazian 2016 Table 1 (cites {r['Reference']}); "
                                f"exon/intron/mechanism column: {col}." + (f" Note: {r['Note']}." if r["Note"] else ""),
            "_review_row": r[""],
        })
    return out


ID_REGISTRY = ROOT / "data/event_ids.json"


def assign_stable_ids(events):
    """Give each event a permanent ID (MEI0001...). A registry remembers gene, element class, location and supporting
    PMIDs for every ID ever issued; an event reuses the ID of the registry entry with the same gene that shares a PMID
    (and a compatible class and location), otherwise it gets the next unused number. IDs are never reused."""
    reg = json.loads(ID_REGISTRY.read_text()) if ID_REGISTRY.exists() else {"next": 1, "ids": {}}
    taken = set()

    def score(entry, ev):
        if entry["gene"] != ev["gene"] or entry["id"] in taken:
            return -1
        shared = len(set(entry["pmids"]) & set(ev["pmids"]))
        if not shared:
            return -1
        same_cls = entry["mei_class"] == ev["mei_class"] or "unknown" in (entry["mei_class"], ev["mei_class"])
        same_loc = (entry.get("exon_number"), entry.get("intron_number")) == (ev.get("exon_number"), ev.get("intron_number"))
        return shared * 10 + same_cls * 5 + same_loc * 3 if same_cls else -1

    entries = list(reg["ids"].values())
    # most-reported events claim their IDs first so a small new event can't steal a big one's ID
    for ev in sorted(events, key=lambda e: -len(e["pmids"])):
        best = max(entries, key=lambda en: score(en, ev), default=None)
        if best is not None and score(best, ev) >= 0:
            ev["id"] = best["id"]
        else:
            ev["id"] = f"MEI{reg['next']:04d}"
            reg["next"] += 1
        taken.add(ev["id"])
        reg["ids"][ev["id"]] = {"id": ev["id"], "gene": ev["gene"], "mei_class": ev["mei_class"], "pmids": ev["pmids"],
                                "exon_number": ev.get("exon_number"), "intron_number": ev.get("intron_number")}
    ID_REGISTRY.write_text(json.dumps(reg, indent=1))


def placement(case, model):
    """Where to draw the insertion on the canonical transcript: (kind, exon index or intron index, fraction)."""
    if not model:
        return None
    n_ex = len(model["exons"])
    build = (case.get("genome_build") or "").lower()
    if case.get("pos") and case.get("chrom") and ("38" in build) and \
            str(case["chrom"]).replace("chr", "") == model["chrom"].replace("chr", ""):
        p = case["pos"]
        for i, (s, e) in enumerate(model["exons"]):
            if s <= p <= e:
                frac = (p - s) / max(1, e - s)
                return {"kind": "exon", "index": i + 1, "frac": frac if model["strand"] == "+" else 1 - frac,
                        "source": "hg38 coordinate"}
        for i in range(n_ex - 1):
            (s1, e1), (s2, e2) = model["exons"][i], model["exons"][i + 1]
            lo, hi = (e1, s2) if model["strand"] == "+" else (e2, s1)
            if lo < p < hi:
                frac = (p - lo) / max(1, hi - lo)
                return {"kind": "intron", "index": i + 1, "frac": frac if model["strand"] == "+" else 1 - frac,
                        "source": "hg38 coordinate"}
    region = case.get("region")
    if case.get("exon_number") and region in ("coding_exon", "exon_UTR5", "exon_UTR3", "multiple", "unknown"):
        k = case["exon_number"]
        if 1 <= k <= n_ex:
            return {"kind": "exon", "index": k, "frac": 0.5, "source": "exon number from paper"}
    if case.get("intron_number") and 1 <= case["intron_number"] < n_ex:
        return {"kind": "intron", "index": case["intron_number"], "frac": 0.5, "source": "intron number from paper"}
    if region == "exon_UTR5":
        return {"kind": "exon", "index": 1, "frac": 0.2, "source": "5' UTR (approximate)"}
    if region == "exon_UTR3":
        return {"kind": "exon", "index": n_ex, "frac": 0.8, "source": "3' UTR (approximate)"}
    if region == "promoter":
        return {"kind": "promoter", "index": 0, "frac": 0.5, "source": "promoter (approximate)"}
    return None


def main():
    papers = {json.loads(l)["pmid"]: json.loads(l) for l in open(ROOT / "data/raw/candidates.jsonl")}
    models = json.load(gzip.open(ROOT / "data/gene_models_gencode_v38.json.gz", "rt"))
    alias = {}  # old symbol -> current (only from extraction's gene_as_reported)

    records = []
    n_papers = n_with = 0
    for f in sorted((ROOT / "data/extracted").glob("*.json")):
        d = json.loads(f.read_text())
        n_papers += 1
        if d.get("cases"):
            n_with += 1
        for i, c in enumerate(d.get("cases", [])):
            c = dict(c)
            if "from review" in (c.get("mechanism_detail") or "").lower():
                continue  # review-table rows are added from the parsed Hancks table instead (attributed to primary papers)
            c["pmid"] = d["pmid"]
            c["gene"] = norm_gene(c.get("gene"))
            if c.get("gene_as_reported"):
                alias[norm_gene(c["gene_as_reported"])] = c["gene"]
            c["mechanisms"] = sorted(set(c.get("mechanisms") or ["unknown"]),
                                     key=lambda m: MECH_ORDER.index(m) if m in MECH_ORDER else 99)
            records.append(c)

    # fill exon number from the cDNA position when the paper gave HGVS but no exon
    for r in records:
        if r.get("exon_number") is None and r.get("hgvs"):
            k = exon_from_cdna(r["hgvs"], models.get(r["gene"]))
            if k:
                r["exon_number"] = k
                r["exon_from_hgvs"] = True

    # group into insertion events
    by_key = defaultdict(list)
    for r in records:
        by_key[r["gene"]].append(r)
    events = []
    for key, recs in by_key.items():
        # informative records first, so vague ones ("an L1 insertion in F8") attach to a real event
        recs.sort(key=lambda r: (not informative(r), CONF_RANK.get(r.get("confidence"), 3), r.get("text_source") != "full_text"))
        clusters = []
        for r in recs:
            fits = [cl for cl in clusters if all(compatible(r, x) for x in cl)]
            if not informative(r) and len(fits) > 1:
                if r.get("origin") == "founder" or "founder" in (r.get("case_label") or "").lower():
                    fits = [max(fits, key=len)]  # "the founder insertion" = the gene's most-reported event
                else:
                    fits = []  # too vague to say which of several insertions in this gene it is
            if fits:
                fits[0].append(r)
            else:
                clusters.append([r])
        for cl in clusters:
            best = cl[0]
            mech = Counter()
            for r in cl:  # full-text, high-confidence reports outweigh thin abstracts
                w = {"high": 3, "medium": 2, "low": 1}.get(r.get("confidence"), 1) * (2 if r.get("text_source") == "full_text" else 1)
                for m in r["mechanisms"]:
                    mech[m] += w
            mech_list = sorted(mech, key=lambda m: (-mech[m], MECH_ORDER.index(m) if m in MECH_ORDER else 99))
            if len(mech_list) > 1 and "unknown" in mech_list:
                mech_list.remove("unknown")
            if best.get("region") in ("intron", "exon_UTR5", "exon_UTR3", "promoter", "intergenic") and \
                    len(mech_list) > 1 and mech_list[0] == "coding_disruption":
                mech_list.append(mech_list.pop(0))  # a UTR/intronic insertion acts through the other mechanisms
            pmids = sorted({r["pmid"] for r in cl}, key=lambda p: (int(papers.get(p, {}).get("year") or 9999), int(p)))
            ev = {k: best.get(k) for k in best if k not in ("pmid", "mechanisms", "quote", "mechanism_detail")}
            ev.update({
                "mechanisms": mech_list,
                "pmids": pmids,
                "first_year": min((int(papers[p]["year"]) for p in pmids if papers.get(p, {}).get("year")), default=None),
                "reports": [{"pmid": r["pmid"], "mechanisms": r["mechanisms"], "mechanism_detail": r.get("mechanism_detail"),
                             "quote": r.get("quote"), "evidence": r.get("evidence"), "confidence": r.get("confidence"),
                             "text_source": r.get("text_source"), "case_label": r.get("case_label")} for r in cl],
                "evidence": sorted({e for r in cl for e in (r.get("evidence") or [])}),
                "n_patients": max((r.get("n_patients") or 0 for r in cl), default=0) or None,
                "n_families": max((r.get("n_families") or 0 for r in cl), default=0) or None,
            })
            known_cls = Counter(r["mei_class"] for r in cl if r.get("mei_class") not in (None, "unknown"))
            ev["mei_class"] = known_cls.most_common(1)[0][0] if known_cls else "unknown"
            known_reg = Counter(r["region"] for r in cl if r.get("region") not in (None, "unknown"))
            ev["region"] = known_reg.most_common(1)[0][0] if known_reg else "unknown"
            for k in ("exon_number", "intron_number", "subfamily", "insertion_length_bp", "tsd", "hgvs", "chrom", "pos", "genome_build",
                      "transcript", "omim_phenotype", "orientation_vs_gene", "affected_exons"):
                if ev.get(k) in (None, ""):
                    ev[k] = next((r.get(k) for r in cl if r.get(k) not in (None, "")), None)
            events.append(ev)

    # attach review-table rows to the event from the same primary paper, else add them as review-only events
    n_attached = n_new = 0
    for h in hancks_records():
        same_gene = [e for e in events if e["gene"] == h["gene"] and not e.get("review_only") and compatible(h, e)]
        target = next((e for e in same_gene if h["pmid"] in e["pmids"]), None)
        if target is None and len(same_gene) == 1 and h["pmid"] == HANCKS_PMID:
            target = same_gene[0]
        rep = {"pmid": h["pmid"], "mechanisms": h["mechanisms"], "mechanism_detail": h["mechanism_detail"], "quote": None,
               "evidence": [], "confidence": "low", "text_source": "review_table", "case_label": h["case_label"]}
        if target:
            target["reports"].append(rep)
            for k in ("subfamily", "insertion_length_bp", "tsd", "orientation_vs_gene", "full_length"):
                if target.get(k) in (None, ""):
                    target[k] = h[k]
            if target.get("mei_class") == "unknown":
                target["mei_class"] = h["mei_class"]
            n_attached += 1
        else:
            ev = {k: v for k, v in h.items() if k not in ("pmid", "quote", "mechanism_detail", "_review_row")}
            ev.update({"pmids": [h["pmid"]], "reports": [rep], "n_patients": None, "n_families": None,
                       "first_year": int(papers[h["pmid"]]["year"]) if papers.get(h["pmid"], {}).get("year") else None,
                       "review_only": True})
            events.append(ev)
            n_new += 1
    print(f"Hancks table rows: {n_attached} attached to extracted events, {n_new} added as review-only events")

    events.sort(key=lambda e: (e["gene"], e.get("first_year") or 9999))
    assign_stable_ids(events)
    genes_used = {}
    for ev in events:
        g = ev["gene"]
        model = models.get(g) or models.get(alias.get(g, ""))
        if model:
            genes_used[g] = {k: model[k] for k in ("chrom", "strand", "transcript", "tx_start", "tx_end", "cds", "exons")}
        ev["placement"] = placement(ev, model)

    paper_meta = {}
    for ev in events:
        for p in ev["pmids"]:
            m = papers.get(p, {})
            paper_meta[p] = {"title": m.get("title"), "year": m.get("year"), "journal": m.get("journal"),
                             "first_author": m.get("first_author"), "pmcid": m.get("pmcid"), "doi": m.get("doi")}

    import datetime
    out = {"built": datetime.date.today().isoformat(), "events": events, "genes": genes_used, "papers": paper_meta,
           "stats": {"papers_screened": len(papers), "papers_extracted": n_papers, "papers_with_cases": n_with,
                     "case_records": len(records), "events": len(events)}}
    (ROOT / "data/atlas.json").write_text(json.dumps(out))
    with open(ROOT / "data/atlas_cases.tsv", "w", newline="") as f:
        cols = ["id", "gene", "disease", "mei_class", "subfamily", "region", "exon_number", "intron_number",
                "mechanisms", "origin", "inheritance", "insertion_length_bp", "n_families", "first_year", "pmids",
                "evidence", "confidence"]
        w = csv.writer(f, delimiter="\t")
        w.writerow(cols)
        for ev in events:
            w.writerow([";".join(map(str, ev[c])) if isinstance(ev.get(c), list) else ev.get(c) for c in cols])

    print(json.dumps(out["stats"]))
    print("events by class:", Counter(e["mei_class"] for e in events).most_common())
    print("events by primary mechanism:", Counter(e["mechanisms"][0] for e in events).most_common())
    print("placed on diagram:", sum(1 for e in events if e["placement"]), "/", len(events),
          "| gene model found:", sum(1 for e in events if e["gene"] in genes_used))

    # recall vs Hancks & Kazazian 2016 Table 1 (gene + element class)
    cls = {"Alu": "Alu", "L1": "L1", "SVA": "SVA", "Processed Pseudogene": "processed_pseudogene", "pA": "polyA_only"}
    primary = [e for e in events if any(r.get("text_source") != "review_table" for r in e["reports"])]
    have = {(e["gene"], e["mei_class"]) for e in primary}
    have_gene = {e["gene"] for e in primary}
    rows = list(csv.DictReader(open(ROOT / "data/raw/hancks2016_table1.tsv"), delimiter="\t"))
    hit = [r for r in rows if (norm_gene(r["Gene"]), cls.get(r["Insertion"], "?")) in have]
    gene_only = [r for r in rows if norm_gene(r["Gene"]) in have_gene and r not in hit]
    miss = [r for r in rows if norm_gene(r["Gene"]) not in have_gene]
    print(f"Recall of primary-paper extraction vs Hancks 2016 table (review rows not counted): {len(rows)} rows | gene+class found {len(hit)} | gene only {len(gene_only)} | missing {len(miss)}")
    out["stats"].update({"review_rows": len(rows), "review_found": len(hit), "review_gene_only": len(gene_only),
                         "review_missing": len(miss), "with_full_text": sum(1 for f in (ROOT / "data/fulltext").glob("*.txt")
                                                                      if f.read_text()[:20].startswith("SOURCE: full_text"))})
    (ROOT / "data/atlas.json").write_text(json.dumps(out))
    (ROOT / "data/hancks_missing.tsv").write_text(
        "\n".join(f"{r['Gene']}\t{r['Insertion']}\t{r['Disease']}\t{r['Reference']}\t{r['ref_pmids']}" for r in miss) + "\n")


if __name__ == "__main__":
    main()
