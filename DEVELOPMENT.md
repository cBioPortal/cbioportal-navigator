# Development Status

## Project Goal

Build an MCP server that helps AI assistants navigate to cBioPortal pages by providing properly structured URL parameters. The AI needs to understand the correct format for each parameter.

## Current Progress

### StudyView Page ✅ (Complete)

**Implemented Parameters:**
- `studyIds` - Study identifiers
- `tab` - Tab selection (summary, clinicalData, cnSegments, plots)
- `filterJson` - Comprehensive filtering (auto-generated from cbioportal-ts-api-client)
- `filterAttributeId` + `filterValues` - Legacy simple filtering
- `plots_horz_selection`, `plots_vert_selection`, `plots_coloring_selection` - Plots configuration

**Not Implemented (Low Priority):**
- `sharedGroups` - Shared sample groups
- `sharedCustomData` - Custom data sharing
- `geneset_list` - Gene set lists
- `generic_assay_groups` - Generic assay grouping

### ResultsView Page
Status: Implemented (basic support)

### PatientView Page
Status: Implemented (basic support)

## Schema Architecture

### Two Types of Schemas

| Schema Category | Source | Location | Maintenance Method |
|----------------|--------|----------|-------------------|
| **API Types** (filterJson) | cbioportal-ts-api-client npm package | `src/shared/schemas/cbioportal.ts` | Auto-generated via ts-to-zod |
| **URL Params** (plots, etc.) | cbioportal-frontend source code | `src/pages/*/schemas.ts` | Manually maintained |

### Update Workflows

**For API types (filterJson):**
```bash
npm run generate:schemas
# Reads from: node_modules/cbioportal-ts-api-client/dist/generated/CBioPortalAPIInternal.d.ts
# Generates: src/shared/schemas/cbioportal.ts
```

**For URL params (plots):**
- Manually edit `src/pages/studyViewPage/schemas.ts`
- Copy type definitions from cbioportal-frontend when needed
- These types are stable and rarely change

## Key Technical Notes

### URL Parameter Types
- All URL parameters are **strings** (even numeric IDs like entrez gene IDs)
- Example: `selectedGeneOption: z.string()` not `z.number()`

### StudyView URL Parameters
- **StudyViewURLQuery**: Complete type definition (15+ parameters) in frontend
- **StudyViewURLWrapper**: Frontend class that only manages subset (7 parameters)
- **Our MCP tool**: Can use all parameters from URLQuery, not limited by URLWrapper

### Type Sources (Frontend Reference)

**From cbioportal-frontend repository:**

| Type | Frontend File | Lines |
|------|---------------|-------|
| `PlotsSelectionParam` | `src/pages/studyView/StudyViewURLWrapper.ts` | 9-18 |
| `PlotsColoringParam` | `src/pages/studyView/StudyViewURLWrapper.ts` | 31-37 |
| `StudyViewURLQuery` | `src/pages/studyView/StudyViewPageStore.ts` | Type export |

**From cbioportal-ts-api-client package:**
- `StudyViewFilter` (for `filterJson`) → Auto-available via npm package

## Future Considerations

- Plots parameters are stable; manual maintenance is acceptable
- If frontend changes plots structure frequently, consider semi-automated extraction
- Main focus: Keep AI model informed of correct parameter formats via accurate Zod schemas
