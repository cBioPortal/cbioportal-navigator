/**
 * Navigate to Group Comparison page based on clinical attribute.
 *
 * This module implements the main logic for creating group comparison sessions
 * from clinical attributes. It:
 * 1. Fetches samples matching the filter
 * 2. Retrieves clinical data for the specified attribute
 * 3. Groups samples by attribute values
 * 4. Creates a comparison session on the backend
 * 5. Returns a navigation URL to the comparison page
 *
 * Based on: cbioportal-frontend/src/pages/studyView/StudyViewPageStore.ts:1944-1983
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { apiClient } from './shared/cbioportalClient.js';
import { ComparisonSessionClient } from './groupComparison/comparisonSessionClient.js';
import {
    groupSamplesByAttributeValue,
    createGroup,
    createNAGroup,
    type Sample,
    type ClinicalDataItem,
    type SessionGroupData,
} from './groupComparison/groupBuilder.js';
import {
    buildComparisonUrl,
    type ComparisonTab,
} from './groupComparison/buildComparisonUrl.js';
import {
    splitDataIntoQuartiles,
    type Quartile,
} from './groupComparison/numericalBinning.js';
import { buildStudyUrl } from './studyView/buildStudyUrl.js';
import {
    createNavigationResponse,
    createErrorResponse,
} from './shared/responses.js';
import { getConfig } from './shared/config.js';
import { loadPrompt } from './shared/promptLoader.js';

/**
 * Tool definition schema (without description, which is loaded at startup)
 */
const inputSchema = {
    studyIds: z
        .array(z.string())
        .min(1)
        .describe(
            'Array of validated study IDs (e.g., ["luad_tcga"] or ["luad_tcga", "lusc_tcga"] for cross-study). These should be pre-resolved by route_to_target_page tool.'
        ),
    groups: z
        .array(
            z.union([
                z.object({
                    name: z
                        .string()
                        .min(1)
                        .describe('Display name for this group'),
                    studyViewFilter: z
                        .record(z.string(), z.any())
                        .describe(
                            'StudyViewFilter defining which samples belong to this group. studyIds are auto-injected.'
                        ),
                }),
                z.object({
                    name: z
                        .string()
                        .min(1)
                        .describe('Display name for this group'),
                    isUnselected: z
                        .literal(true)
                        .describe(
                            'If true, this group contains all samples in the cohort NOT matched by any other group. Exactly one group may have isUnselected: true. Cannot be combined with studyViewFilter.'
                        ),
                }),
            ])
        )
        .min(2)
        .optional()
        .describe(
            'Custom filter-based groups. Each group provides either a studyViewFilter or isUnselected: true (complement of all other groups). Use for merged attribute values (T1+T2 vs T3+T4), gene-based splits, wildtype/unaltered comparisons, or multi-cohort comparisons. Cannot be combined with clinicalAttributeId, clinicalAttributeValues, or includeNA. Can be combined with studyViewFilter for global pre-filtering. Minimum 2 groups required, at most one may be isUnselected.'
        ),
    clinicalAttributeId: z
        .string()
        .min(1)
        .optional()
        .describe(
            'Clinical attribute ID to auto-group by (e.g., "SEX", "PATH_T_STAGE"). Tool discovers all values and creates one group per value. Cannot be combined with groups.'
        ),
    clinicalAttributeValues: z
        .array(z.string())
        .optional()
        .describe(
            'Optional subset of attribute values to include in comparison (e.g., ["White", "Asian"] for RACE). Only with clinicalAttributeId, not groups. Only applies to categorical attributes.'
        ),
    studyViewFilter: z
        .record(z.string(), z.any())
        .optional()
        .describe(
            'Optional StudyViewFilter to pre-filter samples before grouping. Works with both clinicalAttributeId and groups (applied as global pre-filter intersected with each group). Same format as navigate_to_study_view filterJson.'
        ),
    includeNA: z
        .boolean()
        .optional()
        .describe(
            'Whether to include an NA group for samples without the attribute. Only with clinicalAttributeId, not groups. Default: true for categorical, false for numerical.'
        ),
    tab: z
        .string()
        .optional()
        .describe(
            'Optional comparison page tab. Pick from availableComparisonTabs in resolver metadata. Always available: overlap, clinical. Conditional (study must have relevant data): survival, alterations, mutations, mrna, protein, dna_methylation, generic_assay_{type} (e.g. "generic_assay_treatment_response"). mrna/protein/dna_methylation/generic_assay_* require single-study comparison.'
        ),
};

