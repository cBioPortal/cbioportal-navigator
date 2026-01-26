# cBioPortal Navigator

A Model Context Protocol (MCP) server that helps AI assistants navigate users to the right cBioPortal pages by resolving natural language queries into structured URLs.

## Overview

cBioPortal Navigator bridges the gap between natural language cancer genomics queries and cBioPortal's powerful visualization tools. It enables AI assistants like Claude to:

- Search and validate cancer studies, genes, and molecular profiles
- Resolve ambiguous queries (e.g., "TCGA lung cancer" → specific study selection)
- Build properly formatted cBioPortal URLs for StudyView, PatientView, and ResultsView
- Handle complex query parameters like gene lists, alteration types, and case sets

## Features

- **Smart Study Resolution**: Search studies by keywords or validate study IDs
- **Gene Validation**: Batch validate gene symbols against cBioPortal's database
- **Ambiguity Handling**: Returns multiple options when queries match several entities
- **Multi-Tool Architecture**: Main router tool + specialized navigation tools:
  - `route_to_target_page` - Intelligent router that directs to the right page type
  - `navigate_to_studyview` - Browse cancer study summaries and cohort analysis
  - `navigate_to_patientview` - View individual patient/sample detailed data
  - `navigate_to_resultsview` - Analyze gene alterations across samples (OncoPrint)
  - `navigate_to_group_comparison` - Compare clinical subgroups (survival, mutations, CNA, etc.)

## Project Structure

```
cbioportal-navigator/
├── src/
│   ├── server/                       # Server layer (user-facing)
│   │   ├── index.ts                  # Application entry point
│   │   ├── mcp/                      # MCP server infrastructure
│   │   │   ├── server.ts             # MCP server creation and setup
│   │   │   ├── toolRegistry.ts       # Tool registration
│   │   │   └── resourceRegistry.ts   # Resource registration
│   │   └── chat/                     # Chat Completions API
│   │       ├── handler.ts            # Request handler (streaming & non-streaming)
│   │       ├── mcp-client/           # MCP client integration
│   │       ├── providers/            # Multi-provider support
│   │       └── config/               # API key resolution logic
│   ├── domain/                       # Domain layer (business logic)
│   │   ├── shared/                   # Shared types and utilities for all domain tools
│   │   │   ├── types.ts              # MCP tool parameter and response types
│   │   │   ├── responses.ts          # Response builders for MCP tools
│   │   │   └── validators.ts         # Parameter validation utilities
│   │   ├── router/                   # Main routing tool
│   │   │   └── tool.ts               # resolve_and_route tool
│   │   ├── studyView/                # StudyView domain
│   │   │   ├── tool.ts               # navigate_to_studyview
│   │   │   ├── urlBuilder.ts         # URL construction logic
│   │   │   ├── tabValidator.ts       # Tab availability validation
│   │   │   ├── schemas/              # Manually maintained Zod schemas
│   │   │   └── resources/            # MCP resources
│   │   ├── patientView/              # PatientView domain
│   │   │   ├── tool.ts               # navigate_to_patientview
│   │   │   └── urlBuilder.ts         # URL construction logic
│   │   ├── resultsView/              # ResultsView domain
│   │   │   ├── tool.ts               # navigate_to_resultsview
│   │   │   └── urlBuilder.ts         # URL construction logic
│   │   └── groupComparison/          # GroupComparison domain
│   │       ├── tool.ts               # navigate_to_group_comparison
│   │       └── utils/                # Group building, URL construction, binning
│   └── infrastructure/               # Infrastructure layer (API-facing)
│       ├── api/                      # cBioPortal API clients
│       │   ├── client.ts             # Main API client
│       │   └── studyViewData.ts      # StudyView-specific API calls
│       ├── resolvers/                # Entity resolvers
│       │   ├── studyResolver.ts      # Study search and validation
│       │   ├── geneResolver.ts       # Gene validation
│       │   └── profileResolver.ts    # Molecular profile lookup
│       └── utils/                    # Core infrastructure utilities
│           ├── config.ts             # Configuration management (baseUrl, protocol)
│           └── urlBuilder.ts         # Core URL construction utilities
├── DEVELOPMENT.md                    # Development status and architecture docs
├── Dockerfile                        # Multi-stage Docker build
├── docker-compose.example.yml        # Docker Compose template
├── librechat.example.yaml            # LibreChat MCP configuration
└── package.json
```

