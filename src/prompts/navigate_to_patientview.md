# Navigate to PatientView

Generates direct URL to cBioPortal PatientView - individual patient/sample detailed profile.

**→ See router tool for universal guidelines (no guessing IDs, exact values, Link First principle).**

## What PatientView Shows

- Patient summary with key alterations
- Clinical timeline (diagnosis, treatments, events)
- Genomic alterations (mutations, CNV, fusions)
- Pathway analysis and tissue images

---

## Required Inputs

### studyIds (required)

- Array of study IDs from router response
- **Single study:** `["luad_tcga_pan_can_atlas_2018"]`
- **Multiple studies:** `["luad_tcga_pan_can_atlas_2018", "lusc_tcga"]`
  - → Generates separate URL for EACH study
- **🚫 DO NOT invent study IDs** - use exact values from router

### patientId OR sampleId (at least one required)

- **patientId:** Patient identifier (e.g., `"TCGA-05-4244"`)
- **sampleId:** Sample identifier (e.g., `"TCGA-05-4244-01"`)
- Use the identifier provided by the user or from previous tool responses
- Case-sensitive - use exact values

### tab (optional)

- `"summary"` (default), `"clinicalData"`, `"genomicTracks"`, `"pathways"`, `"tissueImage"`, `"trialMatch"`
- Opens specific view directly

### navIds (optional)

- Enables navigation through a cohort of patients
- Rarely used - only if user explicitly wants cohort navigation

---

## Multi-Study Behavior

When multiple `studyIds` provided:
- Tool generates SEPARATE URL for each study
- Useful for viewing same patient across different studies
- Response includes multiple URLs - provide ALL to user

### Example

`studyIds: ["luad_tcga_pan_can_atlas_2018", "lusc_tcga"]`, `patientId: "TCGA-05-4244"`

**→ Returns 2 URLs:**
1. PatientView for TCGA-05-4244 in luad_tcga_pan_can_atlas_2018
2. PatientView for TCGA-05-4244 in lusc_tcga

---

## Complete Examples

### Example 1: View Specific Patient

**User:** "Show me patient TCGA-05-4244 from the TCGA lung adenocarcinoma study"
- **Router returns:** `studyId: "luad_tcga_pan_can_atlas_2018"`
- **Call navigate:**
  ```json
  {
    "studyIds": ["luad_tcga_pan_can_atlas_2018"],
    "patientId": "TCGA-05-4244"
  }
  ```
- **Response:** Direct URL to patient summary

### Example 2: View Patient Across Multiple Studies

**User:** "View patient TCGA-05-4244 in both lung cancer studies"
- **Router returns:** `studyIds: ["luad_tcga_pan_can_atlas_2018", "lusc_tcga"]`
- **Call navigate:**
  ```json
  {
    "studyIds": ["luad_tcga_pan_can_atlas_2018", "lusc_tcga"],
    "patientId": "TCGA-05-4244"
  }
  ```
- **Response:** Two URLs (one for each study)

