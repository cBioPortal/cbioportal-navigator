# Navigate to Group Comparison

Creates group comparison sessions based on clinical attribute values and generates URL to cBioPortal's Group Comparison page.

**→ See router tool for universal guidelines (no guessing IDs, exact values, Link First principle).**

## What Group Comparison Shows

- Statistical comparison between groups (e.g., Male vs Female, T1 vs T2 vs T3)
- Survival analysis across groups
- Mutation and CNA enrichment between groups
- Clinical attribute differences
- mRNA/protein expression comparison

---

## Required Inputs

### studyIds (required)
Array of study IDs from router response. Cross-study supported, but the clinical attribute **must exist in all specified studies** with compatible value types.

### clinicalAttributeId (required)
Clinical attribute ID to group by (e.g., `"SEX"`, `"PATH_T_STAGE"`, `"SMOKING_HISTORY"`). Must be from router `clinicalAttributeIds`.

---

## Optional Inputs

### studyViewFilter
Pre-filter samples before grouping. Same format as `navigate_to_study_view` filterJson. `studyIds` are auto-injected — don't include them inside.

### clinicalAttributeValues
Subset of values to compare (categorical only). Reduces noise when attribute has many values. Case-insensitive matching. When specified, returns per-group studyview URLs.

### includeNA
Include "NA" group for samples missing the attribute. Default: `true` (categorical), `false` (numerical).

### tab
`"overlap"`, `"survival"`, `"clinical"`, `"alterations"`, `"mutations"`, `"copy-number"`, `"mrna"`, `"protein"`

---

## Grouping Behavior

**Categorical (STRING):** Groups by unique values. Top 19 + NA = max 20 groups, sorted by sample count.

**Numerical (NUMBER):** Auto-splits into 4 quartiles with equal sample counts (e.g., AGE → "33.5-55", "55-67", "67-75.5", "75.5-89"). NaN samples go to NA group.

**Patient vs Sample level:** Tool auto-detects from metadata. Patient-level attributes (SEX, AGE) apply to all samples; sample-level (SAMPLE_TYPE) are per-sample.

**Minimum 2 groups required** for comparison.

---

## Response Format

The tool returns:
- **url:** Direct link to comparison page (with optional tab)
- **groups:** Array with name and sample count per group
- **Simple comparison (no filter/subset):** `baseStudyViewUrl` for exploring the study
- **Pre-filter or value subset:** `groupUrls` array — one studyview URL per group with combined filters

When presenting results, include group names and sample counts. For `groupUrls`, provide each group's URL for detailed exploration.

---

## Examples

### Simple: Compare by Sex
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "SEX"
}
```

### With Pre-filter: TP53-mutated patients by Sex, age > 60
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

### Numerical Attribute: Age Quartiles
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "AGE"
}
```
→ Creates 4 quartile groups automatically.

---

## Error Scenarios

| Error | Cause | Solution |
|-------|-------|----------|
| No samples | Filter too restrictive | Adjust filter criteria |
| Attribute not found | Invalid clinicalAttributeId | Check router `clinicalAttributeIds` |
| < 2 groups | All samples same value | Choose different attribute |
