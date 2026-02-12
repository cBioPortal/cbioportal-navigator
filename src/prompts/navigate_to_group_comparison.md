# Navigate to Group Comparison

Creates group comparison sessions based on clinical attribute values and generates URL to cBioPortal's Group Comparison page.

**→ See router tool for universal guidelines (no guessing IDs, exact values, Link First principle).**

## What Group Comparison Shows

- Statistical comparison between groups (e.g., Male vs Female, T1 vs T2 vs T3)
- Survival analysis across groups
- Mutation and CNA enrichment between groups
- Clinical attribute differences
- mRNA/protein expression comparison

---

## Required Inputs

### studyIds (required)

- Array of study IDs from router response
- **Single study:** `["luad_tcga_pan_can_atlas_2018"]`
- **Cross-study:** `["luad_tcga_pan_can_atlas_2018", "lusc_tcga"]`
- **🚫 DO NOT invent study IDs** - use exact values from router

### clinicalAttributeId (required)

- Clinical attribute ID to group samples by
- **Examples:** `"SEX"`, `"PATH_T_STAGE"`, `"SMOKING_HISTORY"`
- Must be from router response `clinicalAttributeIds`
- **🚫 DO NOT guess attribute IDs** - use exact values from router

---

## Optional Inputs

### studyViewFilter (optional)

- StudyViewFilter object to pre-filter samples before grouping
- Use this to combine with gene filters or other criteria
- Same format as `navigate_to_studyview_page` filterJson
- **Note:** `studyIds` will be automatically injected - you don't need to include it
- If omitted, all samples in the study are used

**Example:** Compare TP53-mutated samples by sex
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "SEX",
  "studyViewFilter": {
    "geneFilters": [{
      "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
      "geneQueries": [[{"hugoGeneSymbol": "TP53"}]]
    }]
  }
}
```

**Note:** The tool automatically includes `studyIds` in the filter for proper routing. You don't need to add it manually inside `studyViewFilter`.

### clinicalAttributeValues (optional)

- Subset of attribute values to include in comparison (categorical attributes only)
- If specified, only creates groups for the selected values — reduces noise when attribute has many values
- Value matching is case-insensitive: `["white"]` matches `"White"`
- When specified, returns per-group studyview URLs (same as pre-filter scenario)
- If omitted, all values are included

**Example:** Compare only specific tumor stages
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "PATH_T_STAGE",
  "clinicalAttributeValues": ["T1", "T2"]
}
```

### includeNA (optional)

- Whether to include an "NA" group for samples without the attribute
- **Default:** `true` for categorical attributes, `false` for numerical attributes
- Set to `false` to exclude samples missing the clinical attribute
- Useful when focusing only on samples with known values

### tab (optional)

- Specific comparison tab to navigate to
- **Available tabs:** `"overlap"`, `"survival"`, `"clinical"`, `"alterations"`, `"mutations"`, `"copy-number"`, `"mrna"`, `"protein"`
- If omitted, navigates to comparison overview page
- **Example:** `"tab": "survival"` → Direct link to survival analysis tab

---

## How It Works

1. **Fetch samples:** Get all samples matching the filter (or all samples if no filter)
2. **Get clinical data:** Retrieve clinical attribute values for samples
3. **Group samples:**
   - **Categorical attributes** (STRING): Group by unique values (e.g., "Male"/"Female", "T1"/"T2"/"T3")
   - **Numerical attributes** (NUMBER): Automatically split into 4 quartiles with equal sample counts (e.g., "33.5-55.2", "55.2-67.8", etc.)
4. **Sort and limit:** Keep top 20 groups by size (including NA group if requested)
5. **Create session:** POST session to backend with group definitions
6. **Generate URLs:** Create comparison URL and studyview URLs for exploring groups
7. **Return metadata:** URLs, group names, and sample counts

---

## Response Format

