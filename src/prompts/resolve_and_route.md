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

All matching studies are returned, ranked by: keyword match count (primary) → sample count (secondary). Top 5 receive full metadata (clinicalAttributes, molecularProfiles, treatments); the rest receive basic info only (studyId, name, sampleCount).

### Study Selection

- **When multiple studies match, pick one and proceed immediately.** Do not ask the user to choose first. Prefer **TCGA studies** over others; within TCGA, prefer the **PanCancer Atlas** version (e.g., `luad_tcga_pan_can_atlas_2018`). Generate the URL with the selected study, then list the other matching studies as alternatives — use each study's `studyViewUrl` field to render them as clickable links.
- **Broad disease terms → prefer pan-disease studies.** When the user queries a general disease category (e.g., "glioma", "sarcoma", "lymphoma"), prefer studies that cover the full disease spectrum over subtype-specific studies. For example, "glioma" encompasses both low-grade glioma (LGG) and glioblastoma (GBM), so `lgggbm_tcga_pub` (LGG+GBM combined) is more appropriate than `gbm_tcga` (GBM only). Similarly, prefer combined/pan-disease studies when the query does not specify a particular subtype.
- **Pan-cancer studies** (e.g., MSK-CHORD) may match disease-specific queries — consider whether the user wants a disease-specific or cross-cancer study.
- **No matches →** guide user to browse at https://www.cbioportal.org (studies from TCGA, ICGC, TARGET, institutional studies, cell line data)

---

## Navigation Tool Selection Guide

After resolving studies, use these rules to choose the right navigation tool(s). You may call **multiple tools in parallel** when the query spans multiple views.

Evaluate in order. **First match wins.**

### Rule 1 → `navigate_to_patient_view`
**Patient or Sample ID explicitly mentioned, OR user wants to browse individual patients from a filtered cohort.**
View a patient's complete profile, clinical timeline, genomic alterations, or compare samples from the same patient. Also use when user wants to page through a filtered set of patients one by one.

- "Show me patient TCGA-001 details"
- "What mutations does patient ID 12345 have?"
- "Show me all the patients in DLBCL TCGA PanCan Atlas who are Hispanic or Latino"
- "Browse female patients with TP53 mutations"

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
**Gene(s) mentioned as the subject of analysis** (not just as a patient filter). Ask: what is the user trying to learn about this gene?

**3a. How often / in what form is this gene altered?**
Mutation frequency, co-occurrence, mutual exclusivity, OncoPrint, structural variants, alteration frequencies by cancer type.
- "Show me TP53 mutations in lung cancer" → `oncoprint` or `mutations`
- "Compare EGFR and KRAS alterations" → `oncoprint`
- "What structural variants exist in ALK?" → `structuralVariants`
- "EGFR alteration frequencies across cancer types" → `cancerTypesSummary`

Note: `cancerTypesSummary` shows how often a gene is mutated/amplified across cancer types — it is an alteration frequency view, not expression levels.

**3b. What are the expression/protein levels of this gene?**
User wants continuous molecular values (mRNA, protein), not binary alteration status. Signal words: "expression", "mRNA", "RNA levels", "z-scores", "protein levels" without accompanying alteration language.

Route to `tab: "plots"` — the Plots tab takes two variables as axes. Expression queries map naturally: continuous value on one axis, grouping variable on the other.
- "EGFR expression across cancer types" → horz: `clinical_attribute`/`CANCER_TYPE_DETAILED`, vert: `MRNA_EXPRESSION`
- "EGFR expression vs copy number" → horz: `COPY_NUMBER_ALTERATION`, vert: `MRNA_EXPRESSION`
- "TP53 mRNA levels in breast cancer" → vert: `MRNA_EXPRESSION`
- "EGFR protein expression by cancer type" → horz: `clinical_attribute`/`CANCER_TYPE_DETAILED`, vert: `PROTEIN_LEVEL`

**3c. How does this gene's alteration affect downstream outcomes?**
Alteration status (mutated vs wildtype) is the grouping variable; the outcome is molecular (mRNA, protein, methylation) or clinical (survival). Use `comparison/{subtab}`.
- "TP53 mutation vs CDKN1A expression" → `comparison/mrna`
- "PTEN alteration vs pAKT protein" → `comparison/protein`
- "BRCA1 deletion and survival" → `comparison/survival`
- "Compare EGFR mRNA in TP53 mutant vs wildtype" → `comparison/mrna`

Distinction from 3b: in 3c, alteration is the cause/grouping; in 3b, there is no alteration grouping — just raw expression values.

**Special cases:**

_Gene-in-disease (broad query):_ "Tell me about IDH1 mutations in glioma", "TP53 in lung cancer" — call **both** `navigate_to_study_view` (gene as mutation filter, cohort overview) and `navigate_to_results_view` (OncoPrint, mutation table) in parallel. Present study view first.

_OQL with precise filters StudyView cannot express_ (specific amino acid, protein position, GERMLINE, DRIVER modifier): route to `navigate_to_results_view` only. StudyView has no way to filter by exact amino acid change or modifier. Examples: `BRAF:MUT=V600E`, `EGFR:MUT=L858R`, `TP53:DRIVER`, `BRCA1:GERMLINE`.

_OQL with broad alteration types StudyView can express_ (AMP, HOMDEL, GAIN, HETLOSS, mutation class like INFRAME or TRUNC, or plain MUTATED): call **both** tools. The OQL goes to `navigate_to_results_view`; build the equivalent `studyViewFilter` for `navigate_to_study_view` using `geneFilters` / `mutationDataFilters` / `genomicDataFilters`. Examples: `EGFR:AMP`, `TP53:TRUNC`, `KRAS:MUT=INFRAME`.

_Gene A altered vs gene B altered (all alteration types):_ "How do IDH1-altered vs EGFR-altered patients differ?" — `navigate_to_results_view` with both genes, `tab: "comparison/survival"`, `comparisonSelectedGroups: ["IDH1", "EGFR"]`. Do not use `navigate_to_group_comparison` — it cannot express mutation + CNA combined.

_Gene A mutant vs gene B mutant (mutation-specific):_ "ATRX mutant vs CIC mutant outcomes" — use `navigate_to_group_comparison` with custom groups, each group's `studyViewFilter` using `geneFilters` pointing to the mutations profile (`molecularProfileId` ending in `_mutations`). This creates mutation-only groups, not all-alteration groups.

_Gene A mutant vs gene B amp (mixed alteration types):_ "IDH1 mutant vs EGFR amp" — use `navigate_to_group_comparison` with custom groups: the mutation group uses `geneFilters` with the `_mutations` profile; the AMP group uses `geneFilters` with the `_gistic` profile and `copyNumberAlterationEventTypes: ["AMP"]`.

_"alteration" keyword:_ means mutation + CNA combined. StudyView cannot express this natively; strongly prefer `navigate_to_results_view`.

_"vs" semantics:_
- Symmetric cohort split ("male vs female", "stage I vs stage II") → Rule 2
- Gene alteration → outcome ("TP53 mutation vs survival") → Rule 3c
- Gene vs gene alteration ("EGFR vs KRAS") → Rule 3a
- Two continuous variables ("expression vs copy number") → Rule 3b

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
- **availableComparisonTabs** — which comparison tabs this study supports (e.g., `["overlap","clinical","survival","alterations","mutations","mrna"]`). Use when selecting `tab` for `navigate_to_group_comparison` or `comparison/{subtab}` for `navigate_to_results_view`.
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
