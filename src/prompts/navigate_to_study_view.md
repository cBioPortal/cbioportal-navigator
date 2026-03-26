# Navigate to StudyView

Generates direct URL to cBioPortal StudyView — cohort overview and analysis.

**→ See router tool for universal guidelines (no guessing IDs, exact values, Link First principle).**

## What StudyView Shows

- Cohort statistics and patient demographics
- Genomic overview (mutations, CNV, fusions)
- Survival analysis curves
- Custom charts and plots

---

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

### Cross-type intersection

Different alteration types require separate `geneFilters` entries:

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
{"hugoGeneSymbol": "TP53", "profileType": "mutations", "categorization": "MUTATED", "values": [[{"value": "MUTATED"}]]}
```
Values: `"MUTATED"` or `"NOT_MUTATED"`

**Mode 2: Mutation Types**
```json
{"hugoGeneSymbol": "TP53", "profileType": "mutations", "categorization": "MUTATION_TYPE", "values": [[{"value": "Missense_Mutation"}]]}
```
Common types: `"Missense_Mutation"`, `"Nonsense_Mutation"`, `"Frame_Shift_Del"`, `"Frame_Shift_Ins"`, `"In_Frame_Del"`, `"In_Frame_Ins"`, `"Splice_Site"`.

`values` is a 2D array: **outer = OR, inner = AND**. For mutation types, use outer OR (each type in its own inner array):
- OR: `[[{"value": "Missense_Mutation"}], [{"value": "Nonsense_Mutation"}]]`
- AND (rare): `[[{"value": "Missense_Mutation"}, {"value": "Nonsense_Mutation"}]]`

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

### alterationFilter — only when non-default

Only include when user explicitly requests:
- Drivers only: `{"includeDriver": true, "includeVUS": false, "includeUnknownOncogenicity": false}`
- Somatic only: `{"includeGermline": false, "includeSomatic": true, "includeUnknownStatus": false}`
- Specific CNA: `{"copyNumberAlterationEventTypes": {"AMP": true, "HOMDEL": false}}` — only `AMP` and `HOMDEL` are supported here; for `GAIN`, `HETLOSS`, or `DIPLOID`, use `genomicDataFilters` instead

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
| `dataType` | `"MRNA_EXPRESSION"`, `"MUTATION_EXTENDED"`, `"COPY_NUMBER_ALTERATION"`, `"METHYLATION"`, `"PROTEIN_LEVEL"`, `"CLINICAL"` |
| `selectedDataSourceOption` | Molecular profile ID from router metadata (e.g. `"lgggbm_tcga_pub_mrna_median_zscores"`) |
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
    "selectedDataSourceOption": "lgggbm_tcga_pub_mutations",
    "mutationCountBy": "MutatedVsWildType"
  },
  "plotsVertSelection": {
    "selectedGeneOption": "IDH1",
    "dataType": "MRNA_EXPRESSION",
    "selectedDataSourceOption": "lgggbm_tcga_pub_mrna_median_zscores"
  }
}
```

Use profile IDs from router metadata. Only include plots params when the user asks for a specific plot configuration.
