# Get StudyView Filter Options

Fetches exact valid values for building `filterJson` in StudyView — covers both **clinical attributes** and **generic assay entities**.

## What This Tool Does

- **Clinical attributes:** returns datatype + exact values (e.g., `["Male", "Female"]` for SEX)
- **Generic assay entities:** returns entity list (stableId + name) and values (categorical) or a `"continuous": true` flag (LIMIT-VALUE)

**🚫 NEVER guess or invent filter values.** Always use exact values from this tool's response.

---

## Input

### studyId
Study identifier from router response.

### attributeIds _(optional)_
Array of clinical attribute IDs.
- From `router.metadata.clinicalAttributeIds` — pre-validated
- At least one of `attributeIds` or `genericAssayProfileIds` is required

### genericAssayProfileIds _(optional)_
Array of molecular profile IDs from `router.metadata.genericAssayProfiles[].molecularProfileId`.
- At least one of `attributeIds` or `genericAssayProfileIds` is required

---

## Output

### `attributes` (when attributeIds provided)
```json
[
  {
    "attributeId": "SEX",
    "displayName": "Sex",
    "datatype": "STRING",
    "values": ["Male", "Female"]
  },
  {
    "attributeId": "AGE",
    "displayName": "Age",
    "datatype": "NUMBER",
    "values": ["23", "45", "67", ...]
  }
]
```

### `genericAssayEntities` (when genericAssayProfileIds provided)
```json
[
  {
    "molecularProfileId": "luad_tcga_pan_can_atlas_2018_genetic_ancestry",
    "profileType": "genetic_ancestry",
    "datatype": "LIMIT-VALUE",
    "entities": [
      { "stableId": "Admixed_American", "name": "Admixed American", "continuous": true },
      { "stableId": "European",         "name": "European",         "continuous": true }
    ]
  }
]
```

---

## Building `genericAssayDataFilters`

Use the returned `profileType` and `stableId` directly in the filter:

```json
{
  "genericAssayDataFilters": [{
    "profileType": "genetic_ancestry",
    "stableId": "European",
    "values": [{"start": 0.8}]
  }]
}
```

### Values format

| datatype | filter style | example |
|----------|-------------|---------|
| `LIMIT-VALUE` | numerical range (`continuous: true`) | `{"start": 0.8}` or `{"start": 0.2, "end": 0.5}` |
| `CATEGORICAL` | exact string match | `{"value": "High"}` |
| `BINARY` | exact string match | `{"value": "YES"}` |

---

## Workflow

1. **Router returns** `genericAssayProfiles: [{ molecularProfileId, datatype }]`
2. **Call this tool:**
   ```json
   {
     "studyId": "luad_tcga_pan_can_atlas_2018",
     "genericAssayProfileIds": ["luad_tcga_pan_can_atlas_2018_genetic_ancestry"]
   }
   ```
3. **Tool returns** entities with stableIds and value hints
4. **Call** `navigate_to_studyview` with `genericAssayDataFilters` using exact stableIds

Both `attributeIds` and `genericAssayProfileIds` can be requested in a single call.
