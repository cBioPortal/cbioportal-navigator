# Main Router — Resolve Studies & Route to Navigation Tool

Resolves study identifiers (keywords → studyIds), handles ambiguity (up to 5 matches), and recommends the next specialized navigation tool.

## Parameters

- **targetPage:** `study` | `patient` | `results` | `comparison`
- **studyKeywords:** 1-3 specific keywords to search (e.g., `["TCGA", "lung"]`) — OR —
- **studyIds:** Direct study IDs to validate (e.g., `["luad_tcga"]`)

## Recommended Tools

- `navigate_to_studyview` — cohort overview
- `navigate_to_patientview` — individual patient
- `navigate_to_resultsview` — gene alteration analysis
- `navigate_to_group_comparison` — subgroup comparison

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

## Choosing targetPage — Decision Rules

Evaluate in order. **First match wins.**

### Rule 1 → `patient`
**Patient or Sample ID explicitly mentioned.**
View a patient's complete profile, clinical timeline, genomic alterations, or compare samples from the same patient.

- "Show me patient TCGA-001 details"
- "What mutations does patient ID 12345 have?"
- "Show me all the patients in DLBCL TCGA PanCan Atlas who are Hispanic or Latino"

### Rule 2 → `comparison`
**User wants to compare/split a cohort by a data attribute.**
Signals: compare, vs, difference, split, by sex/age/stage/smoking...
Numerical attributes (e.g., age) are auto quartile-binned.

If comparing on genes only (e.g., "EGFR vs KRAS alterations"), use `results` comparison tab instead.

- "Compare male vs female patients in LUAD"
- "Show survival differences by tumor stage"
- "Compare KRAS-mutated patients by smoking history"
- "What genes are overexpressed in high grade lung adenocarcinoma vs low grade?"
- "Compare luad by KRAS mutation"

### Rule 3 → `results`
**Gene(s) mentioned AND query asks about the gene's alteration pattern itself.**
Signals: mutation frequency, co-occurrence, mutual exclusivity, OncoPrint, comparing genes to each other, survival by genotype, functional impact, structural variants, expression correlation, cancer type summary for named genes.

- "Show me TP53 mutations in lung cancer"
- "Compare EGFR and KRAS alterations"
- "What structural variants exist in ALK?"
- "Find genes with similar expression to EGFR"

**Key distinction — gene as subject vs filter:**
- **Subject → results:** query asks *about* the gene (mutations, frequency, co-occurrence)
- **Filter → study (Rule 4):** query uses gene to define *which patients* to explore

| Gene as subject (→ results) | Gene as filter (→ study) |
|---|---|
| "Show me TP53 mutations in lung cancer" | "Clinical features of EGFR-mutated patients" |
| "EGFR and KRAS co-occurrence" | "Survival of patients with TP53 mutation" |

### Rule 4 → `study` (default)
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
