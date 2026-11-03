#!/usr/bin/env python3
"""Monthly update of the MEI Disease Atlas: find new PubMed papers, screen and extract them with Claude,
rebuild the site, and put the result on a review branch.

Steps
  1. Run the PubMed queries for papers published since the last update (data/last_update.txt); keep PMIDs
     not seen before; append them to data/raw/candidates.jsonl.
  2. Screen the new papers with Claude Code in headless mode (`claude -p`, your Claude subscription; no API key)
     using pipeline/prompts/screen.md.
  3. Fetch full text / abstracts for include + maybe papers.
  4. Extract cases with `claude -p` using pipeline/prompts/extract.md; validate; retry once on problems.
  5. Rebuild data/atlas.json, gene identifiers and the site (docs/).
  6. Commit on branch update-YYYY-MM-DD and push it (with --push) so it can be reviewed and merged on GitHub.
     Nothing reaches the live site until that branch is merged into main.

Usage
  python pipeline/monthly_update.py                  # full run, commit on a review branch (local only)
  python pipeline/monthly_update.py --push           # ... and push the branch to GitHub
  python pipeline/monthly_update.py --harvest-only   # just report how many new papers there are (no Claude use)
  python pipeline/monthly_update.py --since 2026/10/01
Run log: data/updates/<date>/log.txt
"""
import argparse
import datetime
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
import pubmed_harvest as ph  # noqa: E402

TODAY = datetime.date.today().isoformat()
RUN = ROOT / "data/updates" / TODAY
CLAUDE_TOOLS = "Read,Write,Edit,Grep,Glob,Bash(python3:*)"


def log(msg):
    line = f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    print(line, flush=True)
    with open(RUN / "log.txt", "a") as f:
        f.write(line + "\n")


def sh(cmd, **kw):
    log("$ " + " ".join(cmd))
    return subprocess.run(cmd, cwd=ROOT, check=True, text=True, **kw)


def claude(prompt, timeout_h=4):
    """Run Claude Code headless in the project folder, limited to file tools and python3."""
    res = subprocess.run(["claude", "-p", prompt, "--allowedTools", CLAUDE_TOOLS, "--permission-mode", "acceptEdits"],
                         cwd=ROOT, text=True, capture_output=True, timeout=timeout_h * 3600)
    (RUN / f"claude_{int(time.time())}.txt").write_text(res.stdout + "\n--- stderr ---\n" + res.stderr)
    if res.returncode != 0:
        raise RuntimeError(f"claude -p exited {res.returncode}: {res.stderr[-500:]}")
    return res.stdout


def harvest_new(since, record=True):
    hits = {}
    for name, q in ph.QUERIES.items():
        for p in ph.esearch(q, since):
            hits.setdefault(p, set()).add(name)
        time.sleep(0.4)
    for seed in ph.CITED_BY_SEEDS:
        for p in ph.cited_by(seed):
            hits.setdefault(p, set()).add(f"cited_by_{seed}")
        time.sleep(0.4)
    cand_file = ROOT / "data/raw/candidates.jsonl"
    seen = {json.loads(l)["pmid"] for l in open(cand_file)}
    new = sorted((p for p in hits if p not in seen), key=int)
    recs = []
    for i in range(0, len(new), 200):
        for r in ph.efetch(new[i:i + 200]):
            r["queries"] = sorted(hits.get(r["pmid"], []))
            recs.append(r)
        time.sleep(0.4)
    if record:  # report-only runs must not mark papers as seen
        with open(cand_file, "a") as f:
            for r in recs:
                f.write(json.dumps(r) + "\n")
    with open(RUN / "new_candidates.jsonl", "w") as f:
        for r in recs:
            f.write(json.dumps({k: r[k] for k in ("pmid", "title", "abstract", "year", "pub_types", "queries")}) + "\n")
    return recs


def screen(recs):
    out = RUN / "screen.jsonl"
    claude(f"""Screen papers for the MEI Disease Atlas in this project.
Read pipeline/prompts/screen.md and follow it exactly. Read every record in {RUN.relative_to(ROOT)}/new_candidates.jsonl
(fields pmid, title, abstract) and judge each one yourself from its title and abstract; do not use the web.
Write one JSON object per record (every pmid exactly once) to {out.relative_to(ROOT)} with fields
pmid, label (include|maybe|exclude), mei_class (list), genes (list), reason (<= 20 words).
Finish by checking the output has one line per input record.""")
    labels = {}
    for l in open(out):
        r = json.loads(l)
        labels[str(r["pmid"])] = r
    missing = [r["pmid"] for r in recs if r["pmid"] not in labels]
    if missing:
        raise RuntimeError(f"screening missed {len(missing)} papers: {missing[:10]}")
    merged = ROOT / "data/screen/screen_merged.json"
    allm = json.loads(merged.read_text()) if merged.exists() else {}
    allm.update(labels)
    merged.write_text(json.dumps(allm))
    keep = [p for p, r in labels.items() if r["label"] in ("include", "maybe")]
    with open(ROOT / "data/screen/to_extract.txt", "a") as f:
        f.write("".join(p + "\n" for p in keep))
    return keep


