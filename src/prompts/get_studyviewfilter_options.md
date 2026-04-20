# Get StudyView Filter Options

Fetches exact valid values for building `filterJson` in StudyView — covers **clinical attributes**, **generic assay entities**, and **gene-specific filters**.

## What This Tool Does

- **Clinical attributes:** returns datatype + exact values for STRING/BOOLEAN; `continuous: true` for NUMBER (use `{start, end}` ranges)
- **Generic assay entities:** returns entity list and values (categorical) or `"continuous": true` flag (LIMIT-VALUE)
- **Gene-specific:** returns value distributions for `mutationDataFilters` and `genomicDataFilters`

**Never guess or invent filter values.** Always use exact values from this tool's response.

---

## Input

### studyId
Study identifier from router response.

### attributeIds _(optional)_
Array of clinical attribute IDs from `router.metadata.clinicalAttributeIds`.

### genericAssayProfileIds _(optional)_
Array of molecular profile IDs from `router.metadata.genericAssayProfiles[].molecularProfileId`.

### entitySearch _(optional)_
Keyword to filter generic assay entities by stableId or NAME (case-insensitive regex). **Required for methylation profiles** (tens of thousands of probes). Pass a gene symbol (e.g. `"EGFR"`) or probe ID (e.g. `"cg03860890"`).

### geneSpecificQueries _(optional)_
Array of `{ hugoGeneSymbol, profileType }` to query gene-specific value distributions.

- `profileType` is the profile suffix — strip `{studyId}_` from the molecularProfileId (e.g. `"luad_tcga_pan_can_atlas_2018_mutations"` → `"mutations"`, `"luad_tcga_pan_can_atlas_2018_gistic"` → `"gistic"`)
- `profileType === "mutations"` → returns mutation type breakdown (used in `mutationDataFilters` with `categorization: "MUTATION_TYPE"`)
- Other profileTypes (e.g. `"gistic"`) → returns CNA level breakdown (used in `genomicDataFilters`)

At least one of `attributeIds`, `genericAssayProfileIds`, or `geneSpecificQueries` is required.

---

## Output

### `attributes` (when attributeIds provided)
```json
[
  {
    "attributeId": "SEX",
    "displayName": "Sex",
    "datatype": "STRING",
    "values": ["Male", "Female", "NA"]
  },
  {
    "attributeId": "AGE",
    "displayName": "Diagnosis Age",
    "datatype": "NUMBER",
    "continuous": true
  }
]
```
NUMBER attributes have `continuous: true` — use `{"start": 40, "end": 60}` in `clinicalDataFilters`.

### `genericAssayEntities` (when genericAssayProfileIds provided)
```json
[
  {
    "molecularProfileId": "luad_tcga_pan_can_atlas_2018_genetic_ancestry",
    "profileType": "genetic_ancestry",
    "datatype": "LIMIT-VALUE",
    "entities": [
      { "stableId": "European", "name": "European", "continuous": true }
    ]
  }
]
```

### `geneSpecificCounts` (when geneSpecificQueries provided)
```json
[
  {
    "hugoGeneSymbol": "EGFR",
    "profileType": "mutations",
    "counts": [
      { "value": "Missense_Mutation", "label": "Missense Mutation", "count": 53 },
      { "value": "In_Frame_Del",      "label": "In Frame Del",      "count": 26 },
      { "value": "In_Frame_Ins",      "label": "In Frame Ins",      "count": 3  },
      { "value": "Nonsense_Mutation", "label": "Nonsense Mutation", "count": 2  }
    ]
  },
  {
    "hugoGeneSymbol": "EGFR",
    "profileType": "gistic",
    "counts": [
      { "value": "2",  "label": "Amplification",      "count": 45 },
      { "value": "1",  "label": "Gain",               "count": 120 },
      { "value": "0",  "label": "Diploid",             "count": 300 },
      { "value": "-1", "label": "Shallow Deletion",   "count": 80 },
      { "value": "-2", "label": "Deep Deletion",      "count": 10 }
    ]
  }
]
```

`value` is what goes into the filter. `label` is the display name.

---

## Building Filters from geneSpecificCounts

### `mutationDataFilters` — mutation type (MUTATION_TYPE categorization)

Use `value` strings from `profileType: "mutations"` results:

```json
{
  "mutationDataFilters": [{
    "hugoGeneSymbol": "EGFR",
    "profileType": "mutations",
    "categorization": "MUTATION_TYPE",
    "values": [
      [{"value": "In_Frame_Del"}, {"value": "In_Frame_Ins"}, {"value": "Frame_Shift_Del"}]
    ]
  }]
}
```

`values` is a 2D array: **outer = AND between groups, inner = OR within group**. To match any of several types, put all values in one inner array. Separate outer groups require a patient to simultaneously have mutations of ALL groups — not meaningful for mutation types.

### `mutationDataFilters` — mutated vs not mutated (MUTATED categorization)

No need to query — values are always `"Mutated"` and `"Not Mutated"`. Use directly:

```json
{
  "mutationDataFilters": [{
    "hugoGeneSymbol": "EGFR",
    "profileType": "mutations",
    "categorization": "MUTATED",
    "values": [[{"value": "Mutated"}]]
  }]
}
```

### `genomicDataFilters` — CNA discrete levels

Use `value` strings from non-mutation profileType results:

```json
{
  "genomicDataFilters": [{
    "hugoGeneSymbol": "EGFR",
    "profileType": "gistic",
    "values": [{"value": "2"}]
  }]
}
```

CNA values: `"2"` = AMP, `"1"` = GAIN, `"0"` = DIPLOID, `"-1"` = HETLOSS, `"-2"` = HOMDEL.

### `genomicDataFilters` — continuous expression

For mRNA/protein profiles (continuous), no query needed — use numerical ranges directly:

```json
{
  "genomicDataFilters": [{
    "hugoGeneSymbol": "EGFR",
    "profileType": "rna_seq_v2_mrna_median_Zscores",
    "values": [{"start": 2.0}]
  }]
}
```

---

## Building `genericAssayDataFilters`

```json
{
  "genericAssayDataFilters": [{
    "profileType": "genetic_ancestry",
    "stableId": "European",
    "values": [{"start": 0.8}]
  }]
}
```

| datatype | filter style | example |
|----------|-------------|---------|
| `LIMIT-VALUE` | numerical range | `{"start": 0.8}` or `{"start": 0.2, "end": 0.5}` |
| `CATEGORICAL` | exact string | `{"value": "High"}` |
| `BINARY` | exact string | `{"value": "YES"}` |

---

## Notes

**Methylation:** Always pass `entitySearch` with a gene symbol or probe ID — methylation profiles have tens of thousands of probes.

```json
{
  "studyId": "lgggbm_tcga_pub",
  "genericAssayProfileIds": ["lgggbm_tcga_pub_methylation_hm27"],
  "entitySearch": "EGFR"
}
```

When displaying methylation probes, always include the `description` (genomic region) alongside the probe ID and gene name — e.g. `cg12434587 — MGMT, TSS1500`. When auto-selecting a probe for filtering, state which probe was chosen and why, then list all alternatives with their annotations so the user can switch if needed.

**All parameters can be combined in a single call.**
