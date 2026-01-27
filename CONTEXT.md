# Project Context

## Current Status

MCP server for AI-assisted cBioPortal navigation with dual mode support:
- MCP protocol (stdio/HTTP) for Claude Desktop and other MCP clients
- OpenAI-compatible Chat Completions API for LibreChat

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
