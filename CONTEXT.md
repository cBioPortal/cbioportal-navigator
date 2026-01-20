# Project Context

## Current Status

MCP server for AI-assisted cBioPortal navigation with dual mode support:
- MCP protocol (stdio/HTTP) for Claude Desktop and other MCP clients
- OpenAI-compatible Chat Completions API for LibreChat and similar platforms

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

**Previous update:** Global singleton MCP client implementation (2026-01-15)
- Fixed "closed client" errors by persisting MCP client for server lifetime
- Performance: First request ~50ms overhead, subsequent requests ~0ms
- Files: `toolsLoader.ts`, `handler.ts`, `index.ts`

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
│   ├── mcp/                 # MCP server infrastructure
│   │   ├── server.ts        # MCP server creation and setup
│   │   └── toolRegistry.ts  # Tool registration
│   └── chat/                # Chat Completions API (OpenAI-compatible)
│       ├── handler.ts       # Request handler (streaming & non-streaming)
│       ├── mcp-client/      # MCP client integration
│       │   ├── client.ts    # MCP client configuration
│       │   └── toolsLoader.ts # Tools loading from MCP server (global singleton)
│       ├── providers/       # Multi-provider support (Anthropic/Google/OpenAI)
│       ├── config/          # API key resolution logic
│       └── schemas.ts       # Request/response schemas
│
├── domain/                  # Domain layer (business logic)
│   ├── shared/              # Shared types and utilities
│   ├── router/              # Main routing tool (resolve_and_route)
│   ├── studyView/           # StudyView domain
│   │   ├── tool.ts          # navigate_to_studyview
│   │   ├── urlBuilder.ts    # URL construction logic
│   │   ├── schemas/         # Manually maintained Zod schemas
│   │   └── tools/           # Additional tools
│   │       └── getClinicalAttributeValues.ts
│   ├── patientView/         # PatientView domain
│   └── resultsView/         # ResultsView domain
│
└── infrastructure/          # Infrastructure layer (API-facing)
    ├── api/                 # cBioPortal API clients
    ├── resolvers/           # Entity resolvers (study, gene, profile)
    └── utils/               # Core utilities (config, urlBuilder)
```

**Design Principles:**
- Server (user-facing) → Domain (business logic) → Infrastructure (API-facing)
- Domain-driven: Each page type is self-contained
- MCP server as single source of truth for tools
- Server-side tool execution (zero client configuration)

## Key Design Decisions

### 1. MCP Server as Single Source of Truth

**Problem:** Chat Completions API needed tool definitions. Should we duplicate tool definitions or reuse MCP server's tools?

**Solution:** Chat API uses internal MCP client to connect to own MCP server (`http://localhost:8002/mcp`).

**Why:**
- Tools defined once in MCP server, used by both Claude Desktop and Chat API
- Automatic synchronization: new tools instantly available
- No manual tool conversion code to maintain
- Enables future use of MCP resources

**Implementation:**
- Global singleton MCP client in `toolsLoader.ts`
- Lazy initialization on first request (~50ms)
- Cached tools for subsequent requests (~0ms)
- Automatic error recovery via `resetMCPClient()`

### 2. API Key Resolution for Multi-Provider Support

**Problem:** Navigator supports multiple AI providers (Anthropic, Google, OpenAI), but LibreChat's custom endpoint only allows single `apiKey` field in Authorization header.

**Solution:** Skip Authorization headers entirely, use environment variables exclusively.

**Why:**
- Single endpoint configuration supports all providers
- Auto-detect provider from model name (e.g., `claude-sonnet-4-5` → Anthropic)
- Select appropriate env var: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, or `OPENAI_API_KEY`
- More secure (keys in env, not passed through requests)

**Implementation:** `src/chat/config/auth.ts` ignores Authorization header, uses `ENV_VAR_MAPPING[provider]`.

### 3. Two-Tier Filter Metadata

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

### 4. Manual Schema Maintenance

**Location:** `src/domain/studyView/schemas/`

**Decision:** Manual maintenance instead of auto-generation from cBioPortal API types.

**Why:**
- Source types have known issues (optional/required XOR constraints)
- Low usage rate (~20 of 121 auto-generated schemas actually used)
- cBioPortal API is stable, manual precision preferred over automation
- Easier to maintain small subset of actually-used schemas

### 5. Response Type System

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

### 6. Multi-Study Intelligent Selection

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

### 7. Column-Store Integration

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

### 8. Chat Completions API Architecture

**Key Features:**
- Multi-provider support (Anthropic, Google, OpenAI)
- Auto-detection from model name pattern
- Streaming and non-streaming responses
- Server-side tool execution (tools auto-synced via MCP client)

**Model Aliases:** Using stable aliases to avoid manual version updates
- `claude-sonnet-4-5`
- `gemini-3-flash`
- `gpt-5.2`

**Available Endpoints:**
- `/v1/chat/completions` - Chat completions with tool calling
- `/v1/models` - List available models
- `/health` - Health check
- `/mcp` - MCP protocol endpoint

## Known Limitations

**Not Implemented:**
- StudyView URL parameters: sharedGroups, sharedCustomData, geneset_list
- Tool approval (`needsApproval` parameter)
- Strict mode schema validation (`strict` parameter)

**Platform-specific:**
- LibreChat custom endpoints do not display tool calls in UI (LibreChat limitation)
  - Tools execute successfully but users only see final results
  - Tool execution progress logged server-side only

## Development Workflow

**New tools:**
- Add tool definition to `src/domain/<page>/tool.ts`
- Register in `src/server/mcp/toolRegistry.ts`
- No Chat API changes needed (tools automatically available via MCP client)

**New domains:**
- Create `src/domain/<newPage>/` directory
- Add `tool.ts` (MCP tool definition + handler)
- Add business logic files (urlBuilder.ts, etc.)
- Register tool in `src/server/mcp/toolRegistry.ts`

**Schema updates:**
- Edit `src/domain/studyView/schemas/filters.ts`
- Test with actual cBioPortal API calls

**Build commands:**
- `npm run build` - Compile TypeScript to dist/
- `npm run watch` - Auto-rebuild on file changes
- `npm run dev` - Run with tsx (no build needed)
