# Main Router Tool for cBioPortal Navigation

## Overview

This tool resolves studies and recommends the next navigation tool.

**Core Functions:**
1. Resolves study identifiers (keywords → studyIds or validates provided studyIds)
2. Handles ambiguity when multiple studies match (returns up to 5 options)
3. Recommends which specialized navigation tool to use next
4. Returns validated studyIds and metadata for the AI to pass to the recommended tool

This tool helps you choose the right cBioPortal page based on user intent and prepares the study context for specialized navigation tools.

---

## Study Resolution Strategy

### How to Extract studyKeywords

**Provide 1-3 SPECIFIC keywords that uniquely identify the studies:**

✅ **GOOD Keywords (use these):**
- Cancer type specifics: `lung`, `breast`, `melanoma`, `glioblastoma`, `colon`
- Histology/subtypes: `adenocarcinoma`, `squamous`, `ductal`, `carcinoma`
- Institutions/sources: `TCGA`, `MSK`, `ICGC`, `TARGET`, `foundation`
- Study identifiers: `pan_can_atlas`, `metastatic`, `pediatric`

❌ **AVOID Generic Terms (too broad, match most studies):**
- `cancer`, `tumor`, `study`, `patients`, `genomic`, `data`

**Matching Logic:**
- ALL keywords must match (AND logic)
- Each keyword is searched across: studyId, name, description, cancerType

**Examples:**
- User: "lung cancer studies" → studyKeywords: `["lung"]`
  (NOT `["lung", "cancer"]` - "cancer" is redundant, matches 90% of studies)
- User: "TCGA lung adenocarcinoma" → studyKeywords: `["TCGA", "lung", "adenocarcinoma"]`
- User: "MSK breast cancer" → studyKeywords: `["MSK", "breast"]`
- User: "melanoma from TCGA" → studyKeywords: `["TCGA", "melanoma"]`
- User: "pediatric brain tumor" → studyKeywords: `["pediatric", "brain"]`

### Search Behavior

Returns top 5 studies with detailed metadata, ranked by:
- **Primary:** keyword match count (how many keywords match)
- **Secondary:** sample count (for equal match counts, larger studies ranked higher)
- **Searches across:** studyId, name, description, cancerType fields

### Why Study Specificity Matters

cBioPortal contains hundreds of cancer studies from various sources (TCGA, ICGC, TARGET, institutional studies). A query like "EGFR mutations in lung cancer" is ambiguous because:
- There are many lung cancer studies in cBioPortal
- Lung cancer has multiple subtypes (adenocarcinoma, squamous cell, etc.)
- Each study may have different sample sizes and data types

**→ Users must select a specific study.** If multiple matches are returned, ask the user to choose or infer from context which study best matches their intent.

### Handling Multiple TCGA Versions

Many cancer types have multiple TCGA datasets. For example, Lung Adenocarcinoma has:
- `luad_tcga` - Firehose Legacy
- `luad_tcga_gdc` - GDC
- `luad_tcga_pub` - Nature 2014
- `luad_tcga_pan_can_atlas_2018` - PanCancer Atlas ← **RECOMMEND THIS**

**Recommendation:** When user intent is unclear, prefer the PanCancer Atlas version (e.g., `luad_tcga_pan_can_atlas_2018`) as it has the most comprehensive and up-to-date analysis.

### Pan-Cancer Studies

Some studies span multiple cancer types (e.g., MSK-CHORD includes lung, breast, prostate, etc.). These may match queries for specific cancer types even though they're not disease-specific studies.

### Fallback - No Matches

If no studies match the keywords, guide the user to browse all available studies:
**→ https://www.cbioportal.org**

cBioPortal contains studies from:
- **TCGA** (The Cancer Genome Atlas) - comprehensive studies across ~30 cancer types
- **ICGC** (International Cancer Genome Consortium)
- **TARGET** - pediatric cancer studies
- **Individual sequencing studies** where data is made publicly available
- **Cell line genomics data**

---

## How to Choose targetPage

### 📊 targetPage: 'study' (StudyView)

**Use when the user wants to:**
- View overall statistics of a research study/cohort
- Explore subgroups of patients or samples within a study
- Filter patients by clinical, genomic or other available data attributes (age, gender, stage, presence of a mutation in a specific gene, etc.)
- Explore genomic feature distributions across the study
- Answer discovery questions: "Which genes are most mutated?" "What's the mutation landscape?"

**Example queries:**
- "Show me the TCGA lung cancer study"
- "What are the most commonly amplified genes in MSK-CHORD"
- "What genes are mutated in breast cancer?"
- "I want to see KRAS not mutated pancreatic cancer"
- "Show me HER2 positive cases in the breast pancan atlas cohort"
- "Show me samples in TCGA glioblastoma study with EGFR amplification and mutation"
- "I want to see cases with both KRAS and STK11 mutations in LUAD TCGA"
- "I want to see how many cases are profiled for mutations in TCGA DLBCL study"
- "How many samples have a copy number gain in EGFR in GBM pancan TCGA?"
- "I want to see expression vs copy number change in EGFR in lung cancer."
- "Show me a graph of mutation count vs cancer type in MSK IMPACT 2017"
- "Show me samples with high expression in EGFR in GBM"

