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
import {
    createNavigationResponse,
    createErrorResponse,
} from './shared/responses.js';
import type { ToolResponse } from './shared/types.js';
import { loadPrompt } from './shared/promptLoader.js';

/**
 * Tool definition for MCP registration
 */
export const navigateToResultsViewTool = {
    name: 'navigate_to_resultsview_page',
    title: 'Navigate to ResultsView',
    description: loadPrompt('navigate_to_resultsview.md'),
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
                'cna',
                'plots',
                'survival',
                'coexpression',
                'enrichments',
                'pathways',
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

    // 2. Determine case set ID
    // For single study: use {studyId}_all (e.g., "luad_tcga_all")
    // For multi-study: use "all"
    // User can override with params.caseSetId
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

    // Get study details for metadata
    const studyDetails = await Promise.all(
        studyIds.map((id) => studyResolver.getById(id))
    );

    // Get molecular profiles (optional, for metadata)
    const profiles = await Promise.all(
        studyIds.map((id) => profileResolver.getForStudy(id, 'mutation'))
    );

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
