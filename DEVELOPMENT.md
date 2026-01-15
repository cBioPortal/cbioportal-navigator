# Development Status

## Current Status (2026-01-15)

**Latest Updates:**
- **Added structured logging system** - Comprehensive request/response/tool logging in Chat Completions API
  - Request tracking with unique IDs
  - Full message content logging (user input, AI responses)
  - Tool call and result logging with JSON formatting
  - Token usage statistics
  - Performance metrics (duration, timing)
  - See `src/server/chat/utils/logger.ts`

**Previous Updates (2026-01-13):**
- **Migrated to MCP client architecture** - Chat Completions now uses `@ai-sdk/mcp` to connect to own MCP server
- **Improved streaming support** - Tool calls now visible in streaming responses (using `fullStream`)
- Removed manual tool converter - tools automatically synced from MCP server
- MCP client connection overhead: ~50ms per request
- All 4 tools loaded successfully: resolve_and_route, navigate_to_studyview, navigate_to_patientview, navigate_to_resultsview

**Previous Updates (2026-01-12):**
- **LibreChat integration fully working** - Chat Completions API tested and verified
- Fixed API key priority handling for multi-provider support
- Modified `src/chat/config/auth.ts` to skip headers and use environment variables
- All 4 models working: claude-sonnet-4-5, claude-opus-4-5, gemini-2.0-flash, gpt-4o

**Earlier Changes (2026-01-09):**
- Fixed AI SDK 6.0 tool integration (parameters → inputSchema)
- Added tool call visibility in responses (OpenAI-compatible)

## Project Overview

MCP server that helps AI assistants navigate to cBioPortal pages by providing properly structured URL parameters and filter metadata.

**Supported Pages:**
- StudyView (full support: filters, plots, tabs)
- ResultsView (basic navigation)
- PatientView (basic navigation)

**Dual Mode Support:**
- MCP protocol (stdio/HTTP) for Claude Desktop and other MCP clients
- OpenAI-compatible Chat Completions API for LibreChat and similar platforms

## Architecture

### Directory Structure

```
src/
├── server/                   # Server layer (user-facing)
│   ├── index.ts             # Application entry point
│   ├── mcp/                 # MCP server infrastructure
│   │   ├── server.ts        # MCP server creation and setup
│   │   ├── toolRegistry.ts  # Tool registration
│   │   └── resourceRegistry.ts # Resource registration
│   └── chat/                # Chat Completions API (OpenAI-compatible)
│       ├── handler.ts       # Request handler (streaming & non-streaming)
│       ├── mcp-client/      # MCP client integration
│       │   ├── client.ts    # MCP client configuration and creation
│       │   └── toolsLoader.ts # Tools loading from MCP server
│       ├── providers/       # Multi-provider support (Anthropic/Google/OpenAI)
│       ├── config/          # API key resolution logic
│       ├── schemas.ts       # Request/response schemas
│       └── utils/           # Error handling utilities
│
├── domain/                  # Domain layer (business logic)
│   ├── shared/              # Shared types and utilities for all domain tools
│   │   ├── types.ts         # MCP tool parameter and response types
│   │   ├── responses.ts     # Response builders for MCP tools
│   │   └── validators.ts    # Parameter validation utilities
│   ├── router/              # Main routing tool
│   │   └── tool.ts          # resolve_and_route tool
│   ├── studyView/           # StudyView domain
│   │   ├── tool.ts          # navigate_to_studyview
│   │   ├── urlBuilder.ts    # URL construction logic
│   │   ├── tabValidator.ts  # Tab availability validation
│   │   ├── schemas/         # Manually maintained Zod schemas
│   │   └── resources/       # MCP resources (clinical attributes, case lists, etc.)
│   ├── patientView/         # PatientView domain
│   │   ├── tool.ts          # navigate_to_patientview
│   │   └── urlBuilder.ts    # URL construction logic
│   └── resultsView/         # ResultsView domain
│       ├── tool.ts          # navigate_to_resultsview
│       └── urlBuilder.ts    # URL construction logic
│
└── infrastructure/          # Infrastructure layer (API-facing)
    ├── api/                 # cBioPortal API clients
    │   ├── client.ts        # Main API client
    │   └── studyViewData.ts # StudyView-specific API calls
    ├── resolvers/           # Entity resolvers
    │   ├── studyResolver.ts # Study search and validation
    │   ├── geneResolver.ts  # Gene validation
    │   └── profileResolver.ts # Molecular profile lookup
    └── utils/               # Core infrastructure utilities
        ├── config.ts        # Configuration management (baseUrl, protocol)
        └── urlBuilder.ts    # Core URL construction utilities
```

