# Development Status

## Current Status (2026-01-09)

**Latest Updates:**
- Fixed AI SDK 6.0 tool integration (parameters → inputSchema)
- Added tool call visibility in responses (OpenAI-compatible)
- LibreChat integration configured and ready for testing

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
│   └── config/              # System prompt, defaults
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
- Auto-detection from model name
- Streaming and non-streaming responses
- Tool call transparency (includes `tool_calls` in responses)

### Implementation

**Tool Conversion** (`src/chat/tools/converter.ts`):
```typescript
tool({
    title: mcpTool.title,
    description: mcpTool.description,
    inputSchema: zodObject,  // AI SDK 6.0 API
    execute: async (args) => {
        const result = await mcpTool.handler(args);  // Reuse MCP handler
        return extractTextContent(result);
    }
})
```

**Request Handler** (`src/chat/handler.ts`):
- Uses AI SDK's `generateText()` / `streamText()`
- Automatic multi-turn tool execution (max 10 steps)
- Returns OpenAI-compatible responses with tool call visibility

**Provider Factory** (`src/chat/providers/factory.ts`):
- Auto-detects provider from model name (claude-* / gemini-* / gpt-*)
- API key resolution: request body > headers > environment

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/chat/completions` | POST | Chat completions with tool calling |
| `/v1/models` | GET | List available models |
| `/health` | GET | Health check |
| `/mcp` | POST | MCP protocol endpoint |

### Model Aliases (Auto-updating)

Using stable aliases to avoid manual version updates:
- `claude-sonnet-4-5` (auto-updates to latest Sonnet)
- `claude-opus-4-5` (auto-updates to latest Opus)
- `gemini-2.0-flash` (auto-updates to latest Flash)
- `gpt-4o` (OpenAI's recommended model)

## Testing

### Local Testing

```bash
# Build
npm run build

# Start server
MCP_TRANSPORT=http PORT=8002 npm run dev

# Test chat completions
curl -X POST http://localhost:8002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -d '{
    "model": "claude-sonnet-4-5",
    "messages": [{"role": "user", "content": "Show me TCGA lung cancer"}]
  }'
```

### LibreChat Integration Testing

The Navigator service is integrated into LibreChat via Docker Compose. To test:

**Configuration files:**
- `/Users/fuzy/codebase/LibreChat/librechat.yaml` - Navigator endpoint config
- `/Users/fuzy/codebase/LibreChat/docker-compose.override.yml` - Service integration

**Test workflow:**
1. Build Navigator Docker image:
   ```bash
   cd /Users/fuzy/codebase/cbioportal-navigator
   docker build -t cbioportal-navigator:latest .
   ```

2. Start LibreChat with Navigator:
   ```bash
   cd /Users/fuzy/codebase/LibreChat
   docker-compose up -d
   ```

3. Access LibreChat UI and test Navigator integration:
   - URL: http://localhost:3080
   - Select Navigator endpoint from dropdown
   - Test queries like "Show me TCGA breast cancer study"

4. Check logs:
   ```bash
   docker-compose logs -f navigator
   ```

**Expected behavior:**
- Navigator appears as available endpoint in LibreChat
- Tool calls execute automatically on server
- Final response includes cBioPortal URLs

## Advanced Features (Optional)

### Tool Approval

Require user confirmation before executing tools:

```typescript
tool({
    needsApproval: true,  // or (input) => boolean
    ...
})
```

Use cases: sensitive operations, audit trails

### Strict Mode

Enable provider-native strict schema validation:

```typescript
tool({
    strict: true,
    ...
})
```

Supported: OpenAI, Anthropic (not Google Gemini)

Benefits: exact schema matching, fewer hallucinated parameters

## Schema Management

Location: `src/studyView/schemas/`

**Approach:** Manual maintenance (switched from auto-generation)

**Reasons:**
- Source types have known issues (optional/required XOR constraints)
- Low usage rate (~20 of 121 generated schemas used)
- API is stable, manual precision preferred

**Files:**
- `filters.ts` - StudyViewFilter and nested types
- `urlParams.ts` - Plots configuration

**Maintenance:** Test with actual API calls when updating

## Development Workflow

- **Schema updates:** Edit `src/studyView/schemas/filters.ts` and test
- **New tools:** Add to domain `mcp/tool.ts`, register in `toolRegistry.ts`
- **Chat API changes:** Update `src/chat/handler.ts`, rebuild, test

## Known Limitations

**Not Implemented:**
- StudyView parameters: sharedGroups, sharedCustomData, geneset_list
- MCP Resources Phase 2: detailed clinical data values per attribute
- Conversation history management in Chat API