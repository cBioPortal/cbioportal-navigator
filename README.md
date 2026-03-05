# cBioPortal Navigator

MCP server that helps AI assistants navigate users to the right cBioPortal pages by resolving natural language queries into structured URLs.

## Overview

cBioPortal Navigator bridges natural language cancer genomics queries and cBioPortal's visualization tools. It enables AI assistants to:

- Search and validate cancer studies, genes, and molecular profiles
- Resolve ambiguous queries (e.g., "TCGA lung cancer" → specific study selection)
- Build properly formatted cBioPortal URLs with complex filters and parameters
- Navigate across StudyView, PatientView, ResultsView, and Group Comparison pages

## Tools

| Tool | Description |
|------|-------------|
| `resolve_and_route` | Main router — resolves studies/genes/profiles, returns metadata |
| `get_studyviewfilter_options` | On-demand filter metadata (clinical attributes + generic assay) |
| `navigate_to_study_view` | StudyView with filters, plots, tabs, treatments |
| `navigate_to_patient_view` | PatientView with cohort navigation |
| `navigate_to_results_view` | ResultsView (OncoPrint) via session-based filtering |
| `navigate_to_group_comparison` | Group Comparison — categorical/numerical grouping |

## Project Structure

```
cbioportal-navigator/
├── src/
│   ├── index.ts               # Entry point (stdio/HTTP mode selection, MCP server creation)
│   ├── toolRegistry.ts        # Central tool registration
│   ├── tools/
│   │   ├── resolveAndRoute.ts     # Router tool
│   │   ├── getStudyviewfilterOptions.ts
│   │   ├── navigateToStudyView.ts
│   │   ├── navigateToGroupComparison.ts
│   │   ├── navigateToResultsView.ts
│   │   ├── navigateToPatientView.ts
│   │   ├── router/                # Study/gene/profile resolvers
│   │   ├── studyView/             # URL builder, tab validator, schemas, data client
│   │   ├── groupComparison/       # Group builder, binning, session client
│   │   ├── resultsView/           # URL builder, main session client
│   │   ├── patientView/           # URL builder
│   │   └── shared/                # Config, types, API client, URL builder
│   └── prompts/                   # Prompt markdown files (copied to dist/ at build)
├── Dockerfile
├── docker-compose.mcp.yml        # Standalone MCP server
└── package.json
```

## Usage

### Option 1: Local MCP with Claude Desktop

1. **Build**:
   ```bash
   npm install && npm run build
   ```

2. **Configure Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
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
   **Important**: Use absolute path. Restart Claude Desktop after changes.

3. **Restart Claude Desktop** → Look for MCP connection icon

### Option 2: Standalone MCP Server (Docker)

1. **Start**:
   ```bash
   docker compose -f docker-compose.mcp.yml up -d
   ```

2. **Verify**:
   ```bash
   curl http://localhost:8002/health
   ```

3. **Connect**: MCP endpoint at `http://localhost:8002/mcp`

**Configuration** — edit `docker-compose.mcp.yml`:
```yaml
environment:
  - MCP_TRANSPORT=http
  - PORT=8002
  - CBIOPORTAL_BASE_URL=https://www.cbioportal.org  # Change for private instance
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CBIOPORTAL_BASE_URL` | cBioPortal instance URL | `https://www.cbioportal.org` |
| `MCP_TRANSPORT` | Transport mode (`stdio` or `http`) | `stdio` |
| `PORT` | HTTP server port (HTTP mode only) | `8002` |

## Architecture

**stdio mode** (default) — Claude Desktop via stdin/stdout:
```
Claude Desktop → MCP (stdio) → Navigator → cBioPortal API
```

**HTTP mode** — remote MCP clients:
```
MCP Client → /mcp (Streamable HTTP) → Navigator → cBioPortal API
```

HTTP endpoints: `/mcp` (MCP protocol), `/health`

## Development

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TS + copy prompts to dist/ |
| `npm run dev` | Run with tsx (no build needed) |
| `npm run watch` | Auto-rebuild on file changes |
| `npm start` | Run compiled version |

**Prompts**: All in `src/prompts/*.md` — edit and rebuild.

## Resources

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [cBioPortal Documentation](https://docs.cbioportal.org/)
