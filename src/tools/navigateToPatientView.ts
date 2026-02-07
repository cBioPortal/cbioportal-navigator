/**
 * MCP tool for navigating to cBioPortal PatientView.
 *
 * PatientView displays comprehensive data for individual patients or samples,
 * including clinical timeline, genomic alterations, pathways, tissue images,
 * and treatment information. This tool constructs URLs to navigate to specific
 * patients with optional tab selection and cohort navigation support.
 *
 * @remarks
 * Key exports:
 * - `navigateToPatientViewTool`: Tool definition with schema and documentation
 * - `handleNavigateToPatientView()`: MCP tool handler
 * - `navigateToPatientView()`: Core navigation logic
 *
 * Features:
 * - Requires studyId and either patientId or sampleId
 * - Supports tabs: summary, clinicalData, genomicTracks, pathways, tissueImage, trialMatch
 * - Navigation IDs (navIds) for browsing through patient cohorts
 *
 * Architecture:
 * Uses studyResolver for study validation and buildPatientUrl for URL
 * construction. Returns success response with URL and metadata, or error
 * response for validation failures.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { studyResolver } from './router/studyResolver.js';
import { buildPatientUrl } from './patientView/buildPatientUrl.js';
import {
    createNavigationResponse,
    createErrorResponse,
} from './shared/responses.js';
import type { ToolResponse } from './shared/types.js';
import { loadPrompt } from './shared/promptLoader.js';

/**
 * Tool definition for MCP registration
 */
export const navigateToPatientViewTool = {
    name: 'navigate_to_patientview_page',
    title: 'Navigate to PatientView',
    description: loadPrompt('navigate_to_patientview.md'),
    inputSchema: {
        studyIds: z
            .array(z.string())
            .min(1)
            .describe(
                'Array of validated study IDs (e.g., ["luad_tcga"] or ["luad_tcga", "brca_tcga"]). These should be pre-resolved by route_to_target_page tool. A separate URL will be generated for each study.'
            ),
        patientId: z.string().optional().describe('Patient/case identifier'),
        sampleId: z.string().optional().describe('Sample identifier'),
        tab: z
            .enum([
                'summary',
                'clinicalData',
                'genomicTracks',
                'pathways',
                'tissueImage',
                'trialMatch',
            ])
            .optional()
            .describe('Specific tab to navigate to'),
        navIds: z
            .array(
                z.object({
                    patientId: z.string(),
                    studyId: z.string(),
                })
            )
            .optional()
            .describe('Navigation IDs for cohort browsing'),
    },
};

// Infer type from Zod schema
type NavigateToPatientViewInput = {
    studyIds: z.infer<typeof navigateToPatientViewTool.inputSchema.studyIds>;
    patientId?: z.infer<typeof navigateToPatientViewTool.inputSchema.patientId>;
    sampleId?: z.infer<typeof navigateToPatientViewTool.inputSchema.sampleId>;
    tab?: z.infer<typeof navigateToPatientViewTool.inputSchema.tab>;
    navIds?: z.infer<typeof navigateToPatientViewTool.inputSchema.navIds>;
};

/**
 * Tool handler for MCP
 */
export async function handleNavigateToPatientView(
    input: NavigateToPatientViewInput
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
        const result = await navigateToPatientView(input);
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
 * Main navigation logic for PatientView
 */
async function navigateToPatientView(
    params: NavigateToPatientViewInput
): Promise<ToolResponse> {
    const { studyIds } = params;

    if (!params.patientId && !params.sampleId) {
        return createErrorResponse(
            'Either patientId or sampleId must be provided'
        );
    }

    // studyIds are already validated by router, no need to validate again

    // Build URLs for each study
    const patientUrls = studyIds.map((studyId) => {
        const url = buildPatientUrl({
            studyId,
            caseId: params.patientId,
            sampleId: params.sampleId,
            tab: params.tab,
            navIds: params.navIds as
                | Array<{ patientId: string; studyId: string }>
                | undefined,
        });
        return { studyId, url };
    });

    // Get study details for metadata
    const studyDetails = await Promise.all(
        studyIds.map((id) => studyResolver.getById(id))
    );

    // Use first URL as primary navigation URL
    const primaryUrl = patientUrls[0].url;

    return createNavigationResponse(primaryUrl, {
        patientUrls: patientUrls.map((item, index) => ({
            studyId: item.studyId,
            studyName: studyDetails[index].name,
            url: item.url,
        })),
        patientId: params.patientId,
        sampleId: params.sampleId,
        tab: params.tab,
        hasMultipleUrls: studyIds.length > 1,
    });
}
