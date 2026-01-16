# Project Context

## Current Status

MCP server for AI-assisted cBioPortal navigation with dual mode support:
- MCP protocol (stdio/HTTP) for Claude Desktop and remote MCP agents

**Latest update:** Column-store integration for performance optimization (2026-01-16)
- Implemented transparent URL rewriting to route API calls to column-store endpoints
- Whitelist approach: 21 internalApi endpoints + studies/samples endpoints
- Fixed allSampleCount bug: enabled dual sorting (keyword match + sample count)
- Files: `cbioportalClient.ts`, `resolveAndRoute.ts`

**Previous update:** Response system refactoring for multi-study support (2026-01-16)
- Removed ambiguity response pattern (AI now handles multi-study selection intelligently)
- Split response types: NavigationResponse (URL-based) vs DataResponse (data-based)
- Router returns all matched studies with individual metadata for AI to auto-select
- Files: `types.ts`, `responses.ts`, `router/tool.ts`, all navigation tools

**Previous update:** Code cleanup (2026-01-16)
- Removed Chat Completions API and AI SDK dependencies
- Simplified to pure MCP server for integration with external agents
- Files: removed `src/server/chat/`, updated `index.ts`, `package.json`

**Supported Pages:**
- StudyView (full support: filters, plots, tabs)
- ResultsView (basic navigation)
- PatientView (basic navigation)

## Architecture

### Three-Layer Design

```
src/
├── server/                   # Server layer (user-facing)
│   ├── index.ts             # Application entry point
│   └── mcp-server/          # MCP server infrastructure
│       ├── server.ts        # MCP server creation and setup
│       └── toolRegistry.ts  # Tool registration
│
├── domain/                  # Domain layer (business logic)
│   ├── shared/              # Shared types and utilities
│   ├── router/              # Main routing tool (resolve_and_route)
│   ├── studyViewPage/       # StudyView domain
│   │   ├── navigateToStudyView.ts        # navigate_to_studyview tool
│   │   ├── getClinicalAttributeValues.ts # get_clinical_attribute_values tool
│   │   ├── buildStudyUrl.ts              # URL construction logic
│   │   └── schemas/                      # Manually maintained Zod schemas
│   ├── patientViewPage/     # PatientView domain
│   └── resultsViewPage/     # ResultsView domain
│
└── infrastructure/          # Infrastructure layer (API-facing)
    ├── api/                 # cBioPortal API clients
    ├── resolvers/           # Entity resolvers (study, gene, profile)
    └── utils/               # Core utilities (config, urlBuilder)
```

**Design Principles:**
- Server (user-facing) → Domain (business logic) → Infrastructure (API-facing)
- Domain-driven: Each page type is self-contained
- Pure MCP server for integration with external agents

## Key Design Decisions

### 1. Two-Tier Filter Metadata

**Problem:** When users request filters (e.g., "show lung cancer with high tumor grade"), AI needs:
- Available clinical attributes (e.g., `TUMOR_GRADE`, `AGE`, `SEX`)
- Valid values for each attribute (e.g., SEX: ["Male", "Female"])
- Molecular profiles and case lists

Full clinical attributes with options = ~1,500 tokens. Most queries don't need filters, so including this in every router call wastes tokens.

**Solution:** Split by size and usage pattern:
- **Lightweight data** (case lists, molecular profiles): Return directly in router (~300 tokens)
- **Heavy data** (clinical attributes with options): Return only IDs in router, provide dedicated tool for details

**Why:**
- Token efficiency: Router adds ~300 tokens instead of ~2,000
- On-demand: AI only fetches attribute details when constructing filters
- Accurate: AI gets exact options (e.g., "Male"/"Female" not guessed as "M"/"F")
- Fast: No overhead for queries without filters

**Implementation:**
- Router returns `metadata.clinicalAttributeIds` (IDs only)
- New tool `get_clinical_attribute_values` provides datatype and options on demand
- Single batch API call for multiple attributes

### 2. Manual Schema Maintenance

**Location:** `src/domain/studyView/schemas/`

**Decision:** Manual maintenance instead of auto-generation from cBioPortal API types.

**Why:**
- Source types have known issues (optional/required XOR constraints)
- Low usage rate (~20 of 121 auto-generated schemas actually used)
- cBioPortal API is stable, manual precision preferred over automation
- Easier to maintain small subset of actually-used schemas

### 3. Response Type System

**Problem:** Different tools serve different purposes - navigation tools return URLs, data tools return structured information. Using a single `SuccessResponse` type was ambiguous and led to inconsistent response structures.

**Solution:** Split into two distinct response types with clear semantics.

