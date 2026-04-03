# Project Context

MCP server for AI-assisted cBioPortal navigation. Supports stdio mode for Claude Desktop and HTTP mode (Streamable HTTP transport) for remote MCP clients.

Six tools: `resolve_and_route`, `get_studyviewfilter_options`, `navigate_to_study_view`, `navigate_to_group_comparison`, `navigate_to_results_view`, `navigate_to_patient_view`. Prompts loaded from `src/prompts/*.md` at startup. Tool files use factory functions (`createXxxTool()`) so `loadPrompt()` runs after `initPrompts()`.

## Key Design Decisions

1. **Column-Store Integration** — `/api/studies/{id}` has `allSampleCount` bug (returns 1). Solution: transparent URL rewriting to `/api/column-store/` for whitelisted endpoints. `studyKeywords` uses getAllStudies (accurate counts); `studyIds` uses getById.

2. **Two-Tier Filter Metadata** — Router returns only attribute IDs (~300 tokens). `get_studyviewfilter_options` provides details on-demand (clinical + generic assay). Avoids ~1,500 tokens per query when filters aren't needed.

3. **Tiered Study Metadata** — Keyword search: top 5 get full metadata (clinicalAttributes, molecularProfiles, treatments); rest get basic info. Direct studyIds: all get full metadata.

4. **Manual Schema Maintenance** — `src/tools/studyView/schemas/` is manual, not auto-generated. Source types have known issues; only ~20 of 121 schemas used; API is stable.

5. **Group Comparison NA & Patient-Level** — Patient-level attributes map `uniquePatientKey` → all patient's samples. Default `includeNA: true` (differs from frontend). Numerical attributes use automatic quartile binning.

6. **StudyView→ResultsView via Session** — `navigate_to_results_view` with `studyViewFilter` fetches filtered samples, creates `POST /api/session/main_session`, returns `?session_id=...` URL.