**Design Principles:**
- **Three-layer architecture**: Server (user-facing) → Domain (business logic) → Infrastructure (API-facing)
- **Domain-driven organization**: Each cBioPortal page type (studyView, patientView, resultsView) is self-contained with tool + logic + schemas
- **MCP server as single source of truth**: Chat API uses MCP client to load tools from MCP server
- **Server-side tool execution**: Zero configuration for clients (tools auto-synced via MCP)
- **Clear separation of concerns**:
  - Server layer handles protocols and API endpoints
  - Domain layer contains pure business logic (cBioPortal-specific)
  - Infrastructure layer provides cross-cutting utilities and external API access

## Chat Completions API

### Overview

OpenAI-compatible endpoint (`/v1/chat/completions`) with automatic server-side tool execution.

**Key Features:**
- Multi-provider support (Anthropic, Google, OpenAI)
- Auto-detection from model name (claude-* → Anthropic, gemini-* → Google, gpt-* → OpenAI)
- Streaming and non-streaming responses
- Tool call transparency (includes `tool_calls` in responses)

**Available Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/chat/completions` | POST | Chat completions with tool calling |
| `/v1/models` | GET | List available models |
| `/health` | GET | Health check |
| `/mcp` | POST | MCP protocol endpoint |

### Implementation Details

**MCP Client Integration** (`src/chat/mcp/`):
- Uses `@ai-sdk/mcp` package to connect to own MCP server (`http://localhost:8002/mcp`)
- `client.ts`: MCP client configuration and connection management
- `toolsLoader.ts`: Loads tools from MCP server via `client.tools()`
- Automatic tool synchronization (no manual conversion needed)
- Connection overhead: ~50ms per request (44ms connection + 7ms tools loading)

**Request Handler** (`src/chat/handler.ts`):
- Uses AI SDK's `generateText()` / `streamText()`
- Automatic multi-turn tool execution (max 10 steps)
- Returns OpenAI-compatible responses
- **Streaming improvements**: Uses `fullStream` instead of `textStream` to include tool call deltas

**Streaming Support**:
- Text deltas: Incremental text content streaming
- Tool calls: Full tool invocation details in streaming responses
- Tool results: Logged to console for debugging
- OpenAI-compatible format for LibreChat and other clients

**Provider Factory** (`src/chat/providers/factory.ts`):
- Auto-detects provider from model name pattern matching
- See "API Key Resolution" section below for key handling

### Model Aliases

Using stable aliases to avoid manual version updates:
- `claude-sonnet-4-5` → latest Sonnet
- `claude-opus-4-5` → latest Opus
- `gemini-2.0-flash` → latest Flash
- `gpt-4o` → OpenAI's recommended model

## API Key Resolution for Multi-Provider Support

### Challenge

Navigator supports multiple AI providers, but LibreChat's custom endpoint configuration only allows a single `apiKey` field. Standard OpenAI-compatible servers use the Authorization header for authentication, which creates a conflict.

### Solution

Modified `src/chat/config/auth.ts` to skip Authorization headers and always use environment variables:

**Priority order:**
1. Request body `api_key` field (for testing/debugging only)
2. ~~Headers (Authorization/X-API-Key)~~ **← SKIPPED**
3. Environment variables (primary source)

**Key implementation:**
```typescript
// src/chat/config/auth.ts
export function resolveApiKey(provider: Provider, bodyKey?: string, headers?: Record<string, string>) {
    if (bodyKey) return bodyKey;

    // Skip headers - LibreChat sends single key, but we support multiple providers
    // Use environment variables to select correct key based on detected provider

    const envKey = process.env[ENV_VAR_MAPPING[provider]];
    if (envKey) return envKey;

    throw new InvalidAPIKeyError(provider);
}
```

### How It Works