**Response Types:**
- **NavigationResponse**: For tools that generate cBioPortal URLs
  - Structure: `{ success: true, message, url, data }`
  - Used by: `navigate_to_studyview`, `navigate_to_patientview`, `navigate_to_resultsview`
  - Helper: `createNavigationResponse(url, data?)`

- **DataResponse**: For tools that return data without URLs
  - Structure: `{ success: true, message, data }`
  - Used by: `resolve_and_route`, `get_clinical_attribute_values`
  - Helper: `createDataResponse(message, data)`

- **ErrorResponse**: For all errors
  - Structure: `{ success: false, error, details? }`
  - Helper: `createErrorResponse(error, details?)`

**Why:**
- Clear semantic distinction between navigation and data tools
- Consistent response structure within each category
- Better type safety and IDE autocomplete
- Legacy `createSuccessResponse` maintained for backward compatibility

**Implementation:**
- Type definitions in `src/domain/shared/types.ts`
- Helper functions in `src/domain/shared/responses.ts`

### 4. Multi-Study Intelligent Selection

**Problem:** When router matched multiple studies (e.g., "lung cancer" → LUAD, LUSC, SCLC), the old design returned an ambiguity error forcing explicit user selection. This added friction and prevented AI from using context to auto-select.

**Solution:** Return all matched studies with individual metadata, let AI decide based on user's original query.

**Implementation:**
- Router no longer returns ambiguity responses
- All matched studies returned with complete metadata for each
- `needsStudySelection` flag: `false` for single match, `true` for multiple matches
- When `true`, AI reviews user's original query to auto-select if clear (e.g., "adenocarcinoma" → LUAD)
- If ambiguous, AI asks user to choose

**Example Flow:**
```
User: "show me lung adenocarcinoma with high tumor grade"
→ Router matches: LUAD, LUSC
→ Returns: needsStudySelection=true, studies=[{LUAD+metadata}, {LUSC+metadata}]
→ AI sees "adenocarcinoma" in query → auto-selects LUAD
→ Calls navigate_to_studyview with LUAD metadata
```

**Why:**
- Reduces user friction (fewer back-and-forth clarifications)
- Leverages AI's semantic understanding
- Still allows manual selection when truly ambiguous
- Metadata preloaded for instant navigation

**Token Cost:**
- Single study: ~500 tokens (1 study × metadata)
- Multi-study: ~1500-2500 tokens (3-5 studies × metadata)
- Acceptable cost for improved UX

### 5. Column-Store Integration

**Problem:** Standard cBioPortal API endpoints had performance issues and data quality bugs:
- `allSampleCount` incorrectly returned `1` for all studies (broke relevance sorting)
- Clinical data queries slower than necessary

**Solution:** Transparent URL rewriting to route specific endpoints to column-store backend.

**Implementation:**
- Whitelist-based approach (only endpoints with column-store implementations)
- Override `request` method in API clients to rewrite URLs: `/api/xxx` → `/api/column-store/xxx`
- 21 internalApi endpoints (StudyView queries) + studies/samples endpoints
- Based on cbioportal-frontend's `proxyColumnStore` pattern

**Why:**
- Zero business logic changes (transparent to calling code)
- Centralized configuration (whitelist in one place)
- Performance: Faster queries via columnar storage
- Data quality: Fixed allSampleCount bug, enabled dual sorting (keyword match + sample count)

**Study Search Sorting:**
- Primary: Keyword match count (relevance)
- Secondary: Sample count (statistical significance)
- Example: "TCGA lung adenocarcinoma" → `luad_tcga` (3 matches, 1166 samples) not `nsclc_mskimpact_2022` (1 match, 1800 samples)

## Known Limitations

**Not Implemented:**
- StudyView URL parameters: sharedGroups, sharedCustomData, geneset_list
- Tool approval (`needsApproval` parameter)
- Strict mode schema validation (`strict` parameter)

## Development Workflow

**New tools:**
- Add tool definition to `src/domain/<page>/<toolName>.ts`
- Register in `src/server/mcp-server/toolRegistry.ts`

**New domains:**
- Create `src/domain/<newPage>/` directory
- Add tool files (MCP tool definitions + handlers)
- Add business logic files (buildUrl.ts, etc.)
- Register tools in `src/server/mcp-server/toolRegistry.ts`

**Schema updates:**
- Edit `src/domain/studyView/schemas/filters.ts`
- Test with actual cBioPortal API calls

**Build commands:**
- `npm run build` - Compile TypeScript to dist/
- `npm run watch` - Auto-rebuild on file changes
- `npm run dev` - Run with tsx (no build needed)