7. **StudyView→PatientView via navCaseIds** — `navigate_to_patient_view` with `studyViewFilter`: ≤20 patients → PatientView URL with `navCaseIds` in hash (frontend's `handleLongUrls()` strips to `window.navCaseIdsCache` only at >60000 chars); >20 patients → StudyView URL with `filterJson`.

8. **Companion URLs** — Navigation tools return a `studyViewUrl` alongside the primary `url` when a filtered subset is involved:
    - `navigate_to_results_view` with `studyViewFilter`: returns `studyViewUrl` (StudyView with same filter) so users can explore the cohort.
    - `navigate_to_group_comparison`: always returns `studyViewUrl` (base study or with pre-filter). When pre-filter or value subset is used, also returns `groupUrls` (per-group StudyView URLs).
    - `system.md` instructs the LLM to present both links, and allows parallel navigation tool calls when a query spans multiple views.

9. **No targetPage Constraint** — `resolve_and_route` only resolves studies and returns metadata. The LLM decides which navigation tool(s) to call based on the selection guide in the tool description. This allows multi-tool calls and flexible routing in multi-turn conversations.

10. **Unselected Group (Wildtype/Complement)** — In `navigate_to_group_comparison` `groups` mode, one group may use `{ name, isUnselected: true }` instead of a `studyViewFilter`. This group receives all cohort samples NOT matched by any other group (complement). Implemented in `navigateToGroupComparisonByFilters`: fetches full cohort (with global `studyViewFilter` if provided), subtracts union of all filter-group samples. At most one unselected group allowed. No `groupUrl` is generated for the unselected group (no simple StudyView filter can express a complement).

11. **ResultsView Per-Gene Comparison Groups** — `navigate_to_results_view` accepts `comparisonSelectedGroups: string[]` to pre-select which groups appear in the comparison tab. With default OQL (no custom OQL), each queried gene gets its own group named after the gene symbol. Passing `["IDH1", "EGFR"]` compares IDH1-altered vs EGFR-altered samples (true altered = mutation + CNA + SV via OQL). Omit for default Altered vs Unaltered aggregate groups. Group name = gene symbol; `comparison_selectedGroups` is JSON-stringified in the URL.

12. **Plots Pre-Configuration** — Both `navigate_to_study_view` and `navigate_to_results_view` accept `plotsHorzSelection` / `plotsVertSelection` (tab must be `"plots"`). `selectedGeneOption` accepts Hugo symbol — resolved to Entrez ID automatically via `geneResolver.resolvePlotsGene()`. `selectedDataSourceOption` = profile suffix (strip `{studyId}_` prefix from molecular profile ID — e.g. `luad_tcga_pan_can_atlas_2018_rna_seq_v2_mrna` → `rna_seq_v2_mrna`); frontend matches by suffix across studies. For `dataType: "clinical_attribute"`, `selectedDataSourceOption` = clinical attribute ID (e.g. `CANCER_TYPE_DETAILED`). Valid `dataType` values: `MRNA_EXPRESSION`, `MUTATION_EXTENDED`, `COPY_NUMBER_ALTERATION`, `METHYLATION`, `PROTEIN_LEVEL`, `STRUCTURAL_VARIANT`, `clinical_attribute`. Default OQL coloring applied by frontend; `plotsColoringSelection` not exposed. For ResultsView plots, all genes referenced in either axis must be included in `genes` (frontend populates gene dropdowns only from queried genes).

13. **Tab-Level Page Descriptions** — All four navigation tools return a `pageDescription` field when a `tab` is specified. Descriptions are curated strings sourced from the cBioPortal frontend (not LLM-generated), stored in `src/tools/shared/pageDescriptions.ts`. Coverage: PatientView (`summary`, `clinicalData`, `pathways`), StudyView (`summary`, `clinicalData`, `cnSegments`, `plots`), ResultsView (19 tabs including comparison subtabs), GroupComparison (9 tabs including `generic_assay_*`). The LLM is instructed in `system.md` to use this field verbatim and not supplement it — the sanctioned way to describe what a page shows without hallucinating UI features.

## Frontend Reference (cbioportal-frontend)

Key enums/types referenced by this project:

- **PatientViewPageTabs** (`PatientViewPageTabs.tsx`): `summary`, `genomicEvolution`, `clinicalData`, `filesAndLinks`, `pathologyReport`, `tissueImage`, `MSKTissueImage`, `trialMatchTab`, `mutationalSignatures`, `pathways`
  - We expose only always-visible: `summary`, `clinicalData`, `pathways`
- **ResultsViewTab** (`ResultsViewPageHelpers.tsx`): `oncoprint`, `survival` (redirect→comparison), `cancerTypesSummary`, `mutualExclusivity`, `plots`, `mutations`, `structuralVariants`, `coexpression`, `comparison`, `cnSegments`, `network`, `pathways`, `expression` (redirect), `download`
  - `cnSegments`: runtime-validated via `validateTabAvailability` (shared with StudyView); ~57% of studies have segment data
  - `structuralVariants`: inferred from profile IDs (look for `_sv`/`_fusion`/`_structural_variants`)
  - `coexpression`: inferred from profile IDs (look for `_mrna`/`_rna_seq`/`_rppa`); single study only
- **ResultsViewComparisonSubTab** (`ResultsViewPageHelpers.tsx`): `overlap`, `survival`, `clinical`, `mrna`, `protein`, `dna_methylation`, `alterations`, `generic_assay` (prefix). URL pattern: `/results/comparison/{subtab}`. Our tool supports these via composite tab values like `comparison/protein`.
- **ResultsView comparison groups** (`ResultsViewComparisonUtils.ts`, `ResultsViewPageStore.ts`): two types — (1) aggregate `"Altered group"` / `"Unaltered group"` (default selection); (2) per-OQL-track groups, one per queried gene named after the gene symbol when using default OQL (e.g. `"IDH1"`, `"EGFR"`). Selected via `comparison_selectedGroups` URL param (JSON array of group names). Default OQL covers mutation + CNA + SV — per-gene groups therefore represent true "altered" for each gene. Our tool exposes this as `comparisonSelectedGroups: string[]`.
- **GroupComparisonTab** (`GroupComparisonTabs.ts`, `ComparisonStore.ts`, `EnrichmentsUtil.tsx`): Tab availability computed from molecular profiles + clinical attributes in `resolveAndRoute` → `availableComparisonTabs`. Always: `overlap`, `clinical`. Conditional: `survival` (paired `_STATUS`+`_MONTHS` attrs), `alterations` (`MUTATION_EXTENDED` or `COPY_NUMBER_ALTERATION`+`DISCRETE`), `mutations` (`MUTATION_EXTENDED`). Single-study only: `mrna` (`MRNA_EXPRESSION`), `protein` (`PROTEIN_LEVEL`), `dna_methylation` (`METHYLATION`), `generic_assay_{type_lowercase}` (one per `genericAssayType`). Default tab when none specified: `overlap` (frontend fallback in `GroupComparisonURLWrapper`).
- **ALTERATION_FILTER_DEFAULTS** (`StudyViewUtils.tsx`): `copyNumberAlterationEventTypes` only supports `AMP`/`HOMDEL`; for `GAIN`/`HETLOSS`/`DIPLOID` use `geneFilters`
- **navCaseIds** (`PatientViewUrlWrapper.ts`, `handleLongUrls.ts`): hashed URL param for cohort navigation; `handleLongUrls()` moves to `window.navCaseIdsCache` when >60000 chars
- **Column-store** (`proxyColumnStore.ts`): rewrites `$domain` to `/api/column-store` for whitelisted endpoints (ClinicalDataCounts, FilteredSamples, etc.)

## URL Safety

Hash params (`filterJson`) are URL-encoded via `encodeURIComponent` in `cbioportalUrlBuilder.ts` to ensure URLs are safe for embedding in markdown links. The LLM is instructed in `system.md` to always use the exact `url` field from tool responses verbatim.

## Known Limitations

- StudyView URL params not implemented: `sharedGroups`, `sharedCustomData`, `geneset_list`
- Treatment tier data (AgentClass/AgentTarget) — identical to base data on public cBioPortal
- Methylation profiles (hm27/hm450) have tens of thousands of probes — use `entitySearch` in `get_studyviewfilter_options` to filter by gene symbol or probe ID before returning results
