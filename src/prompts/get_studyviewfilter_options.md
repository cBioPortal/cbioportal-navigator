# Get StudyView Filter Options

Fetches exact valid values for building `filterJson` in StudyView — covers **clinical attributes**, **generic assay entities**, and **gene-specific filters**.

## What This Tool Does

- **Clinical attributes:** returns datatype + exact values for STRING/BOOLEAN; `continuous: true` and quartile `bins` for NUMBER (use `{start, end}` ranges)
- **Generic assay entities:** returns entity list and values (categorical) or `"continuous": true` flag (LIMIT-VALUE)
- **Gene-specific:** returns value distributions for `mutationDataFilters` and `genomicDataFilters`

**Never guess or invent filter values.** Always use exact values from this tool's response.

---

## Input

### studyId
Study identifier from router response. **Singular** (`studyId`, not `studyIds`) — unlike the navigation tools, which take a `studyIds` array for cross-study cohorts, this tool always operates on exactly one study.

### attributeIds _(optional)_
Array of clinical attribute IDs from `router.metadata.clinicalAttributeIds`.

### genericAssayProfileIds _(optional)_
Array of molecular profile IDs from `router.metadata.genericAssayProfiles[].molecularProfileId`.

### entitySearch _(optional)_
Keyword to filter generic assay entities by stableId or NAME (case-insensitive regex). **Required for methylation profiles** (tens of thousands of probes). Pass a gene symbol (e.g. `"EGFR"`) or probe ID (e.g. `"cg03860890"`).

### geneSpecificQueries _(optional)_
Array of `{ hugoGeneSymbol, profileType }` to query gene-specific value distributions.

- `profileType` is the profile suffix — strip `{studyId}_` from the molecularProfileId (e.g. `"luad_tcga_pan_can_atlas_2018_mutations"` → `"mutations"`, `"luad_tcga_pan_can_atlas_2018_gistic"` → `"gistic"`)
- `profileType === "mutations"` → returns mutation type breakdown as `counts` (used in `mutationDataFilters` with `categorization: "MUTATION_TYPE"`)
- Discrete CNA profiles (e.g. `"gistic"`, `"cna"`) → returns CNA level breakdown as `counts` (used in `genomicDataFilters`)
- Continuous profiles (mRNA, protein, methylation, log2 copy-number, etc.) → returns quartile bin ranges as `bins` (used in `genomicDataFilters` as `{start}`/`{end}` ranges)

### includeTreatments _(optional)_
Set to `true` to fetch available drug/agent names for use in `patientTreatmentFilters` or `sampleTreatmentFilters`.

At least one of `attributeIds`, `genericAssayProfileIds`, `geneSpecificQueries`, or `includeTreatments` is required.

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
    "continuous": true,
    "bins": [
      { "end": 59, "count": 138 },
      { "start": 59, "end": 66, "count": 114 },
      { "start": 66, "end": 73, "count": 133 },
      { "start": 73, "count": 110 }
    ]
  }
]
```
NUMBER attributes have `continuous: true` — for an explicit threshold (e.g. "age over 60"), use `{"start": 60}` directly in `clinicalDataFilters`, no query needed. For a data-driven/cohort-relative split ("quartiles", "high vs low"), use the `bins` ranges — each entry is a quartile with ~equal sample counts, dropping the bin for samples with no recorded value (see `"NA"` below for that group).

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
  },
  {
    "hugoGeneSymbol": "PDCD1",
    "profileType": "rna_seq_mrna",
    "bins": [
      { "end": 3.3886, "count": 8 },
      { "start": 3.3886, "end": 4.41235, "count": 7 },
      { "start": 4.41235, "end": 5.9576, "count": 8 },
      { "start": 5.9576, "count": 7 }
    ]
  }
]
```

For `counts`, `value` is what goes into the filter and `label` is the display name. For `bins`, each entry is a quartile range (4 bins, ~equal sample counts) — `start`/`end` go directly into `genomicDataFilters` as `{start}`/`{end}`.

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

### `genomicDataFilters` — discrete CNA levels

Use `value` strings from `counts` results:

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

### `genomicDataFilters` — continuous data (mRNA, protein, methylation, log2 CNA, etc.)

**Explicit threshold from the user** (e.g. "Z-score > 2", "expression below 5") — use it directly, no query needed:

