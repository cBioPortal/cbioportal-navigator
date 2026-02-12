# Navigate to StudyView

Generates direct URL to cBioPortal StudyView - cohort overview and analysis.

**→ See router tool for universal guidelines (no guessing IDs, exact values, Link First principle).**

## What StudyView Shows

- Cohort statistics and patient demographics
- Genomic overview (mutations, CNV, fusions)
- Survival analysis curves
- Custom charts and plots

---

## Required Inputs

### studyIds (required)

- Array of study IDs from router response
- **Single study:** `["luad_tcga_pan_can_atlas_2018"]`
- **Cross-study:** `["luad_tcga_pan_can_atlas_2018", "lusc_tcga"]`
- **🚫 DO NOT invent study IDs** - use exact values from router

### tab (optional)

- `"summary"` (default), `"clinicalData"`, `"cnSegments"`, `"plots"`
- Tool validates tab availability automatically
- If tab has no data, error explains why (don't generate invalid URL)

---

## Filtering - Clinical Attributes

**USE `get_clinical_attribute_values` FIRST:**
Before constructing clinical filters, call `get_clinical_attribute_values` to get exact valid values. Do NOT guess values.

### filterJson.clinicalDataFilters Structure
```json
{
  "clinicalDataFilters": [
    {
      "attributeId": "SEX",
      "values": [{"value": "Female"}]
    },
    {
      "attributeId": "AGE",
      "values": [{"start": 40, "end": 60}]
    }
  ]
}
```

### Key Rules

- **attributeId:** From router response `clinicalAttributeIds`
- **values array elements:**
  - **Categorical:** `{"value": "Female"}` - exact string from `get_clinical_attribute_values`
  - **Numerical range:** `{"start": 40, "end": 60}`
  - **Open-ended:** `{"start": 65}` or `{"end": 40}`
- **🚫 NEVER guess attribute values** - always use `get_clinical_attribute_values` output

---

## Filtering - Gene Mutations

### filterJson.geneFilters Structure
```json
{
  "geneFilters": [
    {
      "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
      "geneQueries": [[{"hugoGeneSymbol": "TP53"}]]
    }
  ]
}
```

### Key Rules

- **molecularProfileIds:** From router response metadata
  - Usually ends with `_mutations` for mutation data
  - Use exact IDs from router - do NOT construct or guess
- **geneQueries:** Nested arrays `[[{...}]]`
  - Each gene: `{hugoGeneSymbol: "TP53"}`
  - Multiple genes in OR: `[[{hugoGeneSymbol: "TP53"}, {hugoGeneSymbol: "KRAS"}]]`
- **Gene symbols:** UPPERCASE (TP53, KRAS, EGFR)

### Common Gene Filter Options (all optional)

- `alterations: ["AMP", "HOMDEL"]` - specific CNV types
- `includeDriver: true` - driver mutations only
- `includeVUS: false` - exclude variants of unknown significance

### Example

**User:** "Show LUAD patients with TP53 or KRAS mutations"
```json
{
  "geneFilters": [
    {
      "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
      "geneQueries": [[
        {"hugoGeneSymbol": "TP53"},
        {"hugoGeneSymbol": "KRAS"}
      ]]
    }
  ]
}
```

---

## Combining Filters

Multiple filter types use AND logic.

### Example

**User:** "Female LUAD patients with TP53 mutations, age 50-70"

```json
{
  "filterJson": {
    "clinicalDataFilters": [
      {"attributeId": "SEX", "values": [{"value": "Female"}]},
      {"attributeId": "AGE", "values": [{"start": 50, "end": 70}]}
    ],
    "geneFilters": [
      {
        "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
        "geneQueries": [[{"hugoGeneSymbol": "TP53"}]]
      }
    ]
  }
}
```

---

## Filtering - Gene Specific (Genomic)

These filters correspond to the "Gene Specific" charts in StudyView (add chart → search a gene → select profile type).

### How to derive `profileType`

`profileType` = molecularProfileId with the `{studyId}_` prefix stripped:
- `msk_chord_2024_mutations` → `"mutations"`
- `msk_chord_2024_cna` → `"cna"`
- `luad_tcga_pan_can_atlas_2018_mrna_seq_v2_rsem` → `"mrna_seq_v2_rsem"`

Use exact molecularProfileIds from router metadata to derive this.

---

### mutationDataFilters — Mutations profile, two modes

#### Mode 1: Mutated vs Not Mutated (`categorization: "MUTATED"`)

```json
{
  "mutationDataFilters": [{
    "hugoGeneSymbol": "TP53",
    "profileType": "mutations",
    "categorization": "MUTATED",
    "values": [[{"value": "MUTATED"}]]
  }]
}
```

- `values: [[{"value": "MUTATED"}]]` — samples WITH TP53 mutation
- `values: [[{"value": "NOT_MUTATED"}]]` — samples WITHOUT TP53 mutation

#### Mode 2: Mutation Types (`categorization: "MUTATION_TYPE"`)

```json
{
  "mutationDataFilters": [{
    "hugoGeneSymbol": "TP53",
    "profileType": "mutations",
    "categorization": "MUTATION_TYPE",
    "values": [[{"value": "Missense_Mutation"}]]
  }]
}
```

Common mutation type values: `"Missense_Mutation"`, `"Nonsense_Mutation"`, `"Frame_Shift_Del"`, `"Frame_Shift_Ins"`, `"In_Frame_Del"`, `"In_Frame_Ins"`, `"Splice_Site"`. Exact values depend on study data.

Multiple types (OR logic): `[[{"value": "Missense_Mutation"}], [{"value": "Nonsense_Mutation"}]]`

---

### genomicDataFilters — CNA (discrete) or expression (continuous) profiles

```json
{
  "genomicDataFilters": [{
    "hugoGeneSymbol": "MYC",
    "profileType": "gistic",
    "values": [{"value": "2"}]
  }]
}
```

**Discrete CNA values** (GISTIC/CNA profiles):
- `"2"` = Amplification, `"1"` = Gain, `"0"` = Diploid, `"-1"` = Shallow deletion, `"-2"` = Deep deletion

**Continuous expression values** (mRNA/protein profiles — numerical ranges):
```json
{
  "genomicDataFilters": [{
    "hugoGeneSymbol": "EGFR",
    "profileType": "mrna_seq_v2_rsem_zscores_ref_all_samples",
    "values": [{"start": 2.0}]
  }]
}
```

---

### alterationFilter — only when non-default

The frontend automatically applies default alteration settings. Only include `alterationFilter` when the user explicitly requests non-default behavior:

- Drivers only: `{"includeDriver": true, "includeVUS": false, "includeUnknownOncogenicity": false}`
- Somatic only: `{"includeGermline": false, "includeSomatic": true, "includeUnknownStatus": false}`
- Specific CNA types: `{"copyNumberAlterationEventTypes": {"AMP": true, "HOMDEL": false}}`

---

### Gene Specific Examples

**"Show patients with TP53 mutations (mutated vs not mutated)"**
```json
{
  "mutationDataFilters": [{"hugoGeneSymbol": "TP53", "profileType": "mutations", "categorization": "MUTATED", "values": [[{"value": "MUTATED"}]]}]
}
```

**"Show patients with MYC amplification (GISTIC)"**
```json
{
  "genomicDataFilters": [{"hugoGeneSymbol": "MYC", "profileType": "gistic", "values": [{"value": "2"}]}]
}
```

---

## Other Filter Types (Advanced)

### sampleIdentifiers
Select specific samples:
```json
{"sampleIdentifiers": [{"studyId": "luad_tcga", "sampleId": "TCGA-05-4244-01"}]}
```

### structuralVariantFilters
Filter by gene fusions:
```json
{
  "structuralVariantFilters": [{
    "molecularProfileIds": ["luad_tcga_sv"],
    "structVarQueries": [[{"gene1Query": {"hugoSymbol": "ALK"}, "gene2Query": {"specialValue": "ANY_GENE"}}]]
  }]
}
```

For complete schema, refer to the Zod inputSchema (studyViewFilterSchema).

---

## Legacy Simple Filtering

For SINGLE clinical attribute filtering only (use `filterJson` for multiple):

### filterAttributeId + filterValues

**Example:**
- `filterAttributeId: "SEX"`
- `filterValues: "Female"`

**For ranges:**
- `filterAttributeId: "AGE"`
- `filterValues: "40-60"`

**🚫 DO NOT use legacy filtering for:**
- Multiple attributes
- Gene filters
- Complex filters

---

## Complete Examples

### Example 1: Basic Navigation

**User:** "Show me the TCGA lung adenocarcinoma study"
- **Call:** `studyIds: ["luad_tcga_pan_can_atlas_2018"]`
- **Response:** Direct URL to study summary

### Example 2: Gene + Clinical Filtering

**User:** "LUAD patients with EGFR mutations, stage III/IV"
- **Router returns:** `molecularProfileIds: ["luad_tcga_pan_can_atlas_2018_mutations", ...]`
- **Call** `get_clinical_attribute_values: ["TUMOR_STAGE"]`
- **Returns:** TUMOR_STAGE values `["Stage I", "Stage II", "Stage III", "Stage IV"]`
- **Call navigate:**
  ```json
  {
    "studyIds": ["luad_tcga_pan_can_atlas_2018"],
    "filterJson": {
      "geneFilters": [{
        "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
        "geneQueries": [[{"hugoGeneSymbol": "EGFR"}]]
      }],
      "clinicalDataFilters": [{
        "attributeId": "TUMOR_STAGE",
        "values": [{"value": "Stage III"}, {"value": "Stage IV"}]
      }]
    }
  }
  ```
- **Response:** Direct filtered URL
