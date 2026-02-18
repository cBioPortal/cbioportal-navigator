# Project Context

## Current Status

MCP server for AI-assisted cBioPortal navigation with dual mode support:
- MCP protocol (stdio/HTTP) for Claude Desktop and other MCP clients
- OpenAI-compatible Chat Completions API for LibreChat

**Supported Pages:**
- StudyView (full support: filters, plots, tabs, treatment filters)
- GroupComparison (full support: categorical/numerical grouping, tabs, studyview URLs per group)
- ResultsView (basic navigation)
- PatientView (basic navigation)

## Recent Changes

**2026-02-12: Generic assay filter support**
- `resolve_and_route` now separates `genericAssayProfiles: string[]` from `molecularProfileIds` — only present when study has `GENERIC_ASSAY` profiles
- Renamed tool `get_clinical_attribute_values` → `get_studyviewfilter_options` (new file: `getStudyviewfilterOptions.ts`)
  - New optional param `genericAssayProfileIds`: pass IDs from `genericAssayProfiles`, returns `genericAssayEntities`
  - Each entity: `{ stableId, name, values[] }` (CATEGORICAL/BINARY) or `{ stableId, name, continuous: true }` (LIMIT-VALUE)
  - `profileType` returned per profile for direct use in `genericAssayDataFilters`
- `studyViewDataClient` changes:
  - `getMolecularProfiles`: removed `projection: 'ID'` → defaults to SUMMARY (needed for `molecularAlterationType`, `datatype`)
  - New `getGenericAssayMeta(profileIds)` — calls `fetchGenericAssayMetaUsingPOST`
  - New `getGenericAssayDataValues(studyId, profileType, stableIds)` — calls `fetchGenericAssayDataCountsUsingPOST` (already column-store whitelisted)
- `navigate_to_studyview.md`: added `genericAssayDataFilters` section with LIMIT-VALUE range and categorical examples

**2026-02-12: Gene-specific (genomic) filter support**
- Added `mutationDataFilters` and `genomicDataFilters` documentation to `navigate_to_studyview.md`
- `profileType` = molecularProfileId with `{studyId}_` prefix stripped (e.g., `msk_chord_2024_mutations` → `"mutations"`)
- `mutationDataFilters` has two modes:
  - `categorization: "MUTATED"` + `values: [[{"value": "MUTATED"}]]` — binary mutated/not-mutated
  - `categorization: "MUTATION_TYPE"` + `values: [[{"value": "Missense_Mutation"}]]` — filter by mutation type
- `genomicDataFilters` for discrete CNA (`{"value": "2"}` = AMP, `{"value": "-2"}` = HOMDEL) or continuous ranges (`{"start": 2.0}`)
- `alterationFilter` is omitted by default — frontend auto-injects defaults; only include for non-default (drivers-only, somatic-only, etc.)
- Fixed `cp -r` build script nesting bug: `cp -r src/prompts dist/prompts` → `rm -rf dist/prompts && cp -r src/prompts dist/`

**2026-02-10: Treatment metadata & prompt improvements**
- `resolve_and_route` now returns `treatments: string[]` (drug names) in study metadata
  - New `StudyViewDataClient.getTreatments()` — calls patient-counts endpoint, returns sorted drug names
  - Drug names apply to both `patientTreatmentFilters` and `sampleTreatmentFilters` (sample adds `time: "Pre"|"Post"`)
  - Investigation: `tier=AgentClass/AgentTarget` returns identical data on public cBioPortal — not worth adding
- Removed `studyViewUrl` from router response; LLM constructs `https://www.cbioportal.org/study?id={studyId}`
- Router prompt: added `needsStudySelection` semantics, treatments docs, improved metadata field descriptions
- Zod v4 fixes: `z.record(z.boolean())` → `z.record(z.string(), z.boolean())`; `error.errors` → `error.issues`

