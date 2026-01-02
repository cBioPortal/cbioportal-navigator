# Development Status

## Project Goal

Build an MCP server that helps AI assistants navigate to cBioPortal pages by providing properly structured URL parameters and filter metadata.

## Current Status

### Completed Features

**Pages:**
- **StudyView** - Full support (filters, plots, tabs)
- **ResultsView** - Basic navigation
- **PatientView** - Basic navigation

**Infrastructure:**
- Domain-driven architecture (`src/{studyView,patientView,resultsView}/`)
- Unified API client (`src/shared/api/client.ts`)
- MCP Resources for filter metadata (Phase 1)
- Manual schema maintenance (`src/studyView/schemas/`)

### Not Implemented (Low Priority)

**StudyView Parameters:**
- `sharedGroups`, `sharedCustomData`, `geneset_list`, `generic_assay_groups`

**MCP Resources (Phase 2):**
- Detailed clinical data values per attribute
- Generic assay profiles
- Gene-specific genomic data values

## Architecture

### Directory Structure

```
src/
├── mcp/                       # MCP infrastructure
│   ├── router.ts             # Main routing (resolve_and_route)
│   ├── toolRegistry.ts       # Tool registration
│   └── resourceRegistry.ts   # Resource registration
│
├── studyView/                # StudyView domain
│   ├── mcp/
│   │   ├── tool.ts          # navigate_to_studyview
│   │   └── resources/       # clinical-attributes, case-lists, molecular-profiles
│   ├── schemas/             # filters.ts, urlParams.ts (manually maintained)
│   ├── urlBuilder.ts
│   └── tabValidator.ts
│
├── patientView/              # PatientView domain
├── resultsView/              # ResultsView domain
│
└── shared/                   # Shared infrastructure
    ├── api/
    │   ├── client.ts        # CbioportalApiClient (unified API wrapper)
    │   └── studyViewData.ts # StudyViewDataClient (filter metadata)
    ├── resolvers/           # studyResolver, geneResolver, profileResolver
    └── utils/               # config, types, responses, validators
```

**Design Principles:**
- Domain-driven: Each page type is self-contained
- Centralized infrastructure: MCP routing and registration
- Reusable components: Shared resolvers and API clients

## Schema Management

### Approach: Manual Maintenance

**Decision (2026-01):** Switched from ts-to-zod auto-generation to manual schemas.

**Reasons:**
- Source types in `cbioportal-ts-api-client` have known issues (e.g., `DataFilterValue` required fields should be optional XOR)
- Low usage rate: only ~20 of 121 generated schemas used
- API is stable; manual precision is more valuable

### Schema Files

Location: `src/studyView/schemas/`

| File | Content | Reference |
|------|---------|-----------|
| `filters.ts` | `StudyViewFilter` and nested types (288 lines) | Backend Java: `cbioportal/.../web/parameter/`<br>Frontend: `StudyViewPageStore.ts` |
| `urlParams.ts` | Plots configuration schemas | Frontend: `StudyViewURLWrapper.ts` |

### Maintenance Notes

- **URL params**: All are strings (even numeric IDs like entrez gene IDs)
- **Validation**: Test with actual API calls when updating `filters.ts`
- **Documentation**: Document corrections (e.g., DataFilterValue XOR constraints)

## MCP Resources (Phase 1)

MCP Resources provide AI with filter metadata, preventing guesswork when constructing `filterJson`.

### Implemented Resources

Location: `src/studyView/mcp/resources/`

| URI Pattern | Returns | Implementation |
|-------------|---------|----------------|
| `cbioportal://study/{studyId}/filters/clinical-attributes` | Clinical attribute IDs, names, types | `clinicalAttributes.ts` |
| `cbioportal://study/{studyId}/filters/case-lists` | Sample lists/cohorts | `caseLists.ts` |
| `cbioportal://study/{studyId}/filters/molecular-profiles` | Molecular data types | `molecularProfiles.ts` |

### Implementation References

All resources follow `cbioportal-frontend/src/pages/studyView/StudyViewPageStore.ts` patterns:

| Feature | Frontend Lines | Our Implementation |
|---------|---------------|-------------------|
| Clinical Attributes | 6137-6167 | `studyViewData.ts:getClinicalAttributes()` |
| Clinical Data Values | 4973-5033 | `studyViewData.ts:getClinicalDataValues()` |
| Case Lists | 11831-11837 | `studyViewData.ts:getCaseLists()` |
| Molecular Profiles | 5619-5633 | `studyViewData.ts:getMolecularProfiles()` |

### Design Notes

- **Study-specific only**: AI must resolve studyId first
- **Values without counts**: Keep responses concise
- **POST APIs**: Support multiple studyIds (follows frontend pattern)
- **Unified client**: Both public and internal APIs via `src/shared/api/client.ts`

## API Clients

### CbioportalApiClient

Location: `src/shared/api/client.ts`

Wraps both `CBioPortalAPI` and `CBioPortalAPIInternal` from `cbioportal-ts-api-client`.

**Methods:**
- `getAllStudies()`, `getStudy()`, `getGene()`, `getMolecularProfiles()`, `getCaseLists()`
- `getPatientsInStudy()`, `getPatient()`, `getSamplesForPatient()`
- `getRawApi()`, `getInternalApi()` (direct access)

**Singleton:** `apiClient`

### StudyViewDataClient

Location: `src/shared/api/studyViewData.ts`

Specialized client for StudyView filter metadata.

**Methods:**
- `getClinicalAttributes(studyIds)` - Deduplicated attributes
- `getClinicalDataValues(studyId, attributeId)` - Possible values
- `getCaseLists(studyId)` - Case lists with SUMMARY projection
- `getMolecularProfiles(studyIds)` - Molecular profiles

**Singleton:** `studyViewDataClient`

**Design:** Uses `apiClient.getInternalApi()` for StudyView-specific endpoints.

## Next Steps

### Potential Improvements

- **Caching**: Resource metadata could be cached to reduce API calls
- **Phase 2 Resources**: Detailed clinical data values, generic assay profiles
- **Extended Pages**: More parameters for ResultsView/PatientView if needed

### Development Workflow

- **Schema updates**: Edit `src/studyView/schemas/filters.ts` and test with API calls
- **New resources**: Add to `src/studyView/mcp/resources/` and register in `resourceRegistry.ts`
- **New tools**: Add to domain `mcp/tool.ts` and register in `toolRegistry.ts`
