# Navigate to Group Comparison

Creates group comparison sessions and generates URL to cBioPortal's Group Comparison page.

**→ See router tool for universal guidelines (no guessing IDs, exact values, Link First principle).**
**→ `studyViewFilter` format (geneFilters, mutationDataFilters, genomicDataFilters, clinicalDataFilters, genericAssayDataFilters, genomicProfiles, etc.) follows the same rules as `navigate_to_study_view`. `profileType` = molecularProfileId with `{studyId}_` prefix stripped.**
**→ For mutant vs wildtype comparisons where Altered vs Unaltered groups suffice, prefer `navigate_to_results_view` with OQL `GENE: MUT`, `tab: "comparison/alterations"`, `profileFilter: "mutations"` — works cross-study and automatically restricts the Unaltered group to mutation-profiled non-mutant samples. Use group comparison for mut-vs-WT only when custom group definitions beyond Altered/Unaltered are required.**

## What Group Comparison Shows

- Statistical comparison between groups (e.g., Male vs Female, T1 vs T2 vs T3)
- Survival analysis across groups
- Mutation and CNA enrichment between groups
- Clinical attribute differences
- mRNA/protein expression comparison

---

## Workflow

Every comparison is defined by custom `groups` — each group is either a `studyViewFilter` (samples matching that filter) or `isUnselected: true` (complement of all other groups). There is no separate "group by attribute" mode — splitting by a clinical attribute means building one group per value (or range) yourself:

1. Call `get_studyviewfilter_options` with `attributeIds` to get exact `values` (categorical/STRING/BOOLEAN) or quartile `bins` (NUMBER) for the attribute.
2. Build one group per value/range, using `clinicalDataFilters` in each group's `studyViewFilter`. See `get_studyviewfilter_options` docs for filter syntax, including how to represent a missing-data group (`{"value": "NA"}`).
3. For merged values (e.g. T1+T2 vs T3+T4), list multiple `values` in a single group's filter.
4. For "vs rest" comparisons (e.g. EGFR mutant vs everyone else), use `isUnselected: true` for the second group instead of constructing its filter explicitly.

---

## Parameters

### studyIds (required)
Array of study IDs from router response. Cross-study supported, but any clinical attribute used in `clinicalDataFilters` **must exist in all specified studies** with compatible value types.

### groups (required)
Array of groups (≥ 2). Two group types:
- **Filter group:** `{ name, studyViewFilter }` — samples matching the filter. If `studyIds` is included in a group's `studyViewFilter`, only samples from those studies are included in that group; otherwise the top-level `studyIds` applies.
- **Unselected group:** `{ name, isUnselected: true }` — samples in the cohort NOT matched by any other group (complement). At most one group may be unselected.

Use for clinical attribute splits (one group per value/range, including merged values like T1+T2 vs T3+T4, or an "NA"/missing-data group), cohort-relative splits of continuous values (gene expression/protein/methylation/clinical NUMBER attributes — use `bins` from `get_studyviewfilter_options`), gene-based splits, wildtype/unaltered comparisons, or multi-cohort comparisons. Can be combined with `studyViewFilter` for global pre-filtering.

**Multi-cohort splits (comparing different cancer types across studies):** two approaches:
- **By studyId** — set `studyIds` in each group's `studyViewFilter`. Simple, no extra lookups. Use when each group maps cleanly to one or more whole studies.
- **By cancer type attribute** — use `clinicalDataFilters` with exact values from `get_studyviewfilter_options`. Use when grouping within a single multi-cancer study (e.g., MSK-IMPACT), or when merging specific subtypes across studies into one group. Each group independently chooses the right attribute granularity: prefer `CANCER_TYPE` when the target has a direct match; use `CANCER_TYPE_DETAILED` when the target is a subtype within a broader category. Both attributes can be mixed across groups in the same comparison.

### studyViewFilter
Pre-filter samples before grouping. Intersected with each group's filter. Same format as `navigate_to_study_view` filterJson. `studyIds` are auto-injected — don't include them inside.

### tab
Use a value from `availableComparisonTabs` in the resolver metadata for the study. Omit to land on `overlap` (default).

| tab | Shows | Available when |
|---|---|---|
| `overlap` | Sample overlap Venn diagram between groups | Always |
| `clinical` | Clinical attribute differences between groups | Always |
| `survival` | Kaplan-Meier survival curves | Study has survival clinical attributes (`_STATUS`+`_MONTHS` pair) |
| `alterations` | Enriched mutations and CNA between groups | Study has mutation or CNA profiles |
| `mutations` | Detailed mutation comparison (lollipop plot) | Study has mutation profiles; **exactly 2 groups required**. Use `selectedGene` to pre-select a gene in the lollipop plot without filtering the cohort. |
| `mrna` | mRNA expression enrichment | Study has mRNA profiles; single study only |
| `protein` | Protein/phosphoprotein expression enrichment (RPPA) | Study has protein profiles; single study only |
| `dna_methylation` | DNA methylation enrichment | Study has methylation profiles; single study only |
| `generic_assay_{type}` | Custom assay enrichment (e.g. `generic_assay_treatment_response`) | Study has generic assay profiles; single study only |

