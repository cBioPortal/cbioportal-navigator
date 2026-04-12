/**
 * MCP tool for navigating to cBioPortal StudyView.
 *
 * StudyView provides cohort-level overview and analysis of cancer research
 * studies, including statistics, clinical features, survival analysis, and
 * custom visualizations. This tool handles study resolution, tab validation,
 * complex filtering, and plots configuration to generate properly formatted URLs.
 *
 * @remarks
 * Key exports:
 * - `navigateToStudyViewTool`: Tool definition with schema and documentation
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
import { studyResolver } from './shared/studyResolver.js';
import { geneResolver } from './shared/geneResolver.js';
import { buildStudyUrl } from './studyView/buildStudyUrl.js';
import { validateTabAvailability } from './studyView/validateStudyViewTab.js';
import {
    createNavigationResponse,
    createErrorResponse,
} from './shared/responses.js';
import type { ToolResponse } from './shared/types.js';
import { studyViewFilterSchema } from './studyView/schemas/index.js';
import { plotsSelectionParamSchema } from './shared/plotsSchemas.js';
import { loadPrompt } from './shared/promptLoader.js';
import { getStudyViewPageDescription } from './shared/pageDescriptions.js';

/**
 * Tool definition schema (without description, which is loaded at startup)
 */
const inputSchema = {
    studyIds: z
        .array(z.string())
        .min(1)
        .describe(
            'Array of validated study IDs (e.g., ["luad_tcga"] or ["luad_tcga", "lusc_tcga"] for cross-study). These should be pre-resolved by route_to_target_page tool.'
        ),
    tab: z
        .enum(['summary', 'clinicalData', 'cnSegments', 'plots'])
        .optional()
        .default('summary')
        .describe('Specific tab to navigate to'),

    // Comprehensive filtering
    filterJson: studyViewFilterSchema
        .partial()
        .optional()
        .describe(
            'Comprehensive StudyViewFilter object for complex multi-attribute filtering. Key types: clinicalDataFilters (by clinical attribute), geneFilters (gene mutation/CNA binary), mutationDataFilters (gene-specific mutation categorization: "MUTATED" vs "MUTATION_TYPE"), genomicDataFilters (gene-specific CNA discrete values or expression ranges), structuralVariantFilters (fusions). alterationFilter only needed for non-default settings (e.g., drivers-only, somatic-only). See tool description for profileType derivation and examples.'
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
            'Horizontal axis configuration for plots tab. Set selectedGeneOption to a Hugo gene symbol (e.g. "IDH1") — it will be resolved to an Entrez ID automatically.'
        ),

    plotsVertSelection: plotsSelectionParamSchema
        .optional()
        .describe(
            'Vertical axis configuration for plots tab. Same structure as plotsHorzSelection.'
        ),
};

/**
 * Factory function for MCP registration (call after initPrompts)
 */
export function createNavigateToStudyViewTool() {
    return {
        name: 'navigate_to_study_view',
        title: 'Navigate to StudyView',
        description: loadPrompt('navigator/navigate-to-study-view'),
        inputSchema,
    };
}

// Infer type from Zod schema
type NavigateToStudyViewInput = {
    studyIds: z.infer<typeof inputSchema.studyIds>;
    tab?: z.infer<typeof inputSchema.tab>;
    filterJson?: z.infer<typeof inputSchema.filterJson>;
    filterAttributeId?: z.infer<typeof inputSchema.filterAttributeId>;
    filterValues?: z.infer<typeof inputSchema.filterValues>;
    plotsHorzSelection?: z.infer<typeof inputSchema.plotsHorzSelection>;
    plotsVertSelection?: z.infer<typeof inputSchema.plotsVertSelection>;
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
                    text: JSON.stringify(result),
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
                    text: JSON.stringify(errorResponse),
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

    // Resolve gene symbols in plots selections to Entrez IDs
    const [plotsHorzSelection, plotsVertSelection] = await Promise.all([
        geneResolver.resolvePlotsGene(params.plotsHorzSelection),
        geneResolver.resolvePlotsGene(params.plotsVertSelection),
    ]);

    // Build URL with all parameters (supports multiple studies)
    const url = buildStudyUrl({
        studyIds: studyIds,
        tab: params.tab,
        filterJson: params.filterJson,
        filterAttributeId: params.filterAttributeId,
        filterValues: params.filterValues,
        plotsHorzSelection,
        plotsVertSelection,
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
            params.plotsHorzSelection || params.plotsVertSelection
        ),
        ...(getStudyViewPageDescription(params.tab) && {
            pageDescription: getStudyViewPageDescription(params.tab),
        }),
    });
}