1. LibreChat sends `Authorization: Bearer dummy` to satisfy configuration requirements
2. Navigator **ignores** the header value
3. Navigator detects provider from model name (e.g., `claude-sonnet-4-5` → anthropic)
4. Navigator uses the appropriate environment variable (`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, or `OPENAI_API_KEY`)

**Benefits:**
- Single endpoint configuration supports all providers
- API keys managed via environment variables (more secure)
- Automatic provider selection based on model name
- No need for multiple endpoint configurations

## MCP Client Architecture

### Overview

The Chat Completions API now uses an **internal MCP client** to connect to its own MCP server, creating a clean separation between:
- **MCP Server** (`/mcp` endpoint): Source of truth for tools and resources
- **MCP Client** (`src/chat/mcp/`): Lightweight connection manager
- **Chat Completions Handler**: Orchestrates LLM requests with auto-loaded tools

### Design Rationale

**Why MCP Client?**
1. **Single source of truth**: MCP server defines tools once, both Claude Desktop and Chat API use them
2. **Automatic synchronization**: New tools in MCP server → instantly available in Chat API
3. **Cleaner architecture**: No manual tool conversion code to maintain
4. **Resource access**: Enables future use of MCP resources (clinical attributes, case lists, etc.)

### Connection Flow

```
Chat Completions Request
    ↓
Handler creates MCP client
    ↓
Connect to http://localhost:8002/mcp (HTTP transport)
    ↓
Load tools via client.tools()
    ↓
Pass tools to generateText() / streamText()
    ↓
Close MCP client
    ↓
Return response
```

### Performance Characteristics

| Metric | Value | Impact |
|--------|-------|--------|
| Connection time | ~44ms | Per request |
| Tools loading | ~7ms | Per request |
| **Total overhead** | **~50ms** | Acceptable |
| Tools cached | No | Short-lived client |
| Connection reused | No | Stateless design |

### Environment Configuration

```bash
# MCP Server URL (optional, auto-detected)
MCP_SERVER_URL=http://localhost:8002/mcp

# Docker environment flag (auto-set in containers)
DOCKER_ENV=false
```

### Error Handling

If MCP client connection fails:
- Chat Completions request returns 500 error
- Error logged with `[MCP Client]` prefix
- No fallback (by design - fail fast)

**Common errors:**
- `ECONNREFUSED`: MCP server not running (ensure HTTP mode enabled)
- `Timeout`: MCP server slow to respond (check server logs)
- `Protocol mismatch`: MCP SDK version incompatibility (verify @ai-sdk/mcp version)

### Future Enhancements

1. **MCP Resources Integration**:
   - Add `client.listResources()` / `client.readResource()` calls
   - Inject resource data into system messages as context
   - Example: Auto-load clinical attributes when study is mentioned

2. **Connection Pooling** (if needed):
   - Reuse MCP client across requests
   - Implement TTL-based connection management
   - Only add if performance analysis shows significant benefit

3. **Resource Caching**:
   - Cache frequently accessed resources (e.g., TCGA study metadata)
   - Reduce repeated API calls to cBioPortal
   - TTL-based invalidation

## Testing

### Local Development Testing

See README.md Option 1 for local MCP testing with Claude Desktop.

For HTTP endpoint testing:
```bash
npm run build
MCP_TRANSPORT=http PORT=8002 npm start

# Test endpoint
curl http://localhost:8002/health
curl http://localhost:8002/v1/models
```

### LibreChat Integration Testing

See README.md Option 2 for complete Docker setup instructions.

**Quick verification:**
```bash
# Check Navigator is running
docker ps | grep navigator

# View logs
docker compose logs -f cbioportal-navigator

# Test health
curl http://localhost:8002/health
```

## Schema Management

### Location
`src/studyView/schemas/`

### Approach
Manual maintenance (switched from auto-generation)

### Rationale
- Source types have known issues (optional/required XOR constraints)
- Low usage rate (~20 of 121 auto-generated schemas actually used)
- cBioPortal API is stable, manual precision preferred over automation

### Files
- `filters.ts` - StudyViewFilter and nested types
- `urlParams.ts` - Plots configuration

### Maintenance
Test with actual API calls when updating schemas.

## Development Workflow

**Schema updates:**
- Edit `src/domain/studyView/schemas/filters.ts`
- Test with actual cBioPortal API calls
- Verify URL generation works correctly

**New tools:**
- Add tool definition to `src/domain/<page>/tool.ts`
- Register in `src/server/mcp/toolRegistry.ts`
- **No Chat API changes needed** - tools automatically available via MCP client

**New domains:**
- Create `src/domain/<newPage>/` directory
- Add `tool.ts` (MCP tool definition + handler)
- Add business logic files (urlBuilder.ts, etc.)
- Register tool in `src/server/mcp/toolRegistry.ts`

**Chat API changes:**
- Update `src/server/chat/handler.ts` or related files
- Run `npm run build`
- Test with both streaming and non-streaming requests

**Infrastructure changes:**
- Add shared utilities to `src/infrastructure/utils/`
- Add API clients to `src/infrastructure/api/`
- Add resolvers to `src/infrastructure/resolvers/`

**Build commands:**
- `npm run build` - Compile TypeScript to dist/
- `npm run watch` - Auto-rebuild on file changes
- `npm run dev` - Run with tsx (no build needed)

## Planned Enhancements

### Router-Provided Filter Metadata (High Priority)

**Problem:**
When users request filters (e.g., "show lung cancer with high tumor grade"), the AI needs to know:
- What clinical attributes are available for filtering (e.g., `TUMOR_GRADE`, `AGE`, `SEX`)
- What values/options each attribute can have (e.g., SEX: ["Male", "Female"])
- What molecular profiles exist for gene filtering
- Valid case lists for sample selection

Currently, this information is only available through MCP resources, which require manual injection into context.

**Solution:**
Two-tier approach to optimize token usage while providing filter metadata when needed:

1. **Router returns lightweight metadata** - ID lists and small datasets
2. **New dedicated tool for clinical attributes details** - On-demand retrieval of datatype and options

**Design Rationale:**

Token consumption analysis:
- Full clinical attributes with options: ~1,500 tokens (30-50 attributes × 8 options avg)
- Molecular profiles: ~200 tokens (5-15 profiles)
- Case lists: ~100 tokens (5-10 lists)

**Issue:** Most queries don't need filters, so including full clinical attribute details in every router call wastes tokens.

**Solution:** Split data by size and usage pattern:
- **Lightweight data** (case lists, molecular profiles): Return directly in router (~300 tokens)
- **Heavy data** (clinical attributes with options): Return only IDs in router, provide dedicated tool for details

**Implementation Plan:**

1. **Modify `src/domain/router/tool.ts`:**
   ```typescript
   // Current return format
   {
     studyId: "luad_tcga",
     targetPage: "studyview"
   }

   // New return format with lightweight metadata
   {
     studyId: "luad_tcga",
     targetPage: "studyview",
     metadata: {
       // Only IDs for clinical attributes (AI knows what's available)
       clinicalAttributeIds: ["AGE", "SEX", "TUMOR_GRADE", "TUMOR_STAGE", ...],

       // Full info for small datasets (no options needed)
       caseLists: [
         {
           sampleListId: "luad_tcga_all",
           name: "All Tumors",
           description: "All tumor samples",
           category: "all_cases_in_study",
           sampleCount: 566
         },
         // ... 5-10 case lists
       ],

       molecularProfiles: [
         {
           molecularProfileId: "luad_tcga_mutations",
           name: "Mutations",
           molecularAlterationType: "MUTATION_EXTENDED",
           datatype: "MAF"
         },
         {
           molecularProfileId: "luad_tcga_gistic",
           name: "Copy Number Alterations",
           molecularAlterationType: "COPY_NUMBER_ALTERATION",
           datatype: "DISCRETE"
         },
         // ... 5-15 molecular profiles
       ]
     }
   }
   ```

   **Token cost:** ~300-400 tokens (vs ~2,000 with full clinical attributes)

2. **Create new tool `src/domain/studyView/tools/getClinicalAttributeOptions.ts`:**
   ```typescript
   // Tool: get_clinical_attribute_options
   // Purpose: Get detailed info (datatype + options) for specific clinical attributes

   // Input
   {
     studyId: "luad_tcga",
     attributeIds: ["SEX", "TUMOR_STAGE"]  // AI only requests what it needs
   }

   // Output
   {
     attributes: [
       {
         attributeId: "SEX",
         datatype: "STRING",
         options: ["Male", "Female"]
       },
       {
         attributeId: "TUMOR_STAGE",
         datatype: "STRING",
         options: ["Stage I", "Stage IA", "Stage IB", "Stage II", ...]
       }
     ]
   }
   ```

   **Implementation details:**
   - Use `studyViewDataClient.getClinicalAttributes([studyId])` with SUMMARY projection
   - Filter to requested attributeIds
   - Use `studyViewDataClient` batch method to fetch options for all requested attributes in **one API call**:
     ```typescript
     fetchClinicalDataCountsUsingPOST({
       attributes: attributeIds.map(id => ({ attributeId: id, values: [] })),
       studyViewFilter: { studyIds: [studyId] }
     })
     ```
   - **Optimization:** Only fetch options for STRING/BOOLEAN types (NUMBER types don't need predefined options)
   - Return combined data: `{ attributeId, datatype, options }`

3. **Workflow Examples:**

   **Simple query (no filters needed):**
   ```
   User: "Show me TCGA lung cancer study"
     ↓
   AI calls: resolve_and_route({ targetPage: 'study', studyKeywords: ['TCGA', 'lung'] })
     ↓
   Router returns: studyId + lightweight metadata (~300 tokens)
     ↓
   AI calls: navigate_to_studyview({ studyIds: ["luad_tcga"] })
     ↓
   Done! (No extra tool call needed)
   ```

   **Query with filters:**
   ```
   User: "Show me TCGA lung cancer patients with high tumor grade"
     ↓
   AI calls: resolve_and_route({ targetPage: 'study', studyKeywords: ['TCGA', 'lung'] })
     ↓
   Router returns: {
     studyId: "luad_tcga",
     metadata: {
       clinicalAttributeIds: ["AGE", "SEX", "TUMOR_GRADE", ...],  // AI sees TUMOR_GRADE exists
       ...
     }
   }
     ↓
   AI calls: get_clinical_attribute_options({
     studyId: "luad_tcga",
     attributeIds: ["TUMOR_GRADE"]  // Only request what's needed
   })
     ↓
   Returns: {
     attributes: [{
       attributeId: "TUMOR_GRADE",
       datatype: "STRING",
       options: ["G1", "G2", "G3", "G4", "GX"]
     }]
   }
     ↓
   AI knows: high grade = G3, G4
     ↓
   AI calls: navigate_to_studyview({
     studyIds: ["luad_tcga"],
     filterJson: {
       clinicalDataFilters: [{
         attributeId: "TUMOR_GRADE",
         values: [{ value: "G3" }, { value: "G4" }]
       }]
     }
   })
   ```

**Benefits:**
- **Token efficiency:** Router only adds ~300 tokens (vs ~2,000 with full clinical attributes)
- **On-demand details:** AI only fetches clinical attribute options when constructing filters
- **Accurate filtering:** AI gets exact options (e.g., "Male"/"Female" not guessed as "M"/"F")
- **Fast simple queries:** No overhead for queries without filters
- **Batch efficiency:** Single API call to fetch options for multiple attributes

**Performance Considerations:**
- Router overhead: ~200-300ms (clinical attribute IDs + case lists + molecular profiles)
- New tool overhead: ~150-250ms (options for requested attributes only)
- Total for filter queries: ~400-500ms (acceptable)
- Simple queries (no filters): ~200-300ms (no extra tool call)

**Files to Create/Modify:**
- `src/domain/router/tool.ts` - Add lightweight metadata fetching
- `src/domain/studyView/tools/getClinicalAttributeOptions.ts` - New tool for detailed attribute info
- `src/infrastructure/api/studyViewData.ts` - Add batch options fetching method (if not exists)
- `src/server/mcp/toolRegistry.ts` - Register new tool

**MCP Resources Status:**
- Resources (`clinicalAttributes`, `caseLists`, `molecularProfiles`) remain registered for potential future use
- This enhancement makes them **redundant for the Chat API use case**
- Resources are still useful for MCP clients with UI (e.g., Claude Desktop with @ mention system)

## Known Limitations

**Not Implemented:**
- StudyView URL parameters: sharedGroups, sharedCustomData, geneset_list
- **MCP Resources usage in Chat API**: Available via `client.listResources()` / `client.readResource()` but not yet integrated
- Conversation history management in Chat API
- Tool approval (`needsApproval` parameter)
- Strict mode schema validation (`strict` parameter)
- MCP client connection pooling (short-lived connections per request)

**Platform-specific:**
- Tool approval and strict mode are AI SDK features not currently utilized
- May be useful for future audit trails or stricter validation requirements
- MCP Resources can be accessed but need manual injection into messages (not auto-integrated like tools)
