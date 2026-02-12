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

**USE `get_studyviewfilter_options` FIRST:**
Before constructing clinical filters, call `get_studyviewfilter_options` to get exact valid values. Do NOT guess values.

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
  - **Categorical:** `{"value": "Female"}` - exact string from `get_studyviewfilter_options`
  - **Numerical range:** `{"start": 40, "end": 60}`
  - **Open-ended:** `{"start": 65}` or `{"end": 40}`
- **🚫 NEVER guess attribute values** - always use `get_studyviewfilter_options` output

---

## Filtering - Gene (Mutation / CNA / Structural Variant)

Mutations, CNAs, and structural variants all use `geneFilters`. The molecular profile ID determines which alteration type is filtered.

### How to identify profile type from router metadata

| Type | Profile ID pattern | Notes |
|------|--------------------|-------|
| Mutation | `_mutations`, `_sequenced` | MUTATION_EXTENDED profiles |
| CNA | `_cna`, `_gistic` | COPY_NUMBER_ALTERATION, **DISCRETE only** |
| Structural Variant | `_structural_variants` | STRUCTURAL_VARIANT profiles |

Use exact IDs from router metadata — do NOT construct or guess.

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

- **Gene symbols:** UPPERCASE (TP53, KRAS, EGFR)
- Multiple alteration types → use separate `geneFilters` entries (one per profile)

### Union vs Intersection (multiple genes)

**Union (default)** — sample has alteration in ANY of the selected genes:
```json
"geneQueries": [[{"hugoGeneSymbol": "TP53"}, {"hugoGeneSymbol": "KRAS"}]]
```

**Intersection** — sample has alterations in ALL of the selected genes:
```json
"geneQueries": [[{"hugoGeneSymbol": "TP53"}], [{"hugoGeneSymbol": "KRAS"}]]
```

### CNA — `alterations` field

For CNA profiles, specify which copy number types to include. Valid values: `"AMP"`, `"GAIN"`, `"DIPLOID"`, `"HETLOSS"`, `"HOMDEL"`.

If `alterations` is omitted or empty `[]`, all types are included.

```json
{
  "geneFilters": [{
    "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_gistic"],
    "geneQueries": [[
      {"hugoGeneSymbol": "MYC", "alterations": ["AMP"]},
      {"hugoGeneSymbol": "CDKN2A", "alterations": ["HOMDEL"]}
    ]]
  }]
}
```

### Examples

**"Show LUAD patients with TP53 or KRAS mutations (union)"**
```json
{
  "geneFilters": [{
    "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
    "geneQueries": [[{"hugoGeneSymbol": "TP53"}, {"hugoGeneSymbol": "KRAS"}]]
  }]
}
```

**"Show LUAD patients with both TP53 mutation AND MYC amplification (intersection across types)"**
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

**"Show LUAD patients with ALK structural variant"**
```json
{
  "geneFilters": [{
    "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_structural_variants"],
    "geneQueries": [[{"hugoGeneSymbol": "ALK"}]]
  }]
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

## Filtering - Generic Assay

Applies to studies with `genericAssayProfiles` in the router metadata (e.g., genetic ancestry, mutational signatures, treatment response scores).

### Workflow

1. Router returns `genericAssayProfiles: [{ molecularProfileId, datatype }]`
2. Call `get_studyviewfilter_options` with `genericAssayProfileIds` to get entity stableIds + values
3. Construct `genericAssayDataFilters` using the returned `profileType` and `stableId`

### filterJson.genericAssayDataFilters Structure

```json
{
  "genericAssayDataFilters": [
    {
      "profileType": "genetic_ancestry",
      "stableId": "European",
      "values": [{"start": 0.8}]
    }
  ]
}
```

- **profileType:** `molecularProfileId` with `{studyId}_` prefix stripped (same rule as genomicDataFilters)
- **stableId:** from `get_studyviewfilter_options` response `genericAssayEntities[].entities[].stableId`
- **values:**
  - `LIMIT-VALUE` (continuous): `{"start": 0.8}`, `{"end": 0.5}`, or `{"start": 0.2, "end": 0.8}`
  - `CATEGORICAL`/`BINARY`: `{"value": "High"}` — use exact string from `values[]` in response

### Example

**"Show patients with >80% European genetic ancestry"**
```json
{
  "genericAssayDataFilters": [{
    "profileType": "genetic_ancestry",
    "stableId": "European",
    "values": [{"start": 0.8}]
  }]
}
```

---

## Other Filter Types (Advanced)

### sampleIdentifiers
Select specific samples:
```json
{"sampleIdentifiers": [{"studyId": "luad_tcga", "sampleId": "TCGA-05-4244-01"}]}
```


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
- **Call** `get_studyviewfilter_options: ["TUMOR_STAGE"]`
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
