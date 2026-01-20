# Get Clinical Attribute Values

Fetches exact valid values for clinical attributes to build accurate patient filters.

## What This Tool Does

Returns the precise valid values for clinical attributes (e.g., `["Male", "Female"]` for SEX).

**Use this to get exact values for filter construction - do NOT guess or invent values.**

## When to Use

- User wants to filter by clinical attributes (age, gender, stage, tumor grade, etc.)
- You need exact valid values to construct filters (value matching is case-sensitive and exact)

---

## Critical - Value Accuracy

**🚫 NEVER guess or invent attribute values.** Always use exact values from this tool's response.

- ✅ `"Female"` (from tool response) will match patients
- ❌ `"female"` or `"FEMALE"` (guessed) will match zero patients

---

## Input

### studyId
Study identifier (from router response)

### attributeIds
Array of clinical attribute IDs
- **From router response:** These IDs are pre-validated and guaranteed to exist
- **User-specified IDs:** May not exist - tool will return error with available IDs

---

## Output

For each attribute:
- **attributeId:** The attribute identifier
- **displayName:** Human-readable name for display to user
- **datatype:** `"STRING"`, `"NUMBER"`, or `"BOOLEAN"`
- **values:** Array of exact valid values found in this study's data
  - Example: `["Male", "Female"]` or `["G1", "G2", "G3", "G4", "GX"]`

---

## Workflow

1. **Router returns:** `clinicalAttributeIds: ["AGE", "SEX", "TUMOR_GRADE", ...]`
2. **User asks:** "Show me female patients with high tumor grade"
3. **Call this tool** with relevant attributes:
   ```json
   {
     "studyId": "luad_tcga_pub",
     "attributeIds": ["SEX", "TUMOR_GRADE"]
   }
   ```
4. **Tool returns exact values:**
   - SEX: `["Male", "Female"]`
   - TUMOR_GRADE: `["G1", "G2", "G3", "G4", "GX"]`
5. **Map user intent to exact values:**
   - "female" → `"Female"` (use exact value from response)
   - "high tumor grade" → `["G3", "G4"]` (infer from domain knowledge)
6. **Immediately call** `navigate_to_studyview` with these exact values to generate the URL
7. **Provide the direct URL to the user** (Link First principle)

---

## Error Handling

- If attribute ID doesn't exist, tool returns error with list of available IDs
- If attribute has no values (empty array), it cannot be used for filtering in this study