**2026-02-03: Group Comparison bug fixes & prompt alignment**
- `clinicalAttributeValues` filter case-insensitive; per-group URL generation triggers on value subset
- Prompt: `includeNA` defaults, Scenario A/B examples, drill-down guidance all aligned with code

## Change History (Condensed)

- **2026-02-02**: Group Comparison — `clinicalAttributeValues` subset selection, smart NA defaults (numerical: false, categorical: true), attribute metadata in response, numerical quartile binning, tab support, per-group studyview URLs, frontend number formatting alignment
- **2026-01-30**: Group Comparison tool — categorical grouping, NA handling, patient-level vs sample-level distinction
- **2026-01-27**: Tiered metadata (top 5 detailed, rest basic), AND keyword search (90% noise reduction), Map-based O(n) lookups
- **2026-01-20**: Prompts externalized to `.md` files, column-store URL rewriting fix, allSampleCount fix

## Architecture

```
src/
├── server/                   # Entry point, MCP server, Chat API
├── domain/                   # Business logic (router, studyView, patientView, resultsView)
└── infrastructure/           # API clients, resolvers, utilities
```

**Design:** Server → Domain → Infrastructure (three-layer separation)

## Key Design Decisions

### 1. Column-Store Integration
Standard API has bugs (`/api/studies/{id}` returns `allSampleCount: 1`). Solution: transparent URL rewriting to `/api/column-store/` for whitelisted endpoints. Regex must match full URLs (no `^` anchor). Two code paths: `studyKeywords` uses getAllStudies (accurate counts); `studyIds` uses getById (acceptable).

### 2. Multi-Provider API Key Resolution
LibreChat allows one `apiKey` field. Solution: ignore Authorization header, detect provider from model name (`claude-*`/`gemini-*`/`gpt-*`), use corresponding env var.

### 3. MCP Server as Single Source of Truth
Chat API connects to own MCP server internally. Tools defined once, used by both Claude Desktop and Chat API. Global singleton, lazy init.

### 4. Two-Tier Filter Metadata
Router returns only attribute IDs (~300 tokens). Dedicated `get_clinical_attribute_values` tool provides details on-demand. Avoids ~1,500 tokens per query when filters aren't needed.

### 5. Tiered Study Metadata
Keyword search: top 5 get full metadata (clinicalAttributes, molecularProfiles, treatments); rest get basic info. Direct studyIds: all get full metadata. AND keyword logic ensures relevance.

### 6. Manual Schema Maintenance
`src/domain/studyView/schemas/` — manual, not auto-generated. Source types have known issues; only ~20 of 121 schemas used; API is stable.

### 7. Group Comparison: NA & Patient-Level Handling
Patient-level attributes need special mapping: clinical data has `uniquePatientKey` (no `sampleId`), must map to all patient's samples. Default `includeNA: true` (differs from frontend — MCP must auto-decide). Numerical attributes use automatic quartile binning (4 equal-sized groups).

## Known Issues & Limitations

**API Quality Issues:**
- `/api/studies/{id}` has allSampleCount bug (returns 1)
- Workaround: Use getAllStudies (column-store) for accurate data

**Not Implemented:**
- StudyView URL parameters: sharedGroups, sharedCustomData, geneset_list
- Tool approval, strict mode schema validation
- Treatment tier data (AgentClass/AgentTarget) — no data on public instance

**Platform-specific:**
- LibreChat doesn't display tool calls in UI (tools work, but progress not visible to user)

## Development

**Build:**
- `npm run build` - Compile to dist/
- `npm run dev` - Run with tsx (no build needed)

**Claude Desktop config:**
- Path: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Entry point: `dist/server/index.js` (NOT `dist/index.js`)
- Must use absolute path, restart Claude Desktop after changes

**Adding tools:**
1. Create tool in `src/domain/<page>/tool.ts`
2. Register in `src/server/mcp/toolRegistry.ts`
3. Done (Chat API auto-syncs via MCP client)
