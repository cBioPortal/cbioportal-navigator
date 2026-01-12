# Development Status

## Current Status (2026-01-12)

**Latest Updates:**
- **LibreChat integration fully working** - Chat Completions API tested and verified
- Fixed API key priority handling for multi-provider support
- Modified `src/chat/config/auth.ts` to skip headers and use environment variables
- All 4 models working: claude-sonnet-4-5, claude-opus-4-5, gemini-2.0-flash, gpt-4o

**Recent Changes (2026-01-09):**
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
├── chat/                     # Chat Completions API (OpenAI-compatible)
│   ├── handler.ts           # Request handler (streaming & non-streaming)
│   ├── tools/converter.ts   # MCP tools → AI SDK converter
│   ├── providers/factory.ts # Multi-provider support (Anthropic/Google/OpenAI)
│   └── config/
│       └── auth.ts          # API key resolution logic
│
├── mcp/                      # MCP infrastructure
│   ├── router.ts            # resolve_and_route tool
│   ├── toolRegistry.ts      # Tool registration
│   └── resourceRegistry.ts  # Resource registration
│
├── studyView/               # StudyView domain
│   ├── mcp/tool.ts          # navigate_to_studyview
│   ├── schemas/             # Manually maintained Zod schemas
│   └── urlBuilder.ts
│
├── patientView/             # PatientView domain
├── resultsView/             # ResultsView domain
│
└── shared/                  # Shared infrastructure
    ├── api/client.ts        # cBioPortal API wrapper
    └── resolvers/           # Study/gene/profile resolvers
```

**Design Principles:**
- Domain-driven architecture (each page type is self-contained)
- 100% MCP tool reuse (no code duplication for Chat API)
- Server-side tool execution (zero configuration for clients)

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

**Tool Conversion** (`src/chat/tools/converter.ts`):
- Converts MCP tools to AI SDK format using `tool()` function
- Uses `inputSchema` (AI SDK 6.0 API) for parameter validation
- Reuses MCP handlers via `execute()` callback

**Request Handler** (`src/chat/handler.ts`):
- Uses AI SDK's `generateText()` / `streamText()`
- Automatic multi-turn tool execution (max 10 steps)
- Returns OpenAI-compatible responses

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
- Edit `src/studyView/schemas/filters.ts`
- Test with actual cBioPortal API calls
- Verify URL generation works correctly

**New tools:**
- Add to domain `mcp/tool.ts`
- Register in `src/mcp/toolRegistry.ts`
- Add corresponding Chat API converter if needed

**Chat API changes:**
- Update `src/chat/handler.ts` or related files
- Run `npm run build`
- Test with both streaming and non-streaming requests

**Build commands:**
- `npm run build` - Compile TypeScript to dist/
- `npm run watch` - Auto-rebuild on file changes
- `npm run dev` - Run with tsx (no build needed)

## Known Limitations

**Not Implemented:**
- StudyView URL parameters: sharedGroups, sharedCustomData, geneset_list
- MCP Resources Phase 2: detailed clinical data values per attribute
- Conversation history management in Chat API
- Tool approval (`needsApproval` parameter)
- Strict mode schema validation (`strict` parameter)

**Platform-specific:**
- Tool approval and strict mode are AI SDK features not currently utilized
- May be useful for future audit trails or stricter validation requirements