## Usage

### Option 1: Local MCP with Claude Desktop

**Quick Start** (3 steps):

1. **Build**:
   ```bash
   npm install && npm run build
   ```

2. **Configure Claude Desktop**:

   Edit config file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "cbioportal-navigator": {
         "command": "node",
         "args": ["/FULL/PATH/TO/cbioportal-navigator/dist/server/index.js"]
       }
     }
   }
   ```

   **Important**: Use absolute path (not relative like `~/` or `./`)

3. **Restart Claude Desktop** → Look for MCP connection icon

### Option 2: Standalone MCP Server (Docker)

Run Navigator as a standalone MCP server that AI agents can connect to via HTTP.

**Quick Start**:

1. **Start the MCP server**:
   ```bash
   docker compose -f docker-compose.mcp.yml up -d
   ```

2. **Verify it's running**:
   ```bash
   # Check health
   curl http://localhost:8002/health

   # View logs
   docker compose -f docker-compose.mcp.yml logs -f
   ```

3. **Connect from AI agents**:
   - MCP endpoint: `http://localhost:8002/mcp`
   - Use with MCP-compatible tools like Claude Code or custom agents

**Configuration**:

Edit `docker-compose.mcp.yml` to customize:
```yaml
environment:
  - MCP_TRANSPORT=http
  - PORT=8002
  - CBIOPORTAL_BASE_URL=https://www.cbioportal.org  # Change if using private instance
```

**Stop the server**:
```bash
docker compose -f docker-compose.mcp.yml down
```

### Option 3: LibreChat Integration (Docker)

Navigator integrates with LibreChat via Docker Compose, supporting multiple AI providers (Claude, Gemini, GPT) with a single endpoint configuration.

**Quick Start**:

1. **Configure API keys in LibreChat's `.env` file**:
   ```bash
   # Edit /path/to/LibreChat/.env
   ANTHROPIC_API_KEY=sk-ant-...
   GOOGLE_KEY=AIzaSy...
   OPENAI_API_KEY=sk-proj-...
   ```

2. **Setup configuration files**:
   ```bash
   cp docker-compose.example.yml docker-compose.override.yml
   cp librechat.example.yaml librechat.yaml
   ```

3. **Edit `docker-compose.override.yml`**:
   ```yaml
   services:
     cbioportal-navigator:
       # Use pre-built GitHub image
       # Or build locally: docker build -t cbioportal-navigator:latest .
       image: ghcr.io/YOUR_USERNAME/cbioportal-navigator:latest
       container_name: cbioportal-navigator
       ports:
         - "8002:8002"
       environment:
         - MCP_TRANSPORT=http
         - PORT=8002
         # API keys shared from LibreChat .env
         - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
         - GOOGLE_API_KEY=${GOOGLE_KEY}
         - OPENAI_API_KEY=${OPENAI_API_KEY}
       restart: unless-stopped
       networks:
         - default

     api:
       volumes:
         - ./librechat.yaml:/app/librechat.yaml:ro
   ```

4. **Edit `librechat.yaml`**:
   ```yaml
   endpoints:
     custom:
       - name: 'cBioPortal Navigator'
         apiKey: 'dummy'  # Navigator uses env vars, not this value
         baseURL: 'http://cbioportal-navigator:8002/v1'
         models:
           default:
             - 'claude-sonnet-4-5'
             - 'claude-opus-4-5'
             - 'gemini-2.0-flash'
             - 'gpt-4o'
           fetch: true
         modelDisplayLabel: 'cBioPortal Navigator'
   ```

