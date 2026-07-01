# Study Resolver — Resolve Studies & Provide Metadata

Resolves study identifiers (keywords → studyIds), handles ambiguity, and returns study metadata for navigation tool selection.

## Parameters

- **studyKeywords:** 1-3 specific keywords to search (e.g., `["TCGA", "lung"]`) — OR —
- **studyIds:** Direct study IDs to validate (e.g., `["luad_tcga"]`)

## Available Navigation Tools

After resolving studies, choose one or more based on the user's intent:

- `navigate_to_study_view` — cohort overview, clinical distributions, gene filters
- `navigate_to_patient_view` — individual patient profiles
- `navigate_to_results_view` — gene alteration analysis (OncoPrint, mutations, comparison, plots)
- `navigate_to_group_comparison` — subgroup comparison by clinical attributes or custom groups

---

## Study Resolution

### Keyword Extraction

Provide 1-3 SPECIFIC keywords. Use AND logic across studyId, name, description, cancerType.

- **Use:** cancer types (`lung`, `melanoma`), subtypes (`adenocarcinoma`, `squamous`), sources (`TCGA`, `MSK`, `ICGC`), identifiers (`pan_can_atlas`, `pediatric`)
- **Avoid:** generic terms (`cancer`, `tumor`, `study`, `patients`, `genomic`) — they match most studies

| User query | studyKeywords |
|---|---|
| "lung cancer studies" | `["lung"]` (not `["lung", "cancer"]`) |
| "TCGA lung adenocarcinoma" | `["TCGA", "lung", "adenocarcinoma"]` |
| "MSK breast cancer" | `["MSK", "breast"]` |

### Result Ranking

All matching studies are returned (capped at 40), ranked by: keyword match count (primary) → sample count (secondary). Top 5 receive full metadata (clinicalAttributes, molecularProfiles); the rest receive basic info only (studyId, name, sampleCount, profiles).

### Study Selection

**Baseline ranking** (applies to all navigation tools) — when multiple studies match, pick one and proceed immediately; do not ask the user to choose first.

- Prefer **TCGA studies**; within TCGA, prefer the **PanCancer Atlas** version (e.g., `luad_tcga_pan_can_atlas_2018`).
- For broad disease terms (e.g., "glioma", "sarcoma", "lymphoma"), prefer pan-disease/combined studies over subtype-specific ones — e.g., `lgggbm_tcga_pub` (LGG+GBM) over `gbm_tcga` (GBM only).
- Pan-cancer studies (e.g., MSK-CHORD) may also match disease-specific queries — weigh whether the user wants a disease-specific or cross-cancer study.

**Override — `navigate_to_results_view` OQL queries only.** The study chosen above must also have the molecular profile the query's OQL requires:

| OQL / query type | Required profile |
|---|---|
| Mutation (`MUT`) | `_mutations` |
| CNA (`AMP`, `HOMDEL`, `GAIN`, ...) | discrete `_gistic`/`_cna` |
| `FUSION` | `_structural_variants` |
| `EXP` | **z-scored** mRNA (`_Zscores`, e.g. `..._mrna_median_all_sample_Zscores`) |
| `PROT` | **z-scored** protein (`_rppa_Zscores`/`quantification_zscores`) |

A raw `_mrna`/`_rna_seq`/`_rppa` profile without `_Zscores` does NOT satisfy `EXP`/`PROT` — those thresholds are z-score based; for a cohort-relative split on a raw/non-Zscore profile, use Rule 2's custom groups with `bins` instead. Clinical attributes encoding fusion status (e.g. `BRAF_KIAA1549_FUSION`) are not a substitute for an SV profile — `FUSION` OQL requires `sv`.

Check availability via: for top-5 studies, scan `molecularProfileIds` for the suffixes above; for otherStudies, use the `profiles` flags (`mutations`, `cna`, `sv`, `mrna`, `protein` — `mrna`/`protein` are already Zscore-gated).

If the chosen study lacks the required profile, fall back in order: (1) another study meeting the baseline ranking above that has the profile, (2) any TCGA study with the profile, (3) the highest-ranked non-TCGA study with the profile. If no study has the required profile, inform the user rather than generating a URL that will return no data.

Once a study is finalized, generate its URL, then list the other matching studies as alternatives — use each study's `studyViewUrl` field to render them as clickable links.

