/**
 * MCP tool for retrieving StudyView filter options (clinical attributes + generic assay entities).
 *
 * This tool fetches detailed information needed to construct filterJson parameters:
 * - Clinical attributes: datatype and valid values
 * - Generic assay entities: entity list and values (for CATEGORICAL/BINARY) or range
 *   hint (for LIMIT-VALUE/continuous)
 *
 * Use this after reviewing metadata from the router to get exact values before
 * constructing clinicalDataFilters or genericAssayDataFilters.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { studyViewDataClient } from './studyView/studyViewDataClient.js';
import { createDataResponse, createErrorResponse } from './shared/responses.js';
import type { ToolResponse } from './shared/types.js';
import { loadPrompt } from './shared/promptLoader.js';

/**
 * Tool definition for MCP registration
 */
export const getStudyviewfilterOptionsTool = {
    name: 'get_studyviewfilter_options',
    title: 'Get StudyView Filter Options',
    description: loadPrompt('get_studyviewfilter_options.md'),
    inputSchema: {
        studyId: z.string().describe('Study identifier (e.g., "luad_tcga")'),
        attributeIds: z
            .array(z.string())
            .optional()
            .describe(
                'Clinical attribute IDs to fetch values for (e.g., ["SEX", "TUMOR_GRADE"])'
            ),
        genericAssayProfileIds: z
            .array(z.string())
            .optional()
            .describe(
                'GENERIC_ASSAY molecular profile IDs from router genericAssayProfiles[].molecularProfileId'
            ),
    },
};

type ToolInput = {
    studyId: z.infer<typeof getStudyviewfilterOptionsTool.inputSchema.studyId>;
    attributeIds?: z.infer<
        typeof getStudyviewfilterOptionsTool.inputSchema.attributeIds
    >;
    genericAssayProfileIds?: z.infer<
        typeof getStudyviewfilterOptionsTool.inputSchema.genericAssayProfileIds
    >;
};

/**
 * Tool handler for MCP
 */