5. **Start services** (from LibreChat directory):
   ```bash
   # If currently running, docker compose down
   docker compose up -d
   ```

6. **Usage**:
   - Open LibreChat: http://localhost:3080
   - Select "cBioPortal Navigator" from the endpoint dropdown
   - Choose any model (all use correct API keys automatically)
   - Ask: "Show me TCGA lung cancer mutations in EGFR"

**How it works**:
- Navigator detects provider from model name (claude-* → Anthropic, gemini-* → Google, gpt-* → OpenAI)
- Uses corresponding environment variable for each provider
- Single endpoint supports all models without per-model configuration

**Troubleshooting**:
```bash
# View Navigator logs
docker compose logs -f cbioportal-navigator

# Test health endpoint
curl http://localhost:8002/health

# Check available models
curl http://localhost:8002/v1/models
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CBIOPORTAL_BASE_URL` | Base URL of cBioPortal instance | `https://www.cbioportal.org` |
| `MCP_TRANSPORT` | Transport mode (`stdio` or `http`) | `stdio` |
| `PORT` | HTTP server port (HTTP mode only) | `8002` |
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude models) | - |
| `GOOGLE_API_KEY` | Google API key (for Gemini models) | - |
| `OPENAI_API_KEY` | OpenAI API key (for GPT models) | - |
| `NODE_ENV` | Environment mode | `production` (in Docker) |


## Architecture

### Communication Flows

**Option 1: MCP Protocol (Claude Desktop)**
```
Claude Desktop
    ↓ MCP Protocol (stdio)
Navigator MCP Server
    ↓ cBioPortal HTTP API
cBioPortal
```

**Option 2: Chat Completions API (LibreChat)**
```
LibreChat UI
    ↓ HTTP POST
Navigator Chat Completions API (/v1/chat/completions)
    ↓ AI SDK → Anthropic/Google/OpenAI API
AI Provider (Claude/Gemini/GPT)
    ↓ Tool calls → MCP tools
Navigator MCP Tools
    ↓ cBioPortal HTTP API
cBioPortal
```

### Dual Mode Support

Navigator runs in one of two transport modes based on the `MCP_TRANSPORT` environment variable:

**stdio mode** (default):
- Used by Claude Desktop and other local MCP clients
- Direct process communication via stdin/stdout
- Command: `MCP_TRANSPORT=stdio npm start`

**HTTP mode**:
- Used by LibreChat and web-based clients
- Provides both MCP endpoint (`/mcp`) and Chat Completions endpoint (`/v1/chat/completions`)
- Streamable HTTP with SSE support
- Command: `MCP_TRANSPORT=http PORT=8002 npm start`

## Development

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run watch` | Auto-rebuild on file changes |
| `npm run dev` | Run with tsx (no build needed) |
| `npm start` | Run compiled version (requires build first) |

### Updating Prompts

All prompts are externalized to markdown files for easy editing:

```bash
# Edit prompts
vim src/domain/router/prompts/resolve_and_route.md      # MCP tool prompts
vim src/server/chat/prompts/system.md                   # Chat system prompt

# Rebuild and restart
npm run build && npm run dev
```

**Prompt locations:**
- **MCP Tools**: `src/domain/<domain>/prompts/*.md`
  - Router: `src/domain/router/prompts/resolve_and_route.md`
  - StudyView: `src/domain/studyViewPage/prompts/*.md`
  - PatientView: `src/domain/patientViewPage/prompts/*.md`
  - ResultsView: `src/domain/resultsViewPage/prompts/*.md`
  - GroupComparison: `src/domain/groupComparison/prompts/*.md`
- **Chat System**: `src/server/chat/prompts/system.md`

## Resources

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [cBioPortal Documentation](https://docs.cbioportal.org/)
- [LibreChat Documentation](https://www.librechat.ai/)
- [Claude Desktop](https://claude.ai/download)