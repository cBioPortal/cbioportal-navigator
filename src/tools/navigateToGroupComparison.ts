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
 * Tool definition for MCP registration
 */
export const navigateToGroupComparisonTool = {
    name: 'navigate_to_group_comparison',
    title: 'Navigate to Group Comparison',
    description: loadPrompt('navigate_to_group_comparison.md'),
    inputSchema: {
        studyIds: z
            .array(z.string())
            .min(1)
            .describe(
                'Array of validated study IDs (e.g., ["luad_tcga"] or ["luad_tcga", "lusc_tcga"] for cross-study). These should be pre-resolved by route_to_target_page tool.'
            ),
        clinicalAttributeId: z
            .string()
            .min(1)
            .describe(
                'Clinical attribute ID to group by (e.g., "SEX", "PATH_T_STAGE"). Must be from router response clinicalAttributeIds.'
            ),
        clinicalAttributeValues: z
            .array(z.string())
            .optional()
            .describe(
                'Optional subset of attribute values to include in comparison (e.g., ["White", "Asian"] for RACE). If not specified, all values will be included. Only applies to categorical attributes.'
            ),
        studyViewFilter: z
            .record(z.string(), z.any())
            .optional()
            .describe(
                'Optional StudyViewFilter object to pre-filter samples before grouping (e.g., gene filters, clinical filters). Same format as navigate_to_study_view filterJson.'
            ),
        includeNA: z
            .boolean()
            .optional()
            .describe(
                'Whether to include an NA group for samples without the attribute. Default: true for categorical attributes, false for numerical attributes.'
            ),
        tab: z
            .enum([
                'overlap',
                'survival',
                'clinical',
                'alterations',
                'mutations',
                'copy-number',
                'mrna',
                'protein',
            ])
            .optional()
            .describe(
                'Optional comparison page tab to navigate to (e.g., "survival", "clinical"). Default: overview page.'
            ),
    },
};

/**
 * Input type inferred from schema
 */
export type NavigateToGroupComparisonInput = {
    studyIds: z.infer<
        typeof navigateToGroupComparisonTool.inputSchema.studyIds
    >;
    clinicalAttributeId: z.infer<
        typeof navigateToGroupComparisonTool.inputSchema.clinicalAttributeId
    >;
    clinicalAttributeValues?: z.infer<
        typeof navigateToGroupComparisonTool.inputSchema.clinicalAttributeValues
    >;
    studyViewFilter?: z.infer<
        typeof navigateToGroupComparisonTool.inputSchema.studyViewFilter
    >;
    includeNA?: z.infer<
        typeof navigateToGroupComparisonTool.inputSchema.includeNA
    >;
    tab?: z.infer<typeof navigateToGroupComparisonTool.inputSchema.tab>;
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
            description: `Group comparison by ${result.attributeName} (${result.attributeId})`,
            studies: input.studyIds,
            attribute: {
                id: result.attributeId,
                name: result.attributeName,
                datatype: result.attributeDatatype,
            },
            totalGroups: result.groupInfo.length,
            groups: result.groupInfo,
        };

        // Add studyview URLs based on scenario
        if (result.baseStudyViewUrl) {
            // Single attribute comparison (no pre-filter)
            responseData.baseStudyViewUrl = result.baseStudyViewUrl;
            responseData.urlExplanation = result.urlExplanation;
        } else if (result.groupUrls) {
            // Multi-attribute comparison (with pre-filter)
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
    groupInfo: GroupInfo[];
    // Attribute information
    attributeId: string;
    attributeName: string;
    attributeDatatype: string;
    // Single attribute scenario (no pre-filter)
    baseStudyViewUrl?: string;
    urlExplanation?: string;
    // Multi-attribute scenario (with pre-filter)
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
        clinicalAttributeId,
        clinicalAttributeValues,
        studyViewFilter,
        includeNA,
        tab,
    } = input;

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
    const url = buildComparisonUrl(sessionId, tab);

    // Step 9: Prepare group metadata
    const groupInfo: GroupInfo[] = groups.map((group) => ({
        name: group.name,
        sampleCount: group.studies.reduce(
            (total, study) => total + study.samples.length,
            0
        ),
    }));

    // Step 10: Generate studyview URLs based on scenario
    // Per-group URLs when: pre-filter exists OR user selected a value subset
    const shouldGeneratePerGroupUrls =
        hasFiltersOtherThanStudyIds(studyViewFilter) ||
        (clinicalAttributeValues && clinicalAttributeValues.length > 0);

    if (!shouldGeneratePerGroupUrls) {
        // Simple comparison (all values, no filter): return base studyview URL only
        const baseStudyViewUrl = buildStudyUrl({ studyIds });
        const groupNames = groupInfo.map((g) => g.name).join(', ');
        const urlExplanation = `Base study view for ${studyIds.join(', ')}. Comparison groups: ${groupNames}`;

        return {
            url,
            groupInfo,
            attributeId: clinicalAttributeId,
            attributeName: attribute.displayName,
            attributeDatatype: attribute.datatype,
            baseStudyViewUrl,
            urlExplanation,
        };
    } else {
        // Pre-filter or value subset: return 1 URL per group
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
            groupInfo,
            attributeId: clinicalAttributeId,
            attributeName: attribute.displayName,
            attributeDatatype: attribute.datatype,
            groupUrls,
        };
    }
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
