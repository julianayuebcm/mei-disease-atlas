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

## Automatic updates
`.github/workflows/daily-update.yml` runs every day on GitHub Actions: it looks for papers newly added to PubMed,
screens and extracts them with Claude Code in headless mode (`pipeline/update_literature.py --ci`), rebuilds the site,
and opens a pull request labelled `literature-update`. Merging the pull request publishes the update. Days with no
new papers end without using Claude. Requires the repository secret `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`).

The same update can run on your own machine (e.g. from cron), committing to a review branch:
```
pipeline/update_literature.sh --harvest-only      # list new papers only
pipeline/update_literature.sh --push              # full run, push branch update-YYYY-MM-DD
```

## Citation
Yue J. *MEI Disease Atlas: germline mobile element insertions in human disease.* https://julianayuebcm.github.io/mei-disease-atlas/
Please also cite the original papers for any case you use.

## Licence
Code: MIT (`LICENSE`). Data and site content: CC BY 4.0 (`LICENSE-DATA.md`).
Corrections and missing cases: please open an issue.
