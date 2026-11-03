# Screening prompt — MEI disease atlas

Decide for each paper (title + abstract) whether it reports a **human germline mobile element insertion (MEI)
that causes or likely causes disease in a patient or family**.

An MEI is a new (non-reference) insertion of: Alu, L1/LINE-1, SVA, HERV/ERV, a processed pseudogene (retrocopy),
or a poly(A)/retrotransposition-mediated insertion. Germline = constitutional, inherited or de novo
(including mosaic constitutional).

## Labels
- `include` — the abstract reports at least one such disease-causing (or likely causal) germline MEI in a human
  patient/family. This includes MEIs that cause an associated deletion/rearrangement at the insertion site, and
  founder MEIs (e.g. SVA in FKTN, SVA in TAF1).
- `maybe` — could contain such a case but the abstract does not say clearly. Typical: mutation surveys/cohorts of
  a disease gene ("we found N mutations including insertions"), methods papers that detected pathogenic MEIs in
  patients, reviews that may list cases, abstracts that mention "insertion" without saying the inserted sequence.
- `exclude` — clearly not a germline disease MEI case: somatic/cancer-only insertions, non-human, evolution or
  population polymorphism studies with no disease case, Alu-Alu recombination deletions of *reference* repeats only,
  expression/methylation of TEs, tool benchmarks without patient findings, unrelated topics.

Somatic-only cancer insertions (e.g. L1 in APC in a colon tumour) → `exclude` (out of scope).
When torn between `maybe` and `exclude`, choose `maybe`.

## Output (one JSON object per paper, JSON Lines)
{"pmid": "...", "label": "include|maybe|exclude", "mei_class": ["Alu"|"L1"|"SVA"|"HERV"|"pseudogene"|"polyA"|"unknown"],
 "genes": ["GENE", ...], "reason": "<= 20 words"}
