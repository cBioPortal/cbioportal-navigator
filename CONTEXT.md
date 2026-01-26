# Project Context

## Current Status

MCP server for AI-assisted cBioPortal navigation with dual mode support:
- MCP protocol (stdio/HTTP) for Claude Desktop and other MCP clients
- OpenAI-compatible Chat Completions API for LibreChat

**Recent Changes (2026-02-03):**
- **Group Comparison bug fixes & prompt alignment**
  - `clinicalAttributeValues` filter now case-insensitive (was strict match, missed case variants)
  - Per-group studyview URL generation now also triggers on `clinicalAttributeValues` (was only pre-filter)
  - Prompt: added missing `clinicalAttributeValues` parameter documentation
  - Prompt: `includeNA` default description aligned with code (categorical: true, numerical: false)
  - Prompt: Scenario A/B example responses updated to match actual output (description format, attribute field)
  - Prompt: Scenario A drill-down guidance added — instructs AI to call `navigate_to_studyview_page` for individual groups
- **Code quality fixes**
  - Removed duplicate `ClinicalDataItem` in `numericalBinning.ts`, now imports from `groupBuilder`
  - `groups: any[]` → `SessionGroupData[]` in main handler
  - `comparisonSessionClient.getSession` return type fixed, removed `as any`
  - JSDoc flow steps aligned with actual code (9 → 10 steps)

**Recent Changes (2026-02-02 - Session 2):**
- **Group Comparison value subset selection** - New `clinicalAttributeValues` parameter
  - Filter categorical attributes to specific values (e.g., `["White", "Asian"]` for RACE)
  - Only creates groups for selected values, reducing noise in comparison
  - Parameter is optional - omit to include all values (existing behavior)
- **Smart NA default for numerical binning** - `includeNA` now defaults based on datatype
  - Numerical attributes: `includeNA` defaults to `false` (quartiles are meaningful without NA)
  - Categorical attributes: `includeNA` defaults to `true` (show all data including missing)
  - Users can still override with explicit `includeNA: true/false`
- **Attribute metadata in response** - Better context for AI explanations
  - Response now includes: `attribute.id`, `attribute.name`, `attribute.datatype`
  - Description updated: "Group comparison by Age (AGE)" instead of just "by AGE"
  - Helps AI explain to users what attribute is being compared
- **Frontend alignment fixes** - Matched cBioPortal frontend conventions exactly
  - `formatNumber`: integers → 0 decimals, non-integers → 2 decimals (was: always 1 decimal)
  - `clinicalAttributeName`: categorical → `displayName`; numerical → `"Quartiles of {displayName}"` (was: raw attribute ID)
  - `groupNameOrder`: numerical sessions now pass group name order to preserve ascending display (was: omitted)

**Recent Changes (2026-02-02 - Session 1):**
- **Group Comparison enhancements** - Numerical binning, tab support, and studyview URL generation
  - **Quartiles for numerical attributes**: NUMBER datatype now auto-creates 4 equal-sized groups instead of 20+ discrete groups
    - Example: AGE creates "33.50-55", "55-67", "67-75.50", "75.50-89" (equal sample counts)
    - Groups named by min-max value range (format: integers no decimal, non-integers 2 decimals — matches frontend)
    - Implementation: `src/domain/groupComparison/utils/numericalBinning.ts`
  - **NA group limit fix**: NA group now counts toward 20-group limit (was: max 21, now: max 20 total)
  - **Tab parameter support**: Optional `tab` parameter to navigate directly to comparison tab (survival, clinical, alterations, etc.)
  - **StudyView URL generation**: Returns studyview URLs for exploring individual groups
    - Single attribute (no pre-filter): 1 base studyview URL without filters
    - Multi-attribute (with pre-filter): 1 URL per group showing filter combination (e.g., TP53 mutation + SEX=Male)
    - Categorical groups: use `{value: "Male"}`, Numerical groups: use `{start: 50, end: 70}` range filters
  - Response format: `baseStudyViewUrl` + `urlExplanation` OR `groupUrls` array depending on scenario

**Previous Changes (2026-01-30):**
- **Group Comparison tool** - Create clinical attribute-based cohort comparisons
  - Groups samples by categorical attributes (SEX, TUMOR_STAGE, etc.)
  - Automatic NA group handling with patient-level vs sample-level distinction
  - Returns group metadata (names, sample counts) for AI to explain to users
  - Auto-injects studyIds into studyViewFilter for proper column-store routing
  - Tool: `navigate_to_group_comparison` with includeNA parameter (default: true)

**Recent Changes (2026-01-27):**
- **Tiered study metadata in router response** - Optimized token usage and search precision
  - studyKeywords: Returns all matches, but only top 5 get full metadata (clinicalAttributes, molecularProfiles)
  - studyIds (direct): All studies get full metadata (no limit, users specify explicitly)
  - Other studies: Basic info only (studyId, name, sampleCount)
