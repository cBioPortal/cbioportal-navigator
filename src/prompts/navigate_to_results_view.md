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
- `MUT = MISSENSE` / `NONSENSE` / `NONSTART` / `NONSTOP` / `FRAMESHIFT` / `TRUNC` / `INFRAME` / `SPLICE` / `PROMOTER` — by type (`INFRAME` = in-frame insertions/deletions; `FRAMESHIFT` = frameshift insertions/deletions)
- When user language maps ambiguously to OQL types, explain your interpretation. E.g. "indels" strictly means `INFRAME` + `FRAMESHIFT`, but clinical context may favor one — state which you used and why.
- `MUT = (12-13)` — position range (overlapping mutations); `(12-13*)` — fully contained only; `(12-)` / `(-13)` — open-ended
- **Amino acid vs position**: if the user specifies an amino acid symbol (e.g. "G12", "G12 or G13"), use amino acid notation (`MUT = G12`, or shorthand `G12 G13`). Use position range only when the user gives a numeric position without an amino acid (e.g. "codon 12", "position 12").
- `MUT != MISSENSE` — exclude a mutation type; `!=` also works with specific protein changes (e.g. `!= T790M`) and amino acid positions (e.g. `!= V600`), but **not** with position ranges — `MUT != (12-12)` is silently ignored
- **Excluding a position:** two options depending on precision needed:
  - `MUT != G12` — simpler; uses amino acid notation; also excludes mutations that overlap position 12 (e.g. A11_G12dup)
  - `MUT = (-11); MUT = (13-)` — precise; excludes only mutations starting at position 12, preserves overlapping mutations like A11_G12dup. Prefer this when the user wants to retain edge cases

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
- **When using `EXP` or `PROT`, you must also set `profileFilter`** — see profileFilter section below.
- When the threshold is not specified by the user, state the default used and invite adjustment — e.g., "Using z-score threshold > 2. Let me know if you'd like a different value."

**Fusions / Structural variants** (synonymous in cBioPortal — users may say either)
- OQL keyword is always `FUSION` regardless of whether the user said "fusion" or "structural variant"
- `FUSION` — all fusions/SVs; `FUSION_DRIVER` — driver events only
- When the study has an SV profile (`_structural_variants`), pair with `tab: "structuralVariants"` for the dedicated fusion table. The tab controls display; `: FUSION` encodes the alteration type in the URL — both are required, neither substitutes for the other.
- **Gene pair or orientation-specific queries** — when the user specifies a fusion gene pair (e.g. `TMPRSS2::ERG`, `BCR-ABL`, "TMPRSS2 fused to ERG") or asks for one gene as the upstream/downstream partner (e.g. "TMPRSS2 as the 5' partner", "ERG downstream"): SV data in cBioPortal does not reliably record upstream/downstream orientation, so exact pair or orientation filtering is not possible. Explain this limitation, then query the relevant gene(s) with FUSION OQL — e.g. `["TMPRSS2: FUSION", "ERG: FUSION"]` — and use `tab: "structuralVariants"` if the study has an SV profile. This returns samples where either gene carries a fusion; in the right disease context most will be the target pair.

**Modifiers** — append with `_`, alteration type comes first:
- `DRIVER` — **all** driver alterations (mutation, CNA, fusion); use when the user says "driver events" without specifying a type. E.g. `KRAS: DRIVER`
- `MUT_DRIVER` / `FUSION_DRIVER` / `AMP_DRIVER` — driver events for a specific alteration type only (OncoKB/CancerHotspots)
- `MUT_GERMLINE` / `MUT_SOMATIC` — by mutation origin
- Can also use modifier alone: `BRCA1: GERMLINE` (shorthand for germline mutations)
- Chain multiple: `TRUNC_GERMLINE_DRIVER` — truncating, germline, driver

**Multi-gene shortcuts**
- `DATATYPES: AMP GAIN HOMDEL EXP > 1.5 EXP < -1.5; CDKN2A MDM2 TP53` — apply same alteration types to multiple genes (`;` acts as line break)

**Merged tracks** (OncoPrint grouping — only visible in OncoPrint; other tabs show genes individually)
- `["CDK PATHWAY" CDKN2A CDKN2B CDK4]` — custom label; **label must be in double quotes** when it contains spaces
- `[MDM2 MDM4]` — no label (auto-label: slash-joined gene names)
- Plain genes inside the brackets are space-separated: `["EGFR FAMILY" EGFR ERBB2 ERBB3 ERBB4]`
- Per-gene OQL modifiers (including position ranges) are fully supported inside merged tracks — **use semicolons to separate gene specs**:
  `["KINASE DOMAIN DRIVERS" EGFR: MUT = (712-979)_DRIVER; ERBB2: MUT = (719-987)_DRIVER; ERBB3: MUT = (721-989)_DRIVER; ERBB4: MUT = (721-989)_DRIVER]`

**Merged track example** — EGFR family with domain-specific driver tracks:
```json
[
  "[\"EGFR FAMILY\" EGFR ERBB2 ERBB3 ERBB4]",
  "[\"KINASE DOMAIN DRIVERS\" EGFR: MUT = (712-979)_DRIVER; ERBB2: MUT = (719-987)_DRIVER; ERBB3: MUT = (721-989)_DRIVER; ERBB4: MUT = (721-989)_DRIVER]",
  "[\"EXTRACELLULAR DOMAIN DRIVERS\" EGFR: MUT = (1-621)_DRIVER; ERBB2: MUT = (1-631)_DRIVER; ERBB3: MUT = (1-643)_DRIVER; ERBB4: MUT = (1-649)_DRIVER]"
]
```

