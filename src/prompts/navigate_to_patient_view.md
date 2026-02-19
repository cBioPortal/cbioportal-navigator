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

### patientId OR sampleId (at least one required)
- `patientId`: e.g., `"TCGA-05-4244"`
- `sampleId`: e.g., `"TCGA-05-4244-01"`
- Case-sensitive — use exact values from user or tool responses.

### tab (optional)
`"summary"` (default), `"clinicalData"`, `"genomicTracks"`, `"pathways"`, `"tissueImage"`, `"trialMatch"`

### navIds (optional)
Enables cohort navigation. Rarely used — only if user explicitly requests it.

---

## Example

**User:** "Show me patient TCGA-05-4244 from TCGA lung adenocarcinoma"

```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "patientId": "TCGA-05-4244"
}
```

With multiple studies, returns separate URLs for each study.
