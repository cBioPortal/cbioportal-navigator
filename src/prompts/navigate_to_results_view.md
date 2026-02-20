# Navigate to ResultsView

Generates direct URL to cBioPortal ResultsView — gene alteration analysis and OncoPrint.

**→ See router tool for universal guidelines (no guessing IDs, exact values, Link First principle).**

## What ResultsView Shows

- **OncoPrint:** visual matrix of gene alterations across samples
- **Mutation details:** amino acid changes, functional impact, frequencies
- **Co-occurrence analysis:** mutually exclusive or co-occurring alterations
- **Survival analysis, plots, pathway diagrams**

---

## Required Inputs

### studyIds (required)
Array of study IDs from router response. Supports cross-study analysis.

### genes (required)
Array of UPPERCASE HUGO gene symbols: `["TP53"]`, `["TP53", "KRAS", "EGFR"]`

### tab (optional)
`"oncoprint"` (default), `"mutations"`, `"structuralVariants"`, `"cancerTypesSummary"`, `"mutualExclusivity"` (requires multiple genes), `"plots"`, `"coexpression"`, `"comparison"`, `"cnSegments"`, `"pathways"`, `"download"`

**Note:** `"survival"` is a redirect alias for `"comparison"` — both open the Comparison/Survival tab. Use `"comparison"` as the canonical value; `"survival"` also works if that's what the user asks for.

---

## Optional Parameters

- **caseSetId:** Sample selection. Defaults to `"{studyId}_all"`. Only specify if user wants a specific case set.
- **zScoreThreshold:** mRNA expression z-score threshold. Default: 2.0
- **rppaScoreThreshold:** Protein expression threshold. Default: 2.0
- **studyViewFilter:** Filter object to restrict analysis to a filtered sample subset. When provided, fetches matching samples and returns a session-based URL (`?session_id=...`). Use the same filterJson format as `navigate_to_study_view`.

---

## When to use studyViewFilter

Use `studyViewFilter` when the user wants to analyze genes **within a specific subset** of a study:

- "Show OncoPrint for TP53 mutations in female patients only"
- "Analyze KRAS in stage III patients"

Without `studyViewFilter`, ResultsView uses all samples in the study.

---

## Examples

**User:** "Analyze EGFR, KRAS, and TP53 in lung cancer, show survival tab"

```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "genes": ["EGFR", "KRAS", "TP53"],
  "tab": "survival"
}
```

**User:** "Show OncoPrint for TP53 in female TCGA lung cancer patients"

```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "genes": ["TP53"],
  "studyViewFilter": {
    "clinicalDataFilters": [
      { "attributeId": "SEX", "values": [{ "value": "Female" }] }
    ]
  }
}
```