**No matches →** guide user to browse at https://www.cbioportal.org (studies from TCGA, ICGC, TARGET, institutional studies, cell line data)

---

## Navigation Tool Selection Guide

After resolving studies, use these rules to choose the right navigation tool(s). You may call **multiple navigation tools in parallel** when the query spans multiple views (e.g., `navigate_to_study_view` + `navigate_to_results_view` together).

Evaluate in order. **First match wins.**

### Rule 1 → `navigate_to_patient_view`
**Patient or Sample ID explicitly mentioned, OR user wants to browse individual patients from a filtered cohort.**
View a patient's complete profile, clinical timeline, genomic alterations, or compare samples from the same patient. Also use when user wants to page through a filtered set of patients one by one.

- "Show me patient TCGA-001 details"
- "What mutations does patient ID 12345 have?"
- "Show me all the patients in DLBCL TCGA PanCan Atlas who are Hispanic or Latino"
- "Browse female patients with TP53 mutations"

### Rule 2 → `navigate_to_group_comparison`
**User wants to compare/split a cohort where the grouping variable is clinical, cohort-level, or a continuous molecular value split cohort-relatively (high vs low, quartiles, median).**
Signals: compare, vs, difference, split, by sex/age/stage/smoking/expression level...

**Approach — custom `groups`:** every comparison is built from custom groups, each defined by its own `studyViewFilter` (or `isUnselected: true` for "vs rest"). For a clinical attribute split, call `get_studyviewfilter_options` with `attributeIds` to get exact `values` (categorical) or quartile `bins` (NUMBER), then build one group per value/range using `clinicalDataFilters` — including merged values (T1+T2 vs T3+T4) and an "NA"/missing-data group. Also use custom groups for: multi-cohort splits (LUAD vs LUSC), multi-factor groups combining gene + clinical criteria, or cohort-relative splits of continuous molecular values (gene expression/protein/methylation "high vs low", quartiles) — call `get_studyviewfilter_options` with `geneSpecificQueries`/`genericAssayProfileIds` to get `bins`, then use those `{start,end}` ranges in `genomicDataFilters`/`genericAssayDataFilters`.

**Important — when NOT to use group comparison:**
- User explicitly asks about a specific outcome between groups defined by **gene alteration status** (mutation/CNA/SV, including "Gene X vs rest" Altered/Unaltered) or an **absolute/biological threshold** (e.g. z-score overexpression `EXP > 2`, an explicit user-given cutoff) → Rule 3c
- Either gene group requires OQL-precision (`geneFilters` cannot express specific amino acid, DRIVER, GERMLINE, position range) → Rule 3c
- Alteration frequencies between genes ("EGFR vs KRAS alteration rates") → Rule 3a

- "Compare male vs female patients in LUAD"
- "Show survival differences by tumor stage"
- "Compare KRAS-mutated patients by smoking history"
- "What genes are overexpressed in high grade lung adenocarcinoma vs low grade?"
- "Compare luad by KRAS mutation"
- "Compare early stage (T1+T2) vs late stage (T3+T4)"
- "LUAD vs LUSC mutation comparison"
- "Survival by PDCD1 expression, high vs low" → custom groups using `genomicDataFilters` ranges from `bins`
- "Split this cohort by MGMT methylation level (quartiles) and compare clinical features"

**Specific gene(s) as the enrichment subject of a clinical/molecular split:** When Rule 2 applies (grouping variable is clinical/molecular) **and** the user also names specific gene(s) as what's being examined across those groups (e.g., naming a handful of genes and asking how their alteration rates differ across subtype/stage/grade/etc.) — this has two complementary answers, and both should be provided: call `navigate_to_group_comparison` with groups built from that attribute (`tab: "comparison/alterations"`) for the statistical enrichment question ("which of these genes differ significantly between groups"), **and** `navigate_to_results_view` with those genes plus `oncoprintClinicalTracks: [attributeId]` for the visual per-sample question ("what does the pattern look like"). Fetch exact attribute values via `get_studyviewfilter_options` once and reuse them for both calls. Present the group comparison link first (quantitative answer), then the OncoPrint link (visual confirmation).

- "EGFR and MET alteration rates by histologic subtype in lung adenocarcinoma" → group_comparison (groups by histologic subtype attribute, `comparison/alterations`) + results_view (`genes: ["EGFR","MET"]`, `oncoprintClinicalTracks: [attributeId]`)

