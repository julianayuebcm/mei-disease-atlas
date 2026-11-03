# MEI Disease Atlas

**Live site: https://julianayuebcm.github.io/mei-disease-atlas/**

A curated atlas of published germline mobile element insertions (Alu, L1, SVA and others) that cause human disease,
with each insertion coded by mechanism (coding disruption, exon skipping, exonization, aberrant splicing,
insertion-associated deletion, ...), element, subfamily, location and evidence, and drawn on its gene's
canonical transcript.

Built only from published literature (PubMed / PubMed Central) and public gene annotation (GENCODE v38).
It contains no patient data.

> **Disclaimer.** Records were extracted with the help of a large language model (Claude, Anthropic) and merged
> automatically; they have been only partly checked by hand and may contain errors. For research and education
> only, not for clinical use. Always confirm details in the original paper.

## Repository layout
| Path | What |
|---|---|
| `docs/` | The built website (GitHub Pages serves this folder) |
| `data/atlas.json`, `data/atlas_cases.tsv` | The curated dataset (one record per insertion event) |
| `data/extracted/<pmid>.json` | Per-paper extraction records |
| `data/event_ids.json` | Registry that keeps insertion IDs (MEI0001, ...) stable across rebuilds |
| `pipeline/` | Search, screening, extraction, merging and site-building code |
| `site/template.html` | Website source |

## Rebuilding
```
python pipeline/pubmed_harvest.py --extra-pmids data/raw/hancks2016_table_pmids.txt   # PubMed candidates
python pipeline/fetch_fulltext.py data/screen/to_extract.txt                           # PMC full text / abstracts
python pipeline/extract_with_claude.py data/screen/to_extract.txt                      # needs ANTHROPIC_API_KEY
python pipeline/validate_extracted.py
python pipeline/build_atlas.py          # merge into insertion events -> data/atlas.json
python pipeline/build_static.py         # pre-render every page into docs/ (needs node)
```
Screening prompts and the extraction schema are in `pipeline/prompts/`. `pipeline/build_gene_models.py <gencode.v38.annotation.gff3>`
regenerates `data/gene_models_gencode_v38.json.gz`.

## Monthly updates
`pipeline/monthly_update.sh` finds papers published since the last run, screens and extracts them with Claude Code in
headless mode (`claude -p`, no API key needed), rebuilds the site and commits the result to a review branch
`update-YYYY-MM-DD` (pushed with `--push`). Merge the branch into `main` on GitHub to publish. Example crontab line
(06:00 on the 1st of each month):
```
0 6 1 * * /home/julianay/workspace/mei_disease_atlas/pipeline/monthly_update.sh --push >> /home/julianay/workspace/mei_disease_atlas/data/monthly_update_cron.log 2>&1
```
`--harvest-only` just reports how many new papers there are.

## Citation
Yue J. *MEI Disease Atlas: germline mobile element insertions in human disease.* https://julianayuebcm.github.io/mei-disease-atlas/
Please also cite the original papers for any case you use.

## Licence
Code: MIT (`LICENSE`). Data and site content: CC BY 4.0 (`LICENSE-DATA.md`).
Corrections and missing cases: please open an issue.
