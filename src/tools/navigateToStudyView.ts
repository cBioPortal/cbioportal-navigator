/**
 * MCP Tool: navigate_to_studyview
 * Navigate to cBioPortal StudyView page
 */

import { z } from 'zod';
import { studyResolver } from '../resolution/studyResolver.js';
import { buildStudyUrl } from '../urlBuilders/study.js';
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
- summary: Study overview with key statistics (default)
- clinicalData: Clinical data table view
- genomicEvolution: Clonal evolution analysis
- survival: Survival curves with stratification options
- plots: Custom scatter plots and charts

PARAMETERS:
- studyId: Direct study ID (e.g., "luad_tcga") OR
- studyKeywords: Array of keywords to search studies (e.g., ["TCGA", "lung"])
- tab: Optionally specify which tab to open directly

TYPICAL USE CASES:
- "Show me the TCGA lung cancer study overview"
- "Navigate to BRCA study clinical data"
- "Open the survival tab for melanoma study"
- "Display summary statistics for pancreatic cancer cohort"`,
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
            .enum([
                'summary',
                'clinicalData',
                'genomicEvolution',
                'survival',
                'plots',
            ])
            .optional()
            .describe('Specific tab to navigate to'),
    },
};

// Infer type from Zod schema
type NavigateToStudyViewInput = {
    studyKeywords?: z.infer<
        typeof navigateToStudyViewTool.inputSchema.studyKeywords
    >;
    studyId?: z.infer<typeof navigateToStudyViewTool.inputSchema.studyId>;
    tab?: z.infer<typeof navigateToStudyViewTool.inputSchema.tab>;
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

    // Build URL
    const url = buildStudyUrl({
        studyIds: studyId,
        tab: params.tab,
    });

    // Get study details for metadata
    const studyDetails = await studyResolver.getById(studyId);

    return createSuccessResponse(url, {
        studyId,
        studyName: studyDetails.name,
    });
}
