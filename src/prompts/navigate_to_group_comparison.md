# Navigate to Group Comparison

Creates group comparison sessions and generates URL to cBioPortal's Group Comparison page.

**→ See router tool for universal guidelines (no guessing IDs, exact values, Link First principle).**
**→ `studyViewFilter` format (geneFilters, mutationDataFilters, genomicDataFilters, etc.) follows the same rules as `navigate_to_study_view`. `profileType` = molecularProfileId with `{studyId}_` prefix stripped.**

## What Group Comparison Shows

- Statistical comparison between groups (e.g., Male vs Female, T1 vs T2 vs T3)
- Survival analysis across groups
- Mutation and CNA enrichment between groups
- Clinical attribute differences
- mRNA/protein expression comparison

---

## Parameters

### studyIds (required)
Array of study IDs from router response. Cross-study supported, but the clinical attribute **must exist in all specified studies** with compatible value types.

### clinicalAttributeId
Clinical attribute ID to group by (e.g., `"SEX"`, `"PATH_T_STAGE"`). Tool discovers all values and creates one group per value automatically. **Cannot be used together with `groups`.**

### groups
Array of custom groups (≥ 2). Two group types:
- **Filter group:** `{ name, studyViewFilter }` — samples matching the filter. `studyIds` are auto-injected.
- **Unselected group:** `{ name, isUnselected: true }` — samples in the cohort NOT matched by any other group (complement). At most one group may be unselected.

Use when grouping logic cannot be expressed as a single attribute: merged values (T1+T2 vs T3+T4), gene-based splits, wildtype/unaltered comparisons, multi-cohort. **Cannot be used together with `clinicalAttributeId`, `clinicalAttributeValues`, or `includeNA`.** Can be combined with `studyViewFilter` for global pre-filtering.

### studyViewFilter
Pre-filter samples before grouping. Works with both `clinicalAttributeId` and `groups` — when used with `groups`, it is intersected with each group's filter. Same format as `navigate_to_study_view` filterJson. `studyIds` are auto-injected — don't include them inside.

### clinicalAttributeValues (clinicalAttributeId only)
Subset of values to compare (categorical only). Reduces noise when attribute has many values. Case-insensitive matching.

### includeNA (clinicalAttributeId only)
Include "NA" group for samples missing the attribute. Default: `true` (categorical), `false` (numerical).

### tab
Use a value from `availableComparisonTabs` in the resolver metadata for the study. Omit to land on `overlap` (default).

| tab | Shows | Available when |
|---|---|---|
| `overlap` | Sample overlap Venn diagram between groups | Always |
| `clinical` | Clinical attribute differences between groups | Always |
| `survival` | Kaplan-Meier survival curves | Study has survival clinical attributes (`_STATUS`+`_MONTHS` pair) |
| `alterations` | Enriched mutations and CNA between groups | Study has mutation or CNA profiles |
| `mutations` | Detailed mutation comparison (lollipop plot) | Study has mutation profiles; **exactly 2 groups required** |
| `mrna` | mRNA expression enrichment | Study has mRNA profiles; single study only |
| `protein` | Protein/phosphoprotein expression enrichment (RPPA) | Study has protein profiles; single study only |
| `dna_methylation` | DNA methylation enrichment | Study has methylation profiles; single study only |
| `generic_assay_{type}` | Custom assay enrichment (e.g. `generic_assay_treatment_response`) | Study has generic assay profiles; single study only |

**Arm-level CNA:** When the user asks about chromosome arm deletions/gains (e.g., "19q deletion", "1p loss", "chr8 gain"), use `generic_assay_armlevel_cna` if present in `availableComparisonTabs` — it directly shows arm-level CNA enrichment per group. Prefer this over `alterations` for arm-level questions.

---

## Grouping Behavior (clinicalAttributeId)

**Categorical (STRING):** Groups by unique values. Top 19 + NA = max 20 groups, sorted by sample count.

**Numerical (NUMBER):** Auto-splits into 4 quartiles with equal sample counts (e.g., AGE → "33.5-55", "55-67", "67-75.5", "75.5-89"). NaN samples go to NA group.

**Patient vs Sample level:** Tool auto-detects from metadata. Patient-level attributes (SEX, AGE) apply to all samples; sample-level (SAMPLE_TYPE) are per-sample.

