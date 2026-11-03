#!/usr/bin/env python3
"""Step 4 (standalone): extract structured MEI disease cases from each paper with the Claude API.

Reads data/fulltext/<pmid>.txt (from fetch_fulltext.py), sends it with prompts/extract.md to Claude,
and writes data/extracted/<pmid>.json ({"pmid", "cases": [...], "why_none"?}). Already-extracted
PMIDs are skipped, so reruns only process new papers.

Auth: ANTHROPIC_API_KEY, or an `ant auth login` profile.
Usage: python pipeline/extract_with_claude.py data/screen/to_extract.txt [--workers 4]
"""
import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import anthropic

ROOT = Path(__file__).resolve().parent.parent
PROMPT = (ROOT / "pipeline/prompts/extract.md").read_text()
MODEL = "claude-opus-5-5"

MECHANISMS = ["coding_disruption", "exon_skipping", "exonization", "aberrant_splicing", "intron_retention",
              "iralu_structure", "premature_polyadenylation", "expression_loss", "epigenetic_silencing",
              "utr_effect", "insertion_associated_deletion", "transduction_effect", "aberrant_transcript_other",
              "unknown"]
EVIDENCE = ["rna_rt_pcr", "rna_seq", "minigene", "protein", "segregation", "de_novo_confirmed",
            "functional_assay", "long_read", "none_stated"]


def s(*types):
    return {"type": list(types)}


CASE_PROPS = {
    "case_label": s("string"), "gene": s("string"), "gene_as_reported": s("string", "null"),
    "disease": s("string"), "omim_phenotype": s("string", "null"),
    "inheritance": {"type": "string", "enum": ["AD", "AR", "XL", "XLR", "XLD", "de_novo", "mosaic", "unknown"]},
    "mei_class": {"type": "string", "enum": ["Alu", "L1", "SVA", "HERV", "processed_pseudogene", "polyA_only", "unknown"]},
    "subfamily": s("string", "null"), "insertion_length_bp": s("integer", "null"), "full_length": s("boolean", "null"),
    "orientation_vs_gene": {"type": ["string", "null"], "enum": ["sense", "antisense", None]},
    "tsd": s("string", "null"), "polyA": s("boolean", "null"), "transduction": s("boolean", "null"),
    "origin": {"type": "string", "enum": ["de_novo", "inherited", "founder", "unknown"]},
    "n_patients": s("integer", "null"), "n_families": s("integer", "null"),
    "ancestry_or_population": s("string", "null"),
    "region": {"type": "string", "enum": ["coding_exon", "exon_UTR5", "exon_UTR3", "intron", "promoter",
                                          "intergenic", "multiple", "unknown"]},
    "exon_number": s("integer", "null"), "intron_number": s("integer", "null"), "transcript": s("string", "null"),
    "hgvs": s("string", "null"), "genome_build": s("string", "null"), "chrom": s("string", "null"),
    "pos": s("integer", "null"), "distance_to_splice_site_bp": s("integer", "null"),
    "mechanisms": {"type": "array", "items": {"type": "string", "enum": MECHANISMS}},
    "mechanism_detail": s("string"),
    "affected_exons": {"type": ["array", "null"], "items": {"type": "integer"}},
    "evidence": {"type": "array", "items": {"type": "string", "enum": EVIDENCE}},
    "quote": s("string"),
    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    "text_source": {"type": "string", "enum": ["full_text", "abstract_only"]},
}
SCHEMA = {
    "type": "object",
    "properties": {
        "pmid": s("string"),
        "cases": {"type": "array", "items": {"type": "object", "properties": CASE_PROPS,
                                              "required": list(CASE_PROPS), "additionalProperties": False}},
        "why_none": s("string", "null"),
    },
    "required": ["pmid", "cases", "why_none"],
    "additionalProperties": False,
}


def extract(client, pmid):
    paper = (ROOT / "data/fulltext" / f"{pmid}.txt").read_text()
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}},
        system=PROMPT,
        messages=[{"role": "user", "content": f"PMID: {pmid}\n\n<paper>\n{paper}\n</paper>"}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError(f"refused ({response.stop_details})")
    if response.stop_reason == "max_tokens":
        raise RuntimeError("hit max_tokens")
    text = next(b.text for b in response.content if b.type == "text")
    data = json.loads(text)
    data["pmid"] = pmid
    data["_model"] = response.model
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pmid_list")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    out_dir = ROOT / "data/extracted"
    out_dir.mkdir(parents=True, exist_ok=True)
    todo = [p for p in Path(args.pmid_list).read_text().split() if not (out_dir / f"{p}.json").exists()]
    print(f"{len(todo)} papers to extract", file=sys.stderr)

    client = anthropic.Anthropic()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(extract, client, p): p for p in todo}
        for fut in as_completed(futures):
            pmid = futures[fut]
            try:
                data = fut.result()
            except anthropic.RateLimitError as e:
                print(f"[rate-limited] {pmid}: rerun later ({e})", file=sys.stderr)
                continue
            except anthropic.APIStatusError as e:
                print(f"[api error {e.status_code}] {pmid}: {e.message}", file=sys.stderr)
                continue
            except anthropic.APIConnectionError as e:
                print(f"[connection] {pmid}: {e}", file=sys.stderr)
                continue
            except (RuntimeError, json.JSONDecodeError) as e:
                print(f"[failed] {pmid}: {e}", file=sys.stderr)
                continue
            (out_dir / f"{pmid}.json").write_text(json.dumps(data, indent=1))
            print(f"{pmid}: {len(data['cases'])} case(s)", file=sys.stderr)


if __name__ == "__main__":
    main()