```json
{
  "genomicDataFilters": [{
    "hugoGeneSymbol": "EGFR",
    "profileType": "rna_seq_v2_mrna_median_Zscores",
    "values": [{"start": 2.0}]
  }]
}
```

**Data-driven split** (quartiles, "high vs low", "split by expression") — query `geneSpecificQueries` for that gene+profile to get `bins`: 4 quartile ranges with ~equal sample counts. Use a `{start, end}` range directly:

```json
{
  "genomicDataFilters": [{
    "hugoGeneSymbol": "PDCD1",
    "profileType": "rna_seq_mrna",
    "values": [{"end": 3.3886}]
  }]
}
```
→ filters to the lowest quartile (Q1) of PDCD1 expression.

**2-group high/low split:** merge bins 1+2 vs bins 3+4 — the boundary between bin 2 and bin 3 is the median. E.g. with bins `[{end:3.3886}, {start:3.3886,end:4.41235}, {start:4.41235,end:5.9576}, {start:5.9576}]`, "Low" = `{"end": 4.41235}` and "High" = `{"start": 4.41235}`.

**Group comparison from bins** — pass each range as a separate group's `studyViewFilter.genomicDataFilters` in `navigate_to_group_comparison`'s `groups`:

```json
{
  "studyIds": ["gbm_iatlas_prins_2019"],
  "groups": [
    {
      "name": "PDCD1 Low",
      "studyViewFilter": {
        "genomicDataFilters": [{"hugoGeneSymbol": "PDCD1", "profileType": "rna_seq_mrna", "values": [{"end": 4.41235}]}]
      }
    },
    {
      "name": "PDCD1 High",
      "studyViewFilter": {
        "genomicDataFilters": [{"hugoGeneSymbol": "PDCD1", "profileType": "rna_seq_mrna", "values": [{"start": 4.41235}]}]
      }
    }
  ],
  "tab": "survival"
}
```

---

## Building `clinicalDataFilters`

### Categorical (STRING/BOOLEAN) — exact value

Use `value` strings from `attributes[].values`:

```json
{
  "clinicalDataFilters": [{"attributeId": "SEX", "values": [{"value": "Female"}]}]
}
```

Merge multiple values into one group by listing them together: `"values": [{"value": "T1"}, {"value": "T2"}]`.

### NUMBER — explicit threshold or data-driven split

**Explicit threshold from the user** (e.g. "age over 60") — use it directly, no query needed:

```json
{
  "clinicalDataFilters": [{"attributeId": "AGE", "values": [{"start": 60}]}]
}
```

**Data-driven split** (quartiles, "high vs low") — use `{start, end}` ranges from `attributes[].bins` directly:

```json
{
  "clinicalDataFilters": [{"attributeId": "AGE", "values": [{"end": 59}]}]
}
```
→ filters to the lowest quartile (Q1) of AGE.

**2-group high/low split:** merge bins 1+2 vs bins 3+4 — the boundary between bin 2 and bin 3 is the median, same as for `genomicDataFilters` bins above.

### "NA" / missing-data group

`"NA"` is a valid value representing samples with no recorded value for the attribute — appears in `attributes[].values` for categorical attributes (e.g. `["Male", "Female", "NA"]`) and is always usable even when not listed (NUMBER attributes have no recorded NA value but the underlying samples still exist):

```json
{
  "clinicalDataFilters": [{"attributeId": "SEX", "values": [{"value": "NA"}]}]
}
```
→ samples where SEX was not recorded.

### Group comparison from values/bins

Pass each value or range as a separate group's `studyViewFilter.clinicalDataFilters` in `navigate_to_group_comparison`'s `groups`:

```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "groups": [
    {
      "name": "Male",
      "studyViewFilter": {"clinicalDataFilters": [{"attributeId": "SEX", "values": [{"value": "Male"}]}]}
    },
    {
      "name": "Female",
      "studyViewFilter": {"clinicalDataFilters": [{"attributeId": "SEX", "values": [{"value": "Female"}]}]}
    },
    {
      "name": "Unknown",
      "studyViewFilter": {"clinicalDataFilters": [{"attributeId": "SEX", "values": [{"value": "NA"}]}]}
    }
  ],
  "tab": "clinical"
}
```

Same pattern with `bins` ranges for NUMBER attributes (e.g. AGE Q1 vs Q4) — see the survival example for `genomicDataFilters` bins above.

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
