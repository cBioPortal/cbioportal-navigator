/**
 * Navigate to Group Comparison page based on custom filter-defined groups.
 *
 * This module implements the logic for creating group comparison sessions
 * from custom StudyViewFilter-defined groups. It:
 * 1. Fetches samples for each group's filter (intersected with an optional
 *    global pre-filter)
 * 2. Computes the complement (isUnselected) group, if any
 * 3. Creates a comparison session on the backend
 * 4. Returns a navigation URL to the comparison page, plus per-group
 *    StudyView URLs
 *
 * Based on: cbioportal-frontend/src/pages/groupComparison/comparisonGroupManager/ComparisonGroupManagerUtils.ts
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { apiClient } from './shared/cbioportalClient.js';
import { ComparisonSessionClient } from './groupComparison/comparisonSessionClient.js';
import {
    createGroup,
    type Sample,
    type SessionGroupData,
} from './groupComparison/groupBuilder.js';
import {
    buildComparisonUrl,
    type ComparisonTab,
} from './groupComparison/buildComparisonUrl.js';
import { buildStudyUrl } from './studyView/buildStudyUrl.js';
import {
    createNavigationResponse,
    createErrorResponse,
} from './shared/responses.js';
import { getConfig } from './shared/config.js';
import { loadPrompt } from './shared/promptLoader.js';
import { getGroupComparisonPageDescription } from './shared/pageDescriptions.js';

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
        .describe(
            'Groups to compare (minimum 2). Each group provides either a studyViewFilter or isUnselected: true (complement of all other groups). Use for clinical attribute splits (including merged values, e.g. T1+T2 vs T3+T4, or an "NA"/missing-data group via clinicalDataFilters), cohort-relative splits of continuous values (use bins from get_studyviewfilter_options), gene-based splits, wildtype/unaltered comparisons, or multi-cohort comparisons. Can be combined with studyViewFilter for global pre-filtering. At most one group may be isUnselected.'
        ),
    studyViewFilter: z
        .record(z.string(), z.any())
        .optional()
        .describe(
            "Optional StudyViewFilter to pre-filter samples before grouping. Intersected with each group's filter. Same format as navigate_to_study_view filterJson. studyIds are auto-injected — do not include them inside."
        ),
    tab: z
        .string()
        .optional()
        .default('overlap')
        .describe(
            'Optional comparison page tab. Pick from availableComparisonTabs in resolver metadata. Always available: overlap, clinical. Conditional (study must have relevant data): survival, alterations, mutations, mrna, protein, dna_methylation, generic_assay_{type} (e.g. "generic_assay_treatment_response"). mrna/protein/dna_methylation/generic_assay_* require single-study comparison.'
        ),
    selectedGene: z
        .string()
        .optional()
        .describe(
            'HUGO gene symbol to pre-select in the mutations tab (e.g., "EGFR"). Only meaningful when tab is "mutations". Does NOT filter the cohort — use this to focus the visualization on a specific gene without changing group membership or denominators. To filter the cohort to gene-mutated samples, use geneFilters in studyViewFilter instead.'
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
    groups: GroupDefinition[];
    studyViewFilter?: z.infer<typeof inputSchema.studyViewFilter>;
    tab?: string;
    selectedGene?: string;
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
            description: `Group comparison (${result.groupInfo.length} custom groups)`,
            studies: input.studyIds,
            totalGroups: result.groupInfo.length,
            groups: result.groupInfo,
        };

        // Always include studyViewUrl for cohort exploration
        responseData.studyViewUrl = result.studyViewUrl;

        // Add per-group URLs when available
        if (result.groupUrls) {
            responseData.groupUrls = result.groupUrls;
        }

        const pageDescription = getGroupComparisonPageDescription(input.tab, {
            groups: result.groupInfo,
        });
        if (pageDescription) {
            responseData.pageDescription = pageDescription;
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
    // Per-group StudyView URLs (one per filter-based group; omitted for an isUnselected group)
    groupUrls?: GroupUrl[];
}

/**
 * Core logic for creating a group comparison session and URL from custom
 * StudyViewFilter-defined groups.
 *
 * Flow:
 * 1. Fetch samples for each filter-based group in parallel (intersected with
 *    the global pre-filter, if any)
 * 2. Compute the complement (isUnselected) group, if any
 * 3. Create a comparison session on the backend
 * 4. Build the comparison URL with optional tab
 * 5. Generate per-group StudyView URLs and the overall studyViewUrl
 *
 * @param input - Validated input parameters
 * @returns Object with comparison URL, group metadata, and studyview URLs
 * @throws Error if a group has no samples, session creation fails, or
 *   isUnselected leaves no remaining samples
 */
export async function navigateToGroupComparison(
    input: NavigateToGroupComparisonInput
): Promise<GroupComparisonResult> {
    const {
        studyIds,
        groups: filterGroups,
        studyViewFilter: globalFilter,
        tab,
        selectedGene,
    } = input;

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
            const { studyIds: groupStudyIds, ...restFilter } = studyViewFilter;
            const effectiveStudyIds =
                (groupStudyIds as string[] | undefined) ?? studyIds;
            const filter = globalFilter
                ? mergeStudyViewFilters(
                      globalFilter,
                      restFilter,
                      effectiveStudyIds
                  )
                : { ...restFilter, studyIds: effectiveStudyIds };
            const samples: Sample[] =
                await apiClient.fetchFilteredSamples(filter);
            return { name, samples, effectiveStudyIds, restFilter };
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
                samples.map((s: Sample) => `${s.studyId}_${s.sampleId}`)
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

    const url = buildComparisonUrl(
        sessionId,
        tab as ComparisonTab | undefined,
        selectedGene
    );

    const groupInfo: GroupInfo[] = sessionGroups.map((group) => ({
        name: group.name,
        sampleCount: group.studies.reduce(
            (total, study) => total + study.samples.length,
            0
        ),
    }));

    // Per-group StudyView URLs (one per filter-based group)
    const groupUrls: GroupUrl[] = [
        ...groupSamples.map(({ name, effectiveStudyIds, restFilter }) => {
            const combinedFilter = globalFilter
                ? mergeStudyViewFilters(
                      globalFilter,
                      restFilter,
                      effectiveStudyIds
                  )
                : restFilter;
            return {
                groupName: name,
                url: buildStudyUrl({
                    studyIds: effectiveStudyIds,
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
