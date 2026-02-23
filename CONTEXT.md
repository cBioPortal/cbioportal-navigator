# Project Context

MCP server for AI-assisted cBioPortal navigation. Dual mode: MCP protocol (stdio/HTTP) for Claude Desktop and other MCP clients; OpenAI-compatible Chat Completions API for LibreChat.

## Tools

| Tool | Description |
|------|-------------|
| `resolve_and_route` | Main router — resolves studies/genes/profiles, returns metadata for the LLM to decide next tool |
| `get_studyviewfilter_options` | On-demand filter metadata (clinical attributes + generic assay entities) |
| `navigate_to_study_view` | StudyView URL with filters, plots, tabs, treatment filters |
| `navigate_to_group_comparison` | Group Comparison — categorical/numerical grouping, tabs, per-group StudyView URLs |
| `navigate_to_results_view` | ResultsView — filter-to-results via session (`mainSessionClient.ts`) |
| `navigate_to_patient_view` | PatientView — filter-to-patient with cohort navigation (`navCaseIds`) |

## Architecture

```
src/
├── server/
│   ├── index.ts              # Entry point: stdio/HTTP mode selection
│   ├── mcp/
│   │   ├── server.ts          # MCP server creation
│   │   └── toolRegistry.ts    # Central tool registration
│   └── chat/
│       ├── handler.ts         # Chat Completions API (streaming & non-streaming)
│       ├── auth.ts            # Multi-provider API key resolution
│       ├── providerFactory.ts # AI SDK provider creation
│       ├── mcpClient.ts       # Internal MCP client (tools sync)
│       └── toolsLoader.ts     # MCP→Chat tool conversion
├── tools/
│   ├── resolveAndRoute.ts          # Router tool
│   ├── getStudyviewfilterOptions.ts
│   ├── navigateToStudyView.ts
│   ├── navigateToGroupComparison.ts
│   ├── navigateToResultsView.ts
│   ├── navigateToPatientView.ts
│   ├── router/                # Study/gene/profile resolvers
│   ├── studyView/             # URL builder, tab validator, schemas, data client
│   ├── groupComparison/       # Group builder, numerical binning, session client
│   ├── resultsView/           # URL builder, main session client
│   ├── patientView/           # URL builder
│   └── shared/                # Config, types, responses, validators, API client, URL builder
└── prompts/                   # All prompt markdown files (copied to dist/ at build)
    ├── system.md
    ├── resolve_and_route.md
    ├── get_studyviewfilter_options.md
    ├── navigate_to_study_view.md
    ├── navigate_to_group_comparison.md
    ├── navigate_to_results_view.md
    └── navigate_to_patient_view.md
```

## Key Design Decisions

1. **Column-Store Integration** — `/api/studies/{id}` has `allSampleCount` bug (returns 1). Solution: transparent URL rewriting to `/api/column-store/` for whitelisted endpoints. `studyKeywords` uses getAllStudies (accurate counts); `studyIds` uses getById.

2. **Multi-Provider API Key Resolution** — LibreChat sends one `apiKey` field. We ignore the Authorization header, detect provider from model name (`claude-*`/`gemini-*`/`gpt-*`), use corresponding env var.

3. **MCP Server as Single Source of Truth** — Chat API connects to own MCP server internally. Tools defined once, used by both Claude Desktop and Chat API.

4. **Two-Tier Filter Metadata** — Router returns only attribute IDs (~300 tokens). `get_studyviewfilter_options` provides details on-demand (clinical + generic assay). Avoids ~1,500 tokens per query when filters aren't needed.

5. **Tiered Study Metadata** — Keyword search: top 5 get full metadata (clinicalAttributes, molecularProfiles, treatments); rest get basic info. Direct studyIds: all get full metadata.

6. **Manual Schema Maintenance** — `src/tools/studyView/schemas/` is manual, not auto-generated. Source types have known issues; only ~20 of 121 schemas used; API is stable.

7. **Group Comparison NA & Patient-Level** — Patient-level attributes map `uniquePatientKey` → all patient's samples. Default `includeNA: true` (differs from frontend). Numerical attributes use automatic quartile binning.

8. **StudyView→ResultsView via Session** — `navigate_to_results_view` with `studyViewFilter` fetches filtered samples, creates `POST /api/session/main_session`, returns `?session_id=...` URL.

9. **StudyView→PatientView via navCaseIds** — `navigate_to_patient_view` with `studyViewFilter`: ≤20 patients → PatientView URL with `navCaseIds` in hash (frontend's `handleLongUrls()` strips to `window.navCaseIdsCache` only at >60000 chars); >20 patients → StudyView URL with `filterJson`.

## Frontend Reference (cbioportal-frontend)

Key enums/types referenced by this project:

- **PatientViewPageTabs** (`PatientViewPageTabs.tsx`): `summary`, `genomicEvolution`, `clinicalData`, `filesAndLinks`, `pathologyReport`, `tissueImage`, `MSKTissueImage`, `trialMatchTab`, `mutationalSignatures`, `pathways`
  - We expose only always-visible: `summary`, `clinicalData`, `pathways`
- **ResultsViewTab** (`ResultsViewPageHelpers.tsx`): `oncoprint`, `survival` (redirect→comparison), `cancerTypesSummary`, `mutualExclusivity`, `plots`, `mutations`, `structuralVariants`, `coexpression`, `comparison`, `cnSegments`, `network`, `pathways`, `expression` (redirect), `download`
- **ALTERATION_FILTER_DEFAULTS** (`StudyViewUtils.tsx`): `copyNumberAlterationEventTypes` only supports `AMP`/`HOMDEL`; for `GAIN`/`HETLOSS`/`DIPLOID` use `geneFilters`
- **navCaseIds** (`PatientViewUrlWrapper.ts`, `handleLongUrls.ts`): hashed URL param for cohort navigation; `handleLongUrls()` moves to `window.navCaseIdsCache` when >60000 chars
- **Column-store** (`proxyColumnStore.ts`): rewrites `$domain` to `/api/column-store` for whitelisted endpoints (ClinicalDataCounts, FilteredSamples, etc.)

## Known Limitations

- StudyView URL params not implemented: `sharedGroups`, `sharedCustomData`, `geneset_list`
- Treatment tier data (AgentClass/AgentTarget) — identical to base data on public cBioPortal
- LibreChat doesn't display tool call progress in UI

## Development

- `npm run build` — compile TS + copy prompts to dist/
- `npm run dev` — run with tsx (no build needed, entry: `src/server/index.ts`)
- `npm start` — run compiled (`dist/server/index.js`)

**Adding tools:** Create in `src/tools/<name>.ts` → register in `src/server/mcp/toolRegistry.ts` → Chat API auto-syncs via MCP client.

**Claude Desktop config:** `~/Library/Application Support/Claude/claude_desktop_config.json` — use absolute path to `dist/server/index.js`, restart after changes.
