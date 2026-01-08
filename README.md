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

#### Development Mode

For development with auto-reload (stdio mode):

```bash
npm run dev
```

For HTTP mode development:

```bash
MCP_TRANSPORT=http PORT=8002 npm run dev
```

### Option 2: Chat Completions API (OpenAI-Compatible)

The server provides an OpenAI-compatible chat completions endpoint at `/v1/chat/completions` that includes built-in system prompts and cBioPortal tools. Perfect for LibreChat and other OpenAI-compatible clients.

**Quick Start** (local testing):

1. **Start the server**:
   ```bash
   # Install and build
   npm install && npm run build

   # Start in HTTP mode
   MCP_TRANSPORT=http PORT=8002 npm start
   ```

2. **Test the endpoint**:
   ```bash
   # Non-streaming request
   curl -X POST http://localhost:8002/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -d '{
       "model": "claude-3-5-sonnet-20241022",
       "messages": [{"role": "user", "content": "Show me TCGA breast cancer study"}]
     }'

   # Streaming request
   curl -X POST http://localhost:8002/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -d '{
       "model": "claude-3-5-sonnet-20241022",
       "messages": [{"role": "user", "content": "Show me TCGA breast cancer study"}],
       "stream": true
     }'

   # Available models
   curl http://localhost:8002/v1/models
   ```

**Supported Models**:
- `claude-3-5-sonnet-20241022` (Anthropic)
- `gemini-2.0-flash-exp` (Google)
- `gpt-4-turbo-preview` (OpenAI)

**API Key Configuration** (priority order):
1. Request body: `"api_key": "your-key"`
2. Headers: `Authorization: Bearer your-key` or `X-API-Key: your-key`
3. Environment variables: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`

**Key Features**:
- Built-in system prompt (cBioPortal navigation assistant)
- Automatic tool execution (resolve_and_route, navigate_to_studyview, etc.)
- Multi-provider support (Anthropic, Google, OpenAI)
- Streaming and non-streaming responses
- OpenAI-compatible format

### Option 3: LibreChat Integration

**Method A: Chat Completions Endpoint (Recommended)**

1. **Start the server** (see Option 2 above)

2. **Configure LibreChat** (`librechat.yaml`):
   ```yaml
   endpoints:
     custom:
       - name: "cBioPortal Navigator"
         apiKey: "user_provided"
         baseURL: "http://localhost:8002/v1"
         models:
           default: ["claude-3-5-sonnet-20241022", "gemini-2.0-flash-exp", "gpt-4-turbo-preview"]
   ```

3. **Usage in LibreChat**:
   - Select "cBioPortal Navigator" endpoint
   - Enter your Anthropic/Google/OpenAI API key
   - Ask queries like "Show me TCGA lung cancer mutations in EGFR"
   - The system automatically calls cBioPortal tools and returns URLs

**Method B: MCP Server (Advanced)**

For users who prefer the MCP protocol:

1. **Setup config files**:
   ```bash
   cp docker-compose.example.yml docker-compose.yml
   cp librechat.example.yaml librechat.yaml
   ```

2. **Configure docker-compose.yml**:
   ```yaml
   # Choose one image source
   # Option A: Use pre-built image
   image: ghcr.io/YOUR_USERNAME/cbioportal-navigator:latest

   # Option B: Build locally
   build:
     context: .
     dockerfile: Dockerfile
   ```

3. **LibreChat MCP Configuration** (`librechat.yaml`):
   ```yaml
   mcpServers:
     cbioportal-navigator:
       type: streamable-http
       url: "http://cbioportal-navigator:8002/mcp"
   ```

4. **Start services**:
   ```bash
   docker-compose up -d
   ```

5. **Verify**:
   - LibreChat UI: http://localhost:3080
   - Health check: http://localhost:8002/health
   - Chat Completions: http://localhost:8002/v1/chat/completions
   - View logs: `docker-compose logs -f cbioportal-navigator`

**Optional - Environment Variables**:
```yaml
# In docker-compose.yml
cbioportal-navigator:
  environment:
    - CBIOPORTAL_BASE_URL=https://www.cbioportal.org  # Change if using custom instance
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