### 🧬 targetPage: 'patient' (PatientView)

**Use when the user wants to:**
- View one or more specific patient's complete profile
- See a patient's clinical timeline and events
- See all genomic alterations for one individual
- Compare multiple samples from the same patient


**Example queries:**
- "Show me patient TCGA-001 details"
- "What mutations does patient ID 12345 have?"
- "Show me all the patients in DLBCL TCGA PanCan Atlas who are Hispanic or Latino"

### 🔬 targetPage: 'results' (ResultsView/OncoPrint)

**Use when the user wants to:**
- Analyze specific genes across multiple samples
- Find mutation patterns and frequencies for named genes
- Identify genes that are altered in a co-occurring or mutually exclusive pattern
- Compare alterations in multiple genes
- Perform survival analysis by genotype
- View specific mutations in a given gene
- Explore the functional impact of mutations in a named gene
- View all structural variants in a given gene
- Find genes with similar expression patterns to a named gene
- View the cancer types where one or more named genes are altered
- Compare clinical or genomic features based on the presence of alterations in a named gene

**Example queries:**
- "Show me TP53 mutations in lung cancer"
- "Compare EGFR and KRAS alterations"

### 📊 targetPage: 'comparison' (GroupComparison)

**Use when the user wants to:**
- Compare patient subgroups defined by a clinical attribute (e.g., Male vs Female, T1 vs T2 vs T3)
- Perform outcome analysis across subgroups of samples
- Find genomic/mutation/CNA differences between groups of samples or patients
- Compare groups after pre-filtering by genomic or clinical criteria (e.g., "compare by sex among TP53-mutated patients")
- Analyze age-based or other numerical attribute groups (auto quartile-binned)
- Look for genes that are differentially expresssed between two groups of samples

**Key signal:** The user's intent is to **split and compare** a cohort by  attribute, not to view a single cohort overview or a specific gene pattern.

**Example queries:**
- "Compare male vs female patients in LUAD"
- "Show survival differences by tumor stage"
- "Compare age groups in breast cancer"
- "Compare KRAS-mutated patients by smoking history"
- "What genes are overexpressed in high grade lung adenocarcinoma vs low grade?"
- "Are there mutations that are more common in metastatic prostate cancer vs primary?"
- "Compare luad by KRAS mutation"

---

## Decision Flowchart

Evaluate rules in order. First match wins.

```
Rule 1: Sample or Patient ID explicitly mentioned
        → targetPage: 'patient'

Rule 2: User wants to compare/split cohort by a data attribute
        (Signals: compare, vs, difference, split, by sex/age/stage/smoking...)
        → targetPage: 'comparison'
        Note: If user wants to compare on genes only, then go to results comparison tab. Otherwise it should be comparing on attributes more than just genes, go to group comparsion.

Rule 3: Gene(s) mentioned AND the query is asking about the gene's
        alteration pattern itself
        (Signals: mutation frequency, co-occurrence, mutual exclusivity,
         OncoPrint, alteration landscape, comparing multiple genes to each other)
        → targetPage: 'results'

Rule 4: Anything else
        (Includes: gene used only as a filter to define a patient cohort,
         discovery questions, cohort overview)
        → targetPage: 'study'
```

**Rule 3 — subject vs filter (key distinction):**
- Gene is **subject** (→ results): the query asks *about* the gene — its mutations, frequency, relationship to other genes.
  - "Show me TP53 mutations in lung cancer"
  - "EGFR and KRAS co-occurrence"
  - "What is the mutation landscape?"
- Gene is **filter** (→ study, falls to Rule 4): the query uses the gene to define *which patients* to explore.
  - "Clinical features of EGFR-mutated patients"
  - "Survival of patients with TP53 mutation"
  - "Age distribution in KRAS-mutated cohort"

---

## Routing Workflow

This tool recommends one of these specialized tools:
- `navigate_to_studyview` - for StudyView (cohort overview)
- `navigate_to_patientview` - for PatientView (individual patient)
- `navigate_to_resultsview` - for ResultsView (gene alteration analysis)
- `navigate_to_group_comparison` - for GroupComparison (subgroup comparison)

### Workflow Example

1. **User:** "Show me TP53 mutations in TCGA lung cancer"
2. **AI calls:** `resolve_and_route(targetPage='results', studyKeywords=['TCGA', 'lung'])`
3. **Router returns:**
   ```json
   {
     "status": "success",
     "recommendedTool": "navigate_to_resultsview",
     "resolvedStudyIds": ["luad_tcga_pan_can_atlas_2018", "lusc_tcga"],
     "needsStudySelection": true,
     "studiesWithMetadata": [{ "studyId": "...", "name": "...", "sampleCount": 123, "metadata": {} }],
     "message": "Found 2 studies. Review query to select or ask user to choose."
   }
   ```