**Logic**: multiple specifications per gene use OR logic (e.g. `TP53: MUT AMP` = mutated OR amplified)

**Statement terminator**: OQL statements may optionally end with `;`

#### OQL Examples

| User request | genes array |
|---|---|
| "BRAF V600E only" | `["BRAF: MUT = V600E"]` |
| "EGFR amplifications only" | `["EGFR: AMP"]` |
| "Germline BRCA1 mutations" | `["BRCA1: MUT_GERMLINE"]` |
| "Somatic TP53 mutations" | `["TP53: MUT_SOMATIC"]` |
| "Driver events in KRAS" | `["KRAS: DRIVER"]` |
| "Driver mutations in KRAS" | `["KRAS: MUT_DRIVER"]` |
| "TP53 mutations except missense" | `["TP53: MUT != MISSENSE"]` |
| "KRAS codon 12 mutations" | `["KRAS: MUT = (12-12)"]` |
| "KRAS mutations except codon 12" | `["KRAS: MUT = (-11)", "KRAS: MUT = (13-)"]` |
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
| `"structuralVariants"` | Study has an SV profile (look for `_structural_variants` in `molecularProfileIds`) |
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
- **Per-gene:** one group per queried gene, named after the gene symbol. The group's content is determined by the OQL for that gene: plain symbol = any alteration (mutation + CNA + SV); OQL statement = only the specified subset.

**`comparisonSelectedGroups`:** overrides the default group selection. Omit for Altered vs Unaltered. Pass gene symbols to compare gene-specific groups.

**Critical:** when comparing alteration-type-specific groups, apply OQL to **all** genes in the comparison — not just the genes with special modifiers. Plain symbol means "any alteration", even when another gene in the same call uses OQL.

**Best for:**
- One gene's alteration effect on outcomes — "TP53 mutation and survival" → omit `comparisonSelectedGroups` (default Altered vs Unaltered)
- Mutant vs wildtype gene alteration enrichment ("what other genes are altered in X mutant") → OQL `GENE: MUT`, `tab: "comparison/alterations"`, `profileFilter: "mutations"`. Restricting `profileFilter` to `"mutations"` ensures the Unaltered group contains only mutation-profiled non-mutant samples. Works cross-study.
- Gene A vs gene B (any alteration type) — "IDH1-altered vs RB1-altered patients" → `genes: ["IDH1", "RB1"]`, `comparisonSelectedGroups: ["IDH1", "RB1"]`
- Gene A vs gene B (mutation-specific) — "BRAF-mutant vs NRAS-mutant survival" → `genes: ["BRAF: MUT", "NRAS: MUT"]`, `comparisonSelectedGroups: ["BRAF", "NRAS"]`
- Gene A vs gene B (mixed OQL) — "BRAF V600E vs NRAS mutant" → `genes: ["BRAF: MUT = V600E", "NRAS: MUT"]`, `comparisonSelectedGroups: ["BRAF", "NRAS"]`

---

## Optional Parameters

- **caseSetId:** Sample selection. Defaults to `"{studyId}_all"`. Only specify if user wants a specific case set.
- **zScoreThreshold:** mRNA expression z-score threshold. Default: 2.0
- **rppaScoreThreshold:** Protein expression threshold. Default: 2.0
- **studyViewFilter:** Filter object to restrict analysis to a filtered sample subset. When provided, fetches matching samples and returns a session-based URL (`?session_id=...`). Use the same filterJson format as `navigate_to_study_view`.

### profileFilter — profile selection

`profileFilter` is a comma-separated list of molecular profile suffixes. Suffix = `molecularProfileId` with `{studyId}_` stripped. Example: `luad_tcga_rna_seq_v2_mrna_median_Zscores` → suffix `rna_seq_v2_mrna_median_Zscores`.

**Critical:** suffix mode overrides all defaults — you must include every profile type you want active.

Two distinct use cases with different construction rules:

**Mode 1 — Expression OQL (`EXP` or `PROT`)**

Required when OQL contains `EXP` or `PROT`. Without it, OncoPrint finds no matching data and shows 0% altered.

Construction rules:
1. Collect profile IDs from the selected study:
   - **Top-5 study**: scan `molecularProfileIds`; for mRNA prefer ID containing `all_sample` + `Zscores`, fall back to `_median_Zscores`; for protein prefer `quantification_zscores`, fall back to `rppa_Zscores`
   - **otherStudies**: read non-`false` values from the `profiles` object
2. Always include base profiles if present: `mutations`, `cna`, `sv`
3. Add the expression profile required by the OQL: `mrna` for `EXP`, `protein` for `PROT`
4. Strip `{studyId}_` from each ID to get the suffix, join with commas, no spaces

Example — `luad_tcga_pan_can_atlas_2018` with `EXP > 2`:
```
profileFilter: "mutations,gistic,structural_variants,rna_seq_v2_mrna_median_all_sample_Zscores"
```

Example — `brca_tcga_pan_can_atlas_2018` with `PROT > 1.5`:
```
profileFilter: "mutations,gistic,structural_variants,protein_quantification_zscores"
```

Restriction: `EXP`/`PROT` OQL only works for single-study queries. Do not use with multiple `studyIds`.

**Mode 2 — Mutation-based mut-vs-WT comparison** (OQL `GENE: MUT`, `tab: "comparison/alterations"`)

Set `profileFilter: "mutations"` only. This controls the profiling boundary: the Unaltered group will contain only mutation-profiled non-mutant samples, excluding unprofiled samples. Do not add `cna` or `sv` — rules from Mode 1 do not apply here.

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