## Tool Usage Flow

When connected to an AI assistant (e.g., Claude):

### Example 1: Gene Mutation Analysis

**User Query**: "Show me TP53 mutations in TCGA lung adenocarcinoma"

**AI Processing**:
1. Recognizes: Gene-focused query → Results page needed
2. Calls `route_to_target_page` OR `navigate_to_resultsview` directly
3. Parameters: `targetPage="results"`, `studyKeywords=["TCGA", "lung", "adenocarcinoma"]`, `genes=["TP53"]`

**Server Processing**:
1. Searches studies matching keywords → finds "luad_tcga"
2. Validates gene "TP53"
3. Builds results URL with OncoPrint parameters
4. Returns: `https://www.cbioportal.org/results/oncoprint?...`

### Example 2: Patient View

**User Query**: "Take me to patient TCGA-05-4384 in study luad_tcga"

**AI Processing**:
1. Recognizes: Specific patient → Patient page needed
2. Calls `route_to_target_page` OR `navigate_to_patientview` directly
3. Parameters: `targetPage="patient"`, `studyId="luad_tcga"`, `patientId="TCGA-05-4384"`

**Server Processing**:
1. Validates study "luad_tcga" exists
2. Builds patient URL
3. Returns: `https://www.cbioportal.org/patient?studyId=luad_tcga&caseId=TCGA-05-4384`

### Example 3: Study Overview

**User Query**: "Show me the TCGA breast cancer study overview"

**AI Processing**:
1. Recognizes: Study-level overview → Study page needed
2. Calls `route_to_target_page` OR `navigate_to_studyview` directly
3. Parameters: `targetPage="study"`, `studyKeywords=["TCGA", "breast"]`

**Server Processing**:
1. Searches studies → finds "brca_tcga"
2. Builds study URL
3. Returns: `https://www.cbioportal.org/study?id=brca_tcga`

## Architecture

### Communication Flow

```
AI Assistant (Claude)
    ↓ MCP Protocol
MCP Server (this project)
    ↓ HTTP API
cBioPortal Public API
```

### Transport Modes

- **stdio**: For local clients like Claude Desktop (direct stdin/stdout communication)
- **Streamable HTTP**: For remote/web-based clients like LibreChat (HTTP POST with optional SSE)

The server automatically selects the transport mode based on the `MCP_TRANSPORT` environment variable:
- `MCP_TRANSPORT=stdio` (default): Uses stdio transport
- `MCP_TRANSPORT=http`: Uses Streamable HTTP transport

## Development

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run watch` | Auto-rebuild on file changes |
| `npm run dev` | Run with tsx (no build needed) |
| `npm start` | Run compiled version (requires build first) |

## License

AGPL-3.0-or-later

## Development

### Schema Architecture

Schemas are manually maintained in domain-specific directories (e.g., `src/studyView/schemas/`). This approach provides precise validation rules and avoids issues with incorrect auto-generated types.

**For detailed schema architecture and maintenance workflows**, see [`DEVELOPMENT.md`](DEVELOPMENT.md)

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run watch` | Auto-rebuild on file changes |
| `npm run dev` | Run with tsx (no build needed) |
| `npm start` | Run compiled version (requires build first) |

## Contributing

Contributions welcome! Please ensure:
- TypeScript code compiles without errors
- Changes are tested with both Claude Desktop and LibreChat
- Documentation is updated accordingly
- Schema changes are properly validated and tested with API calls

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Claude Desktop not connecting** | • Use absolute path in config<br>• Run `npm run build` to create dist/index.js<br>• Check logs: `~/Library/Logs/Claude/` (macOS) |
| **Docker container not starting** | • Check logs: `docker-compose logs cbioportal-navigator`<br>• Rebuild: `docker-compose up --build` |
| **HTTP endpoint 404** | • Verify container running: `docker ps`<br>• Test health: `curl http://localhost:8002/health`<br>• Check firewall on port 8002 |

## Resources

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [cBioPortal Documentation](https://docs.cbioportal.org/)
- [LibreChat Documentation](https://www.librechat.ai/)
- [Claude Desktop](https://claude.ai/download)