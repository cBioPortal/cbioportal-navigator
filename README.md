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
│   ├── server/                       # Server layer (user-facing)
│   │   ├── index.ts                  # Application entry point
│   │   └── mcp-server/               # MCP server infrastructure
│   │       ├── server.ts             # MCP server creation and setup
│   │       └── toolRegistry.ts       # Tool registration
│   ├── domain/                       # Domain layer (business logic)
│   │   ├── shared/                   # Shared types and utilities for all domain tools
│   │   │   ├── types.ts              # MCP tool parameter and response types
│   │   │   ├── responses.ts          # Response builders for MCP tools
│   │   │   └── validators.ts         # Parameter validation utilities
│   │   ├── router/                   # Main routing tool
│   │   │   └── resolveAndRoute.ts    # resolve_and_route tool
│   │   ├── studyViewPage/            # StudyView domain
│   │   │   ├── navigateToStudyView.ts        # navigate_to_studyview tool
│   │   │   ├── getClinicalAttributeValues.ts # get_clinical_attribute_values tool
│   │   │   ├── buildStudyUrl.ts              # URL construction logic
│   │   │   ├── validateStudyViewTab.ts       # Tab availability validation
│   │   │   └── schemas/                      # Manually maintained Zod schemas
│   │   ├── patientViewPage/          # PatientView domain
│   │   │   ├── navigateToPatientView.ts  # navigate_to_patientview tool
│   │   │   └── buildPatientUrl.ts        # URL construction logic
│   │   └── resultsViewPage/          # ResultsView domain
│   │       ├── navigateToResultsView.ts  # navigate_to_resultsview tool
│   │       └── buildResultsUrl.ts        # URL construction logic
│   └── infrastructure/               # Infrastructure layer (API-facing)
│       ├── api/                      # cBioPortal API clients
│       │   ├── cbioportalClient.ts   # Main API client
│       │   └── studyViewDataClient.ts # StudyView-specific API calls
│       ├── resolvers/                # Entity resolvers
│       │   ├── studyResolver.ts      # Study search and validation
│       │   ├── geneResolver.ts       # Gene validation
│       │   └── profileResolver.ts    # Molecular profile lookup
│       └── utils/                    # Core infrastructure utilities
│           ├── config.ts             # Configuration management (baseUrl, protocol)
│           └── cbioportalUrlBuilder.ts # Core URL construction utilities
├── CONTEXT.md                        # Development context and architecture docs
├── Dockerfile                        # Multi-stage Docker build
├── docker-compose.example.yml        # Docker Compose template for integration
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

### Option 2: Docker Integration with MCP Agent

Navigator can run as a standalone MCP server in Docker, connecting to external MCP agents like those in [cbioportal-mcp-qa](https://github.com/cBioPortal/cbioportal-mcp-qa).

**Quick Start**:

1. **Build Docker image**:
   ```bash
   docker build -t cbioportal-navigator:latest .
   ```

2. **Run as MCP server**:
   ```bash
   docker run -d \
     --name cbioportal-navigator \
     -p 8002:8002 \
     -e MCP_TRANSPORT=http \
     -e PORT=8002 \
     -e CBIOPORTAL_BASE_URL=https://www.cbioportal.org \
     cbioportal-navigator:latest
   ```

3. **Connect from MCP agent**:
   Configure your agent to connect to `http://cbioportal-navigator:8002/mcp`

**Integration with cbioportal-mcp-qa**:

See `docker-compose.example.yml` for an example configuration that replaces the ClickHouse MCP server with Navigator.

**Troubleshooting**:
```bash
# View Navigator logs
docker logs -f cbioportal-navigator

# Test health endpoint
curl http://localhost:8002/health

# Test MCP endpoint
curl -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CBIOPORTAL_BASE_URL` | Base URL of cBioPortal instance | `https://www.cbioportal.org` |
| `MCP_TRANSPORT` | Transport mode (`stdio` or `http`) | `stdio` |
| `PORT` | HTTP server port (HTTP mode only) | `8002` |
| `NODE_ENV` | Environment mode | `production` (in Docker) |


## Architecture

### Communication Flows

**stdio mode** (Claude Desktop):
```
Claude Desktop
    ↓ MCP Protocol (stdio)
Navigator MCP Server
    ↓ cBioPortal HTTP API
cBioPortal
```

**HTTP mode** (mcp-agent integration):
```
MCP Agent (e.g., cbioportal-mcp-qa)
    ↓ HTTP POST /mcp
Navigator MCP Server
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
- Used by remote MCP agents and web-based clients
- Provides MCP endpoint (`/mcp`) using Streamable HTTP transport
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
- [cbioportal-mcp-qa](https://github.com/cBioPortal/cbioportal-mcp-qa) - Example MCP agent integration
- [Claude Desktop](https://claude.ai/download)