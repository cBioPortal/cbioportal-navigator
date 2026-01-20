# Navigate to ResultsView

Generates direct URL to cBioPortal ResultsView - gene alteration analysis and OncoPrint.

**→ See router tool for universal guidelines (no guessing IDs, exact values, Link First principle).**

## What ResultsView Shows

- **OncoPrint:** visual matrix of gene alterations across samples
- **Mutation details:** amino acid changes, functional impact, frequencies
- **Co-occurrence analysis:** mutually exclusive or co-occurring alterations
- **Survival analysis, plots, pathway diagrams**

---

## Required Inputs

### studyIds (required)

- Array of study IDs from router response
- **Single study:** `["luad_tcga_pub"]`
- **Cross-study analysis:** `["luad_tcga_pub", "lusc_tcga", "brca_tcga"]`
- **🚫 DO NOT invent study IDs** - use exact values from router

### genes (required)

- Array of gene symbols (at least 1)
- **Examples:** `["TP53"]`, `["TP53", "KRAS", "EGFR"]`
- **Gene symbols must be UPPERCASE:** TP53, KRAS, EGFR (not tp53, kras, egfr)
- Use human HUGO Gene Symbols

### tab (optional)

- `"oncoprint"` (default), `"mutations"`, `"coexpression"`, `"comparison"`, `"survival"`
- `"cancerTypesSummary"`, `"plots"`, `"downloads"`
- `"mutualExclusivity"` (requires multiple genes)
- `"cnSegments"`, `"structuralVariants"` (if data available)
- Opens specific analysis directly

---

## Optional Parameters

### caseSetId (optional)

- Case set identifier for sample selection
- **Defaults to:** `"{studyId}_all"` (all samples in study)
- **Examples:** `"luad_tcga_pub_all"`, `"luad_tcga_pub_cnaseq"`
- Only specify if user explicitly wants a specific case set

### zScoreThreshold (optional)

- Z-score threshold for mRNA expression data filtering
- **Default:** 2.0
- Only relevant for expression-based queries

### rppaScoreThreshold (optional)

- RPPA score threshold for protein data filtering
- **Default:** 2.0
- Only relevant for protein expression queries

---

## Gene Symbol Formatting

**Gene symbols MUST be UPPERCASE** (TP53, not tp53). Use HUGO symbols (TP53, not p53). See router for complete rules.

---

## Complete Examples

### Example 1: Multiple Genes Query

**User:** "Analyze EGFR, KRAS, and TP53 alterations in lung cancer"
- **Router returns:** `studyId: "luad_tcga_pub"`
- **Call navigate:**
  ```json
  {
    "studyIds": ["luad_tcga_pub"],
    "genes": ["EGFR", "KRAS", "TP53"]
  }
  ```
- **Response:** Direct URL to multi-gene OncoPrint

### Example 2: Specific Tab Navigation

**User:** "Show me survival analysis for EGFR mutated patients"
- **Router returns:** `studyId: "luad_tcga_pub"`
- **Call navigate:**
  ```json
  {
    "studyIds": ["luad_tcga_pub"],
    "genes": ["EGFR"],
    "tab": "survival"
  }
  ```
- **Response:** Direct URL to survival tab
