/**
 * MCP tool for navigating to cBioPortal StudyView pages.
 *
 * StudyView provides cohort-level overview and analysis of cancer research
 * studies, including statistics, clinical features, survival analysis, and
 * custom visualizations. This tool handles study resolution, tab validation,
 * complex filtering, and plots configuration to generate properly formatted URLs.
 *
 * @remarks
 * Key exports:
 * - `navigateToStudyViewPageTool`: Tool definition with schema and documentation
 * - `handleNavigateToStudyView()`: MCP tool handler
 * - `navigateToStudyView()`: Core navigation logic
 *
 * Features:
 * - Study resolution via keywords or direct studyId
 * - Tab validation (summary, clinicalData, cnSegments, plots)
 * - Complex filtering via filterJson (StudyViewFilter object)
 * - Legacy filtering via filterAttributeId + filterValues
 * - Plots configuration (axis selection, coloring)
 *
 * Architecture:
 * Uses studyResolver for study identification, tabValidator for data availability
 * checks, and buildStudyUrl for URL construction. Returns success response with
 * URL and metadata, ambiguity response for multiple matches, or error response.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { studyResolver } from '../../infrastructure/resolvers/studyResolver.js';
import { buildStudyUrl } from './buildStudyUrl.js';
import { validateTabAvailability } from './validateStudyViewTab.js';
import {
    createNavigationResponse,
    createErrorResponse,
} from '../shared/responses.js';
import type { ToolResponse } from '../shared/types.js';
import {
    studyViewFilterSchema,
    plotsSelectionParamSchema,
    plotsColoringParamSchema,
} from './schemas/index.js';

/**
 * Tool definition for MCP registration
 */
