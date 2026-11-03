#!/usr/bin/env python3
"""Literature update for the MEI Disease Atlas: find papers newly added to PubMed, screen and extract them with
Claude, and rebuild the site. Runs daily on GitHub Actions (.github/workflows/daily-update.yml) or from cron.

Steps
  1. Run the PubMed queries for records added to PubMed in the look-back window (default: last 45 days), keeping
     PMIDs never screened before (data/screen/screen_merged.json, data/papers_meta.json). Most days: none -> stop.
  2. Screen new papers with Claude Code headless (`claude -p`) using pipeline/prompts/screen.md.
  3. Fetch full text / abstracts for include + maybe papers.
  4. Extract cases with `claude -p` using pipeline/prompts/extract.md; validate; retry once on problems.
  5. Rebuild data/atlas.json, gene identifiers and the site (docs/).
  6. Local runs: commit to branch update-YYYY-MM-DD (and push it with --push).
     --ci (GitHub Actions): leave changes in the working tree and report through $GITHUB_OUTPUT; the workflow
     opens the pull request. Nothing reaches the live site until the change is merged into main.

Claude login: your Claude Code login locally; on GitHub Actions the CLAUDE_CODE_OAUTH_TOKEN secret.

Usage
  python pipeline/update_literature.py --harvest-only      # list new papers; no Claude use, nothing changed
  python pipeline/update_literature.py [--push]           # local full run -> review branch
  python pipeline/update_literature.py --ci               # GitHub Actions
  options: --days 45 (look-back window) | --since YYYY/MM/DD
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
META = ROOT / "data/papers_meta.json"
SCREENED = ROOT / "data/screen/screen_merged.json"
LOCAL_CANDIDATES = ROOT / "data/raw/candidates.jsonl"   # local only (contains abstracts; not in git)


def log(msg):
    line = f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    print(line, flush=True)
    with open(RUN / "log.txt", "a") as f:
        f.write(line + "\n")


def sh(cmd, **kw):
    log("$ " + " ".join(cmd))
    return subprocess.run(cmd, cwd=ROOT, check=True, text=True, **kw)


def output(**kv):
    """Report results to a GitHub Actions step (no-op elsewhere)."""
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a") as f:
            for k, v in kv.items():
                if "\n" in str(v):
                    f.write(f"{k}<<EOF_{k}\n{v}\nEOF_{k}\n")
                else:
                    f.write(f"{k}={v}\n")


def claude(prompt, timeout_h=4):
    """Run Claude Code headless in the project folder, limited to file tools and python3."""
    res = subprocess.run(["claude", "-p", prompt, "--allowedTools", CLAUDE_TOOLS, "--permission-mode", "acceptEdits"],
                         cwd=ROOT, text=True, capture_output=True, timeout=timeout_h * 3600)
    (RUN / f"claude_{int(time.time())}.txt").write_text(res.stdout + "\n--- stderr ---\n" + res.stderr)
    if res.returncode != 0:
        raise RuntimeError(f"claude -p exited {res.returncode}: {(res.stderr or res.stdout)[-800:]}")
    return res.stdout


def seen_pmids():
    seen = set(json.loads(SCREENED.read_text())) if SCREENED.exists() else set()
    if META.exists():
        seen |= set(json.loads(META.read_text()))
    if LOCAL_CANDIDATES.exists():
        seen |= {json.loads(l)["pmid"] for l in open(LOCAL_CANDIDATES)}
    return seen


def harvest_new(since, record):
    hits = {}
    for name, q in ph.QUERIES.items():
        for p in ph.esearch(q, since, datetype="edat"):
            hits.setdefault(p, set()).add(name)
        time.sleep(0.4)
    for seed in ph.CITED_BY_SEEDS:
        for p in ph.cited_by(seed):
            hits.setdefault(p, set()).add(f"cited_by_{seed}")
        time.sleep(0.4)
    seen = seen_pmids()
    new = sorted((p for p in hits if p not in seen), key=int)
    recs = []
    for i in range(0, len(new), 200):
        for r in ph.efetch(new[i:i + 200]):
            r["queries"] = sorted(hits.get(r["pmid"], []))
            recs.append(r)
        time.sleep(0.4)
    with open(RUN / "new_candidates.jsonl", "w") as f:
        for r in recs:
            f.write(json.dumps(r) + "\n")
    if record and recs:   # report-only runs must not mark papers as seen
        meta = json.loads(META.read_text()) if META.exists() else {}
        for r in recs:
            meta[r["pmid"]] = {k: r.get(k) for k in ("title", "year", "journal", "first_author", "pmcid", "doi")}
        META.write_text(json.dumps(meta, sort_keys=True, separators=(",", ":")))
        if LOCAL_CANDIDATES.exists():
            with open(LOCAL_CANDIDATES, "a") as f:
                for r in recs:
                    f.write(json.dumps(r) + "\n")
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
        if l.strip():
            r = json.loads(l)
            labels[str(r["pmid"])] = r
    missing = [r["pmid"] for r in recs if r["pmid"] not in labels]
    if missing:
        raise RuntimeError(f"screening missed {len(missing)} papers: {missing[:10]}")
    allm = json.loads(SCREENED.read_text()) if SCREENED.exists() else {}
    allm.update(labels)
    SCREENED.write_text(json.dumps(allm))
    keep = sorted((p for p, r in labels.items() if r["label"] in ("include", "maybe")), key=int)
    with open(ROOT / "data/screen/to_extract.txt", "a") as f:
        f.write("".join(p + "\n" for p in keep))
    return keep, labels


def extract(pmids):
    lst = RUN / "to_extract.txt"
    lst.write_text("\n".join(pmids) + "\n")
    sh([sys.executable, "pipeline/fetch_fulltext.py", str(lst), "--records", str(RUN / "new_candidates.jsonl")])
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
    ap.add_argument("--since", help="YYYY/MM/DD: records added to PubMed on/after this date")
    ap.add_argument("--days", type=int, default=45, help="look-back window when --since is not given (default 45)")
    ap.add_argument("--harvest-only", action="store_true")
    ap.add_argument("--push", action="store_true", help="local runs: push the review branch to GitHub")
    ap.add_argument("--ci", action="store_true", help="GitHub Actions mode: no git operations; report via $GITHUB_OUTPUT")
    args = ap.parse_args()
    RUN.mkdir(parents=True, exist_ok=True)
    output(changed="false")
    since = args.since or (datetime.date.today() - datetime.timedelta(days=args.days)).strftime("%Y/%m/%d")
    log(f"MEI Disease Atlas update: PubMed records added since {since}")

    local_git = not (args.harvest_only or args.ci)
    if local_git:
        st = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=ROOT, text=True, capture_output=True).stdout
        if st.strip():
            raise SystemExit("working tree has uncommitted changes; commit or stash them before an update run")
        sh(["git", "checkout", "-q", "main"])
        sh(["git", "pull", "-q", "--ff-only", "origin", "main"])

    recs = harvest_new(since, record=not args.harvest_only)
    log(f"{len(recs)} new PubMed papers not screened before")
    for r in recs[:50]:
        log(f"  {r['pmid']} {r.get('year')} {(r.get('title') or '')[:100]}")
    if args.harvest_only or not recs:
        log("done")
        return

    keep, labels = screen(recs)
    log(f"screening: {len(keep)} include/maybe of {len(recs)}")
    if keep:
        extract(keep)
    before = len(json.loads((ROOT / "data/atlas.json").read_text())["events"])
    sh([sys.executable, "pipeline/build_atlas.py"], capture_output=True)
    sh([sys.executable, "pipeline/fetch_gene_xrefs.py"], capture_output=True)
    sh([sys.executable, "pipeline/build_atlas.py"], capture_output=True)
    sh([sys.executable, "pipeline/build_static.py"], capture_output=True)
    after = len(json.loads((ROOT / "data/atlas.json").read_text())["events"])

    new_cases = []
    for p in keep:
        f = ROOT / f"data/extracted/{p}.json"
        if f.exists():
            for c in json.loads(f.read_text()).get("cases", []):
                new_cases.append(f"- PMID {p}: {c.get('gene')} {c.get('mei_class')} ({', '.join(c.get('mechanisms') or [])}), "
                                 f"{c.get('disease')} [confidence: {c.get('confidence')}]")
    title = f"Literature update {TODAY}: {len(recs)} new papers, {len(new_cases)} case records"
    body = (f"Automated by `pipeline/update_literature.py`.\n\n"
            f"- New PubMed papers screened: {len(recs)}\n- Passed screening (include/maybe): {len(keep)}\n"
            f"- Case records extracted: {len(new_cases)}\n- Insertion events: {before} -> {after}\n\n"
            + ("### New case records\n" + "\n".join(new_cases) + "\n\n" if new_cases else "")
            + "### Screened papers\n" + "\n".join(f"- {p} **{labels[p]['label']}**: {labels[p].get('reason', '')}" for p in sorted(labels, key=int))
            + "\n\nScreening and extraction were done by Claude. Check the new records against the papers before merging; "
              "merging publishes them on the live site.")
    (RUN / "pr_body.md").write_text(body)
    log(title)

    if args.ci:
        output(changed="true", title=title, body_file=str(RUN / "pr_body.md"))
        return
    branch = f"update-{TODAY}"
    sh(["git", "checkout", "-q", "-b", branch])
    sh(["git", "add", "-A"])
    sh(["git", "commit", "-q", "-m", title + "\n\n" + body])
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
