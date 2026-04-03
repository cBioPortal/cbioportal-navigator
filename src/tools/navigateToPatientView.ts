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
 * - Supports tabs: summary, clinicalData, pathways
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
import { studyResolver } from './shared/studyResolver.js';
import { buildPatientUrl } from './patientView/buildPatientUrl.js';
import { apiClient } from './shared/cbioportalClient.js';
import { buildStudyUrl } from './studyView/buildStudyUrl.js';
import {
    createNavigationResponse,
    createErrorResponse,
} from './shared/responses.js';
import type { ToolResponse } from './shared/types.js';
import { loadPrompt } from './shared/promptLoader.js';
import { getPatientViewPageDescription } from './shared/pageDescriptions.js';

/**
 * Tool definition schema (without description, which is loaded at startup)
 */
const inputSchema = {
    studyIds: z
        .array(z.string())
        .min(1)
        .describe(
            'Array of validated study IDs (e.g., ["luad_tcga"] or ["luad_tcga", "brca_tcga"]). These should be pre-resolved by route_to_target_page tool. A separate URL will be generated for each study.'
        ),
    patientId: z.string().optional().describe('Patient/case identifier'),
    sampleId: z.string().optional().describe('Sample identifier'),
    tab: z
        .enum(['summary', 'clinicalData', 'pathways'])
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
    studyViewFilter: z
        .record(z.string(), z.any())
        .optional()
        .describe(
            'StudyViewFilter object to navigate a filtered patient cohort. When provided, fetches all matching patients and opens the first one with full cohort navigation (navCaseIds). patientId and sampleId are not required when this is provided. Same format as navigate_to_study_view filterJson.'
        ),
};

/**
 * Factory function for MCP registration (call after initPrompts)
 */
export function createNavigateToPatientViewTool() {
    return {
        name: 'navigate_to_patient_view',
        title: 'Navigate to PatientView',
        description: loadPrompt('navigator/navigate-to-patient-view'),
        inputSchema,
    };
}

// Infer type from Zod schema
type NavigateToPatientViewInput = {
    studyIds: z.infer<typeof inputSchema.studyIds>;
    patientId?: z.infer<typeof inputSchema.patientId>;
    sampleId?: z.infer<typeof inputSchema.sampleId>;
    tab?: z.infer<typeof inputSchema.tab>;
    navIds?: z.infer<typeof inputSchema.navIds>;
    studyViewFilter?: z.infer<typeof inputSchema.studyViewFilter>;
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

    // Get study details for metadata (used in both paths)
    const studyDetails = await Promise.all(
        studyIds.map((id) => studyResolver.getById(id))
    );

    // Filter path: fetch patients from filter → build cohort navigation URL
    if (params.studyViewFilter) {
        const filter = { ...params.studyViewFilter, studyIds };
        const samples = await apiClient.fetchFilteredSamples(filter);

        if (samples.length === 0) {
            return createErrorResponse(
                'No samples match the provided studyViewFilter'
            );
        }

        // Deduplicate to unique patients preserving order
        const seen = new Set<string>();
        const patients: Array<{ patientId: string; studyId: string }> = [];
        for (const s of samples) {
            const key = `${s.studyId}:${s.patientId}`;
            if (!seen.has(key)) {
                seen.add(key);
                patients.push({ patientId: s.patientId, studyId: s.studyId });
            }
        }

        const PATIENT_NAV_LIMIT = 20;

        // Large cohort: fall back to StudyView with filter applied
        if (patients.length > PATIENT_NAV_LIMIT) {
            const studyViewUrl = buildStudyUrl({
                studyIds,
                filterJson: params.studyViewFilter,
            });

            return createNavigationResponse(studyViewUrl, {
                studyIds,
                studies: studyDetails.map((s) => ({
                    studyId: s.studyId,
                    name: s.name,
                })),
                filteredPatientCount: patients.length,
                fallback: true,
                fallbackReason: `${patients.length} patients exceed the direct navigation limit (${PATIENT_NAV_LIMIT}). Showing StudyView with filter applied instead.`,
                instructions: `Click "View selected cases" in StudyView to open PatientView with full cohort navigation.`,
            });
        }

        // Small cohort: direct PatientView URL with navCaseIds
        const first = patients[0];
        const url = buildPatientUrl({
            studyId: first.studyId,
            caseId: first.patientId,
            tab: params.tab,
            navIds: patients,
        });

        return createNavigationResponse(url, {
            studyIds,
            studies: studyDetails.map((s) => ({
                studyId: s.studyId,
                name: s.name,
            })),
            filteredPatientCount: patients.length,
            firstPatientId: first.patientId,
            firstStudyId: first.studyId,
            tab: params.tab,
            ...(getPatientViewPageDescription(params.tab) && {
                pageDescription: getPatientViewPageDescription(params.tab),
            }),
        });
    }

    // Default path: navigate to a specific known patient/sample
    if (!params.patientId && !params.sampleId) {
        return createErrorResponse(
            'Either patientId, sampleId, or studyViewFilter must be provided'
        );
    }

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
        ...(getPatientViewPageDescription(params.tab) && {
            pageDescription: getPatientViewPageDescription(params.tab),
        }),
    });
}
