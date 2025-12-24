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
│   ├── schemas/                      # Type definitions & Zod schema generation
│   │   ├── README.md                 # Schema generation guide
│   │   ├── types/                    # TypeScript type definitions
│   │   │   ├── StudyViewFilter.d.ts  # StudyViewFilter types from cBioPortal API
│   │   │   └── PlotsConfig.d.ts      # Plots configuration types
│   │   └── generated/                # Auto-generated Zod schemas (ts-to-zod)
│   │       ├── StudyViewFilterSchemas.ts
│   │       └── PlotsConfigSchemas.ts
│   ├── resolution/                   # Entity resolvers
│   │   ├── studyResolver.ts          # Study search and validation
│   │   ├── geneResolver.ts           # Gene validation
│   │   └── profileResolver.ts        # Molecular profile lookup
│   ├── urlBuilders/                  # URL construction logic
│   │   ├── config.ts                 # Base URL configuration
│   │   ├── core.ts                   # Core URL utilities
│   │   ├── study.ts                  # StudyView URL builder
│   │   ├── patient.ts                # PatientView URL builder
│   │   └── results.ts                # ResultsView URL builder
│   └── api/                          # cBioPortal API client
│       └── client.ts                 # HTTP client wrapper
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

3. **Restart Claude Desktop** → Look for 🔌 icon

#### Development Mode

For development with auto-reload (stdio mode):

```bash
npm run dev
```

For HTTP mode development:

```bash
MCP_TRANSPORT=http PORT=8002 npm run dev
```

### Option 2: Server Deployment with LibreChat

**Quick Start** (4 steps):

1. **Setup config files**:
   ```bash
   cp docker-compose.example.yml docker-compose.yml
   cp librechat.example.yaml librechat.yaml
   ```

2. **Configure docker-compose.yml**:

   Choose one image source:
   ```yaml
   # Option A: Use pre-built image
   image: ghcr.io/YOUR_USERNAME/cbioportal-navigator:latest

   # Option B: Build locally
   build:
     context: .
     dockerfile: Dockerfile
   ```

   Add your API keys:
   ```yaml
   librechat:
     environment:
       - ANTHROPIC_API_KEY=your_key_here
       - OPENAI_API_KEY=your_key_here
   ```

3. **Start services**:
   ```bash
   docker-compose up -d
   ```

4. **Verify**:
   - LibreChat UI: http://localhost:3080
   - Health check: http://localhost:8002/health
   - View logs: `docker-compose logs -f cbioportal-navigator`

**LibreChat MCP Configuration** (`librechat.yaml`):
```yaml
mcpServers:
  cbioportal-navigator:
    type: streamable-http
    url: "http://cbioportal-navigator:8002/mcp"
```

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
2. Validates gene "TP53" ✓
3. Builds results URL with OncoPrint parameters
4. Returns: `https://www.cbioportal.org/results/oncoprint?...`

### Example 2: Patient View

**User Query**: "Take me to patient TCGA-05-4384 in study luad_tcga"

**AI Processing**:
1. Recognizes: Specific patient → Patient page needed
2. Calls `route_to_target_page` OR `navigate_to_patientview` directly
3. Parameters: `targetPage="patient"`, `studyId="luad_tcga"`, `patientId="TCGA-05-4384"`

**Server Processing**:
1. Validates study "luad_tcga" exists ✓
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

### Schema Generation

This project uses [ts-to-zod](https://github.com/fabien0102/ts-to-zod) to automatically generate Zod validation schemas from TypeScript type definitions, providing strict type safety for MCP tool inputs.

**Quick Reference:**

```bash
# Regenerate all schemas
npm run generate:schemas

# Build project
npm run build
```

**For detailed schema development guide**, see [`src/schemas/README.md`](src/shared/schemas/README.md)

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run watch` | Auto-rebuild on file changes |
| `npm run dev` | Run with tsx (no build needed) |
| `npm start` | Run compiled version (requires build first) |
| `npm run generate:schemas` | Regenerate all Zod schemas from type definitions |

## Contributing

Contributions welcome! Please ensure:
- TypeScript code compiles without errors
- Changes are tested with both Claude Desktop and LibreChat
- Documentation is updated accordingly
- If modifying schemas, run `npm run generate:schemas` before committing

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