/**
 * Factory function for MCP registration (call after initPrompts)
 */
export function createNavigateToGroupComparisonTool() {
    return {
        name: 'navigate_to_group_comparison',
        title: 'Navigate to Group Comparison',
        description: loadPrompt('navigator/navigate-to-group-comparison'),
        inputSchema,
    };
}

/**
 * Input type inferred from schema
 */
export type FilterGroup = {
    name: string;
    studyViewFilter: Record<string, any>;
};

export type UnselectedGroup = {
    name: string;
    isUnselected: true;
};

export type GroupDefinition = FilterGroup | UnselectedGroup;

export type NavigateToGroupComparisonInput = {
    studyIds: z.infer<typeof inputSchema.studyIds>;
    groups?: GroupDefinition[];
    clinicalAttributeId?: z.infer<typeof inputSchema.clinicalAttributeId>;
    clinicalAttributeValues?: z.infer<
        typeof inputSchema.clinicalAttributeValues
    >;
    studyViewFilter?: z.infer<typeof inputSchema.studyViewFilter>;
    includeNA?: z.infer<typeof inputSchema.includeNA>;
    tab?: string;
};

/**
 * MCP handler for navigate_to_group_comparison tool.
 *
 * Executes core logic and formats response.
 *
 * @param input - Tool input (already validated by MCP framework)
 * @returns MCP tool response
 */
