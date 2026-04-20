# Navigate to ResultsView

Generates direct URL to cBioPortal ResultsView — gene alteration analysis and OncoPrint.

**→ See router tool for universal guidelines (no guessing IDs, exact values, Link First principle).**

## Required Inputs

### studyIds (required)
Array of study IDs from router response. Supports cross-study analysis.

### genes (required)
Array of gene entries — each element is either a plain HUGO gene symbol or an OQL statement.

**Plain symbols** (default alteration types — mutations, AMP, HOMDEL, fusions):
```json
["TP53", "KRAS", "EGFR"]
```

**OQL statements** (precise alteration filtering):
```json
["BRAF: MUT = V600E", "EGFR: AMP", "TP53"]
```

Mixed is fine. Plain and OQL entries can appear in the same array.

For `tab: "plots"`, the gene dropdown on each axis is populated only from this list. Include every gene referenced in either axis — not just the primary gene of interest. E.g. "EGFR mRNA by TP53 mutation status" requires `genes: ["TP53", "EGFR"]`.

#### OQL Syntax Reference

**Mutations**
- `MUT` — all non-synonymous mutations
- `MUT = V600E` — specific amino acid change (shorthand: `BRAF: V600E`)
- `MUT = MISSENSE` / `NONSENSE` / `NONSTART` / `NONSTOP` / `FRAMESHIFT` / `TRUNC` / `INFRAME` / `SPLICE` / `PROMOTER` — by type
- `MUT = (12-13)` — position range (overlapping mutations); `(12-13*)` — fully contained only; `(12-)` / `(-13)` — open-ended
- `MUT != MISSENSE` — exclude a mutation type

**Copy number**
- `AMP` — amplification
- `HOMDEL` — deep/homozygous deletion
- `GAIN` — copy number gain
- `HETLOSS` — shallow deletion
- `CNA >= GAIN` / `CNA <= HETLOSS` — comparison operators (`>`, `<`, `>=`, `<=`)

**Expression**
- `EXP > 2` / `EXP < -2` / `EXP >= 1.5` / `EXP <= -1.5` — mRNA expression (SDs from mean)
- `PROT > 1.5` / `PROT < -1.5` — protein/phosphoprotein level
- Phosphoprotein: use gene symbol with site, e.g. `EGFR_PY992: PROT > 2`

**Fusions**
- `FUSION` — all fusions

**Modifiers** — append with `_`, alteration type comes first:
- `MUT_DRIVER` / `FUSION_DRIVER` / `AMP_DRIVER` — driver events only (OncoKB/CancerHotspots)
- `MUT_GERMLINE` / `MUT_SOMATIC` — by mutation origin
- Can also use modifier alone: `BRCA1: GERMLINE` (shorthand for germline mutations)
- Chain multiple: `TRUNC_GERMLINE_DRIVER` — truncating, germline, driver

**Multi-gene shortcuts**
- `DATATYPES: AMP GAIN HOMDEL EXP > 1.5 EXP < -1.5; CDKN2A MDM2 TP53` — apply same alteration types to multiple genes (`;` acts as line break)

**Merged tracks** (OncoPrint grouping)
- `["CDK PATHWAY" CDKN2A CDKN2B CDK4]` — group genes under a label
- `[MDM2 MDM4]` — no label

**Logic**: multiple specifications per gene use OR logic (e.g. `TP53: MUT AMP` = mutated OR amplified)

**Statement terminator**: OQL statements may optionally end with `;`

#### OQL Examples

| User request | genes array |
|---|---|
| "BRAF V600E only" | `["BRAF: MUT = V600E"]` |
| "EGFR amplifications only" | `["EGFR: AMP"]` |
| "Germline BRCA1 mutations" | `["BRCA1: MUT_GERMLINE"]` |
| "Somatic TP53 mutations" | `["TP53: MUT_SOMATIC"]` |
| "Driver mutations in KRAS" | `["KRAS: MUT_DRIVER"]` |
| "TP53 mutations except missense" | `["TP53: MUT != MISSENSE"]` |
| "KRAS codon 12 mutations" | `["KRAS: MUT = (12-12)"]` |
| "EGFR driver fusions" | `["EGFR: FUSION_DRIVER"]` |
| "BRCA1 truncating germline driver" | `["BRCA1: TRUNC_GERMLINE_DRIVER"]` |
| "EGFR phospho-Y992 overexpression" | `["EGFR_PY992: PROT > 2"]` |
| "TP53 mutated or amplified" | `["TP53: MUT AMP"]` |
| "AMP or HOMDEL across panel" | `["DATATYPES: AMP HOMDEL; EGFR KRAS TP53 PTEN"]` |