### selectedGene
HUGO gene symbol to pre-select in the mutations tab (e.g., `"EGFR"`). Only meaningful when `tab` is `"mutations"`.

**`selectedGene` vs `geneFilters` in `studyViewFilter` — not interchangeable:**
- `selectedGene` — controls what is **displayed**. Cohort and denominators unchanged.
- `geneFilters` in `studyViewFilter` — controls who is **in the cohort**. Only mutation carriers included; denominators shrink.

Use `selectedGene` when a gene is mentioned in the context of comparing mutation profiles (e.g., "compare EGFR mutations between lung and brain"). Use `geneFilters` only when the cohort should be restricted to mutation carriers (e.g., "among EGFR-mutated patients, compare by sex").

**Arm-level CNA:** When the user asks about chromosome arm deletions/gains (e.g., "19q deletion", "1p loss", "chr8 gain"), use `generic_assay_armlevel_cna` if present in `availableComparisonTabs` — it directly shows arm-level CNA enrichment per group. Prefer this over `alterations` for arm-level questions.

---

## Response Format

The tool returns:
- **url:** Direct link to comparison page (with optional tab)
- **studyViewUrl:** StudyView link for exploring the cohort (with pre-filter applied if provided)
- **groups:** Array with name and sample count per group
- **groupUrls:** One StudyView URL per filter-based group with combined filters (omitted for an `isUnselected` group, which has no simple StudyView representation)

When presenting results, include group names and sample counts. Always offer both the comparison link and the `studyViewUrl`. For `groupUrls`, provide each group's URL for detailed exploration.

---

## Examples

### Compare by clinical attribute (categorical)
Call `get_studyviewfilter_options` with `attributeIds: ["SEX"]` first to confirm exact values, then build one group per value.
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
    }
  ]
}
```

### Compare by clinical attribute, including a missing-data group
Add an `"NA"` group for samples with no recorded value — `"NA"` is always a valid filter value even when the attribute reports no NA value among `values`.
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "groups": [
    {"name": "Male", "studyViewFilter": {"clinicalDataFilters": [{"attributeId": "SEX", "values": [{"value": "Male"}]}]}},
    {"name": "Female", "studyViewFilter": {"clinicalDataFilters": [{"attributeId": "SEX", "values": [{"value": "Female"}]}]}},
    {"name": "Unknown", "studyViewFilter": {"clinicalDataFilters": [{"attributeId": "SEX", "values": [{"value": "NA"}]}]}}
  ],
  "tab": "clinical"
}
```