The tool returns a navigation response with:
- **url:** Direct link to comparison page (with optional tab)
- **totalGroups:** Number of groups created
- **groups:** Array of group information with name and sample count
- **baseStudyViewUrl** (simple comparison, no filter/subset): Base studyview URL for exploring the study
- **urlExplanation** (simple comparison, no filter/subset): Explanation of what the URL shows
- **groupUrls** (pre-filter or value subset): Array of studyview URLs, one per group

### Scenario A: Simple Comparison (All Values, No Filter)

**Example response:**
```json
{
  "success": true,
  "message": "Navigating to [url]",
  "url": "https://cbioportal.org/comparison?comparisonId=...",
  "data": {
    "description": "Group comparison by Sex (SEX)",
    "studies": ["luad_tcga_pan_can_atlas_2018"],
    "attribute": {
      "id": "SEX",
      "name": "Sex",
      "datatype": "STRING"
    },
    "totalGroups": 3,
    "groups": [
      {"name": "Male", "sampleCount": 250},
      {"name": "Female", "sampleCount": 209},
      {"name": "NA", "sampleCount": 14}
    ],
    "baseStudyViewUrl": "https://cbioportal.org/study?id=luad_tcga_pan_can_atlas_2018",
    "urlExplanation": "Base study view for luad_tcga_pan_can_atlas_2018. Comparison groups: Male, Female, NA"
  }
}
```

**AI should tell user:**
- "Created comparison by Sex with 3 groups (Male: 250 samples, Female: 209 samples, NA: 14 samples)"
- "You can explore the base study at [baseStudyViewUrl]"
- If user wants to drill into a specific group, call `navigate_to_studyview_page` with a `clinicalDataFilters` for that group's value (e.g., `{"attributeId": "SEX", "values": [{"value": "Male"}]}`)

### Scenario B: Per-Group URLs (Pre-filter or Value Subset)

**Example response:**
```json
{
  "success": true,
  "message": "Navigating to [url]",
  "url": "https://cbioportal.org/comparison?comparisonId=...",
  "data": {
    "description": "Group comparison by Sex (SEX)",
    "studies": ["luad_tcga_pan_can_atlas_2018"],
    "attribute": {
      "id": "SEX",
      "name": "Sex",
      "datatype": "STRING"
    },
    "totalGroups": 2,
    "groups": [
      {"name": "Male", "sampleCount": 145},
      {"name": "Female", "sampleCount": 132}
    ],
    "groupUrls": [
      {
        "groupName": "Male",
        "url": "https://cbioportal.org/study?id=luad_tcga_pan_can_atlas_2018#filterJson={...geneFilters+SEX=Male}"
      },
      {
        "groupName": "Female",
        "url": "https://cbioportal.org/study?id=luad_tcga_pan_can_atlas_2018#filterJson={...geneFilters+SEX=Female}"
      }
    ]
  }
}
```

**AI should tell user:**
- "Created comparison with TP53 mutation filter + SEX grouping"
- "Male group (145 samples): [URL to studyview with TP53+Male filters]"
- "Female group (132 samples): [URL to studyview with TP53+Female filters]"
- Each URL shows that specific group's filter combination for detailed exploration

---

## Key Rules

### Attribute Value Handling

- **Case-insensitive grouping:** "male" and "Male" are treated as the same group
- **Automatic sorting:** Groups sorted by sample count (largest first)
- **Max 20 groups total:** Up to 20 groups including NA group (if requested)
- **Minimum 2 groups:** At least 2 groups required for comparison

### Attribute Types

**Categorical (STRING datatype):**
- Groups by unique values (e.g., "Male", "Female", "T1", "T2", "T3")
- Top 19 value-based groups + 1 NA group (if includeNA=true) = max 20 total

**Numerical (NUMBER datatype):**
- Automatically creates 4 quartiles with equal sample counts
- Groups named by value range (e.g., "45.2-67.8")
- Samples with NaN values excluded from quartiles (handled by NA group if includeNA=true)
- **Example (AGE):** Instead of creating 50+ groups (one per unique age), creates 4 quartile groups like "33.5-55", "55-67", "67-75.5", "75.5-89"

