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
import { studyResolver } from '../../shared/resolvers/studyResolver.js';
import { buildPatientUrl } from '../urlBuilder.js';
import {
    createSuccessResponse,
    createErrorResponse,
} from '../../shared/utils/responses.js';
import type { ToolResponse } from '../../shared/utils/types.js';

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

MULTI-STUDY SUPPORT:
When multiple studyIds are provided, this tool generates a separate PatientView URL
for each study. This is useful when you want to view the same patient ID across
different studies or compare patients from different cohorts.

TYPICAL USE CASES:
- "Show me patient TCGA-001 from LUAD study" → studyIds: ["luad_tcga"], patientId: "TCGA-001"
- "View patient TCGA-001 across lung studies" → studyIds: ["luad_tcga", "lusc_tcga"], patientId: "TCGA-001"
- "Navigate to sample TCGA-001-01A" → studyIds: ["luad_tcga"], sampleId: "TCGA-001-01A"
- "Open genomic tracks for this patient" → studyIds: ["luad_tcga"], patientId: "TCGA-001", tab: "genomicTracks"

PARAMETERS:
- studyIds: REQUIRED - Array of validated study IDs (e.g., ["luad_tcga"] or ["luad_tcga", "brca_tcga"])
  * These should be pre-resolved by route_to_target_page tool
  * A separate URL will be generated for each study
- Provide either patientId OR sampleId (at least one required)
- Optionally specify a tab to open directly
- navIds can be provided to enable navigation through a cohort`,
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

    // Build a user-friendly message
    const urlDescriptions = patientUrls
        .map((item, index) => {
            const study = studyDetails[index];
            const identifier = params.patientId
                ? `patient ${params.patientId}`
                : `sample ${params.sampleId}`;
            return `- ${study.name} (${item.studyId}): ${identifier}\n  URL: ${item.url}`;
        })
        .join('\n\n');

    const message =
        studyIds.length === 1
            ? patientUrls[0].url
            : `Generated ${studyIds.length} PatientView URLs:\n\n${urlDescriptions}`;

    return createSuccessResponse(message, {
        patientUrls: patientUrls.map((item, index) => ({
            studyId: item.studyId,
            studyName: studyDetails[index].name,
            url: item.url,
        })),
        patientId: params.patientId,
        sampleId: params.sampleId,
        tab: params.tab,
    });
}