- **AND logic for keyword search** - Changed from OR (`some`) to AND (`every`)
  - `["lung", "cancer"]`: 333 matches → 31 matches (90% noise reduction)
  - Prompt updated to guide AI: avoid generic terms like "cancer", use specific terms like "lung", "TCGA"
- Performance: O(n×m) → O(n) using Map for study lookups

**Previous Changes (2026-01-20):**
- **Prompts externalized to markdown files** - All MCP tool and chat system prompts now in `.md` files for easy editing by testing teams
  - MCP tools: `src/domain/<domain>/prompts/*.md`
  - Chat system: `src/server/chat/prompts/system.md`
  - After editing: `npm run build` and restart server
- Fixed incorrect allSampleCount in study search results
- Column-store URL rewriting now working (regex fix: removed ^ anchors to match full URLs)
- studyKeywords path: Preserves complete study objects from getAllStudies (column-store, correct data)
- studyIds path: Uses getById (may have incorrect sampleCount, but doesn't matter for direct queries)

**Supported Pages:**
- StudyView (full support: filters, plots, tabs)
- GroupComparison (full support: categorical/numerical grouping, tabs, studyview URLs per group)
- ResultsView (basic navigation)
- PatientView (basic navigation)

## Architecture

```
src/
├── server/                   # Entry point, MCP server, Chat API
├── domain/                   # Business logic (router, studyView, patientView, resultsView)
└── infrastructure/           # API clients, resolvers, utilities
```

**Design:** Server → Domain → Infrastructure (three-layer separation)

## Critical Design Decisions

### 1. Column-Store Integration

**Problem:** Standard API endpoints have bugs and performance issues:
- `/api/studies/{id}` returns `allSampleCount: 1` (wrong!)
- `/api/column-store/studies/{id}` returns 404
- Clinical data queries are slow

**Solution:** Transparent URL rewriting for whitelisted endpoints
```typescript
// Intercept API calls
if (/\/api\/studies(\?|\/meta|$)/.test(url)) {
    url = url.replace(/\/api\//, '/api/column-store/');
}
```

**Critical:** Regex must match full URLs (not just paths):
- Wrong: `/^\/api\/studies/` (only matches `/api/studies`)
- Correct: `/\/api\/studies/` (matches `https://domain.com/api/studies`)

**Why Two Code Paths:**
- studyKeywords: Needs accurate sampleCount for sorting → preserve getAllStudies results
- studyIds: User specified IDs explicitly, no sorting → getById acceptable

**Whitelisted:** studies, samples/fetch, 21 StudyView endpoints

### 2. Multi-Provider API Key Resolution

**Problem:** LibreChat custom endpoint only allows one `apiKey` field, but Navigator supports Anthropic/Google/OpenAI.

**Solution:** Ignore Authorization header entirely, use environment variables only:
- Detect provider from model name (`claude-*` → Anthropic, `gemini-*` → Google, `gpt-*` → OpenAI)
- Select env var: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, or `OPENAI_API_KEY`

**Why:** Single endpoint config supports all providers, more secure.

### 3. MCP Server as Single Source of Truth

Chat API uses internal MCP client to connect to own MCP server (`http://localhost:8002/mcp`).

**Why:**
- Tools defined once, used by both Claude Desktop and Chat API
- New tools automatically available (zero config)
- Global singleton, lazy init (~50ms first request, ~0ms after)

### 4. Two-Tier Filter Metadata

**Problem:** Full clinical attributes with options = ~1,500 tokens, but most queries don't need filters.

**Solution:**
- Router returns only attribute IDs (~300 tokens)
- Dedicated tool `get_clinical_attribute_values` provides details on-demand

**Why:** Token efficiency + accurate values (AI gets exact options like "Male"/"Female", not guessed)

### 5. Multi-Study Intelligent Selection

Router returns all matched studies (max 5) with metadata, lets AI auto-select based on user's original query.

**Example:**
- User: "lung adenocarcinoma with high grade"
- Router: matches LUAD, LUSC, returns both with metadata
- AI: sees "adenocarcinoma" → auto-selects LUAD

**Why:** Reduces friction, leverages AI semantic understanding, still allows manual selection when ambiguous.

### 6. Tiered Metadata Strategy

**Problem:** Keyword search can match 100+ studies, fetching full metadata for all is wasteful (API calls, tokens).

**Solution:** Return all matches but tier metadata depth by relevance:
```typescript
{
  totalCount: 42,
  studiesWithMetadata: [/* top 5 with clinicalAttributes + molecularProfiles */],
  otherStudies: [/* remaining 37 with studyId + name + sampleCount only */]
}
```

**Path-specific logic:**
- `studyKeywords` (search): Top 5 get metadata (sorted by relevance)
- `studyIds` (direct): All get metadata (user specified explicitly, usually ≤5)

**Why:** AI sees total scope (42 matches) but gets detailed context only for most relevant ones. Balances information completeness with efficiency.

### 7. AND vs OR Keyword Search

**Problem:** OR logic (`some`) caused noise - `["lung", "cancer"]` matched 333 studies (291 unrelated).

**Solution:** AND logic (`every`) - all keywords must match
```typescript
// Before: keywords.some(kw => searchText.includes(kw))  // OR
// After:  keywords.every(kw => searchText.includes(kw)) // AND
```

**Prompt guidance:** AI extracts specific terms only
- ✅ Good: `lung`, `TCGA`, `adenocarcinoma`, `MSK`
- ❌ Avoid: `cancer`, `tumor`, `study` (too generic, match 90% of studies)

**Result:** `["lung", "cancer"]` → 31 relevant matches (vs 333 before)

**Why:** Precision over recall. Top 5 ranked results are what matter, AND logic ensures they're actually relevant.

### 8. Manual Schema Maintenance

Location: `src/domain/studyView/schemas/`

Decision: Manual maintenance (not auto-generated).

**Why:**
- Source types have known issues
- Low usage rate (~20 of 121 schemas actually used)
- cBioPortal API is stable, manual precision preferred

### 9. Group Comparison NA Handling

**Problem:** Duplicate NA groups appearing in comparison results (frontend-inspired bug).

**Root Cause:** Frontend doesn't auto-create NA groups - it only creates groups for values in `clinicalAttributeValues` parameter (user-selected from UI). Our MCP tool must auto-decide, but early implementation created NA groups twice:

1. `groupSamplesByAttributeValue` assigned `value: 'NA'` for missing data → created first NA group
2. `createNAGroup` calculated NA samples incorrectly for patient-level attributes → created second NA group with wrong count

**Solution:** Three-part fix:
```typescript
// Fix 1: groupBuilder.ts - Don't assign 'NA', skip instead
const dataWithSamples = samples
    .map((sample) => {
        const datum = patientKeyToData[sample.uniquePatientKey!];
        if (!datum) return null;  // Skip, not 'NA'
        return { ...sample, value: datum.value };
    })
    .filter(item => item !== null);

// Fix 2: navigateToGroupComparison.ts - Filter out any "NA" groups defensively
.filter(([groupName]) => groupName.toLowerCase() !== 'na')

// Fix 3: createNAGroup - Check by patient keys for patient-level attributes
if (isPatientAttribute) {
    const patientsWithData = new Set(clinicalData.map(d => d.uniquePatientKey));
    samples.forEach(sample => {
        if (patientsWithData.has(sample.uniquePatientKey!)) {
            samplesWithData.add(`${sample.studyId}_${sample.sampleId}`);
        }
    });
}
```

**Why Patient-Level Needs Special Handling:**
- Clinical data for patient attributes has `patientId`/`uniquePatientKey`, no `sampleId`
- Multiple samples can belong to one patient → must map patient data to all patient's samples
- Original bug: compared `studyId_patientId` (from clinicalData) vs `studyId_sampleId` (from samples) → never matched

**Design Choice:** Default `includeNA: true` (different from frontend):
- Frontend: User manually selects groups in UI (NA is optional)
- MCP tool: Must auto-decide → default to "show all data" for transparency
- Users can override with `includeNA: false` when they specifically want to exclude missing data

**Numerical Attributes:** ✅ RESOLVED (2026-02-02)
- NUMBER datatype now uses automatic quartile binning (4 equal-sized groups)

**NA Group Counting:** ✅ RESOLVED (2026-02-02)
- NA group now counts toward 20-group limit (max 20 total)

## Known Issues & Limitations

**API Quality Issues:**
- `/api/studies/{id}` has allSampleCount bug (returns 1)
- `/api/column-store/studies/{id}` returns 404
- Workaround: Use getAllStudies (column-store) for accurate data

**Not Implemented:**
- StudyView URL parameters: sharedGroups, sharedCustomData, geneset_list
- Tool approval, strict mode schema validation

**Platform-specific:**
- LibreChat doesn't display tool calls in UI (tools work, but progress not visible to user)

## Development

**Build:**
- `npm run build` - Compile to dist/
- `npm run dev` - Run with tsx (no build needed)

**Claude Desktop config:**
- Path: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Entry point: `dist/server/index.js` (NOT `dist/index.js`)
- Must use absolute path, restart Claude Desktop after changes

**Adding tools:**
1. Create tool in `src/domain/<page>/tool.ts`
2. Register in `src/server/mcp/toolRegistry.ts`
3. Done (Chat API auto-syncs via MCP client)
