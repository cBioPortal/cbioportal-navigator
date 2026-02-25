/**
 * MCP tool for navigating to cBioPortal ResultsView (OncoPrint).
 *
 * ResultsView analyzes specific genes across samples, displaying alteration
 * patterns through OncoPrint matrices, mutation details, copy number analysis,
 * co-occurrence patterns, survival curves, and expression correlations. This
 * tool handles study resolution, gene validation, and complex URL construction.
 *
 * @remarks
 * Key exports:
 * - `navigateToResultsViewTool`: Tool definition with schema and documentation
 * - `handleNavigateToResultsView()`: MCP tool handler
 * - `navigateToResultsView()`: Core navigation logic
 *
 * Features:
 * - Study resolution via keywords or direct studyId
 * - Batch gene validation (filters out invalid genes)
 * - Supports tabs: oncoprint, mutations, cna, plots, survival, coexpression, enrichments, pathways
 * - Optional case set selection and Z-score thresholds
 * - Default case set: {studyId}_all (all samples)
 *
 * Architecture:
 * Uses studyResolver for study identification, geneResolver for gene validation,
 * profileResolver for metadata, and buildResultsUrl for URL construction. Returns
 * success response with validated genes, or ambiguity/error responses.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { studyResolver } from './router/studyResolver.js';
import { geneResolver } from './router/geneResolver.js';
import { profileResolver } from './router/profileResolver.js';
import { buildResultsUrl } from './resultsView/buildResultsUrl.js';
import { MainSessionClient } from './resultsView/mainSessionClient.js';
import { apiClient } from './shared/cbioportalClient.js';
import { getConfig } from './shared/config.js';
import { buildCBioPortalPageUrl } from './shared/cbioportalUrlBuilder.js';
import {
    createNavigationResponse,
    createErrorResponse,
} from './shared/responses.js';
import type { ToolResponse } from './shared/types.js';
import { loadPrompt } from './shared/promptLoader.js';
import { buildStudyUrl } from './studyView/buildStudyUrl.js';

/**
 * Tool definition for MCP registration
 */
export const navigateToResultsViewTool = {
    name: 'navigate_to_results_view',
    title: 'Navigate to ResultsView',
    description: loadPrompt('navigate_to_results_view.md'),
    inputSchema: {
        studyIds: z
            .array(z.string())
            .min(1)
            .describe(
                'Array of validated study IDs (e.g., ["luad_tcga"] or ["luad_tcga", "lusc_tcga"] for cross-study). These should be pre-resolved by route_to_target_page tool.'
            ),
        genes: z
            .array(z.string())
            .min(1)
            .describe('Gene symbols (required, at least 1)'),
        caseSetId: z
            .string()
            .optional()
            .describe('Case set ID (defaults to {studyId}_all)'),
        tab: z
            .enum([
                'oncoprint',
                'mutations',
                'structuralVariants',
                'cancerTypesSummary',
                'mutualExclusivity',
                'plots',
                'survival',
                'coexpression',
                'comparison',
                'cnSegments',
                'pathways',
                'download',
            ])
            .optional()
            .describe('Specific tab to navigate to'),
        zScoreThreshold: z
            .number()
            .optional()
            .describe('Z-score threshold for expression data'),
        rppaScoreThreshold: z
            .number()
            .optional()
            .describe('RPPA score threshold for protein data'),
        studyViewFilter: z
            .record(z.string(), z.any())
            .optional()
            .describe(
                'StudyViewFilter object to restrict analysis to a filtered sample subset. When provided, fetches matching samples and creates a session-based URL (?session_id=...). Same format as navigate_to_study_view filterJson.'
            ),
    },
};

// Infer type from Zod schema
type NavigateToResultsViewInput = {
    studyIds: z.infer<typeof navigateToResultsViewTool.inputSchema.studyIds>;
    genes: z.infer<typeof navigateToResultsViewTool.inputSchema.genes>;
    caseSetId?: z.infer<typeof navigateToResultsViewTool.inputSchema.caseSetId>;
    tab?: z.infer<typeof navigateToResultsViewTool.inputSchema.tab>;
    zScoreThreshold?: z.infer<
        typeof navigateToResultsViewTool.inputSchema.zScoreThreshold
    >;
    rppaScoreThreshold?: z.infer<
        typeof navigateToResultsViewTool.inputSchema.rppaScoreThreshold
    >;
    studyViewFilter?: z.infer<
        typeof navigateToResultsViewTool.inputSchema.studyViewFilter
    >;
};

