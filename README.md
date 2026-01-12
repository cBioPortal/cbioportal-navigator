# cBioPortal Navigator

A Model Context Protocol (MCP) server that helps AI assistants navigate users to the right cBioPortal pages by resolving natural language queries into structured URLs.

## Overview

cBioPortal Navigator bridges the gap between natural language cancer genomics queries and cBioPortal's powerful visualization tools. It enables AI assistants like Claude to:

- Search and validate cancer studies, genes, and molecular profiles
- Resolve ambiguous queries (e.g., "TCGA lung cancer" → specific study selection)
- Build properly formatted cBioPortal URLs for study views, patient views, and results pages
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

## Project Structure

```
cbioportal-navigator/
├── src/
│   ├── index.ts                      # Entry point (stdio/HTTP mode selection)
│   ├── server.ts                     # MCP server creation and tool registration
│   ├── tools/
│   │   ├── routeToTargetPage.ts      # Main router tool (routes to specialized tools)
│   │   ├── navigateToStudyView.ts    # StudyView page navigation
│   │   ├── navigateToPatientView.ts  # PatientView page navigation
│   │   ├── navigateToResultsView.ts  # ResultsView page navigation
│   │   └── common/                   # Shared tool utilities
│   │       ├── types.ts              # Tool response types
│   │       ├── responses.ts          # Response builders
│   │       └── validators.ts         # Input validators
│   ├── pages/                        # Page-specific tools and schemas
│   │   ├── studyViewPage/
│   │   │   ├── tool.ts               # StudyView MCP tool
│   │   │   ├── schemas.ts            # Plots URL parameter schemas (manual)
│   │   │   ├── urlBuilder.ts         # URL construction
│   │   │   └── tabValidator.ts       # Tab availability validation
│   │   ├── resultsViewPage/          # ResultsView page navigation
│   │   └── patientViewPage/          # PatientView page navigation
│   ├── shared/                       # Shared utilities and schemas
│   │   ├── schemas/
│   │   │   └── cbioportal.ts         # Auto-generated API type schemas (ts-to-zod)
│   │   ├── resolvers/                # Entity resolvers
│   │   │   ├── studyResolver.ts      # Study search and validation
│   │   │   ├── geneResolver.ts       # Gene validation
│   │   │   └── profileResolver.ts    # Molecular profile lookup
│   │   ├── utils/                    # Shared utilities
│   │   │   ├── urlBuilder.ts         # Core URL utilities
│   │   │   ├── responses.ts          # Response builders
│   │   │   └── types.ts              # Common types
│   │   └── api/
│   │       └── client.ts             # cBioPortal API client
│   └── router.ts                     # Main routing tool
├── DEVELOPMENT.md                    # Development status and schema documentation
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
         "args": ["/FULL/PATH/TO/cbioportal-navigator/dist/index.js"]
       }
     }
   }
   ```

   **Important**: Use absolute path (not relative like `~/` or `./`)

3. **Restart Claude Desktop** → Look for MCP connection icon

### Option 2: LibreChat Integration (Docker)

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
       # Use pre-built GitHub image (or build locally)
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

## Resources

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [cBioPortal Documentation](https://docs.cbioportal.org/)
- [LibreChat Documentation](https://www.librechat.ai/)
- [Claude Desktop](https://claude.ai/download)