### Rule 3 → `navigate_to_results_view`
**Gene(s) mentioned as the subject of analysis** (not just as a patient filter). Ask: what is the user trying to learn about this gene?

**3a. How often / in what form is this gene altered?**
Mutation frequency, co-occurrence, mutual exclusivity, OncoPrint, structural variants, alteration frequencies by cancer type. Includes queries with magnitude qualifiers on expression or protein level ("high", "low", "overexpressed", "underexpressed").
- "Show me TP53 mutations in lung cancer" → `oncoprint` or `mutations`
- "Compare EGFR and KRAS alterations" → `oncoprint`
- "What structural variants exist in ALK?" → `structuralVariants`
- "EGFR alteration frequencies across cancer types" → `cancerTypesSummary`
- "High MYC protein expression in lymphoma" → `MYC: PROT > 2`, `oncoprint`, with `profileFilter`
- "VEGFA overexpression in kidney cancer" → `VEGFA: EXP > 2`, `oncoprint`, with `profileFilter`

Note: `cancerTypesSummary` shows how often a gene is mutated/amplified across cancer types — it is an alteration frequency view, not expression levels.

**3b. What are the expression/protein levels of this gene?**
User wants continuous molecular values (mRNA, protein), not binary alteration status. Signal words: "expression", "mRNA", "RNA levels", "z-scores", "protein levels" without accompanying alteration language or magnitude qualifiers ("high", "low", "over-", "under-").

Route to `tab: "plots"` — the Plots tab takes two variables as axes. Expression queries map naturally: continuous value on one axis, grouping variable on the other.
- "EGFR expression across cancer types" → horz: `clinical_attribute`/`CANCER_TYPE_DETAILED`, vert: `MRNA_EXPRESSION`
- "EGFR expression vs copy number" → horz: `COPY_NUMBER_ALTERATION`, vert: `MRNA_EXPRESSION`
- "TP53 mRNA levels in breast cancer" → vert: `MRNA_EXPRESSION`
- "EGFR protein expression by cancer type" → horz: `clinical_attribute`/`CANCER_TYPE_DETAILED`, vert: `PROTEIN_LEVEL`

**3c. Gene alteration as the comparison axis**
Gene alteration status defines the groups; the outcome is clinical (survival) or molecular (mRNA, protein, methylation). Use `navigate_to_results_view` with `comparison/{subtab}`.

**Gene-based comparison decision table:**

| Groups | Tool | Parameters |
|---|---|---|
| Gene X vs rest (any alteration type) | `results_view` | single gene, no `comparisonSelectedGroups` → Altered vs Unaltered |
| Gene A vs Gene B (any alteration type combination) | `results_view` | OQL on each gene, `comparisonSelectedGroups: ["A", "B"]` |
| Groups with multi-factor criteria (gene + clinical attribute, etc.) | `group_comparison` | custom groups with combined filters |

For gene A vs gene B, use OQL to specify each gene's alteration type — plain symbol = all alterations (mut + CNA + SV); `MUT` = mutations only; `AMP`/`HOMDEL` = CNA; modifiers like `MUT_DRIVER`, `MUT = V600E` work too. Mix freely across genes.

- "TP53 mutation vs CDKN1A expression" → `comparison/mrna`
- "PTEN alteration vs pAKT protein" → `comparison/protein`
- "BRCA1 deletion and survival" → `comparison/survival`
- "BRAF V600E vs the rest" → `genes: ["BRAF: MUT = V600E"]`, no `comparisonSelectedGroups`
- "IDH1-altered vs EGFR-altered patients" → `genes: ["IDH1", "EGFR"]`, `comparisonSelectedGroups: ["IDH1", "EGFR"]`
- "IDH1 mut vs EGFR amp" → `genes: ["IDH1: MUT", "EGFR: AMP"]`, `comparisonSelectedGroups: ["IDH1", "EGFR"]`

Distinction from 3b: in 3c, alteration is the cause/grouping; in 3b, there is no alteration grouping — just raw expression values.

Distinction from Rule 2: `EXP`/`PROT` thresholds here are absolute/biological (z-score based, e.g. `EXP > 2` = overexpression) — appropriate when the study has a z-scored profile or the user gives an explicit cutoff. For cohort-relative splits ("high vs low", "quartiles") — especially when only a raw/continuous (non-z-score) profile is available — use Rule 2's custom groups with `bins` from `get_studyviewfilter_options` instead.