export const navigateToStudyViewPageTool = {
    name: 'navigate_to_studyview_page',
    title: 'Navigate to StudyView Page',
    description: `Navigate to cBioPortal StudyView page - research cohort overview and analysis.

WHAT IS STUDYVIEW:
StudyView provides a comprehensive overview of a research cohort, including:
- Cohort statistics: sample counts, patient demographics, genomic summaries
- Clinical features: age, gender, stage, treatment information
- Genomic overview: most frequent mutations, copy number alterations, fusions
- Survival analysis: overall survival, disease-free survival curves
- Custom charts: visualizations of any data dimension

AVAILABLE TABS:
- summary: Study overview with key statistics (always available, default)
- clinicalData: Clinical data table view (validated for sample availability)
- cnSegments: Copy number segments view (validated for CN data existence)
- plots: Custom scatter plots and charts (always available)

TAB VALIDATION:
The navigator validates tab availability before generating URLs. If you request a tab
that doesn't have data for the study, you'll receive a clear error message explaining
why, rather than generating a URL that would just redirect to Summary.

ALWAYS AVAILABLE: summary, plots
CONDITIONALLY AVAILABLE: clinicalData, cnSegments (validated automatically)

PARAMETERS:

Study Selection (required):
- studyIds: Array of validated study IDs (e.g., ["luad_tcga", "brca_tcga"])
  * For single study: ["luad_tcga"]
  * For cross-study analysis: ["luad_tcga", "lusc_tcga"]
  * These should be pre-resolved by route_to_target_page tool

Tab Selection (optional):
- tab: Specific tab to navigate to

Filtering (optional):

1. filterJson - Comprehensive filtering with StudyViewFilter object
   Use for complex multi-attribute filtering. Supports:
   - clinicalDataFilters: Filter by clinical attributes (age, gender, stage, etc.)
     Example: {attributeId: "AGE", values: [{start: 40, end: 60}]}
   - geneFilters: Filter by gene mutations or alterations
     Example: {molecularProfileIds: ["study_mutations"], geneQueries: [[{hugoGeneSymbol: "TP53"}]]}
     Full GeneFilterQuery structure with all fields is supported.
   - genomicDataFilters: Filter by genomic data values (CNV, expression, etc.)
   - mutationDataFilters: Filter by mutation properties
   - sampleIdentifiers: Specific sample selection
     Example: [{studyId: "luad_tcga", sampleId: "TCGA-05-4244-01"}]
   - And 15+ more filter types - see StudyViewFilter type for complete list

2. filterAttributeId + filterValues - Legacy simple filtering
   Use for single clinical attribute filtering only
   - filterAttributeId: Clinical attribute ID (e.g., "AGE", "CANCER_TYPE", "SEX")
   - filterValues: Comma-separated values or ranges
     * For numeric: "40-60,70-80" (ranges)
     * For categorical: "Female,Male" (values)

Plots Configuration (optional - for plots tab):
- plotsHorzSelection: Configure horizontal axis
  * selectedGeneOption: Gene entrez ID (number)
  * dataType: "clinical_attribute", "MRNA_EXPRESSION", "MUTATION_EXTENDED", etc.
  * selectedDataSourceOption: Clinical attribute ID or data source
  * logScale: "true" or "false"

- plotsVertSelection: Configure vertical axis (same structure as horizontal)

- plotsColoringSelection: Configure point coloring
  * selectedOption: Coloring attribute
  * colorByMutationType: "true" or "false"
  * colorByCopyNumber: "true" or "false"

TYPICAL USE CASES:

Basic navigation:
- "Show me the TCGA lung cancer study" → studyIds: ["luad_tcga"]
- "Navigate to BRCA study clinical data" → studyIds: ["brca_tcga"], tab: "clinicalData"
- "Show CN segments for LUAD study" → studyIds: ["luad_tcga"], tab: "cnSegments"
  (Will validate if CN data exists before generating URL)
- "Compare TCGA lung adenocarcinoma and squamous" → studyIds: ["luad_tcga", "lusc_tcga"]

Simple filtering (use filterAttributeId/filterValues):
- "Filter lung study by patients age 40-60" →
  studyIds: ["luad_tcga"], filterAttributeId: "AGE", filterValues: "40-60"
- "Show only female patients" →
  studyIds: ["brca_tcga"], filterAttributeId: "SEX", filterValues: "Female"

Complex filtering (use filterJson):
- "Show LUAD patients with TP53 mutations" →
  studyIds: ["luad_tcga"], filterJson: {
    geneFilters: [{
      molecularProfileIds: ["luad_tcga_mutations"],
      geneQueries: [[{hugoGeneSymbol: "TP53"}]]
    }]
  }
- "Filter by age 40-60 AND stage III/IV" →
  filterJson: {
    clinicalDataFilters: [
      {attributeId: "AGE", values: [{start: 40, end: 60}]},
      {attributeId: "STAGE", values: [{value: "Stage III"}, {value: "Stage IV"}]}
    ]
  }

Plots configuration:
- "Open plots tab with age vs survival" →
  studyIds: ["luad_tcga"], tab: "plots",
  plotsHorzSelection: {dataType: "clinical_attribute", selectedDataSourceOption: "AGE"},
  plotsVertSelection: {dataType: "clinical_attribute", selectedDataSourceOption: "OS_MONTHS"}

Tab validation examples:
- Request cnSegments for study WITHOUT CN data → Error returned with clear reason
- Request clinicalData for study WITHOUT samples → Error returned
- Request summary or plots → Always works, no validation needed`,
    inputSchema: {
        studyIds: z
            .array(z.string())
            .min(1)
            .describe(
                'Array of validated study IDs (e.g., ["luad_tcga"] or ["luad_tcga", "lusc_tcga"] for cross-study). These should be pre-resolved by route_to_target_page tool.'
            ),
        tab: z
            .enum(['summary', 'clinicalData', 'cnSegments', 'plots'])
            .optional()
            .describe('Specific tab to navigate to'),

        // Comprehensive filtering
        filterJson: studyViewFilterSchema
            .partial()
            .optional()
            .describe(
                'Comprehensive StudyViewFilter object for complex multi-attribute filtering. Supports clinicalDataFilters, geneFilters, genomicDataFilters, genomicProfiles, mutationDataFilters, sampleIdentifiers, and 15+ more filter types. See examples in tool description.'
            ),

        // Legacy simple filtering
        filterAttributeId: z
            .string()
            .optional()
            .describe(
                'Clinical attribute ID for simple single-attribute filtering (e.g., "AGE", "CANCER_TYPE", "SEX"). Use with filterValues.'
            ),

        filterValues: z
            .string()
            .optional()
            .describe(
                'Comma-separated values or ranges for filterAttributeId. For numeric: "40-60,70-80". For categorical: "Female,Male".'
            ),

        // Plots configuration
        plotsHorzSelection: plotsSelectionParamSchema
            .optional()
            .describe(
                'Horizontal axis configuration for plots tab. Fields: selectedGeneOption (number), dataType (string), selectedDataSourceOption (string), logScale ("true"/"false").'
            ),

        plotsVertSelection: plotsSelectionParamSchema
            .optional()
            .describe(
                'Vertical axis configuration for plots tab. Same structure as plotsHorzSelection.'
            ),

        plotsColoringSelection: plotsColoringParamSchema
            .optional()
            .describe(
                'Point coloring configuration for plots tab. Fields: selectedOption (string), colorByMutationType ("true"/"false"), colorByCopyNumber ("true"/"false").'
            ),
    },
};

