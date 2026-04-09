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
 * Tool definition schema (without description, which is loaded at startup)
 */
const inputSchema = {
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
    entitySearch: z
        .string()
        .optional()
        .describe(
            'Keyword to search generic assay entities (case-insensitive match against stableId and NAME). Pass the gene symbol (e.g. "EGFR") or probe ID (e.g. "cg03860890") from the user query. Required when querying methylation profiles.'
        ),
};

/**
 * Factory function for MCP registration (call after initPrompts)
 */
export function createGetStudyviewfilterOptionsTool() {
    return {
        name: 'get_studyviewfilter_options',
        title: 'Get StudyView Filter Options',
        description: loadPrompt('navigator/get-studyviewfilter-options'),
        inputSchema,
    };
}

type ToolInput = {
    studyId: z.infer<typeof inputSchema.studyId>;
    attributeIds?: z.infer<typeof inputSchema.attributeIds>;
    genericAssayProfileIds?: z.infer<typeof inputSchema.genericAssayProfileIds>;
    entitySearch?: z.infer<typeof inputSchema.entitySearch>;
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
    const { studyId, attributeIds, genericAssayProfileIds, entitySearch } =
        params;

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
            ? resolveGenericAssayProfiles(
                  studyId,
                  genericAssayProfileIds,
                  entitySearch
              )
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

async function resolveGenericAssayProfiles(
    studyId: string,
    profileIds: string[],
    entitySearch?: string
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

            // Fetch full metadata (SUMMARY projection)
            const allMeta = await studyViewDataClient.getGenericAssayMeta([
                profileId,
            ]);

            // Filter by entitySearch keyword if provided (case-insensitive match
            // against stableId or NAME property — same logic as cBioPortal frontend)
            const metaList = entitySearch
                ? (() => {
                      const escaped = entitySearch.replace(
                          /[.*+?^${}()|[\]\\]/g,
                          '\\$&',
                      );
                      const regex = new RegExp(escaped, 'i');
                      return allMeta.filter((meta) => {
                          const props =
                              meta.genericEntityMetaProperties as Record<
                                  string,
                                  string
                              >;
                          return (
                              regex.test(meta.stableId) ||
                              regex.test(props?.NAME ?? '')
                          );
                      });
                  })()
                : allMeta;

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
                    ...(props?.DESCRIPTION && {
                        description: props.DESCRIPTION,
                    }),
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
                ...(entitySearch && { matchedCount: entities.length }),
            };
        })
    );

    return results;
}
