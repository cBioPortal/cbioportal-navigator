/**
 * Main router MCP tool that resolves studies and recommends navigation tools.
 *
 * This tool acts as the primary entry point for cBioPortal navigation,
 * resolving study identifiers and recommending which specialized navigation
 * tool to use next. It handles study keyword search, validation, and
 * ambiguity resolution before delegating to page-specific tools.
 *
 * @remarks
 * Key exports:
 * - `resolveAndRouteTool`: Tool definition with detailed routing guidance
 * - `handleResolveAndRoute()`: Handler that resolves studies and recommends tools
 *
 * Workflow:
 * 1. Resolve studyKeywords or validate studyIds
 * 2. Handle ambiguity (multiple matches) - let user choose
 * 3. Return recommendation: which tool to use + resolved studyIds
 * 4. AI calls the recommended nav tool with resolved studyIds
 *
 * Routing logic:
 * - targetPage='study' → recommends navigate_to_studyview
 * - targetPage='patient' → recommends navigate_to_patientview
 * - targetPage='results' → recommends navigate_to_resultsview
 *
 * The tool provides extensive inline documentation explaining when to use each
 * page type, including use cases, example queries, and key features for each.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { studyResolver, type ResolvedStudy } from './router/studyResolver.js';
import { studyViewDataClient } from './studyView/studyViewDataClient.js';
import { createDataResponse, createErrorResponse } from './shared/responses.js';
import type { ToolResponse } from './shared/types.js';
import { loadPrompt } from './shared/promptLoader.js';

/**
 * Tool definition for MCP registration
 */
export const resolveAndRouteTool = {
    name: 'resolve_and_route',
    title: 'Resolve Studies and Route to Page',
    description: loadPrompt('resolve_and_route.md'),
    inputSchema: {
        targetPage: z
            .enum(['study', 'patient', 'results', 'comparison'])
            .describe(
                'The type of cBioPortal page to navigate to (study/patient/results/comparison)'
            ),
        studyKeywords: z
            .array(z.string())
            .optional()
            .describe(
                'Keywords to search for studies (e.g., ["TCGA", "lung", "adenocarcinoma"])'
            ),
        studyIds: z
            .array(z.string())
            .optional()
            .describe(
                'Direct study IDs to validate (e.g., ["luad_tcga", "brca_tcga"]). Use this for cross-study queries.'
            ),
    },
};

// Infer type from Zod schema
type ToolInput = {
    targetPage: z.infer<typeof resolveAndRouteTool.inputSchema.targetPage>;
    studyKeywords?: z.infer<
        typeof resolveAndRouteTool.inputSchema.studyKeywords
    >;
    studyIds?: z.infer<typeof resolveAndRouteTool.inputSchema.studyIds>;
};

/**
 * Tool handler for MCP
 * Resolves studies and recommends the appropriate navigation tool
 */