### Patient vs Sample Level

- **Patient-level attributes** (e.g., SEX, AGE): Value applies to all patient's samples
- **Sample-level attributes** (e.g., SAMPLE_TYPE, TUMOR_STAGE): Value specific to each sample
- Tool automatically detects attribute level from metadata

### NA Group

- Created for samples without the clinical attribute
- Included by default (`includeNA: true`)
- Counts toward 20-group limit
- Only created if NA samples exist
- Appears as separate group in comparison

---

## Examples

### Example 1: Compare by Sex

**User:** "Compare male vs female patients in LUAD"

**Step 1:** Call router → get `studyIds: ["luad_tcga_pan_can_atlas_2018"]`

**Step 2:** Call navigate_to_group_comparison:
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "SEX"
}
```

**Result:** URL with 2-3 groups (Male, Female, possibly NA)

---

### Example 2: Compare by Tumor Stage

**User:** "Compare different tumor stages in LUAD"

**Step 1:** Call router → get `studyIds: ["luad_tcga_pan_can_atlas_2018"]`

**Step 2:** Call navigate_to_group_comparison:
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "PATH_T_STAGE"
}
```

**Result:** URL with groups like T1, T2, T3, T4, possibly NA

---

### Example 3: Compare with Pre-filtering

**User:** "Compare KRAS mutation status by sex in LUAD patients over 60"

**Step 1:** Call router → get study and molecular profile IDs

**Step 2:** Call get_studyviewfilter_options for AGE → determine filter format

**Step 3:** Call navigate_to_group_comparison:
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "SEX",
  "studyViewFilter": {
    "clinicalDataFilters": [{
      "attributeId": "AGE",
      "values": [{"start": 60}]
    }],
    "geneFilters": [{
      "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
      "geneQueries": [[{"hugoGeneSymbol": "KRAS"}]]
    }]
  }
}
```

**Result:** URL comparing Male vs Female (and NA) among KRAS-mutated patients over 60

---

### Example 4: Exclude NA Group

**User:** "Compare only patients with known smoking history"

**Step 1:** Call router → get `studyIds: ["luad_tcga_pan_can_atlas_2018"]`

**Step 2:** Call navigate_to_group_comparison:
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "SMOKING_HISTORY",
  "includeNA": false
}
```

**Result:** URL with only groups having smoking history data (no NA group)

---

### Example 5: Navigate to Specific Tab

**User:** "Show me survival differences by sex in LUAD"

**Step 1:** Call router → get `studyIds: ["luad_tcga_pan_can_atlas_2018"]`

**Step 2:** Call navigate_to_group_comparison:
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "SEX",
  "tab": "survival"
}
```

**Result:** URL directly to survival analysis tab of comparison page

---

### Example 6: Numerical Attribute (Age Quartiles)

**User:** "Compare different age groups in LUAD"

**Step 1:** Call router → get `studyIds: ["luad_tcga_pan_can_atlas_2018"]`

**Step 2:** Call navigate_to_group_comparison:
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "AGE"
}
```

**Result:** URL with 4 quartile groups (e.g., "33.5-55.2", "55.2-67.8", "67.8-75.3", "75.3-89"), each with roughly equal sample counts

---

### Example 7: Multi-Attribute Comparison with Group URLs

**User:** "Compare male vs female among TP53-mutated patients, and show me each group's studyview"

**Step 1:** Call router → get study and molecular profile IDs

**Step 2:** Call navigate_to_group_comparison:
```json
{
  "studyIds": ["luad_tcga_pan_can_atlas_2018"],
  "clinicalAttributeId": "SEX",
  "studyViewFilter": {
    "geneFilters": [{
      "molecularProfileIds": ["luad_tcga_pan_can_atlas_2018_mutations"],
      "geneQueries": [[{"hugoGeneSymbol": "TP53"}]]
    }]
  }
}
```