export async function handleNavigateToGroupComparison(
    input: NavigateToGroupComparisonInput
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
        const result = await navigateToGroupComparison(input);

        const responseData: any = {
            description: result.attributeId
                ? `Group comparison by ${result.attributeName} (${result.attributeId})`
                : `Group comparison (${result.groupInfo.length} custom groups)`,
            studies: input.studyIds,
            totalGroups: result.groupInfo.length,
            groups: result.groupInfo,
        };

        if (result.attributeId) {
            responseData.attribute = {
                id: result.attributeId,
                name: result.attributeName,
                datatype: result.attributeDatatype,
            };
        }

        // Always include studyViewUrl for cohort exploration
        responseData.studyViewUrl = result.studyViewUrl;

        // Add per-group URLs when available (pre-filter or value subset)
        if (result.groupUrls) {
            responseData.groupUrls = result.groupUrls;
        }

        const response = createNavigationResponse(result.url, responseData);
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(response),
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
 * Group information for response metadata
 */
export interface GroupInfo {
    name: string;
    sampleCount: number;
}

/**
 * Group with associated studyview URL
 */
export interface GroupUrl {
    groupName: string;
    url: string;
}

/**
 * Result from navigateToGroupComparison
 */
export interface GroupComparisonResult {
    url: string;
    studyViewUrl: string;
    groupInfo: GroupInfo[];
    // Attribute information (only for clinicalAttributeId mode)
    attributeId?: string;
    attributeName?: string;
    attributeDatatype?: string;
    // Per-group URLs (when pre-filter or value subset is used, always for groups mode)
    groupUrls?: GroupUrl[];
}

/**
 * Core logic for creating group comparison session and URL.
 *
 * Flow:
 * 1. Fetch samples matching the filter
 * 2. Get clinical attribute metadata (patient vs sample level, datatype)
 * 3. Fetch clinical data for the attribute
 * 4. Group samples by attribute values (or quartiles for numerical)
 * 5. Limit to top 20 value-based groups
 * 6. Create NA group if requested (within 20-group limit)
 * 7. Create comparison session on backend
 * 8. Build comparison URL with optional tab
 * 9. Prepare group metadata
 * 10. Generate studyview URLs (base URL or per-group based on scenario)
 *
 * Based on: StudyViewPageStore.ts:createCategoricalAttributeComparisonSession
 *
 * @param input - Validated input parameters
 * @returns Object with comparison URL, group metadata, and studyview URLs
 * @throws Error if session creation fails or no valid groups found
 */
export async function navigateToGroupComparison(
    input: NavigateToGroupComparisonInput
): Promise<GroupComparisonResult> {
    const {
        studyIds,
        groups: filterGroups,
        clinicalAttributeId,
        clinicalAttributeValues,
        studyViewFilter,
        includeNA,
        tab,
    } = input;

    // Validate: exactly one of groups or clinicalAttributeId must be provided
    if (!filterGroups && !clinicalAttributeId) {
        throw new Error(
            'Either groups (filter-based) or clinicalAttributeId must be provided'
        );
    }
    if (filterGroups && clinicalAttributeId) {
        throw new Error(
            'groups and clinicalAttributeId are mutually exclusive — provide one or the other'
        );
    }
    if (filterGroups && (clinicalAttributeValues || includeNA !== undefined)) {
        throw new Error(
            'clinicalAttributeValues and includeNA cannot be used with groups — these options only apply to clinicalAttributeId mode'
        );
    }

    // Dispatch to filter-based mode
    if (filterGroups) {
        return navigateToGroupComparisonByFilters(
            studyIds,
            filterGroups,
            studyViewFilter,
            tab as ComparisonTab | undefined
        );
    }

    // Step 1: Fetch samples matching the filter
    // Ensure studyIds is always included in the filter for column-store routing
    const filter = studyViewFilter
        ? { ...studyViewFilter, studyIds }
        : { studyIds };
    const samples: Sample[] = await apiClient.fetchFilteredSamples(filter);

    if (samples.length === 0) {
        throw new Error('No samples found matching the filter criteria');
    }

    // Step 2: Get clinical attribute metadata to determine patient vs sample level and datatype
    const attribute = await apiClient.getClinicalAttribute(
        studyIds,
        clinicalAttributeId
    );

    if (!attribute) {
        throw new Error(
            `Clinical attribute "${clinicalAttributeId}" not found in the specified studies`
        );
    }

    const isPatientAttribute = attribute.patientAttribute;
    const isNumerical = attribute.datatype === 'NUMBER';

    // Set includeNA default based on attribute type
    // Numerical: default false (quartiles are meaningful without NA)
    // Categorical: default true (show all data including missing)
    const shouldIncludeNA = includeNA !== undefined ? includeNA : !isNumerical;

    // Step 3: Fetch clinical data for the attribute
    const clinicalData: ClinicalDataItem[] =
        await apiClient.fetchClinicalDataForSamples(
            clinicalAttributeId,
            samples,
            isPatientAttribute
        );

    if (clinicalData.length === 0) {
        throw new Error(
            `No clinical data found for attribute "${clinicalAttributeId}"`
        );
    }

    // Step 4: Group samples - use quartiles for numerical, categorical for others
    let groups: SessionGroupData[] = [];
    let quartiles: Quartile[] | null = null;

    if (isNumerical) {
        // Use quartile binning for numerical attributes
        quartiles = splitDataIntoQuartiles(clinicalData, 4);

        for (const quartile of quartiles) {
            // Map quartile data back to sample identifiers
            const quartileDataSet = new Set(
                quartile.data.map((d) =>
                    isPatientAttribute ? d.uniquePatientKey : d.uniqueSampleKey
                )
            );

            const sampleIdentifiers = samples
                .filter((s) => {
                    const key = isPatientAttribute
                        ? s.uniquePatientKey
                        : s.uniqueSampleKey;
                    return quartileDataSet.has(key);
                })
                .map((s) => ({
                    studyId: s.studyId,
                    sampleId: s.sampleId,
                }));

            if (sampleIdentifiers.length > 0) {
                groups.push(
                    createGroup(quartile.name, sampleIdentifiers, studyIds)
                );
            }
        }
    } else {
        // Categorical grouping
        const groupsMap = groupSamplesByAttributeValue(
            clinicalData,
            samples,
            isPatientAttribute
        );

        if (groupsMap.size === 0) {
            throw new Error('No valid groups created from clinical data');
        }

        // Filter out any "NA" groups (these will be handled by createNAGroup)
        // Filter by clinicalAttributeValues if specified (case-insensitive)
        // Sort groups by size (descending)
        const allowedValues = clinicalAttributeValues
            ? new Set(clinicalAttributeValues.map((v) => v.toLowerCase()))
            : null;

        const sortedGroups = Array.from(groupsMap.entries())
            .filter(([groupName]) => {
                // Always exclude NA groups (handled by createNAGroup)
                if (groupName.toLowerCase() === 'na') {
                    return false;
                }
                // If clinicalAttributeValues specified, only include matched values
                if (allowedValues) {
                    return allowedValues.has(groupName.toLowerCase());
                }
                // Include all values if not specified
                return true;
            })
            .sort(([, a], [, b]) => b.length - a.length);

        groups = sortedGroups.map(([groupName, sampleIdentifiers]) =>
            createGroup(groupName, sampleIdentifiers, studyIds)
        );
    }

    // Step 5: Limit groups to top 20, including NA group in count
    const MAX_GROUPS = 20;
    const naCount = shouldIncludeNA ? 1 : 0;
    const maxValueGroups = MAX_GROUPS - naCount;

    // Limit value-based groups
    groups = groups.slice(0, maxValueGroups);

    // Step 6: Create NA group if requested and include within 20-group limit
    if (shouldIncludeNA) {
        // Build set of samples that have clinical data
        const samplesWithData = new Set<string>();

        if (isPatientAttribute) {
            const patientsWithData = new Set(
                clinicalData.map((d) => d.uniquePatientKey)
            );
            samples.forEach((sample) => {
                if (patientsWithData.has(sample.uniquePatientKey!)) {
                    samplesWithData.add(`${sample.studyId}_${sample.sampleId}`);
                }
            });
        } else {
            clinicalData.forEach((d) => {
                samplesWithData.add(`${d.studyId}_${d.sampleId}`);
            });
        }

        const naGroup = createNAGroup(samplesWithData, samples, studyIds);
        if (naGroup) {
            groups.push(naGroup);
        }
    }

    if (groups.length < 2) {
        throw new Error(
            'At least 2 groups are required for comparison (found ' +
                groups.length +
                ')'
        );
    }

    // Step 7: Create comparison session on backend
    const config = getConfig();
    const sessionClient = new ComparisonSessionClient(config.baseUrl);

    // Match frontend conventions:
    //   Categorical: clinicalAttributeName = displayName, no groupNameOrder
    //   Numerical:   clinicalAttributeName = "Quartiles of {displayName}", groupNameOrder preserves ascending order
    const { id: sessionId } = await sessionClient.createSession({
        groups,
        origin: studyIds,
        clinicalAttributeName: isNumerical
            ? `Quartiles of ${attribute.displayName}`
            : attribute.displayName,
        ...(isNumerical && { groupNameOrder: groups.map((g) => g.name) }),
    });

    // Step 8: Build comparison URL with optional tab
    const url = buildComparisonUrl(sessionId, tab as ComparisonTab | undefined);

    // Step 9: Prepare group metadata
    const groupInfo: GroupInfo[] = groups.map((group) => ({
        name: group.name,
        sampleCount: group.studies.reduce(
            (total, study) => total + study.samples.length,
            0
        ),
    }));

    // Step 10: Generate studyview URLs
    // studyViewUrl: always present — base study view (with pre-filter if provided)
    const studyViewUrl = buildStudyUrl({
        studyIds,
        filterJson: hasFiltersOtherThanStudyIds(studyViewFilter)
            ? studyViewFilter
            : undefined,
    });

    // Per-group URLs when: pre-filter exists OR user selected a value subset
    const shouldGeneratePerGroupUrls =
        hasFiltersOtherThanStudyIds(studyViewFilter) ||
        (clinicalAttributeValues && clinicalAttributeValues.length > 0);

    if (!shouldGeneratePerGroupUrls) {
        return {
            url,
            studyViewUrl,
            groupInfo,
            attributeId: clinicalAttributeId,
            attributeName: attribute.displayName,
            attributeDatatype: attribute.datatype,
        };
    }

    // Pre-filter or value subset: also return 1 URL per group
    const groupUrls: GroupUrl[] = groupInfo.map((group, index) => {
        // Start with base filter
        const filterJson = studyViewFilter
            ? JSON.parse(JSON.stringify(studyViewFilter))
            : {};

        // Ensure studyIds
        filterJson.studyIds = studyIds;

        // Add clinical attribute filter for this group
        if (!filterJson.clinicalDataFilters) {
            filterJson.clinicalDataFilters = [];
        }

        if (isNumerical && quartiles && quartiles[index]) {
            // Use range filter for numerical
            filterJson.clinicalDataFilters.push({
                attributeId: clinicalAttributeId,
                values: [
                    {
                        start: quartiles[index].minValue,
                        end: quartiles[index].maxValue,
                    },
                ],
            });
        } else {
            // Use categorical value filter
            filterJson.clinicalDataFilters.push({
                attributeId: clinicalAttributeId,
                values: [{ value: group.name }],
            });
        }

        const groupUrl = buildStudyUrl({
            studyIds,
            filterJson,
        });

        return {
            groupName: group.name,
            url: groupUrl,
        };
    });

    return {
        url,
        studyViewUrl,
        groupInfo,
        attributeId: clinicalAttributeId,
        attributeName: attribute.displayName,
        attributeDatatype: attribute.datatype,
        groupUrls,
    };
}

/**
 * Filter-based group comparison mode.
 *
 * Each group is defined by a StudyViewFilter. Samples are materialized for
 * each group independently, then a comparison session is created.
 *
 * @param studyIds - Study IDs (auto-injected into each group's filter)
 * @param filterGroups - Array of {name, studyViewFilter} group definitions
 * @param tab - Optional comparison tab
 */
async function navigateToGroupComparisonByFilters(
    studyIds: string[],
    filterGroups: GroupDefinition[],
    globalFilter?: Record<string, any>,
    tab?: ComparisonTab
): Promise<GroupComparisonResult> {
    // Validate: at most one unselected group
    const unselectedGroups = filterGroups.filter(
        (g): g is UnselectedGroup => 'isUnselected' in g && g.isUnselected
    );
    if (unselectedGroups.length > 1) {
        throw new Error('At most one group may have isUnselected: true');
    }
    const unselectedGroup = unselectedGroups[0] ?? null;

    const selectedFilterGroups = filterGroups.filter(
        (g): g is FilterGroup => !('isUnselected' in g)
    );

    // Fetch samples for each filter-based group in parallel
    const groupSamples = await Promise.all(
        selectedFilterGroups.map(async ({ name, studyViewFilter }) => {
            const filter = globalFilter
                ? mergeStudyViewFilters(globalFilter, studyViewFilter, studyIds)
                : { ...studyViewFilter, studyIds };
            const samples: Sample[] =
                await apiClient.fetchFilteredSamples(filter);
            return { name, samples, studyViewFilter };
        })
    );

    // Validate all filter-based groups have samples
    for (const { name, samples } of groupSamples) {
        if (samples.length === 0) {
            throw new Error(
                `No samples found for group "${name}" — filter may be too restrictive`
            );
        }
    }

    // Compute unselected group if requested:
    // fetch full cohort, subtract all filter-based groups' samples
    let unselectedSamples: Sample[] = [];
    if (unselectedGroup) {
        const cohortFilter = globalFilter
            ? { ...globalFilter, studyIds }
            : { studyIds };
        const cohortSamples: Sample[] =
            await apiClient.fetchFilteredSamples(cohortFilter);

        const selectedKeys = new Set(
            groupSamples.flatMap(({ samples }) =>
                samples.map((s) => `${s.studyId}_${s.sampleId}`)
            )
        );
        unselectedSamples = cohortSamples.filter(
            (s) => !selectedKeys.has(`${s.studyId}_${s.sampleId}`)
        );

        if (unselectedSamples.length === 0) {
            throw new Error(
                `No samples remain for unselected group "${unselectedGroup.name}" — all cohort samples are covered by other groups`
            );
        }
    }

    // Build session groups (filter-based first, then unselected)
    const sessionGroups: SessionGroupData[] = [
        ...groupSamples.map(({ name, samples }) =>
            createGroup(
                name,
                samples.map((s) => ({
                    studyId: s.studyId,
                    sampleId: s.sampleId,
                })),
                studyIds
            )
        ),
        ...(unselectedGroup
            ? [
                  createGroup(
                      unselectedGroup.name,
                      unselectedSamples.map((s) => ({
                          studyId: s.studyId,
                          sampleId: s.sampleId,
                      })),
                      studyIds
                  ),
              ]
            : []),
    ];

    // Create comparison session
    const config = getConfig();
    const sessionClient = new ComparisonSessionClient(config.baseUrl);
    const { id: sessionId } = await sessionClient.createSession({
        groups: sessionGroups,
        origin: studyIds,
    });

    const url = buildComparisonUrl(sessionId, tab as ComparisonTab | undefined);

    const groupInfo: GroupInfo[] = sessionGroups.map((group) => ({
        name: group.name,
        sampleCount: group.studies.reduce(
            (total, study) => total + study.samples.length,
            0
        ),
    }));

    // Per-group StudyView URLs (always generated in filter mode)
    const groupUrls: GroupUrl[] = [
        ...groupSamples.map(({ name, studyViewFilter }) => {
            const combinedFilter = globalFilter
                ? mergeStudyViewFilters(globalFilter, studyViewFilter, studyIds)
                : studyViewFilter;
            return {
                groupName: name,
                url: buildStudyUrl({
                    studyIds,
                    filterJson: hasFiltersOtherThanStudyIds(combinedFilter)
                        ? combinedFilter
                        : undefined,
                }),
            };
        }),
        // Unselected group: no simple StudyView filter to express it, omit
    ];

    const studyViewUrl = buildStudyUrl({
        studyIds,
        filterJson: hasFiltersOtherThanStudyIds(globalFilter)
            ? globalFilter
            : undefined,
    });

    return {
        url,
        studyViewUrl,
        groupInfo,
        groupUrls: groupUrls.length > 0 ? groupUrls : undefined,
    };
}

/**
 * Merge a global StudyViewFilter with a per-group StudyViewFilter.
 *
 * Most filter fields are arrays (clinicalDataFilters, geneFilters, etc.)
 * and are concatenated. Non-array fields use the group value if present,
 * otherwise the global value. studyIds is always set explicitly.
 */
function mergeStudyViewFilters(
    global: Record<string, any>,
    group: Record<string, any>,
    studyIds: string[]
): Record<string, any> {
    const merged: Record<string, any> = { studyIds };
    const allKeys = new Set([...Object.keys(global), ...Object.keys(group)]);

    for (const key of allKeys) {
        if (key === 'studyIds') continue;
        const gVal = global[key];
        const pVal = group[key];
        if (Array.isArray(gVal) && Array.isArray(pVal)) {
            merged[key] = [...gVal, ...pVal];
        } else if (pVal !== undefined) {
            merged[key] = pVal;
        } else {
            merged[key] = gVal;
        }
    }

    return merged;
}

/**
 * Check if studyViewFilter has meaningful filters beyond studyIds.
 *
 * @param filter - StudyViewFilter object (may be undefined)
 * @returns true if filter has fields other than studyIds
 */
function hasFiltersOtherThanStudyIds(
    filter: Record<string, any> | undefined
): boolean {
    if (!filter) {
        return false;
    }

    // Check if any keys exist besides studyIds
    const keys = Object.keys(filter);
    if (keys.length === 0) {
        return false;
    }

    if (keys.length === 1 && keys[0] === 'studyIds') {
        return false;
    }

    // Has other filters
    return true;
}
