# Navigate to StudyView

Generates direct URL to cBioPortal StudyView — cohort overview and analysis.

**→ See router tool for universal guidelines (no guessing IDs, exact values, Link First principle).**

## Required Inputs

### studyIds (required)
Array of study IDs from router response. Single or cross-study: `["luad_tcga_pan_can_atlas_2018"]` or `["luad_tcga", "lusc_tcga"]`.

### tab (optional)
`"summary"` (default), `"clinicalData"`, `"cnSegments"`, `"plots"`. Tool validates tab availability automatically.

---

## Filtering — Clinical Attributes

**Call `get_studyviewfilter_options` first** to get exact valid values. Never guess.

### filterJson.clinicalDataFilters

```json
{
  "clinicalDataFilters": [
    {"attributeId": "SEX", "values": [{"value": "Female"}]},
    {"attributeId": "AGE", "values": [{"start": 40, "end": 60}]}
  ]
}
```

- **attributeId:** from router `clinicalAttributeIds`
- **Categorical:** `{"value": "Female"}` — exact string from `get_studyviewfilter_options`
- **Numerical range:** `{"start": 40, "end": 60}`, open-ended: `{"start": 65}` or `{"end": 40}`

---

## Filtering — Gene (Mutation / CNA / Structural Variant)

Use `geneFilters` for standard mutation/CNA/SV filtering. Use `mutationDataFilters` or `genomicDataFilters` (Gene Specific section) when you need NOT_MUTATED, specific mutation types, GAIN/HETLOSS/DIPLOID, or continuous expression values.

### Profile type identification

| Type | Profile ID pattern |
|------|--------------------|
| Mutation | `_mutations` |
| CNA | `_cna`, `_gistic` (DISCRETE only) |
| Structural Variant | `_structural_variants` |

Use exact profile IDs from router metadata.

### filterJson.geneFilters

```json
{
  "geneFilters": [{
    "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
    "geneQueries": [[{"hugoGeneSymbol": "TP53"}]]
  }]
}
```

### Union vs Intersection

- **Union** (ANY gene): `"geneQueries": [[{"hugoGeneSymbol": "TP53"}, {"hugoGeneSymbol": "KRAS"}]]`
- **Intersection** (ALL genes — same profile): `"geneQueries": [[{"hugoGeneSymbol": "TP53"}], [{"hugoGeneSymbol": "KRAS"}]]`

**IDH1 AND TP53 mutant (same profile):**
```json
{
  "geneFilters": [{
    "molecularProfileIds": ["lgg_tcga_pan_can_atlas_2018_mutations"],
    "geneQueries": [[{"hugoGeneSymbol": "IDH1"}], [{"hugoGeneSymbol": "TP53"}]]
  }]
}
```

### CNA `alterations` field

`geneFilters` supports only `"AMP"` and `"HOMDEL"` for CNA. For `"GAIN"`, `"HETLOSS"`, or `"DIPLOID"`, use `genomicDataFilters` instead (see Gene Specific section below).

```json
{"hugoGeneSymbol": "MYC", "alterations": ["AMP"]}
```

### Cross-type intersection (AND)

To require samples with both a mutation AND a CNA (different profiles), use separate `geneFilters` entries:

```json
{
  "geneFilters": [
    {
      "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
      "geneQueries": [[{"hugoGeneSymbol": "TP53"}]]
    },
    {
      "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_gistic"],
      "geneQueries": [[{"hugoGeneSymbol": "MYC", "alterations": ["AMP"]}]]
    }
  ]
}
```

### Cross-type OR — provide separate URLs

**Same alteration type OR** (e.g., TP53 mutant OR KRAS mutant): use `geneQueries` union within a single `geneFilters` entry — `filterJson` handles this natively.

**Cross alteration type OR** (e.g., TP53 mutant OR EGFR AMP — different profiles): StudyView does not support this natively. Call `navigate_to_study_view` **once per filter** (exception to the one-call rule) to generate a separate URL for each, then instruct the user:

> "StudyView doesn't support OR across different alteration types directly. Here are the two filtered views:
> 1. Open the first link → click **Custom Selection** (top right) → click **currently selected** to populate the text box with those sample IDs → copy the list
> 2. Open the second link → click **Custom Selection** → click **currently selected** → paste in the copied IDs to add them to the list → click **Filter to listed samples**"

---

## Filtering — Gene Specific (Genomic)

These correspond to "Gene Specific" charts in StudyView (add chart → search gene → select profile).

Use when:
- Mutation: need `NOT_MUTATED` or specific mutation types → `mutationDataFilters`
- CNA: need `GAIN`, `HETLOSS`, or `DIPLOID` → `genomicDataFilters`
- Expression/protein: continuous value ranges → `genomicDataFilters`

Multiple entries in `mutationDataFilters` or `genomicDataFilters` combine with AND logic. Both can be used alongside `geneFilters` in the same filter.

### profileType derivation

Strip `{studyId}_` prefix from molecularProfileId:
- `msk_chord_2024_mutations` → `"mutations"`
- `luad_tcga_pan_can_atlas_2018_mrna_seq_v2_rsem` → `"mrna_seq_v2_rsem"`

### mutationDataFilters — two modes

**Mode 1: Mutated vs Not Mutated**
```json
{"hugoGeneSymbol": "TP53", "profileType": "mutations", "categorization": "MUTATED", "values": [[{"value": "Mutated"}]]}
```
Values are always `"Mutated"` or `"Not Mutated"` — no lookup needed.

