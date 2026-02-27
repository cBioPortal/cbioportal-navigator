# Study Resolver — Resolve Studies & Provide Metadata

Resolves study identifiers (keywords → studyIds), handles ambiguity (up to 5 matches), and returns study metadata for navigation tool selection.

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

Top 5 studies ranked by: keyword match count (primary) → sample count (secondary).

### Study Selection

- **Multiple TCGA versions exist** for many cancer types. When intent is unclear, prefer the **PanCancer Atlas** version (e.g., `luad_tcga_pan_can_atlas_2018`).
- **Pan-cancer studies** (e.g., MSK-CHORD) may match disease-specific queries — consider whether the user wants a disease-specific or cross-cancer study.
- **No matches →** guide user to browse at https://www.cbioportal.org (studies from TCGA, ICGC, TARGET, institutional studies, cell line data)

---

## Navigation Tool Selection Guide

After resolving studies, use these rules to choose the right navigation tool(s). You may call **multiple tools in parallel** when the query spans multiple views.

Evaluate in order. **First match wins.**

### Rule 1 → `navigate_to_patient_view`
**Patient or Sample ID explicitly mentioned.**
View a patient's complete profile, clinical timeline, genomic alterations, or compare samples from the same patient.

- "Show me patient TCGA-001 details"
- "What mutations does patient ID 12345 have?"
- "Show me all the patients in DLBCL TCGA PanCan Atlas who are Hispanic or Latino"

### Rule 2 → `navigate_to_group_comparison`
**User wants to compare/split a cohort into symmetric groups.**
Signals: compare, vs, difference, split, by sex/age/stage/smoking...

Two approaches:
- **By attribute:** group by a single clinical attribute (auto-discovers values; numerical attributes are auto quartile-binned)
- **Custom groups:** each group defined by its own filter — use for merged values (T1+T2 vs T3+T4), multi-cohort splits (LUAD vs LUSC), or gene-based splits (TP53-mut vs wt)

**Important — when NOT to use group comparison:**
- Comparing genes to each other (e.g., "EGFR vs KRAS alterations") → use `navigate_to_results_view` comparison tab
- Gene alteration vs molecular readout (e.g., "PTEN alteration vs pAKT protein") → use `navigate_to_results_view` comparison tab (see Rule 3)

- "Compare male vs female patients in LUAD"
- "Show survival differences by tumor stage"
- "Compare KRAS-mutated patients by smoking history"
- "What genes are overexpressed in high grade lung adenocarcinoma vs low grade?"
- "Compare luad by KRAS mutation"
- "Compare early stage (T1+T2) vs late stage (T3+T4)"
- "LUAD vs LUSC mutation comparison"

### Rule 3 → `navigate_to_results_view`
**Gene(s) mentioned AND query asks about the gene's alteration pattern or its downstream molecular effects.**

Covers two sub-scenarios:

**3a. Gene alteration pattern** — mutation frequency, co-occurrence, mutual exclusivity, OncoPrint, functional impact, structural variants, cancer type summary.
- "Show me TP53 mutations in lung cancer"
- "Compare EGFR and KRAS alterations"
- "What structural variants exist in ALK?"

**3b. Gene alteration vs downstream molecular data** — how a gene's alteration status affects protein, mRNA, methylation, or survival. Use the comparison tab with the appropriate subtab (`comparison/protein`, `comparison/mrna`, `comparison/survival`, etc.).
- "PTEN alteration vs pAKT protein in lung squamous" → tab: `comparison/protein`
- "TP53 mutation vs CDKN1A expression" → tab: `comparison/mrna`
- "BRCA1 deletion and survival" → tab: `comparison/survival`

**Key signal — "alteration":** The word "alteration" means mutation + CNA combined. StudyView filters treat these separately (mutationDataFilters vs cnaGeneFilters), making it hard to express. ResultsView handles alteration as a unified concept — altered vs unaltered grouping is built in. When the user says "alteration", strongly prefer `navigate_to_results_view`.

**Key distinction — "vs" semantics:**
- **Symmetric groups** (two cohort subsets) → Rule 2: "male vs female", "stage I vs stage II"
- **Asymmetric** (gene alteration → molecular readout) → Rule 3b: "PTEN alteration vs pAKT", "TP53 mutation vs survival"
- **Gene vs gene** (alteration comparison) → Rule 3a: "EGFR vs KRAS alterations"

**Key distinction — gene as subject vs filter:**

| Pattern | Tool |
|---|---|
| Gene alteration pattern (mutations, co-occurrence) | `results` (oncoprint/mutations) |
| Gene alteration → downstream effect (protein, mRNA, survival) | `results` (comparison/{subtab}) |
| Gene as patient filter (clinical features of X-mutated patients) | `study` (Rule 4) |

### Rule 4 → `navigate_to_study_view` (default)
**Everything else:** cohort overview, discovery questions, gene used only as a patient filter.

- "Show me the TCGA lung cancer study"
- "What genes are mutated in breast cancer?"
- "I want to see KRAS not mutated pancreatic cancer"
- "Show me HER2 positive cases in the breast pancan atlas cohort"
- "Show me samples with EGFR amplification and mutation in TCGA GBM"
- "How many cases are profiled for mutations in TCGA DLBCL study?"
- "I want to see expression vs copy number change in EGFR in lung cancer"
- "Show me a graph of mutation count vs cancer type in MSK IMPACT 2017"

---

## Metadata Reference

The router returns `studiesWithMetadata` containing:

- **needsStudySelection** — `true` if multiple studies found (AI should infer or ask user to choose). Study preview URL: `https://www.cbioportal.org/study?id={studyId}`
- **clinicalAttributeIds** — available clinical attributes (e.g., `AGE`, `SEX`, `TUMOR_STAGE`). Call `get_studyviewfilter_options` to get datatype + valid values before filtering.
- **molecularProfileIds** — non-generic-assay profiles (e.g., `luad_tcga_mutations`, `luad_tcga_gistic`). Mutation profiles end in `_mutations`; CNA profiles in `_gistic` or `_cna`.
- **genericAssayProfiles** _(optional)_ — generic assay profile IDs (e.g., genetic ancestry, mutational signatures). Call `get_studyviewfilter_options` with `genericAssayProfileIds` to get entity stableIds and values.
- **treatments** — drug/agent names (e.g., `CARBOPLATIN`, `PEMBROLIZUMAB`). Use in `patientTreatmentFilters` (no timing) or `sampleTreatmentFilters` (requires `time: "Pre"` or `"Post"`).

### Filter Construction

1. Check `clinicalAttributeIds` for available attributes
2. Call `get_studyviewfilter_options` to get exact values
3. Use exact values in filter construction

---

## Universal Rules

- **Never guess** study IDs, clinical values, molecular profile IDs, or patient IDs — use exact values from tool responses (case-sensitive)
- **Gene symbols:** always UPPERCASE HUGO symbols (TP53, not p53; EGFR, not ErbB1)
- **Link First:** generate and provide URL to user immediately after constructing parameters