// Infer type from Zod schema
type NavigateToStudyViewPageInput = {
    studyIds: z.infer<typeof navigateToStudyViewPageTool.inputSchema.studyIds>;
    tab?: z.infer<typeof navigateToStudyViewPageTool.inputSchema.tab>;
    filterJson?: z.infer<
        typeof navigateToStudyViewPageTool.inputSchema.filterJson
    >;
    filterAttributeId?: z.infer<
        typeof navigateToStudyViewPageTool.inputSchema.filterAttributeId
    >;
    filterValues?: z.infer<
        typeof navigateToStudyViewPageTool.inputSchema.filterValues
    >;
    plotsHorzSelection?: z.infer<
        typeof navigateToStudyViewPageTool.inputSchema.plotsHorzSelection
    >;
    plotsVertSelection?: z.infer<
        typeof navigateToStudyViewPageTool.inputSchema.plotsVertSelection
    >;
    plotsColoringSelection?: z.infer<
        typeof navigateToStudyViewPageTool.inputSchema.plotsColoringSelection
    >;
};

/**
 * Tool handler for MCP
 */
export async function handleNavigateToStudyViewPage(
    input: NavigateToStudyViewPageInput
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
        const result = await navigateToStudyViewPage(input);
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    } catch (error) {
        const errorResponse = createErrorResponse(
            error instanceof Error ? error.message : 'Unknown error occurred',
            error
        );
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(errorResponse, null, 2),
                },
            ],
        };
    }
}

/**
 * Main navigation logic for StudyView
 */
async function navigateToStudyViewPage(
    params: NavigateToStudyViewPageInput
): Promise<ToolResponse> {
    const { studyIds } = params;

    // studyIds are already validated by router, no need to validate again
    // Just validate tab availability for each study if needed
    if (params.tab && params.tab !== 'summary' && params.tab !== 'plots') {
        // Only validate for conditionally available tabs (clinicalData, cnSegments)
        const validationResults = await Promise.all(
            studyIds.map(async (id) => ({
                studyId: id,
                validation: await validateTabAvailability(id, params.tab!),
            }))
        );

        const unavailableStudies = validationResults.filter(
            (r) => !r.validation.available
        );

        if (unavailableStudies.length > 0) {
            return createErrorResponse(
                `Tab "${params.tab}" is not available for some studies`,
                {
                    unavailableStudies: unavailableStudies.map((s) => ({
                        studyId: s.studyId,
                        reason: s.validation.reason,
                    })),
                    requestedTab: params.tab,
                    suggestion:
                        'Try "summary" or "plots" tabs which are always available',
                }
            );
        }
    }

    // Build URL with all parameters (supports multiple studies)
    const url = buildStudyUrl({
        studyIds: studyIds,
        tab: params.tab,
        filterJson: params.filterJson,
        filterAttributeId: params.filterAttributeId,
        filterValues: params.filterValues,
        plotsHorzSelection: params.plotsHorzSelection,
        plotsVertSelection: params.plotsVertSelection,
        plotsColoringSelection: params.plotsColoringSelection,
    });

    // Get study details for metadata
    const studyDetails = await Promise.all(
        studyIds.map((id) => studyResolver.getById(id))
    );

    return createNavigationResponse(url, {
        studyIds,
        studies: studyDetails.map((s) => ({
            studyId: s.studyId,
            name: s.name,
            sampleCount: s.allSampleCount,
        })),
        tab: params.tab,
        hasFilters: !!(params.filterJson || params.filterAttributeId),
        hasPlotsConfig: !!(
            params.plotsHorzSelection ||
            params.plotsVertSelection ||
            params.plotsColoringSelection
        ),
    });
}