**Mode 2: Mutation Types**
```json
{"hugoGeneSymbol": "EGFR", "profileType": "mutations", "categorization": "MUTATION_TYPE", "values": [[{"value": "In_Frame_Del"}, {"value": "In_Frame_Ins"}]]}
```
Always call `get_studyviewfilter_options` with `geneSpecificQueries: [{"hugoGeneSymbol": "EGFR", "profileType": "mutations"}]` first — even if the type names look standard. Do not guess.

`values` is a 2D array: **outer = AND between groups, inner = OR within group**. To match any of several types, put all values in one inner array:
- Match any type (OR): `[[{"value": "In_Frame_Del"}, {"value": "In_Frame_Ins"}]]`
- Require all simultaneously (AND, not meaningful for mutation types): `[[{"value": "In_Frame_Del"}], [{"value": "In_Frame_Ins"}]]`

### genomicDataFilters — CNA or expression profiles

**Discrete CNA** (GISTIC/CNA profiles):
```json
{"hugoGeneSymbol": "MYC", "profileType": "gistic", "values": [{"value": "2"}]}
```
Values: `"2"` = Amp, `"1"` = Gain, `"0"` = Diploid, `"-1"` = Shallow del, `"-2"` = Deep del

**Continuous expression** (mRNA/protein — numerical ranges):
```json
{"hugoGeneSymbol": "EGFR", "profileType": "mrna_seq_v2_rsem_zscores_ref_all_samples", "values": [{"start": 2.0}]}
```

**Driver / VUS filtering:** StudyView does not support driver/VUS filtering via URL. For queries like "driver mutations in IDH1" or "exclude VUS", use `navigate_to_results_view` with OQL (`IDH1: MUT_DRIVER`) instead.

---

## Filtering — Generic Assay

For studies with `genericAssayProfiles` in router metadata (genetic ancestry, mutational signatures, etc.).

**Workflow:** Router returns profiles → call `get_studyviewfilter_options` with `genericAssayProfileIds` → use returned `profileType` and `stableId` in filter.

```json
{
  "genericAssayDataFilters": [{
    "profileType": "genetic_ancestry",
    "stableId": "European",
    "values": [{"start": 0.8}]
  }]
}
```

- **profileType:** molecularProfileId with `{studyId}_` prefix stripped
- **stableId:** from `get_studyviewfilter_options` response
- **LIMIT-VALUE (continuous):** `{"start": 0.8}`, `{"end": 0.5}`, or `{"start": 0.2, "end": 0.8}`
- **CATEGORICAL/BINARY:** `{"value": "High"}`

---

## Other Filter Types

### sampleIdentifiers
```json
{"sampleIdentifiers": [{"studyId": "luad_tcga", "sampleId": "TCGA-05-4244-01"}]}
```

### Legacy: filterAttributeId + filterValues
For SINGLE clinical attribute only. Use `filterJson` for anything more complex.
- `filterAttributeId: "SEX"`, `filterValues: "Female"`
- Ranges: `filterAttributeId: "AGE"`, `filterValues: "40-60"`

---

## Combining Filters

Multiple filter types use AND logic. Full example:

**"Female LUAD patients with EGFR mutations, stage III/IV, age 50-70"**
```json
{
  "filterJson": {
    "clinicalDataFilters": [
      {"attributeId": "SEX", "values": [{"value": "Female"}]},
      {"attributeId": "AGE", "values": [{"start": 50, "end": 70}]},
      {"attributeId": "TUMOR_STAGE", "values": [{"value": "Stage III"}, {"value": "Stage IV"}]}
    ],
    "geneFilters": [{
      "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
      "geneQueries": [[{"hugoGeneSymbol": "EGFR"}]]
    }]
  }
}
```

---

## Plots Configuration

Use `tab: "plots"` with `plotsHorzSelection` / `plotsVertSelection` to pre-configure axes. Set `selectedGeneOption` to the **Hugo gene symbol** (e.g. `"IDH1"`) — it is resolved to an Entrez ID automatically.

| Field | Value |
|---|---|
| `selectedGeneOption` | Hugo symbol, e.g. `"IDH1"` |
| `dataType` | `"MRNA_EXPRESSION"`, `"MUTATION_EXTENDED"`, `"COPY_NUMBER_ALTERATION"`, `"METHYLATION"`, `"PROTEIN_LEVEL"`, `"STRUCTURAL_VARIANT"`, `"clinical_attribute"` |
| `selectedDataSourceOption` | **Molecular types:** profile suffix — strip `{studyId}_` prefix from the molecular profile ID (e.g. `"lgggbm_tcga_pub_mrna_median_zscores"` → `"mrna_median_zscores"`). Same rule as `profileType` in `mutationDataFilters`/`genomicDataFilters`. **`clinical_attribute`:** clinical attribute ID from router `clinicalAttributeIds` (e.g. `"CANCER_TYPE_DETAILED"`, `"CANCER_TYPE"`) |
| `mutationCountBy` | `"MutationType"` (default), `"MutatedVsWildType"` — only for `MUTATION_EXTENDED` axis |
| `logScale` | `"true"` or `"false"` |

**"IDH1 expression by mutation status in LGG"**
```json
{
  "studyIds": ["lgggbm_tcga_pub"],
  "tab": "plots",
  "plotsHorzSelection": {
    "selectedGeneOption": "IDH1",
    "dataType": "MUTATION_EXTENDED",
    "selectedDataSourceOption": "mutations",
    "mutationCountBy": "MutatedVsWildType"
  },
  "plotsVertSelection": {
    "selectedGeneOption": "IDH1",
    "dataType": "MRNA_EXPRESSION",
    "selectedDataSourceOption": "mrna_median_zscores"
  }
}
```

Use profile IDs from router metadata. Only include plots params when the user asks for a specific plot configuration.
