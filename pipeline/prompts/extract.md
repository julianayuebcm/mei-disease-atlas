# Extraction prompt — MEI disease atlas

You are given one paper (full text when available, otherwise title + abstract). Extract every **human germline
mobile element insertion (MEI) reported as causing or likely causing disease** in that paper. One record per
distinct insertion event (gene + element + position). A founder insertion seen in many families is ONE record
(put the number of families/patients in `n_families` / `n_patients`). Somatic (tumour-only) insertions are out of scope.

Report only what the paper states. Use null when the paper does not say. Never guess coordinates.

## Fields (JSON)
- `pmid` (string), `case_label` (short, e.g. "AluYa5 in exon 3 of FIX")
- `gene` (HGNC symbol, current name), `gene_as_reported` (if the paper used an old name)
- `disease`, `omim_phenotype` (MIM number if stated, else null), `inheritance` (AD|AR|XL|XLR|XLD|de_novo|mosaic|unknown)
- `mei_class`: Alu | L1 | SVA | HERV | processed_pseudogene | polyA_only | unknown
- `subfamily` (e.g. AluYa5, L1HS, SVA_F) or null; `insertion_length_bp` (int) or null; `full_length` (true|false|null)
- `orientation_vs_gene`: sense | antisense | null
- `tsd` (sequence or length string) or null; `polyA` (true|false|null); `transduction` (true|false|null)
- `origin`: de_novo | inherited | founder | unknown
- `n_patients`, `n_families` (int or null); `ancestry_or_population` (e.g. "Japanese founder") or null
- Location:
  - `region`: coding_exon | exon_UTR5 | exon_UTR3 | intron | promoter | intergenic | multiple | unknown
  - `exon_number` / `intron_number` (as numbered by the paper) or null; `transcript` (RefSeq/Ensembl if stated)
  - `hgvs` (as written) or null; `genome_build` and `chrom`, `pos` (only if the paper gives them) else null
  - `distance_to_splice_site_bp` (int, if stated) or null
- `mechanisms`: list, using ONLY these codes (multi-label, primary first):
  - `coding_disruption` – insertion inside coding sequence → frameshift / premature stop / truncated or disrupted protein
  - `exon_skipping` – the insertion causes skipping of one or more exons
  - `exonization` – MEI-derived sequence is spliced into the mRNA as a new exon / exon extension
  - `aberrant_splicing` – other splice changes: cryptic splice-site activation, altered splice-site choice, pseudo-exon from flanking (non-MEI) sequence
  - `intron_retention`
  - `iralu_structure` – inverted Alu pair (inserted Alu + existing Alu) forming RNA secondary structure that alters splicing
  - `premature_polyadenylation` – MEI polyA signal / transcription termination truncates the transcript
  - `expression_loss` – reduced/absent transcription or mRNA (promoter disruption, silencing, NMD-level loss) without a more specific code
  - `epigenetic_silencing` – methylation / chromatin spreading from the MEI
  - `utr_effect` – altered mRNA stability/translation via 5′/3′ UTR insertion
  - `insertion_associated_deletion` – genomic deletion/rearrangement accompanying the insertion causes the defect
  - `transduction_effect` – co-mobilised flanking (transduced) sequence is the functional cause
  - `aberrant_transcript_other` – antisense/readthrough/fusion transcripts or other described effect
  - `unknown` – mechanism not investigated/described
- `mechanism_detail` – 1–3 sentences in your words describing the mechanism exactly as the paper shows it
- `affected_exons` – list of exon numbers whose processing is altered (e.g. skipped exon 4) or null
- `evidence`: list from `rna_rt_pcr`, `rna_seq`, `minigene`, `protein`, `segregation`, `de_novo_confirmed`,
  `functional_assay`, `long_read`, `none_stated`
- `quote` – one short verbatim sentence from the paper supporting the mechanism (≤ 40 words)
- `confidence` – high | medium | low (your confidence that this record is a correct, causal germline MEI case)
- `text_source` – full_text | abstract_only

Output: a JSON object {"pmid": "...", "cases": [ ... ]}. If the paper contains no in-scope case, return
{"pmid": "...", "cases": [], "why_none": "<short reason>"}.
