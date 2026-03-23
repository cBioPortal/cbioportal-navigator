# Navigate to ResultsView

Generates direct URL to cBioPortal ResultsView — gene alteration analysis and OncoPrint.

**→ See router tool for universal guidelines (no guessing IDs, exact values, Link First principle).**

## What ResultsView Shows

- **OncoPrint:** visual matrix of gene alterations across samples
- **Mutation details:** amino acid changes, functional impact, frequencies
- **Co-occurrence analysis:** mutually exclusive or co-occurring alterations
- **Comparison:** altered vs unaltered groups — survival, protein, mRNA, clinical differences
- **Survival analysis, plots, pathway diagrams**

---

## Required Inputs

### studyIds (required)
Array of study IDs from router response. Supports cross-study analysis.

### genes (required)
Array of UPPERCASE HUGO gene symbols: `["TP53"]`, `["TP53", "KRAS", "EGFR"]`

### tab (optional)
| Tab | Available when |
|---|---|
| `"oncoprint"` | Always (default) |
| `"mutations"` | Always |
| `"cancerTypesSummary"` | Always |
| `"plots"` | Always |
| `"mutualExclusivity"` | Multiple genes provided |
| `"structuralVariants"` | Study has structural variant / fusion profiles (look for `_sv`, `_fusion`, `_structural_variants` in `molecularProfileIds`) |
| `"coexpression"` | Study has mRNA or protein profiles (look for `_mrna`, `_rna_seq`, `_rppa` in `molecularProfileIds`); single study only |
| `"comparison"` | Always (see subtabs below) |
| `"cnSegments"` | Study has copy number segment data — validated at runtime; ~57% of studies have it |
| `"pathways"` | Always (server config permitting) |
| `"download"` | Always |

**Note:** `"survival"` is a redirect alias for `"comparison"` — both open the Comparison/Survival tab. Use `"comparison"` as the canonical value; `"survival"` also works if that's what the user asks for.

### Comparison subtabs

The comparison tab has subtabs accessible via `"comparison/{subtab}"`. Use `availableComparisonTabs` from resolver metadata to know which subtabs the study supports.

| tab value | Shows | Available when |
|---|---|---|
| `"comparison/overlap"` | Sample overlap Venn diagram between altered/unaltered groups | Always |
| `"comparison/clinical"` | Clinical attribute differences between groups | Always |
| `"comparison/survival"` | Kaplan-Meier survival curves by alteration status | Study has survival clinical attributes (`_STATUS`+`_MONTHS` pair) |
| `"comparison/alterations"` | Enriched mutations and CNA between groups | Study has mutation or CNA profiles |
| `"comparison/mrna"` | mRNA expression enrichment (z-scores) | Study has mRNA profiles; single study only |
| `"comparison/protein"` | Protein/phosphoprotein expression enrichment (RPPA) | Study has protein profiles; single study only |
| `"comparison/dna_methylation"` | DNA methylation enrichment | Study has methylation profiles; single study only |
| `"comparison/generic_assay_{type}"` | Custom assay enrichment (e.g. treatment response) | Study has generic assay profiles; single study only |

**Best for:** Queries asking about a gene's alteration effect on a molecular readout — "PTEN alteration vs pAKT protein", "TP53 mutation and survival", "BRCA1 deletion vs mRNA expression". The comparison tab automatically splits samples into altered vs unaltered groups for the queried gene(s).

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

### Companion StudyView URL

When `studyViewFilter` is provided, the response includes a `studyViewUrl` alongside the primary `url`. Present both to the user — the ResultsView link for gene analysis, and the StudyView link for exploring the filtered cohort's clinical features and other attributes.

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
  "genes": ["IDH1"],
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

Use profile IDs from router metadata. Only include `plotsHorzSelection`/`plotsVertSelection` when the user asks for a specific plot configuration.

---

## Examples

**User:** "Analyze EGFR, KRAS, and TP53 in lung cancer, show survival tab"

```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "genes": ["EGFR", "KRAS", "TP53"],
  "tab": "comparison/survival"
}
```

**User:** "PTEN alteration vs pAKT in lung squamous"

```json
{
  "studyIds": ["lusc_tcga_pan_can_atlas_2018"],
  "genes": ["PTEN"],
  "tab": "comparison/protein"
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
