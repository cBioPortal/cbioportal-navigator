# Project Context

MCP server for AI-assisted cBioPortal navigation. Supports stdio mode for Claude Desktop and HTTP mode (Streamable HTTP transport) for remote MCP clients.

## Tools

| Tool | Description |
|------|-------------|
| `resolve_and_route` | Study resolver — resolves studies, returns metadata; LLM decides which navigation tool(s) to call |
| `get_studyviewfilter_options` | On-demand filter metadata (clinical attributes + generic assay entities) |
| `navigate_to_study_view` | StudyView URL with filters, plots, tabs, treatment filters |
| `navigate_to_group_comparison` | Group Comparison — categorical/numerical grouping, tabs, per-group StudyView URLs |
| `navigate_to_results_view` | ResultsView — filter-to-results via session (`mainSessionClient.ts`) |
| `navigate_to_patient_view` | PatientView — filter-to-patient with cohort navigation (`navCaseIds`) |

## Architecture

```
src/
├── index.ts              # Entry point: stdio/HTTP mode selection, MCP server creation
├── toolRegistry.ts       # Central tool registration
├── tools/
│   ├── resolveAndRoute.ts          # Study resolver (no targetPage — LLM chooses tools)
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
│   └── shared/                # Config, types, responses, validators, API client, URL builder, promptLoader
└── prompts/                   # Local prompt .md files (fallback for Langfuse)
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

3. **Two-Tier Filter Metadata** — Router returns only attribute IDs (~300 tokens). `get_studyviewfilter_options` provides details on-demand (clinical + generic assay). Avoids ~1,500 tokens per query when filters aren't needed.

5. **Tiered Study Metadata** — Keyword search: top 5 get full metadata (clinicalAttributes, molecularProfiles, treatments); rest get basic info. Direct studyIds: all get full metadata.

6. **Manual Schema Maintenance** — `src/tools/studyView/schemas/` is manual, not auto-generated. Source types have known issues; only ~20 of 121 schemas used; API is stable.

7. **Group Comparison NA & Patient-Level** — Patient-level attributes map `uniquePatientKey` → all patient's samples. Default `includeNA: true` (differs from frontend). Numerical attributes use automatic quartile binning.

8. **StudyView→ResultsView via Session** — `navigate_to_results_view` with `studyViewFilter` fetches filtered samples, creates `POST /api/session/main_session`, returns `?session_id=...` URL.

9. **StudyView→PatientView via navCaseIds** — `navigate_to_patient_view` with `studyViewFilter`: ≤20 patients → PatientView URL with `navCaseIds` in hash (frontend's `handleLongUrls()` strips to `window.navCaseIdsCache` only at >60000 chars); >20 patients → StudyView URL with `filterJson`.

10. **Companion URLs** — Navigation tools return a `studyViewUrl` alongside the primary `url` when a filtered subset is involved:
    - `navigate_to_results_view` with `studyViewFilter`: returns `studyViewUrl` (StudyView with same filter) so users can explore the cohort.
    - `navigate_to_group_comparison`: always returns `studyViewUrl` (base study or with pre-filter). When pre-filter or value subset is used, also returns `groupUrls` (per-group StudyView URLs).
    - `system.md` instructs the LLM to present both links, and allows parallel navigation tool calls when a query spans multiple views.

11. **No targetPage Constraint** — `resolve_and_route` only resolves studies and returns metadata. The LLM decides which navigation tool(s) to call based on the selection guide in the tool description. This allows multi-tool calls and flexible routing in multi-turn conversations.

12. **Langfuse Prompt Management** — Prompts are managed in Langfuse under the `navigator/` folder (e.g. `navigator/resolve-and-route`). `promptLoader.ts` pre-fetches all prompts at startup via `initPrompts()` with local `.md` files as `fallback` parameter. Tool files use factory functions (`createXxxTool()`) instead of module-level constants so that `loadPrompt()` runs after `initPrompts()`. SDK: `@langfuse/client` (`LangfuseClient`). Env vars: `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_BASE_URL`.

13. **Unselected Group (Wildtype/Complement)** — In `navigate_to_group_comparison` `groups` mode, one group may use `{ name, isUnselected: true }` instead of a `studyViewFilter`. This group receives all cohort samples NOT matched by any other group (complement). Implemented in `navigateToGroupComparisonByFilters`: fetches full cohort (with global `studyViewFilter` if provided), subtracts union of all filter-group samples. At most one unselected group allowed. No `groupUrl` is generated for the unselected group (no simple StudyView filter can express a complement).

## Frontend Reference (cbioportal-frontend)

Key enums/types referenced by this project:

- **PatientViewPageTabs** (`PatientViewPageTabs.tsx`): `summary`, `genomicEvolution`, `clinicalData`, `filesAndLinks`, `pathologyReport`, `tissueImage`, `MSKTissueImage`, `trialMatchTab`, `mutationalSignatures`, `pathways`
  - We expose only always-visible: `summary`, `clinicalData`, `pathways`
- **ResultsViewTab** (`ResultsViewPageHelpers.tsx`): `oncoprint`, `survival` (redirect→comparison), `cancerTypesSummary`, `mutualExclusivity`, `plots`, `mutations`, `structuralVariants`, `coexpression`, `comparison`, `cnSegments`, `network`, `pathways`, `expression` (redirect), `download`
- **ResultsViewComparisonSubTab** (`ResultsViewPageHelpers.tsx`): `overlap`, `survival`, `clinical`, `mrna`, `protein`, `dna_methylation`, `alterations`, `generic_assay` (prefix). URL pattern: `/results/comparison/{subtab}`. Our tool supports these via composite tab values like `comparison/protein`.
- **ALTERATION_FILTER_DEFAULTS** (`StudyViewUtils.tsx`): `copyNumberAlterationEventTypes` only supports `AMP`/`HOMDEL`; for `GAIN`/`HETLOSS`/`DIPLOID` use `geneFilters`
- **navCaseIds** (`PatientViewUrlWrapper.ts`, `handleLongUrls.ts`): hashed URL param for cohort navigation; `handleLongUrls()` moves to `window.navCaseIdsCache` when >60000 chars
- **Column-store** (`proxyColumnStore.ts`): rewrites `$domain` to `/api/column-store` for whitelisted endpoints (ClinicalDataCounts, FilteredSamples, etc.)

## Known Limitations

- StudyView URL params not implemented: `sharedGroups`, `sharedCustomData`, `geneset_list`
- Treatment tier data (AgentClass/AgentTarget) — identical to base data on public cBioPortal
- Generic assay profiles with >200 entities (e.g. methylation hm27/hm450) return `tooLarge: true` instead of entity list — AI should direct user to web UI for those

## Development

- `npm run build` — compile TS + copy prompts to dist/
- `npm run dev` — run with tsx (no build needed, entry: `src/index.ts`)
- `npm start` — run compiled (`dist/index.js`)

**Adding tools:** Create in `src/tools/<name>.ts` (export `createXxxTool()` factory + handler) → register in `src/toolRegistry.ts` → add prompt mapping in `promptLoader.ts` `PROMPT_NAMES` → create prompt in Langfuse under `navigator/`.

**Claude Desktop config:** `~/Library/Application Support/Claude/claude_desktop_config.json` — use absolute path to `dist/index.js`, restart after changes.
