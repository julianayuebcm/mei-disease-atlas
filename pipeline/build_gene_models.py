#!/usr/bin/env python3
"""Build compact gene models (Ensembl canonical transcript per gene) from GENCODE v38 (hg38).

Output: data/gene_models_gencode_v38.json.gz
  {GENE: {"chrom", "strand", "transcript", "tx_start", "tx_end", "cds": [start, end] | null,
          "exons": [[start, end], ...] in transcript order (exon 1 first)}}
Coordinates are 1-based inclusive, hg38.
"""
import gzip
import json
import os
import sys
from pathlib import Path

# GENCODE release 38 basic annotation (hg38), e.g.
# https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_38/gencode.v38.annotation.gff3.gz (gunzip first)
GFF3 = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("GENCODE_GFF3", "gencode.v38.annotation.gff3")
OUT = Path(__file__).resolve().parent.parent / "data" / "gene_models_gencode_v38.json.gz"


def attrs(s):
    return dict(kv.split("=", 1) for kv in s.strip().split(";") if "=" in kv)


def main():
    tx = {}  # transcript_id -> model
    with open(GFF3) as fh:
        for line in fh:
            if line.startswith("#"):
                continue
            f = line.rstrip("\n").split("\t")
            if len(f) < 9 or f[2] not in ("transcript", "exon", "CDS"):
                continue
            a = attrs(f[8])
            tid = a.get("transcript_id")
            if f[2] == "transcript":
                if "Ensembl_canonical" not in a.get("tag", ""):
                    continue
                tx[tid] = {"gene": a.get("gene_name"), "gene_type": a.get("gene_type"), "chrom": f[0],
                           "strand": f[6], "transcript": tid, "tx_start": int(f[3]), "tx_end": int(f[4]),
                           "exons": [], "cds": None}
            elif tid in tx:
                s, e = int(f[3]), int(f[4])
                if f[2] == "exon":
                    tx[tid]["exons"].append([s, e])
                else:
                    c = tx[tid]["cds"]
                    tx[tid]["cds"] = [min(s, c[0]), max(e, c[1])] if c else [s, e]
    genes = {}
    for m in tx.values():
        m["exons"].sort(reverse=(m["strand"] == "-"))  # exon 1 first
        g = m.pop("gene")
        # prefer protein-coding canonical if a symbol appears twice (PAR copies etc.)
        if g not in genes or (m["gene_type"] == "protein_coding" and genes[g]["gene_type"] != "protein_coding"):
            genes[g] = m
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(OUT, "wt") as f:
        json.dump(genes, f)
    print(f"{len(genes)} genes -> {OUT}")


if __name__ == "__main__":
    main()
