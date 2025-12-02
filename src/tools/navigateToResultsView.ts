/**
 * MCP Tool: navigate_to_resultsview
 * Navigate to cBioPortal ResultsView page
 */

import { z } from 'zod';
import { studyResolver } from '../resolution/studyResolver.js';
import { geneResolver } from '../resolution/geneResolver.js';
import { profileResolver } from '../resolution/profileResolver.js';
import { buildResultsUrl } from '../urlBuilders/results.js';
import {
    createSuccessResponse,
    createAmbiguityResponse,
    createErrorResponse,
} from './common/responses.js';
import type { ToolResponse } from './common/types.js';

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
- studyId: Direct study ID (e.g., "luad_tcga") OR
- studyKeywords: Array of keywords to search studies (e.g., ["TCGA", "lung"])
- genes: REQUIRED - Array of gene symbols (at least 1) 
- caseSetId: Optional case set ID (defaults to {studyId}_all for all samples)
- zScoreThreshold: Optional Z-score threshold for expression data
- rppaScoreThreshold: Optional RPPA score threshold for protein data
- tab: Optionally specify which analysis tab to open

TYPICAL USE CASES:
- "Show me TP53 and KRAS mutations in lung cancer"
- "Analyze EGFR alterations in TCGA LUAD"
- "Find co-occurring mutations with BRAF in melanoma"
- "Compare mutation patterns of PIK3CA and AKT1"
- "Survival analysis for patients with EGFR mutations"`,
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
    studyKeywords?: z.infer<
        typeof navigateToResultsViewTool.inputSchema.studyKeywords
    >;
    studyId?: z.infer<typeof navigateToResultsViewTool.inputSchema.studyId>;
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
    let studyId: string;

    // 1. Resolve study ID
    if (params.studyId) {
        const isValid = await studyResolver.validate(params.studyId);
        if (!isValid) {
            return createErrorResponse(
                `Study ID "${params.studyId}" not found`
            );
        }
        studyId = params.studyId;
    } else if (params.studyKeywords && params.studyKeywords.length > 0) {
        const matches = await studyResolver.search(params.studyKeywords);

        if (matches.length === 0) {
            return createErrorResponse('No matching studies found', {
                searchTerms: params.studyKeywords,
            });
        }

        if (matches.length > 1) {
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

    // 2. Validate genes
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

    // 3. Get molecular profile (optional, for metadata)
    const profile = await profileResolver.getForStudy(studyId, 'mutation');

    // 4. Determine case set ID
    const caseSetId = params.caseSetId || `${studyId}_all`;

    // 5. Build URL
    const url = buildResultsUrl({
        studies: [studyId],
        genes: validGenes,
        caseSelection: {
            type: 'case_set',
            caseSetId,
        },
        tab: params.tab,
    });

    // Get study details for metadata
    const studyDetails = await studyResolver.getById(studyId);

    return createSuccessResponse(url, {
        studyId,
        studyName: studyDetails.name,
        genes: validGenes,
        caseSetId,
        molecularProfileId: profile?.molecularProfileId,
    });
}