export async function handleResolveAndRoute(
    input: ToolInput
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
        const result = await resolveAndRoute(input);
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
 * Main routing logic
 */
async function resolveAndRoute(params: ToolInput): Promise<ToolResponse> {
    const { targetPage, studyKeywords, studyIds } = params;

    // Validate input - must provide either studyKeywords or studyIds
    if (!studyKeywords && !studyIds) {
        return createErrorResponse(
            'Either studyKeywords or studyIds must be provided'
        );
    }

    let resolvedStudyIds: string[];
    let resolvedStudies: ResolvedStudy[] | undefined;
    let isKeywordSearch = false; // Track if this is a keyword search

    // 1. Resolve or validate study IDs
    if (studyIds && studyIds.length > 0) {
        // Validate provided study IDs
        const validationResults = await Promise.all(
            studyIds.map(async (id) => ({
                id,
                valid: await studyResolver.validate(id),
            }))
        );

        const invalidIds = validationResults
            .filter((r) => !r.valid)
            .map((r) => r.id);

        if (invalidIds.length > 0) {
            return createErrorResponse(
                `Invalid study ID(s): ${invalidIds.join(', ')}`,
                { invalidIds, providedIds: studyIds }
            );
        }

        resolvedStudyIds = studyIds;
    } else if (studyKeywords && studyKeywords.length > 0) {
        // Search by keywords
        const matches = await studyResolver.search(studyKeywords);

        if (matches.length === 0) {
            return createErrorResponse('No matching studies found', {
                searchTerms: studyKeywords,
            });
        }

        // Sort by relevance: keyword match count (primary), sample count (secondary)
        const sortedMatches = matches
            .map((study) => {
                // Count how many keywords match this study
                const searchText = [
                    study.studyId,
                    study.name,
                    study.description,
                    study.cancerType,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                const matchCount = studyKeywords.filter((kw) =>
                    searchText.includes(kw.toLowerCase())
                ).length;

                return { study, matchCount };
            })
            .sort((a, b) => {
                // Primary: keyword match count (descending)
                if (a.matchCount !== b.matchCount) {
                    return b.matchCount - a.matchCount;
                }
                // Secondary: sample count (descending) - for studies with equal relevance
                const aCount = a.study.allSampleCount || 0;
                const bCount = b.study.allSampleCount || 0;
                return bCount - aCount;
            })
            .map((item) => item.study);

        // Save all matched studies (no hard limit)
        resolvedStudies = sortedMatches;
        resolvedStudyIds = sortedMatches.map((s) => s.studyId);
        isKeywordSearch = true;
    } else {
        return createErrorResponse(
            'Either studyKeywords or studyIds must be provided'
        );
    }

    // 2. Determine recommended tool based on target page
    const toolMapping = {
        study: 'navigate_to_studyview',
        patient: 'navigate_to_patientview',
        results: 'navigate_to_resultsview',
        comparison: 'navigate_to_group_comparison',
    };

    const recommendedTool = toolMapping[targetPage];

    // 3. Get study details
    // If we have complete study objects from search (with correct allSampleCount),
    // use them directly. Otherwise fetch via getById (for studyIds path).
    const studyDetails =
        resolvedStudies ||
        (await Promise.all(
            resolvedStudyIds.map((id) => studyResolver.getById(id))
        ));

    // 4. Fetch metadata
    // - For studyIds (direct): fetch metadata for all studies
    // - For studyKeywords (search): fetch metadata only for top 5, basic info for rest
    const metadataLimit = isKeywordSearch ? 5 : resolvedStudyIds.length;
    const studyIdsWithMetadata = resolvedStudyIds.slice(0, metadataLimit);
    const studyIdsWithoutMetadata = resolvedStudyIds.slice(metadataLimit);

    // Create lookup map for O(1) access
    const studyDetailsMap = new Map(
        studyDetails.map((study) => [study.studyId, study])
    );

    // Fetch metadata for selected studies
    const studiesWithMetadata = await Promise.all(
        studyIdsWithMetadata.map(async (studyId) => {
            const study = studyDetailsMap.get(studyId)!;

            const [clinicalAttributes, molecularProfiles, treatments] =
                await Promise.all([
                    studyViewDataClient.getClinicalAttributes([studyId]),
                    studyViewDataClient.getMolecularProfiles([studyId]),
                    studyViewDataClient.getTreatments([studyId]),
                ]);

            return {
                studyId: study.studyId,
                name: study.name,
                sampleCount: study.allSampleCount,
                metadata: {
                    clinicalAttributeIds: clinicalAttributes.map(
                        (attr) => attr.clinicalAttributeId
                    ),
                    molecularProfileIds: molecularProfiles
                        .map((profile) => profile.molecularProfileId)
                        .sort(),
                    treatments: treatments,
                },
            };
        })
    );

    // Basic info for remaining studies (keyword search only)
    const otherStudies = studyIdsWithoutMetadata.map((studyId) => {
        const study = studyDetailsMap.get(studyId)!;
        return {
            studyId: study.studyId,
            name: study.name,
            sampleCount: study.allSampleCount,
        };
    });

    // 5. Build response based on number of studies
    const needsStudySelection = resolvedStudyIds.length > 1;
    const totalCount = resolvedStudyIds.length;

    let message: string;
    if (needsStudySelection) {
        const detailMessage =
            otherStudies.length > 0
                ? ` (showing top ${metadataLimit} with detailed metadata)`
                : '';
        message = `Found ${totalCount} matching studies${detailMessage}. Review the user's original query to determine if it clearly matches one study. If yes, use that study's metadata to call ${recommendedTool}. If ambiguous, ask the user to choose.`;
    } else {
        message = `Found 1 study. Use ${recommendedTool} with the provided study metadata.`;
    }

    return createDataResponse(message, {
        recommendedTool,
        needsStudySelection,
        totalCount,
        resolvedStudyIds,
        studiesWithMetadata,
        ...(otherStudies.length > 0 && { otherStudies }),
    });
}