def extract(pmids):
    lst = RUN / "to_extract.txt"
    lst.write_text("\n".join(pmids) + "\n")
    sh([sys.executable, "pipeline/fetch_fulltext.py", str(lst)])
    prompt = f"""Extract structured case records for the MEI Disease Atlas in this project.
Read pipeline/prompts/extract.md and follow it exactly; field names, enum values and types must match CASE_PROPS in
pipeline/extract_with_claude.py (stub `import anthropic` if needed). For each PMID in {lst.relative_to(ROOT)}, the paper
text is data/fulltext/<pmid>.txt (first line SOURCE: full_text or abstract_only; set text_source to match). For long full
texts read the title, abstract and TABLE/FIGURE lines, then search the file for Alu, L1, LINE, SVA, retrotranspos,
insertion, exon, intron, skipping, splic, RT-PCR, polyA, TSD and read those passages. No web; never invent details.
Out of scope (cases: [] with why_none): somatic-only cancer insertions, recombination between pre-existing repeats,
association studies without a causal patient case, and all review papers. `quote` must be a verbatim substring.
Write data/extracted/<pmid>.json = {{"pmid", "cases": [...], "why_none"}} for every PMID as soon as each is done.
Then run: python3 pipeline/validate_extracted.py $(cat {lst.relative_to(ROOT)}) and fix problems until it reports 0."""
    claude(prompt)
    v = subprocess.run([sys.executable, "pipeline/validate_extracted.py", *pmids], cwd=ROOT, text=True, capture_output=True)
    if v.returncode != 0:
        log("validation problems, asking Claude to fix:\n" + v.stdout[-2000:])
        claude(f"Fix these extraction validation problems in data/extracted/ (see pipeline/prompts/extract.md and CASE_PROPS in "
               f"pipeline/extract_with_claude.py), then rerun the validator until it reports 0:\n{v.stdout[-6000:]}")
        sh([sys.executable, "pipeline/validate_extracted.py", *pmids], capture_output=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="YYYY/MM/DD (default: date in data/last_update.txt, else the atlas build date)")
    ap.add_argument("--harvest-only", action="store_true")
    ap.add_argument("--push", action="store_true", help="push the review branch to GitHub")
    args = ap.parse_args()
    RUN.mkdir(parents=True, exist_ok=True)

    state = ROOT / "data/last_update.txt"
    since = args.since or (state.read_text().strip() if state.exists() else
                           json.loads((ROOT / "data/atlas.json").read_text())["built"].replace("-", "/"))
    log(f"MEI Disease Atlas update: papers published since {since}")

    if not args.harvest_only:
        st = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=ROOT, text=True, capture_output=True).stdout
        if st.strip():
            raise SystemExit("working tree has uncommitted changes; commit or stash them before an update run")
        sh(["git", "checkout", "-q", "main"])
        sh(["git", "pull", "-q", "--ff-only", "origin", "main"])

    recs = harvest_new(since, record=not args.harvest_only)
    log(f"{len(recs)} new PubMed papers not screened before")
    if args.harvest_only:
        for r in recs[:50]:
            log(f"  {r['pmid']} {r['year']} {r['title'][:100]}")
        return
    if not recs:
        state.write_text(TODAY.replace("-", "/") + "\n")
        log("nothing new; done")
        return

    keep = screen(recs)
    log(f"screening: {len(keep)} include/maybe of {len(recs)}")
    if keep:
        extract(keep)
    before = len(json.loads((ROOT / "data/atlas.json").read_text())["events"])
    sh([sys.executable, "pipeline/build_atlas.py"], capture_output=True)
    sh([sys.executable, "pipeline/fetch_gene_xrefs.py"], capture_output=True)
    sh([sys.executable, "pipeline/build_atlas.py"], capture_output=True)
    sh([sys.executable, "pipeline/build_static.py"], capture_output=True)
    after = len(json.loads((ROOT / "data/atlas.json").read_text())["events"])
    state.write_text(TODAY.replace("-", "/") + "\n")

    branch = f"update-{TODAY}"
    new_cases = sum(len(json.loads((ROOT / f"data/extracted/{p}.json").read_text()).get("cases", []))
                    for p in keep if (ROOT / f"data/extracted/{p}.json").exists())
    msg = (f"Monthly update {TODAY}: {len(recs)} new papers screened, {len(keep)} extracted, "
           f"{new_cases} case records; insertion events {before} -> {after}\n\nAutomated by pipeline/monthly_update.py "
           f"(screening and extraction by Claude Code). Review before merging into main.")
    sh(["git", "checkout", "-q", "-b", branch])
    sh(["git", "add", "-A"])
    sh(["git", "commit", "-q", "-m", msg])
    if args.push:
        sh(["git", "push", "-q", "-u", "origin", branch])
        log(f"pushed. Review and merge: https://github.com/julianayuebcm/mei-disease-atlas/compare/main...{branch}")
    sh(["git", "checkout", "-q", "main"])
    log(f"done: events {before} -> {after}; branch {branch}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        RUN.mkdir(parents=True, exist_ok=True)
        log(f"FAILED: {e}")
        raise