**Result:**
- Comparison URL for overall comparison
- `groupUrls` array with 2-3 URLs:
  - Male group: studyview URL with TP53 mutation + SEX=Male filters
  - Female group: studyview URL with TP53 mutation + SEX=Female filters
  - NA group (if exists): studyview URL with TP53 mutation + SEX=NA filters

**AI Response Example:**
"Created comparison of TP53-mutated patients by sex. Here are the individual group views:
- Male group (145 samples): [URL showing TP53 mutations + males]
- Female group (132 samples): [URL showing TP53 mutations + females]

You can click each URL to explore that specific group's characteristics in detail."

---

## Error Scenarios

### No samples found
- If `studyViewFilter` is too restrictive
- **Solution:** Adjust filter criteria

### Attribute not found
- Clinical attribute doesn't exist in the study
- **Solution:** Use router to get valid `clinicalAttributeIds`

### Fewer than 2 groups
- All samples have the same value or only NA exists
- **Solution:** Choose a different clinical attribute with more variation

### Too many groups (rare)
- More than 20 unique values for categorical attributes
- **Note:** Tool automatically limits to top 20 by sample count
- For numerical attributes, quartiles are used automatically (4 groups)

### Single-value numerical
- All samples have the same numerical value (e.g., all AGE=50)
- Quartile splitting creates only 1 group
- **Solution:** Choose a different attribute with more variation

---

## Cross-Study Comparison

Group comparison supports multiple studies:

```json
{
  "studyIds": ["luad_tcga", "lusc_tcga"],
  "clinicalAttributeId": "SEX"
}
```

**Important Considerations:**
- The clinical attribute **must exist in ALL specified studies**
- Attribute definitions must be **compatible** (same value types and semantics)
- If uncertain, prefer single-study comparison first
- Tool will fail if attribute is missing from any study

**Common Issues:**
- Some attributes may have different IDs across studies (e.g., "AGE" vs "AGE_AT_DIAGNOSIS")
- Value formats may differ (e.g., "Male" vs "MALE")
- Check router response to verify attribute availability before cross-study comparison

---

## When to Use This Tool

### ✅ Use for:
- Comparing clinical subgroups (sex, tumor stage, smoking status, etc.)
- Age-based comparisons (automatic quartile binning)
- Survival analysis across groups
- Finding genomic differences between phenotypes
- Comparing treatment response groups
- Multi-attribute filtering (e.g., TP53-mutated patients by sex)

### ❌ DO NOT use for:
- Comparing individual genes (use ResultsView instead)
- Custom sample selections without clinical attribute (group comparison requires attribute-based grouping)
- Viewing single cohort overview (use StudyView instead)
- Custom age ranges (tool uses quartiles; if you need specific ranges like "20-40", use StudyView with custom filters)

---

## Integration with Other Tools

### Recommended Flow:
1. **router** → Get study IDs and available clinical attributes
2. **navigate_to_group_comparison** → Create comparison session and return URL

**Note:** You typically don't need `get_studyviewfilter_options` before calling this tool. The tool automatically:
- Fetches all attribute values from the API
- Groups samples by values
- Returns group metadata (group names and sample counts)

### Flow with Pre-filtering:
**When user wants to compare within a filtered cohort (e.g., "Compare KRAS-mutated patients by sex"):**

1. **router** → Get study and molecular profile IDs
2. **navigate_to_group_comparison** with `studyViewFilter` → Create filtered comparison

**Example user query:** "Compare male vs female TP53-mutated LUAD patients"
- Router provides: `studyIds`, `clinicalAttributeIds`, `molecularProfileIds`
- Directly call `navigate_to_group_comparison` with:
  - `studyIds: ["luad_tcga_pan_can_atlas_2018"]`
  - `clinicalAttributeId: "SEX"`
  - `studyViewFilter: { geneFilters: [...] }` (TP53 filter)