/**
 * Tool handler for MCP
 */
export async function handleNavigateToResultsView(
    input: NavigateToResultsViewInput
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
        const result = await navigateToResultsView(input);
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
 * Main navigation logic for ResultsView
 */
async function navigateToResultsView(
    params: NavigateToResultsViewInput
): Promise<ToolResponse> {
    const { studyIds } = params;

    // studyIds are already validated by router, no need to validate again

    // 1. Validate genes
    if (!params.genes || params.genes.length === 0) {
        return createErrorResponse('At least one gene must be provided');
    }

    const validGenes = await geneResolver.validateBatch(params.genes);

    if (validGenes.length === 0) {
        return createErrorResponse('No valid genes found', {
            providedGenes: params.genes,
        });
    }

    if (validGenes.length < params.genes.length) {
        const invalidGenes = params.genes.filter(
            (g) => !validGenes.includes(g)
        );
        console.warn(
            `Some genes were invalid and skipped: ${invalidGenes.join(', ')}`
        );
    }

    // Get study details and profiles (used in both paths)
    const [studyDetails, profiles] = await Promise.all([
        Promise.all(studyIds.map((id) => studyResolver.getById(id))),
        Promise.all(
            studyIds.map((id) => profileResolver.getForStudy(id, 'mutation'))
        ),
    ]);

    // 2a. Filter path: fetch samples → create session → session_id URL
    if (params.studyViewFilter) {
        const filter = { ...params.studyViewFilter, studyIds };
        const samples = await apiClient.fetchFilteredSamples(filter);

        if (samples.length === 0) {
            return createErrorResponse(
                'No samples match the provided studyViewFilter'
            );
        }

        const caseIds = samples
            .map((s) => `${s.studyId}:${s.sampleId}`)
            .join('+');

        const config = getConfig();
        const sessionClient = new MainSessionClient(config.baseUrl);
        const { id: sessionId } = await sessionClient.createSession({
            cancer_study_list: studyIds.join(','),
            gene_list: validGenes.join(' '),
            case_set_id: '-1',
            case_ids: caseIds,
            tab_index: 'tab_visualize',
            Action: 'Submit',
            ...(params.zScoreThreshold !== undefined && {
                Z_SCORE_THRESHOLD: String(params.zScoreThreshold),
            }),
            ...(params.rppaScoreThreshold !== undefined && {
                RPPA_SCORE_THRESHOLD: String(params.rppaScoreThreshold),
            }),
        });

        const url = buildCBioPortalPageUrl(
            params.tab ? `/results/${params.tab}` : '/results',
            { session_id: sessionId }
        );

        // Build companion StudyView URL for exploring the filtered cohort
        const studyViewUrl = buildStudyUrl({
            studyIds,
            filterJson: params.studyViewFilter,
        });

        return createNavigationResponse(url, {
            studyIds,
            studies: studyDetails.map((s) => ({
                studyId: s.studyId,
                name: s.name,
                sampleCount: s.allSampleCount,
            })),
            genes: validGenes,
            filteredSampleCount: samples.length,
            caseSetId: '-1',
            sessionId,
            molecularProfiles: profiles
                .filter((p) => p)
                .map((p) => p!.molecularProfileId),
            studyViewUrl,
        });
    }

    // 2b. Default path: case set ID
    let caseSetId: string;
    if (params.caseSetId) {
        caseSetId = params.caseSetId;
    } else if (studyIds.length === 1) {
        caseSetId = `${studyIds[0]}_all`;
    } else {
        caseSetId = 'all';
    }

    // 3. Build URL (supports multiple studies)
    const url = buildResultsUrl({
        studies: studyIds,
        genes: validGenes,
        caseSelection: {
            type: 'case_set',
            caseSetId,
        },
        tab: params.tab,
    });

    return createNavigationResponse(url, {
        studyIds,
        studies: studyDetails.map((s) => ({
            studyId: s.studyId,
            name: s.name,
            sampleCount: s.allSampleCount,
        })),
        genes: validGenes,
        caseSetId,
        molecularProfiles: profiles
            .filter((p) => p)
            .map((p) => p!.molecularProfileId),
    });
}