4. **AI evaluates:** "luad_tcga_pan_can_atlas_2018" (adenocarcinoma) best matches "lung cancer" intent. If ambiguous, construct preview URLs (`https://www.cbioportal.org/study?id={studyId}`) and present them to the user for choosing.
5. **AI calls:** `navigate_to_resultsview(studyIds=['luad_tcga_pan_can_atlas_2018'], genes=['TP53'])`

### Parameters

- **targetPage:** Which page type (study/patient/results)
- **studyKeywords:** Array of keywords to search for studies (e.g., `["TCGA", "lung"]`) OR
- **studyIds:** Array of direct study IDs to validate (e.g., `["luad_tcga", "brca_tcga"]`)

---

## Metadata Returned

The router provides study context and metadata to help construct filters and parameters.

### needsStudySelection

Boolean flag indicating whether the AI needs to determine which study to use:

- `false` — Exactly 1 study found; proceed directly with the recommended tool
- `true` — Multiple studies found; review the user's original query to determine if intent clearly points to one study. If yes, use that study. If ambiguous, ask the user to choose.

### Study URL Format

To generate a study preview URL for any `studyId`:

```
https://www.cbioportal.org/study?id={studyId}
```

Use this when presenting study options to the user for selection.

### Metadata Fields (studiesWithMetadata)

#### clinicalAttributeIds
Array of clinical attribute IDs available for filtering patients in this study.

**Examples:** `["AGE", "SEX", "TUMOR_GRADE", "TUMOR_STAGE", "OS_MONTHS", "SMOKING_HISTORY"]`

- Use `get_studyviewfilter_options` tool to get datatype + valid values before filtering
- Required for constructing `filterJson.clinicalDataFilters`

#### molecularProfileIds
Array of **non-generic-assay** molecular profile IDs indicating what genomic data is available.

**Examples:** `["luad_tcga_mutations", "luad_tcga_gistic", "luad_tcga_mrna_median_all_sample_zscores"]`

- Required for gene-based filtering (`filterJson.geneFilters`)
- Mutation profiles end in `_mutations`; CNA profiles typically end in `_gistic` or `_cna`

#### genericAssayProfiles _(optional, only when study has GENERIC_ASSAY data)_
Array of GENERIC_ASSAY profile IDs available for filtering (e.g. genetic ancestry, mutational signatures, treatment response scores).

**Examples:** `["luad_tcga_pan_can_atlas_2018_genetic_ancestry", "luad_tcga_pan_can_atlas_2018_mutational_signature"]`

- Call `get_studyviewfilter_options` with these IDs as `genericAssayProfileIds` to get entity stableIds, datatype, and values
- Use stableIds + profileType in `filterJson.genericAssayDataFilters`

#### treatments
Array of drug/agent names documented in this study (may be absent or empty).

**Examples:** `["CARBOPLATIN", "DOCETAXEL", "ERLOTINIB", "PEMBROLIZUMAB"]`

- Only present in studies with treatment data; empty array `[]` means no treatment data
- Same drug names apply to both patient-level and sample-level treatment filters:
  - `patientTreatmentFilters` — filter patients who received this drug (no timing required)
  - `sampleTreatmentFilters` — filter samples by drug + timing; requires `time: "Pre"` or `time: "Post"` (whether sample was collected before or after treatment)

### Filter Construction Workflow

1. Check `clinicalAttributeIds` to see what's available
2. Call `get_studyviewfilter_options` to get datatype and exact values
3. Use exact values in `filterJson.clinicalDataFilters`

---

## Universal Guidelines for All Navigation Tools

After this router recommends a navigation tool, follow these critical rules when calling the specialized navigation tools:

### 🚫 NEVER GUESS OR INVENT

- **Study IDs** - Use exact studyIds from this router's response
- **Clinical attribute values** - Use exact values from `get_studyviewfilter_options` output (case-sensitive)
- **Molecular profile IDs** - Use exact IDs from router metadata
- **Patient/Sample IDs** - Use exact values from user query (preserve case and format)

### ✅ ALWAYS

- Use exact values from tool responses (case-sensitive matching)
- Generate URL immediately after constructing parameters
- **Provide direct URL to user first (Link First principle)**
- Convert gene symbols to UPPERCASE (TP53, not tp53)

### Gene Symbol Rules

- **MUST be UPPERCASE**: TP53, KRAS, EGFR (not tp53 or Tp53)
- Use HUGO symbols: TP53 (not p53), EGFR (not ErbB1 or HER1)

---

**Note:** For detailed information about parameters for each page type, please refer to the documentation of the specific navigation tools after receiving the recommendation.
