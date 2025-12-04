/**
 * MCP Tool: navigate_to_studyview
 * Navigate to cBioPortal StudyView page
 */

import { z } from 'zod';
import { studyResolver } from '../resolution/studyResolver.js';
import { buildStudyUrl } from '../urlBuilders/study.js';
import { validateTabAvailability } from '../resolution/tabValidator.js';
import {
    createSuccessResponse,
    createAmbiguityResponse,
    createErrorResponse,
} from './common/responses.js';
import type { ToolResponse } from './common/types.js';

/**
 * Tool definition for MCP registration
 */
export const navigateToStudyViewTool = {
    name: 'navigate_to_studyview',
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

Study Selection (required - pick one):
- studyId: Direct study ID (e.g., "luad_tcga") OR
- studyKeywords: Array of keywords to search studies (e.g., ["TCGA", "lung"])

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
- "Show me the TCGA lung cancer study" → studyKeywords: ["TCGA", "lung"]
- "Navigate to BRCA study clinical data" → studyId: "brca_tcga", tab: "clinicalData"
- "Show CN segments for LUAD study" → studyId: "luad_tcga", tab: "cnSegments"
  (Will validate if CN data exists before generating URL)

Simple filtering (use filterAttributeId/filterValues):
- "Filter lung study by patients age 40-60" →
  studyKeywords: ["TCGA", "lung"], filterAttributeId: "AGE", filterValues: "40-60"
- "Show only female patients" →
  studyId: "brca_tcga", filterAttributeId: "SEX", filterValues: "Female"

Complex filtering (use filterJson):
- "Show LUAD patients with TP53 mutations" →
  studyId: "luad_tcga", filterJson: {
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
  studyId: "luad_tcga", tab: "plots",
  plotsHorzSelection: {dataType: "clinical_attribute", selectedDataSourceOption: "AGE"},
  plotsVertSelection: {dataType: "clinical_attribute", selectedDataSourceOption: "OS_MONTHS"}

Tab validation examples:
- Request cnSegments for study WITHOUT CN data → Error returned with clear reason
- Request clinicalData for study WITHOUT samples → Error returned
- Request summary or plots → Always works, no validation needed`,
    inputSchema: {
        studyKeywords: z
            .array(z.string())
            .optional()
            .describe(
                'Keywords to search for studies (e.g., ["TCGA", "lung"])'
            ),
        studyId: z
            .string()
            .optional()
            .describe('Direct study ID (e.g., "luad_tcga")'),
        tab: z
            .enum(['summary', 'clinicalData', 'cnSegments', 'plots'])
            .optional()
            .describe('Specific tab to navigate to'),

        // Comprehensive filtering
        filterJson: z
            .record(z.any())
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
        plotsHorzSelection: z
            .record(z.any())
            .optional()
            .describe(
                'Horizontal axis configuration for plots tab. Fields: selectedGeneOption (number), dataType (string), selectedDataSourceOption (string), logScale ("true"/"false").'
            ),

        plotsVertSelection: z
            .record(z.any())
            .optional()
            .describe(
                'Vertical axis configuration for plots tab. Same structure as plotsHorzSelection.'
            ),

        plotsColoringSelection: z
            .record(z.any())
            .optional()
            .describe(
                'Point coloring configuration for plots tab. Fields: selectedOption (string), colorByMutationType ("true"/"false"), colorByCopyNumber ("true"/"false").'
            ),
    },
};

// Infer type from Zod schema
type NavigateToStudyViewInput = {
    studyKeywords?: z.infer<
        typeof navigateToStudyViewTool.inputSchema.studyKeywords
    >;
    studyId?: z.infer<typeof navigateToStudyViewTool.inputSchema.studyId>;
    tab?: z.infer<typeof navigateToStudyViewTool.inputSchema.tab>;
    filterJson?: z.infer<typeof navigateToStudyViewTool.inputSchema.filterJson>;
    filterAttributeId?: z.infer<
        typeof navigateToStudyViewTool.inputSchema.filterAttributeId
    >;
    filterValues?: z.infer<
        typeof navigateToStudyViewTool.inputSchema.filterValues
    >;
    plotsHorzSelection?: z.infer<
        typeof navigateToStudyViewTool.inputSchema.plotsHorzSelection
    >;
    plotsVertSelection?: z.infer<
        typeof navigateToStudyViewTool.inputSchema.plotsVertSelection
    >;
    plotsColoringSelection?: z.infer<
        typeof navigateToStudyViewTool.inputSchema.plotsColoringSelection
    >;
};

/**
 * Tool handler for MCP
 */
export async function handleNavigateToStudyView(
    input: NavigateToStudyViewInput
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
        const result = await navigateToStudyView(input);
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
async function navigateToStudyView(
    params: NavigateToStudyViewInput
): Promise<ToolResponse> {
    let studyId: string;

    // Resolve study ID
    if (params.studyId) {
        // Direct ID provided, validate it
        const isValid = await studyResolver.validate(params.studyId);
        if (!isValid) {
            return createErrorResponse(
                `Study ID "${params.studyId}" not found`
            );
        }
        studyId = params.studyId;
    } else if (params.studyKeywords && params.studyKeywords.length > 0) {
        // Search by keywords
        const matches = await studyResolver.search(params.studyKeywords);

        if (matches.length === 0) {
            return createErrorResponse('No matching studies found', {
                searchTerms: params.studyKeywords,
            });
        }

        if (matches.length > 1) {
            // Return options for user to choose
            return createAmbiguityResponse(
                'Multiple studies found. Please specify which one:',
                matches.map((s) => ({
                    studyId: s.studyId,
                    name: s.name,
                    description: s.description,
                    sampleCount: s.allSampleCount,
                }))
            );
        }

        studyId = matches[0].studyId;
    } else {
        return createErrorResponse(
            'Either studyId or studyKeywords must be provided'
        );
    }

    // Validate tab availability if tab specified
    if (params.tab && params.tab !== 'summary') {
        const validation = await validateTabAvailability(studyId, params.tab);

        if (!validation.available) {
            return createErrorResponse(
                `Tab "${params.tab}" is not available for study "${studyId}"`,
                {
                    reason: validation.reason,
                    requestedTab: params.tab,
                    studyId,
                    suggestion:
                        'Try "summary" or "plots" tabs which are always available',
                }
            );
        }
    }

    // Build URL with all parameters
    const url = buildStudyUrl({
        studyIds: studyId,
        tab: params.tab,
        filterJson: params.filterJson,
        filterAttributeId: params.filterAttributeId,
        filterValues: params.filterValues,
        plotsHorzSelection: params.plotsHorzSelection,
        plotsVertSelection: params.plotsVertSelection,
        plotsColoringSelection: params.plotsColoringSelection,
    });

    // Get study details for metadata
    const studyDetails = await studyResolver.getById(studyId);

    return createSuccessResponse(url, {
        studyId,
        studyName: studyDetails.name,
        tab: params.tab,
        hasFilters: !!(params.filterJson || params.filterAttributeId),
        hasPlotsConfig: !!(
            params.plotsHorzSelection ||
            params.plotsVertSelection ||
            params.plotsColoringSelection
        ),
    });
}