export async function handleGetStudyviewfilterOptions(
    input: ToolInput
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
        const result = await getStudyviewfilterOptions(input);
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
 * Main logic
 */
async function getStudyviewfilterOptions(
    params: ToolInput
): Promise<ToolResponse> {
    const { studyId, attributeIds, genericAssayProfileIds } = params;

    if (!attributeIds?.length && !genericAssayProfileIds?.length) {
        return createErrorResponse(
            'Provide at least one of: attributeIds or genericAssayProfileIds'
        );
    }

    // Run clinical attributes and generic assay lookups in parallel
    const [clinicalResult, genericAssayResult] = await Promise.all([
        attributeIds?.length
            ? resolveClinicalAttributes(studyId, attributeIds)
            : Promise.resolve(null),
        genericAssayProfileIds?.length
            ? resolveGenericAssayProfiles(studyId, genericAssayProfileIds)
            : Promise.resolve(null),
    ]);

    if (clinicalResult?.error) return clinicalResult.error;

    const responseData: Record<string, unknown> = { studyId };
    if (clinicalResult?.attributes) {
        responseData.attributes = clinicalResult.attributes;
    }
    if (genericAssayResult) {
        responseData.genericAssayEntities = genericAssayResult;
    }

    return createDataResponse(
        'Successfully retrieved StudyView filter options',
        responseData
    );
}

// ---------------------------------------------------------------------------
// Clinical attributes
// ---------------------------------------------------------------------------

async function resolveClinicalAttributes(
    studyId: string,
    attributeIds: string[]
): Promise<
    | { attributes: unknown[]; error: null }
    | { attributes: null; error: ToolResponse }
> {
    const allAttributes = await studyViewDataClient.getClinicalAttributes([
        studyId,
    ]);

    const requested = allAttributes.filter((attr) =>
        attributeIds.includes(attr.clinicalAttributeId)
    );

    const missingIds = attributeIds.filter(
        (id) => !requested.some((a) => a.clinicalAttributeId === id)
    );

    if (missingIds.length > 0) {
        return {
            attributes: null,
            error: createErrorResponse(
                `Clinical attributes not found in study: ${missingIds.join(', ')}`,
                {
                    studyId,
                    missingIds,
                    availableIds: allAttributes.map(
                        (a) => a.clinicalAttributeId
                    ),
                }
            ),
        };
    }

    const valuesMap = await studyViewDataClient.getClinicalDataValuesBatch(
        studyId,
        requested.map((a) => a.clinicalAttributeId)
    );

    return {
        attributes: requested.map((attr) => ({
            attributeId: attr.clinicalAttributeId,
            displayName: attr.displayName,
            description: attr.description,
            datatype: attr.datatype,
            values: valuesMap.get(attr.clinicalAttributeId) || [],
        })),
        error: null,
    };
}

// ---------------------------------------------------------------------------
// Generic assay profiles
// ---------------------------------------------------------------------------

/**
 * Maximum number of generic assay entities to enumerate in the response.
 *
 * Profiles like methylation arrays (hm27: ~27K, hm450: ~450K) have far too
 * many entities to be useful in an LLM context window. Returning a partial
 * list would be misleading — the AI would treat it as complete. Instead, when
 * a profile exceeds this limit we skip entity enumeration entirely and return
 * a `tooLarge` flag so the AI can direct the user to the cBioPortal web UI.
 *
 * 200 entities ≈ 3,000 tokens — acceptable for a tool response.
 */
const GENERIC_ASSAY_ENTITY_LIMIT = 200;

async function resolveGenericAssayProfiles(
    studyId: string,
    profileIds: string[]
): Promise<unknown[]> {
    // Fetch all profiles to get datatype for each requested profile
    const allProfiles = await studyViewDataClient.getMolecularProfiles([
        studyId,
    ]);
    const profileMap = new Map(
        allProfiles.map((p) => [p.molecularProfileId, p])
    );

    const results = await Promise.all(
        profileIds.map(async (profileId) => {
            const profile = profileMap.get(profileId);
            const datatype = profile?.datatype ?? 'UNKNOWN';
            const profileType = profileId.replace(`${studyId}_`, '');
            const isContinuous = datatype === 'LIMIT-VALUE';

            // Lightweight count check using ID projection (~6x smaller than SUMMARY).
            // If the profile has too many entities, skip full metadata fetch entirely
            // rather than returning a misleading partial list.
            const entityCount =
                await studyViewDataClient.getGenericAssayEntityCount([
                    profileId,
                ]);

            if (entityCount > GENERIC_ASSAY_ENTITY_LIMIT) {
                return {
                    molecularProfileId: profileId,
                    profileType,
                    datatype,
                    entityCount,
                    tooLarge: true,
                    note: `Profile has ${entityCount} entities — too many to enumerate here. Direct the user to the cBioPortal web UI: StudyView → Add Chart → select this profile → search for the entity of interest.`,
                };
            }

            // Within limit: fetch full metadata (SUMMARY projection)
            const metaList = await studyViewDataClient.getGenericAssayMeta([
                profileId,
            ]);

            let valuesMap = new Map<string, string[]>();
            if (!isContinuous && metaList.length > 0) {
                valuesMap = await studyViewDataClient.getGenericAssayDataValues(
                    studyId,
                    profileType,
                    metaList.map((m) => m.stableId)
                );
            }

            const entities = metaList.map((meta) => {
                const props = meta.genericEntityMetaProperties as Record<
                    string,
                    string
                >;
                const entry: Record<string, unknown> = {
                    stableId: meta.stableId,
                    name: props?.NAME ?? meta.stableId,
                };
                if (isContinuous) {
                    entry.continuous = true;
                } else {
                    entry.values = valuesMap.get(meta.stableId) ?? [];
                }
                return entry;
            });

            return {
                molecularProfileId: profileId,
                profileType,
                datatype,
                entities,
            };
        })
    );

    return results;
}