Use plain symbols when the user has not specified a particular alteration type. Use OQL only when the user's request implies a specific subset of alterations.

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

**Comparison groups** — two types are always available:
- **Aggregate:** `"Altered group"` (any queried gene altered) / `"Unaltered group"` — default selection
- **Per-gene:** one group per queried gene, named after the gene symbol (e.g. `"IDH1"`, `"EGFR"`) when using default OQL

**`comparisonSelectedGroups`:** overrides the default group selection. Omit for Altered vs Unaltered. Pass gene symbols to compare gene-specific groups.

**Best for:**
- One gene's alteration effect on outcomes — "TP53 mutation and survival" → omit `comparisonSelectedGroups` (default Altered vs Unaltered)
- Gene A altered vs gene B altered — "how do IDH1 altered vs EGFR altered patients differ?" → `comparisonSelectedGroups: ["IDH1", "EGFR"]`, `tab: "comparison/survival"` (or `comparison/clinical`)

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
| `dataType` | `"MRNA_EXPRESSION"`, `"MUTATION_EXTENDED"`, `"COPY_NUMBER_ALTERATION"`, `"METHYLATION"`, `"PROTEIN_LEVEL"`, `"STRUCTURAL_VARIANT"`, `"clinical_attribute"` |
| `selectedDataSourceOption` | **Molecular types:** profile suffix — strip `{studyId}_` prefix from the molecular profile ID (e.g. `"lgggbm_tcga_pub_mrna_median_zscores"` → `"mrna_median_zscores"`). Same rule as `profileType` in `mutationDataFilters`/`genomicDataFilters`. Using suffixes enables cross-study matching. **`clinical_attribute`:** clinical attribute ID from router `clinicalAttributeIds` (e.g. `"CANCER_TYPE_DETAILED"`, `"CANCER_TYPE"`) |
| `mutationCountBy` | `"MutationType"` (default), `"MutatedVsWildType"` — only for `MUTATION_EXTENDED` axis |
| `logScale` | `"true"` or `"false"` |

**"EGFR expression across cancer types"**
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "genes": ["EGFR"],
  "tab": "plots",
  "plotsHorzSelection": {
    "dataType": "clinical_attribute",
    "selectedDataSourceOption": "CANCER_TYPE_DETAILED"
  },
  "plotsVertSelection": {
    "selectedGeneOption": "EGFR",
    "dataType": "MRNA_EXPRESSION",
    "selectedDataSourceOption": "rna_seq_v2_mrna_median_all_sample_Zscores",
    "logScale": "true"
  }
}
```

**"IDH1 expression by mutation status in LGG"**
```json
{
  "studyIds": ["lgggbm_tcga_pub"],
  "genes": ["IDH1"],
  "tab": "plots",
  "plotsHorzSelection": {
    "selectedGeneOption": "IDH1",
    "dataType": "MUTATION_EXTENDED",
    "selectedDataSourceOption": "mutations",
    "mutationCountBy": "MutatedVsWildType"
  },
  "plotsVertSelection": {
    "selectedGeneOption": "IDH1",
    "dataType": "MRNA_EXPRESSION",
    "selectedDataSourceOption": "mrna_median_zscores"
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

**User:** "How do outcomes differ for IDH1 altered vs EGFR altered patients?"

```json
{
  "studyIds": ["lgggbm_tcga_pub"],
  "genes": ["IDH1", "EGFR"],
  "tab": "comparison/survival",
  "comparisonSelectedGroups": ["IDH1", "EGFR"]
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