**Special cases:**

_Gene-in-disease (broad query):_ "Tell me about IDH1 mutations in glioma", "TP53 in lung cancer" — call **both** `navigate_to_study_view` (gene as mutation filter, cohort overview) and `navigate_to_results_view` (OncoPrint, mutation table) in parallel. Present study view first.

_OQL with precise filters StudyView cannot express_ (specific amino acid, protein position, GERMLINE, DRIVER modifier): route to `navigate_to_results_view` only. StudyView has no way to filter by exact amino acid change or modifier. Examples: `BRAF:MUT=V600E`, `EGFR:MUT=L858R`, `TP53:DRIVER`, `BRCA1:GERMLINE`. For show/frequency queries (3a): `genes: ["BRAF: MUT = V600E"]`, `tab: "oncoprint"`. For outcome comparison (3c): see decision table above.

_OQL with broad alteration types StudyView can express_ (AMP, HOMDEL, GAIN, HETLOSS, mutation class like INFRAME or TRUNC, or plain MUTATED): call **both** tools. The OQL goes to `navigate_to_results_view`; build the equivalent `studyViewFilter` for `navigate_to_study_view` using `geneFilters` / `mutationDataFilters` / `genomicDataFilters`. Examples: `EGFR:AMP`, `TP53:TRUNC`, `KRAS:MUT=INFRAME`.

_"alteration" keyword:_ means mutation + CNA combined. StudyView cannot express this natively; strongly prefer `navigate_to_results_view`.

_When in doubt, call both_ `navigate_to_study_view` and `navigate_to_results_view`. Use `tab: "plots"` for expression/CNA correlation queries.

### Rule 4 → `navigate_to_study_view` (default)
**Everything else:** cohort overview, discovery questions, gene used only as a patient filter.

- "Show me the TCGA lung cancer study"
- "What genes are mutated in breast cancer?"
- "I want to see KRAS not mutated pancreatic cancer"
- "Show me HER2 positive cases in the breast pancan atlas cohort"
- "Show me samples with EGFR amplification and mutation in TCGA GBM"
- "How many cases are profiled for mutations in TCGA DLBCL study?"
- "Show me a graph of mutation count vs cancer type in MSK IMPACT 2017"

---

## Metadata Reference

The router returns `studiesWithMetadata` containing:

- **clinicalAttributeIds** — available clinical attributes (e.g., `AGE`, `SEX`, `TUMOR_STAGE`). Call `get_studyviewfilter_options` to get datatype + valid values before filtering.
- **molecularProfileIds** — non-generic-assay profiles (e.g., `luad_tcga_mutations`, `luad_tcga_gistic`). Mutation profiles end in `_mutations`; CNA profiles in `_gistic` or `_cna`.
- **genericAssayProfiles** _(optional)_ — generic assay profile IDs (e.g., genetic ancestry, mutational signatures). Call `get_studyviewfilter_options` with `genericAssayProfileIds` to get entity stableIds and values.
- **heatmapProfileIds** _(optional)_ — mRNA/protein/methylation profile IDs eligible for oncoprint heatmap tracks (`navigate_to_results_view`'s `oncoprintHeatmapTracks`). Use the exact ID, not a suffix.
- **availableComparisonTabs** — which comparison tabs this study supports (e.g., `["overlap","clinical","survival","alterations","mutations","mrna"]`). Use when selecting `tab` for `navigate_to_group_comparison` or `comparison/{subtab}` for `navigate_to_results_view`.
- **treatments** — not returned by default. Call `get_studyviewfilter_options` with `includeTreatments: true` to fetch drug/agent names when the user asks about treatment filters.

### Filter Construction

1. Check `clinicalAttributeIds` for available attributes
2. Call `get_studyviewfilter_options` to get exact values
3. Use exact values in filter construction

---

## Universal Rules

- **Never guess** study IDs, clinical values, molecular profile IDs, or patient IDs — use exact values from tool responses (case-sensitive)
- **Gene symbols:** always UPPERCASE HUGO symbols (TP53, not p53; EGFR, not ErbB1)
- **Link First:** generate and provide URL to user immediately after constructing parameters
