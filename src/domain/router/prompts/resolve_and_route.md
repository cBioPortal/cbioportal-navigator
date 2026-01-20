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

### Search Behavior

Returns top 5 studies ranked by:
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
- `luad_tcga_pub` - Nature 2014 ← **RECOMMEND THIS**
- `luad_tcga_pan_can_atlas_2018` - PanCancer Atlas

**Recommendation:** When user intent is unclear, prefer the publication version (e.g., `luad_tcga_pub`) as it represents the original peer-reviewed analysis.

### Pan-Cancer Studies

Some studies span multiple cancer types (e.g., MSK-CHORD includes lung, breast, prostate, etc.). These may match queries for specific cancer types even though they're not disease-specific studies.

### Fallback - No Matches

If no studies match the keywords, guide the user to browse all available studies:
**→ https://www.cbioportal.org/datasets**

cBioPortal contains studies from:
- **TCGA** (The Cancer Genome Atlas) - comprehensive studies across ~30 cancer types
- **ICGC** (International Cancer Genome Consortium)
- **TARGET** - pediatric cancer studies
- **Individual institutional studies** from major cancer centers
- **Cell line genomics data**

---

## How to Choose targetPage

### 📊 targetPage: 'study' (StudyView)

**Use when the user wants to:**
- View overall statistics of a research study/cohort
- Compare different patient subgroups within a study
- Filter patients by clinical attributes (age, gender, stage, etc.)
- See survival analysis for the entire cohort
- Explore genomic feature distributions across the study
- Answer discovery questions: "Which genes are most mutated?" "What's the mutation landscape?"

**Example queries:**
- "Show me the TCGA lung cancer study"
- "Display survival curves for melanoma patients"

### 🧬 targetPage: 'patient' (PatientView)

**Use when the user wants to:**
- View a specific patient's complete profile
- Track a patient's clinical timeline and events
- See all genomic alterations for one individual
- Compare multiple samples from the same patient

**Example queries:**
- "Show me patient TCGA-001 details"
- "What mutations does patient ID 12345 have?"

### 🔬 targetPage: 'results' (ResultsView/OncoPrint)

**Use when the user wants to:**
- Analyze specific genes across multiple samples
- Find mutation patterns and frequencies for named genes
- Identify co-occurring or mutually exclusive mutations
- Compare alterations in multiple genes
- Perform survival analysis by genotype

**Example queries:**
- "Show me TP53 mutations in lung cancer"
- "Compare EGFR and KRAS alterations"

---

## Decision Flowchart

```
Question 1: Does the user mention specific gene name(s)?
├─ YES → targetPage: 'results'
│        (Gene-focused analysis)
│
└─ NO → Question 1b: Is this a discovery question about genes (which/what/how many genes...)?
        ├─ YES → targetPage: 'study' (for unbiased gene discovery)
        │
        └─ NO → Question 2: Is it about a specific patient/case?
                ├─ YES → targetPage: 'patient'
                │        (Individual patient focus)
                │
                └─ NO → targetPage: 'study'
                        (Cohort/study overview)
```

---

## Routing Workflow

This tool recommends one of these specialized tools:
- `navigate_to_studyview` - for StudyView (cohort overview)
- `navigate_to_patientview` - for PatientView (individual patient)
- `navigate_to_resultsview` - for ResultsView (gene alteration analysis)

### Workflow Example

1. **User:** "Show me TP53 mutations in TCGA lung cancer"
2. **AI calls:** `resolve_and_route(targetPage='results', studyKeywords=['TCGA', 'lung'])`
3. **Router returns:**
   ```json
   {
     "status": "success",
     "recommendedTool": "navigate_to_resultsview",
     "resolvedStudyIds": ["luad_tcga_pub", "lusc_tcga"],
     "needsStudySelection": true,
     "studies": [{ "studyId": "...", "name": "...", "sampleCount": 123, "metadata": {} }],
     "message": "Found 2 studies. Review query to select or ask user to choose."
   }
   ```
4. **AI evaluates:** "luad_tcga_pub" (adenocarcinoma) best matches "lung cancer" intent
5. **AI calls:** `navigate_to_resultsview(studyIds=['luad_tcga_pub'], genes=['TP53'])`

### Parameters

- **targetPage:** Which page type (study/patient/results)
- **studyKeywords:** Array of keywords to search for studies (e.g., `["TCGA", "lung"]`) OR
- **studyIds:** Array of direct study IDs to validate (e.g., `["luad_tcga", "brca_tcga"]`)

---

## Metadata Returned

The router provides metadata to help construct filters and parameters:

### 1. clinicalAttributeIds
Array of clinical attribute IDs available for filtering

**Example:** `["AGE", "SEX", "TUMOR_GRADE", "TUMOR_STAGE", "OS_MONTHS"]`

**→ Use `get_clinical_attribute_values` tool to get datatype + valid values**

### 2. molecularProfileIds
Array of molecular profile IDs (5-15 per study)

**Example:** `["study_mutations", "study_gistic", "study_mrna", "study_methylation"]`

- Indicates available data types for this study
- Used by specialized tools to determine what analyses are possible

### Filter Construction Workflow

1. Check `clinicalAttributeIds` to see what's available
2. Call `get_clinical_attribute_values` to get datatype and exact values
3. Use exact values in `filterJson.clinicalDataFilters`

---

## Universal Guidelines for All Navigation Tools

After this router recommends a navigation tool, follow these critical rules when calling the specialized navigation tools:

### 🚫 NEVER GUESS OR INVENT

- **Study IDs** - Use exact studyIds from this router's response
- **Clinical attribute values** - Use exact values from `get_clinical_attribute_values` output (case-sensitive)
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