### Compare by clinical attribute (NUMBER, quartiles)
Call `get_studyviewfilter_options` with `attributeIds: ["AGE"]` to get `bins`, then build one group per quartile range.
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "groups": [
    {"name": "AGE Q1", "studyViewFilter": {"clinicalDataFilters": [{"attributeId": "AGE", "values": [{"end": 59}]}]}},
    {"name": "AGE Q2", "studyViewFilter": {"clinicalDataFilters": [{"attributeId": "AGE", "values": [{"start": 59, "end": 66}]}]}},
    {"name": "AGE Q3", "studyViewFilter": {"clinicalDataFilters": [{"attributeId": "AGE", "values": [{"start": 66, "end": 73}]}]}},
    {"name": "AGE Q4", "studyViewFilter": {"clinicalDataFilters": [{"attributeId": "AGE", "values": [{"start": 73}]}]}}
  ],
  "tab": "survival"
}
```
For a 2-group "high vs low" split, merge bins 1+2 vs bins 3+4 (the boundary between bin 2 and bin 3 is the median) — same pattern as merged categorical values.

### Compare by clinical attribute within a sub-cohort
Use `studyViewFilter` to pre-filter the cohort (e.g. restrict to TP53-mutant patients), then group the remaining samples by attribute value.
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "studyViewFilter": {
    "geneFilters": [{
      "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
      "geneQueries": [[{"hugoGeneSymbol": "TP53"}]]
    }]
  },
  "groups": [
    {"name": "Male", "studyViewFilter": {"clinicalDataFilters": [{"attributeId": "SEX", "values": [{"value": "Male"}]}]}},
    {"name": "Female", "studyViewFilter": {"clinicalDataFilters": [{"attributeId": "SEX", "values": [{"value": "Female"}]}]}}
  ]
}
```
→ The global `studyViewFilter` is merged with each group's filter. Groups contain only TP53-mutant patients.

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
  "studyViewFilter": {
    "genomicProfiles": [["mutations"]]
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
    {
      "name": "EGFR Wildtype",
      "isUnselected": true
    }
  ],
  "tab": "survival"
}
```
→ `genomicProfiles: [["mutations"]]` pre-filters the cohort to mutation-profiled samples before groups are built. "EGFR Wildtype" = mutation-profiled samples NOT in the EGFR Mutant group — unprofiled samples are excluded. Always add `genomicProfiles` to the global `studyViewFilter` for mutation-based wildtype groups.

### Custom groups — gene A mutant vs gene B mutant (mutation-specific comparison)
Use when the user says "mutant vs mutant" — each group filtered to that gene's mutations only, not all alterations.
```json
{
  "studyIds": ["lgg_tcga_pan_can_atlas_2018"],
  "groups": [
    {
      "name": "ATRX Mutant",
      "studyViewFilter": {
        "geneFilters": [{
          "molecularProfileIds": ["lgg_tcga_pan_can_atlas_2018_mutations"],
          "geneQueries": [[{"hugoGeneSymbol": "ATRX"}]]
        }]
      }
    },
    {
      "name": "CIC Mutant",
      "studyViewFilter": {
        "geneFilters": [{
          "molecularProfileIds": ["lgg_tcga_pan_can_atlas_2018_mutations"],
          "geneQueries": [[{"hugoGeneSymbol": "CIC"}]]
        }]
      }
    }
  ],
  "tab": "survival"
}
```
→ Groups are mutation-only. Contrast with `navigate_to_results_view` `comparisonSelectedGroups`, which captures all alteration types (mutation + CNA + SV).

### Custom groups — mutant vs amp (mixed alteration types)
Use when comparing a mutation group against a CNA group.
```json
{
  "studyIds": ["lgg_tcga_pan_can_atlas_2018"],
  "groups": [
    {
      "name": "IDH1 Mutant",
      "studyViewFilter": {
        "geneFilters": [{
          "molecularProfileIds": ["lgg_tcga_pan_can_atlas_2018_mutations"],
          "geneQueries": [[{"hugoGeneSymbol": "IDH1"}]]
        }]
      }
    },
    {
      "name": "EGFR Amp",
      "studyViewFilter": {
        "geneFilters": [{
          "molecularProfileIds": ["lgg_tcga_pan_can_atlas_2018_gistic"],
          "geneQueries": [[{"hugoGeneSymbol": "EGFR"}]],
          "copyNumberAlterationEventTypes": ["AMP"]
        }]
      }
    }
  ],
  "tab": "survival"
}
```

### Custom groups — multi-cohort split (by studyId)
Each group maps to one or more whole studies. Simple — no extra lookups needed.
```json
{
  "studyIds": ["chol_tcga_pan_can_atlas_2018", "blca_tcga_pan_can_atlas_2018"],
  "groups": [
    {
      "name": "Cholangiocarcinoma",
      "studyViewFilter": {"studyIds": ["chol_tcga_pan_can_atlas_2018"]}
    },
    {
      "name": "Bladder Cancer",
      "studyViewFilter": {"studyIds": ["blca_tcga_pan_can_atlas_2018"]}
    }
  ]
}
```

### Custom groups — multi-cohort split (by cancer type attribute)
Use when grouping within a single multi-cancer study. Call `get_studyviewfilter_options` first to get exact values. Each group picks the right granularity independently — `CANCER_TYPE` and `CANCER_TYPE_DETAILED` can be mixed in the same comparison.
```json
{
  "studyIds": ["msk_impact_50k_2026"],
  "groups": [
    {
      "name": "Cholangiocarcinoma",
      "studyViewFilter": {
        "clinicalDataFilters": [{"attributeId": "CANCER_TYPE_DETAILED", "values": [{"value": "Cholangiocarcinoma"}, {"value": "Intrahepatic Cholangiocarcinoma"}, {"value": "Extrahepatic Cholangiocarcinoma"}, {"value": "Perihilar Cholangiocarcinoma"}]}]
      }
    },
    {
      "name": "Bladder Cancer",
      "studyViewFilter": {
        "clinicalDataFilters": [{"attributeId": "CANCER_TYPE", "values": [{"value": "Bladder Cancer"}]}]
      }
    }
  ]
}
```

---

## Error Scenarios

| Error | Cause | Solution |
|-------|-------|----------|
| No samples found for group "X" | Filter too restrictive | Adjust filter criteria |
| < 2 groups | Schema requires minimum 2 groups | Provide at least 2 groups |
| No unselected samples | All cohort samples covered by other groups | Check filter logic |
| Multiple unselected | More than one group with `isUnselected: true` | Only one complement group allowed |
