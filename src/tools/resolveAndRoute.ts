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
 * The tool provides study metadata (clinical attributes, molecular profiles,
 * treatments) so the AI can decide which navigation tool(s) to call next.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { studyResolver, type ResolvedStudy } from './shared/studyResolver.js';
import { studyViewDataClient } from './studyView/studyViewDataClient.js';
import { createDataResponse, createErrorResponse } from './shared/responses.js';
import type { ToolResponse } from './shared/types.js';
import { loadPrompt } from './shared/promptLoader.js';

/**
 * Tool definition schema (without description, which is loaded at startup)
 */
const inputSchema = {
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
};

/**
 * Factory function for MCP registration (call after initPrompts)
 */
export function createResolveAndRouteTool() {
    return {
        name: 'resolve_and_route',
        title: 'Resolve Studies and Route to Page',
        description: loadPrompt('navigator/resolve-and-route'),
        inputSchema,
    };
}

// Infer type from Zod schema
type ToolInput = {
    studyKeywords?: z.infer<typeof inputSchema.studyKeywords>;
    studyIds?: z.infer<typeof inputSchema.studyIds>;
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
    const { studyKeywords, studyIds } = params;

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

    // 2. Get study details
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

            const regularProfileIds = molecularProfiles
                .filter((p) => p.molecularAlterationType !== 'GENERIC_ASSAY')
                .map((p) => p.molecularProfileId)
                .sort();

            const genericAssayProfileIds = molecularProfiles
                .filter((p) => p.molecularAlterationType === 'GENERIC_ASSAY')
                .map((p) => p.molecularProfileId)
                .sort();

            const availableComparisonTabs = computeAvailableComparisonTabs(
                molecularProfiles,
                clinicalAttributes.map((attr) => attr.clinicalAttributeId)
            );

            return {
                studyId: study.studyId,
                name: study.name,
                sampleCount: study.allSampleCount,
                metadata: {
                    clinicalAttributeIds: clinicalAttributes.map(
                        (attr) => attr.clinicalAttributeId
                    ),
                    molecularProfileIds: regularProfileIds,
                    ...(genericAssayProfileIds.length > 0 && {
                        genericAssayProfiles: genericAssayProfileIds,
                    }),
                    availableComparisonTabs,
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

    // 5. Build response
    const totalCount = resolvedStudyIds.length;

    const detailMessage =
        otherStudies.length > 0
            ? ` (top ${metadataLimit} with full metadata, rest with basic info)`
            : '';
    const message =
        totalCount === 1
            ? `Found 1 study. Use the metadata to call the appropriate navigation tool(s).`
            : `Found ${totalCount} matching studies${detailMessage}. Pick the best match (prefer TCGA → prefer PanCancer Atlas), use its metadata to call the appropriate navigation tool(s) and generate URLs immediately. Present other studies as alternatives.`;

    return createDataResponse(message, {
        totalCount,
        resolvedStudyIds,
        studiesWithMetadata,
        ...(otherStudies.length > 0 && { otherStudies }),
    });
}

/**
 * Compute which Group Comparison tabs are available for a study based on its
 * molecular profiles and clinical attributes.
 *
 * Tab availability mirrors the frontend ComparisonStore logic:
 * - overlap / clinical: always available
 * - survival: requires paired {PREFIX}_STATUS + {PREFIX}_MONTHS clinical attributes
 * - alterations: requires MUTATION_EXTENDED or COPY_NUMBER_ALTERATION (DISCRETE)
 * - mutations: requires MUTATION_EXTENDED
 * - mrna: requires MRNA_EXPRESSION (single-study only — enforced by frontend)
 * - protein: requires PROTEIN_LEVEL (single-study only)
 * - dna_methylation: requires METHYLATION (single-study only)
 * - generic_assay_{type}: one entry per unique genericAssayType (single-study only)
 */
function computeAvailableComparisonTabs(
    molecularProfiles: Array<{
        molecularAlterationType: string;
        datatype?: string;
        genericAssayType?: string;
    }>,
    clinicalAttributeIds: string[]
): string[] {
    const tabs: string[] = ['overlap', 'clinical'];

    // Survival: need at least one paired PREFIX_STATUS + PREFIX_MONTHS
    const statusPrefixes = new Set(
        clinicalAttributeIds
            .filter((id) => id.endsWith('_STATUS'))
            .map((id) => id.slice(0, -'_STATUS'.length))
    );
    if (
        clinicalAttributeIds.some(
            (id) =>
                id.endsWith('_MONTHS') &&
                statusPrefixes.has(id.slice(0, -'_MONTHS'.length))
        )
    ) {
        tabs.push('survival');
    }

    const hasMutation = molecularProfiles.some(
        (p) => p.molecularAlterationType === 'MUTATION_EXTENDED'
    );
    const hasCNA = molecularProfiles.some(
        (p) =>
            p.molecularAlterationType === 'COPY_NUMBER_ALTERATION' &&
            p.datatype === 'DISCRETE'
    );

    if (hasMutation || hasCNA) tabs.push('alterations');
    if (hasMutation) tabs.push('mutations');

    if (
        molecularProfiles.some(
            (p) => p.molecularAlterationType === 'MRNA_EXPRESSION'
        )
    )
        tabs.push('mrna');
    if (
        molecularProfiles.some(
            (p) => p.molecularAlterationType === 'PROTEIN_LEVEL'
        )
    )
        tabs.push('protein');
    if (
        molecularProfiles.some(
            (p) => p.molecularAlterationType === 'METHYLATION'
        )
    )
        tabs.push('dna_methylation');

    // Generic assay: one tab per unique genericAssayType
    const genericAssayTypes = new Set(
        molecularProfiles
            .filter(
                (p) =>
                    p.molecularAlterationType === 'GENERIC_ASSAY' &&
                    p.genericAssayType
            )
            .map((p) => p.genericAssayType!)
    );
    for (const type of genericAssayTypes) {
        tabs.push(`generic_assay_${type.toLowerCase()}`);
    }

    return tabs;
}
