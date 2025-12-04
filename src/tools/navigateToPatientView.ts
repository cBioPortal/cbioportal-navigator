/**
 * MCP tool for navigating to cBioPortal PatientView pages.
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
import { studyResolver } from '../resolution/studyResolver.js';
import { buildPatientUrl } from '../urlBuilders/patient.js';
import {
    createSuccessResponse,
    createErrorResponse,
} from './common/responses.js';
import type { ToolResponse } from './common/types.js';

/**
 * Tool definition for MCP registration
 */
export const navigateToPatientViewTool = {
    name: 'navigate_to_patientview',
    title: 'Navigate to PatientView Page',
    description: `Navigate to cBioPortal PatientView page - detailed individual patient/sample information.

WHAT IS PATIENTVIEW:
PatientView displays comprehensive data for a single patient or sample:
- Patient summary: basic demographics, sample overview, key alterations
- Clinical timeline: diagnosis, treatments, follow-up events with temporal relationships
- Genomic alterations: mutations, copy number changes, fusions, expression data
- Pathway impact: affected signaling pathways and biological processes
- Tissue images: pathology slides, IHC staining visualization
- Treatment response: medication history, efficacy assessments

AVAILABLE TABS:
- summary: Patient overview with key information (default)
- clinicalData: Clinical data table with all attributes
- genomicTracks: Genomic data visualization tracks
- pathways: Pathway diagrams with alterations highlighted
- tissueImage: Pathology image viewer
- trialMatch: Clinical trial matching results

TYPICAL USE CASES:
- "Show me patient TCGA-001 from LUAD study"
- "Navigate to sample TCGA-001-01A in the study"
- "Open the genomic tracks for this patient"
- "Display clinical timeline for patient ID 12345"

PARAMETERS:
- studyId is REQUIRED
- Provide either patientId OR sampleId (at least one required)
- Optionally specify a tab to open directly
- navIds can be provided to enable navigation through a cohort`,
    inputSchema: {
        studyId: z.string().describe('Study ID (required)'),
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
    studyId: z.infer<typeof navigateToPatientViewTool.inputSchema.studyId>;
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
 * Main navigation logic for PatientView
 */
async function navigateToPatientView(
    params: NavigateToPatientViewInput
): Promise<ToolResponse> {
    if (!params.studyId) {
        return createErrorResponse('studyId is required for patient page');
    }

    if (!params.patientId && !params.sampleId) {
        return createErrorResponse(
            'Either patientId or sampleId must be provided'
        );
    }

    // Validate study exists
    const isValid = await studyResolver.validate(params.studyId);
    if (!isValid) {
        return createErrorResponse(`Study ID "${params.studyId}" not found`);
    }

    // Build URL
    const url = buildPatientUrl({
        studyId: params.studyId,
        caseId: params.patientId,
        sampleId: params.sampleId,
        tab: params.tab,
        navIds: params.navIds as
            | Array<{ patientId: string; studyId: string }>
            | undefined,
    });

    return createSuccessResponse(url, {
        studyId: params.studyId,
        patientId: params.patientId,
        sampleId: params.sampleId,
    });
}
