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
│   ├── telemetry.ts           # Datadog DogStatsD metrics + OpenTelemetry spans per tool call
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
├── datadog/                   # Datadog dashboard definition for tool metrics
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

### Datadog Tool Metrics

Each MCP tool call emits one OpenTelemetry span (`mcp.tool/<tool>`) and
DogStatsD metrics, matching the tool telemetry in
[cbioportal-mcp](https://github.com/cBioPortal/cbioportal-mcp) so both servers
can be charted on the same dashboard:

- `cbioportal_navigator.tool.calls` (counter)
- `cbioportal_navigator.tool.duration_ms` (distribution)
- `cbioportal_navigator.tool.errors` (counter)

Tags: `tool`, `success`, `client_kind`, `client_name`, `service`, `env`.
Span attributes: `mcp.tool.name`, `mcp.tool.duration_ms`, `mcp.tool.success`,
`mcp.client_kind`, `mcp.client.name`, `mcp.session.id`, `enduser.id`,
`network.client.ip`, `user_agent.original`, `error.type`.

A call counts as failed if the tool throws or returns `{"success": false}`.
`client_kind` is `librechat` when the `x-user-id` header is present, otherwise
`direct`.

Telemetry is off unless one of these is set:

| Variable | Description | Default |
|----------|-------------|---------|
| `DD_AGENT_HOST` | Datadog agent host; enables metrics and tracing | – |
| `DD_DOGSTATSD_HOST` / `DD_DOGSTATSD_PORT` | DogStatsD endpoint | `DD_AGENT_HOST`:`8125` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP endpoint; enables tracing | `http://DD_AGENT_HOST:4318` |
| `DD_SERVICE` / `OTEL_SERVICE_NAME` | Service name | `cbioportal-navigator` |
| `DD_ENV` | `env` tag | – |
| `CBIOPORTAL_NAVIGATOR_DD_METRICS_ENABLED` | Set `false` to disable metrics | `true` |
| `CBIOPORTAL_NAVIGATOR_DD_METRIC_PREFIX` | Metric prefix | `cbioportal_navigator` |

On Kubernetes, set `DD_AGENT_HOST` from the node IP via the Downward API
(`fieldRef: status.hostIP`); the Datadog agent needs DogStatsD on host port
8125 and OTLP HTTP ingest on 4318.

[`datadog/navigator-tool-metrics-dashboard.json`](datadog/navigator-tool-metrics-dashboard.json)
mirrors the "MCP Tool Metrics" group of the cbioagent dashboard with the
navigator's metric names. Import it, or copy its group into the cbioagent
dashboard.

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