**Minimum 2 groups required** for comparison.

---

## Response Format

The tool returns:
- **url:** Direct link to comparison page (with optional tab)
- **studyViewUrl:** StudyView link for exploring the cohort (with pre-filter applied if provided)
- **groups:** Array with name and sample count per group
- **groupUrls** _(when pre-filter, value subset, or custom groups are used):_ one StudyView URL per group with combined filters

When presenting results, include group names and sample counts. Always offer both the comparison link and the `studyViewUrl`. For `groupUrls`, provide each group's URL for detailed exploration.

---

## Examples

### Compare by attribute
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "SEX"
}
```

### Compare by attribute within a sub-cohort
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "SEX",
  "studyViewFilter": {
    "clinicalDataFilters": [{"attributeId": "AGE", "values": [{"start": 60}]}],
    "geneFilters": [{
      "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
      "geneQueries": [[{"hugoGeneSymbol": "TP53"}]]
    }]
  }
}
```

### Numerical attribute (auto quartiles)
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "AGE"
}
```
→ Creates 4 quartile groups automatically.

### Compare subset of values
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "RACE",
  "clinicalAttributeValues": ["White", "Asian", "Black or African American"]
}
```

### Custom groups — merged stage values
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "groups": [
    {
      "name": "Early (T1+T2)",
      "studyViewFilter": {
        "clinicalDataFilters": [{"attributeId": "PATH_T_STAGE", "values": [{"value": "T1"}, {"value": "T2"}]}]
      }
    },
    {
      "name": "Late (T3+T4)",
      "studyViewFilter": {
        "clinicalDataFilters": [{"attributeId": "PATH_T_STAGE", "values": [{"value": "T3"}, {"value": "T4"}]}]
      }
    }
  ]
}
```

### Custom groups — with global pre-filter
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "studyViewFilter": {
    "clinicalDataFilters": [{"attributeId": "SEX", "values": [{"value": "Female"}]}]
  },
  "groups": [
    {
      "name": "EGFR Mutant",
      "studyViewFilter": {
        "geneFilters": [{
          "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
          "geneQueries": [[{"hugoGeneSymbol": "EGFR"}]]
        }]
      }
    },
    { "name": "EGFR Wildtype", "isUnselected": true }
  ]
}
```
→ The global `studyViewFilter` is merged with each group's filter. Groups contain only Female patients.

### Custom groups — mutated vs wildtype using isUnselected
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "groups": [
    {
      "name": "EGFR Mutant",
      "studyViewFilter": {
        "geneFilters": [{
          "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
          "geneQueries": [[{"hugoGeneSymbol": "EGFR"}]]
        }]
      }
    },
    {
      "name": "EGFR Wildtype",
      "isUnselected": true
    }
  ],
  "tab": "survival"
}
```
→ "EGFR Wildtype" = all study samples NOT in the EGFR Mutant group. Use `isUnselected` whenever the second group is the complement of the first (wildtype, unaltered, negative). Combine with `studyViewFilter` to restrict the cohort first.

### Custom groups — multi-cohort split
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018", "lusc_tcga_pan_can_atlas_2018"],
  "groups": [
    {
      "name": "LUAD",
      "studyViewFilter": {
        "clinicalDataFilters": [{"attributeId": "CANCER_TYPE_DETAILED", "values": [{"value": "Lung Adenocarcinoma"}]}]
      }
    },
    {
      "name": "LUSC",
      "studyViewFilter": {
        "clinicalDataFilters": [{"attributeId": "CANCER_TYPE_DETAILED", "values": [{"value": "Lung Squamous Cell Carcinoma"}]}]
      }
    }
  ]
}
```

---

## Error Scenarios

| Error | Cause | Solution |
|-------|-------|----------|
| No samples | Filter too restrictive | Adjust filter criteria |
| Attribute not found | Invalid clinicalAttributeId | Check router `clinicalAttributeIds` |
| < 2 groups | All samples same value | Choose different attribute |
| Incompatible params | `groups` used with `clinicalAttributeId`, `clinicalAttributeValues`, or `includeNA` | Use one approach or the other |
| No unselected samples | All cohort samples covered by other groups | Check filter logic |
| Multiple unselected | More than one group with `isUnselected: true` | Only one complement group allowed |
