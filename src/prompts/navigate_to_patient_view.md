# Navigate to PatientView

Generates direct URL to cBioPortal PatientView — individual patient/sample detailed profile.

**→ See router tool for universal guidelines (no guessing IDs, exact values, Link First principle).**

## What PatientView Shows

- Patient summary with key alterations
- Clinical timeline (diagnosis, treatments, events)
- Genomic alterations (mutations, CNV, fusions)
- Pathway analysis and tissue images

---

## Required Inputs

### studyIds (required)
Array of study IDs from router response. When multiple studies provided, generates a **separate URL for each study**.

### patientId OR sampleId (required unless studyViewFilter is provided)
- `patientId`: e.g., `"TCGA-05-4244"`
- `sampleId`: e.g., `"TCGA-05-4244-01"`
- Case-sensitive — use exact values from user or tool responses.

### tab (optional)
`"summary"` (default), `"clinicalData"`, `"genomicTracks"`, `"pathways"`, `"tissueImage"`, `"trialMatch"`

### navIds (optional)
Enables cohort navigation. Rarely used — only if user explicitly requests it.

### studyViewFilter (optional)
Filter object to browse a filtered patient cohort. When provided:
- Fetches all patients matching the filter
- **≤ 20 patients:** opens the first patient with full cohort navigation (arrow keys to move between patients)
- **> 20 patients:** returns a StudyView URL with the filter applied — present this as a titled link and instruct the user to click **"View selected cases"** to enter PatientView with full cohort navigation
- `patientId` and `sampleId` are not required

Use the same filterJson format as `navigate_to_study_view`.

---

## Link presentation

Always present URLs as titled markdown links, never as bare URLs:
- `[View filtered patient cohort](url)` ✓
- `https://www.cbioportal.org/...` ✗

---

## When to use studyViewFilter

Use `studyViewFilter` when the user wants to **browse individual patients** from a filtered cohort:

- "Browse female patients with TP53 mutations"
- "View patients in stage III one by one"

---

## Examples

**User:** "Show me patient TCGA-05-4244 from TCGA lung adenocarcinoma"

```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "patientId": "TCGA-05-4244"
}
```

**User:** "Browse female patients in TCGA lung cancer"

```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "studyViewFilter": {
    "clinicalDataFilters": [
      { "attributeId": "SEX", "values": [{ "value": "Female" }] }
    ]
  }
}
```

With multiple studies and no filter, returns separate URLs for each study.
