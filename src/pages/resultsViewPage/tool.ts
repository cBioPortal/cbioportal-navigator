/**
 * MCP tool for navigating to cBioPortal ResultsView (OncoPrint) pages.
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
import { studyResolver } from '../../shared/resolvers/studyResolver.js';
import { geneResolver } from '../../shared/resolvers/geneResolver.js';
import { profileResolver } from '../../shared/resolvers/profileResolver.js';
import { buildResultsUrl } from './urlBuilder.js';
import {
    createSuccessResponse,
    createErrorResponse,
} from '../../shared/utils/responses.js';
import type { ToolResponse } from '../../shared/utils/types.js';

/**
 * Tool definition for MCP registration
 */
export const navigateToResultsViewTool = {
    name: 'navigate_to_resultsview',
    title: 'Navigate to ResultsView page',
    description: `Navigate to cBioPortal ResultsView page - gene alteration analysis across samples.

WHAT IS RESULTSVIEW:
ResultsView (also known as Query Page) analyzes specific gene alterations across samples:
- OncoPrint matrix: visual display of multi-gene alteration patterns
- Mutation details: amino acid changes, functional impact, frequency statistics
- Copy number analysis: amplifications and deletions distribution
- Co-occurrence analysis: mutually exclusive or co-occurring relationships between gene alterations
- Custom plots: bar charts and scatter plots of clinical and genomic data
- Comparison analysis: compare clinical/genomic attributes between groups defined by gene alterations
- Gene co-expression: mRNA/protein expression correlations and dependencies

AVAILABLE TABS:
For all studies with genomic alteration data:
    - oncoprint: Alteration matrix visualization (default).
    - cancerTypesSummary: Summary of alterations by cancer type.
    - plots: Customizable bar and scatter plots of clinical and genomic data
    - mutations: Detailed mutation table and lollipop plot for each query gene.
    - comparison: Compare attributes between groups defined by gene alterations. Comparisons default to altered vs non-altered groups, but custom groups based on specific alteration patterns can also be created.
    - pathways/pathwaymapper: Pathway diagrams with alterations. Only useful if queried genes are in the available pathways.
    - pathways/ndex-cancer-pathways: NDEx cancer pathways with alterations. Only useful if queried genes are in the available pathways.
    - downloads: Data download options
For specific studies or queries:
    - mutualExclusivity: Statistical analysis of co-occurrence and exclusivity between query genes/alterations. Available when multiple genes/alterations are queried.
    - structuralVariants: Structural variant details. Available if SV data exists.
    - coexpression: Explore genes whose mRNA/miRNA/protein levels correlate with query genes. Available if mRNA, miRNA, or protein expression data exists.
    - cnSegments: Copy number segments visualization using the Integrated Genomics Viewer (IGV). Available if segment data exists.

PARAMETERS:
- studyIds: REQUIRED - Array of validated study IDs (e.g., ["luad_tcga"] or ["luad_tcga", "brca_tcga"])
  * For single study: ["luad_tcga"]
  * For cross-study analysis: ["luad_tcga", "lusc_tcga", "brca_tcga"]
  * These should be pre-resolved by resolve_and_route tool
- genes: REQUIRED - Array of gene symbols (at least 1)
- caseSetId: Optional case set ID (defaults to {studyId}_all for all samples)
- zScoreThreshold: Optional Z-score threshold for expression data
- rppaScoreThreshold: Optional RPPA score threshold for protein data
- tab: Optionally specify which analysis tab to open

TYPICAL USE CASES:
- "Show me TP53 and KRAS mutations in lung cancer" → studyIds: ["luad_tcga"], genes: ["TP53", "KRAS"]
- "Analyze EGFR alterations in TCGA LUAD" → studyIds: ["luad_tcga"], genes: ["EGFR"]
- "Compare TP53 mutations across TCGA lung studies" → studyIds: ["luad_tcga", "lusc_tcga"], genes: ["TP53"]
- "Find co-occurring mutations with BRAF in melanoma" → studyIds: ["skcm_tcga"], genes: ["BRAF", ...]
- "Survival analysis for patients with EGFR mutations" → studyIds: ["luad_tcga"], genes: ["EGFR"], tab: "survival"`,
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

    return createSuccessResponse(url, {
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
