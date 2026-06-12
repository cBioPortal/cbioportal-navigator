/**
 * API client for fetching StudyView filter metadata.
 *
 * This module provides methods for retrieving metadata needed to construct
 * filterJson parameters for StudyView. It encapsulates the cBioPortal API calls
 * and data transformations required to support MCP resources for filter options.
 *
 * Implementation follows patterns from cbioportal-frontend/src/pages/studyViewPage/StudyViewPageStore.ts
 *
 * @packageDocumentation
 */

import { apiClient } from '../shared/cbioportalClient.js';
import _ from 'lodash';
import type {
    ClinicalAttribute,
    SampleList,
    MolecularProfile,
    StudyViewFilter,
    MolecularProfileFilter,
    GenericAssayMeta,
    GenericAssayMetaFilter,
} from 'cbioportal-ts-api-client';

export class StudyViewDataClient {
    private api = apiClient.getRawApi();
    private internalApi = apiClient.getInternalApi();

    /**
     * Get all clinical attributes for one or more studies.
     *
     * Follows the pattern from cbioportal-frontend StudyViewPageStore.ts (lines 6137-6167)
     * - Uses POST method to support multiple studyIds
     * - Uses SUMMARY projection to get datatype and description fields
     * - Deduplicates based on combination of patientAttribute and clinicalAttributeId
     *
     * @param studyIds - Array of study identifiers
     * @returns Deduplicated list of clinical attributes with summary-level information
     */
    async getClinicalAttributes(
        studyIds: string[]
    ): Promise<ClinicalAttribute[]> {
        const attributes = await this.api.fetchClinicalAttributesUsingPOST({
            studyIds: studyIds,
            projection: 'SUMMARY',
        });

        // Deduplicate based on combination key (same logic as frontend)
        return _.uniqBy(
            attributes,
            (attr) => `${attr.patientAttribute}-${attr.clinicalAttributeId}`
        );
    }

    /**
     * Get possible values for a clinical attribute in a study.
     *
     * Follows the pattern from cbioportal-frontend StudyViewPageStore.ts (lines 4973-5033)
     * - Fetches count data from the API
     * - Extracts unique values without count information
     *
     * @param studyId - Study identifier
     * @param attributeId - Clinical attribute ID
     * @returns Array of unique string values for the attribute
     */
    async getClinicalDataValues(
        studyId: string,
        attributeId: string
    ): Promise<string[]> {
        const result = await this.internalApi.fetchClinicalDataCountsUsingPOST({
            clinicalDataCountFilter: {
                attributes: [{ attributeId, values: [] }],
                studyViewFilter: { studyIds: [studyId] } as StudyViewFilter,
            },
        });

        // Extract unique values (without count information)
        const countItem = result.find(
            (item) => item.attributeId === attributeId
        );
        return countItem?.counts.map((c) => c.value) || [];
    }

    /**
     * Get possible values for multiple clinical attributes in batch (single API call).
     *
     * Optimized version that fetches values for multiple attributes in a single request.
     * Uses the same API endpoint as getClinicalDataValues but with multiple attributes.
     *
     * @param studyId - Study identifier
     * @param attributeIds - Array of clinical attribute IDs
     * @returns Map of attributeId → array of unique string values
     */
    async getClinicalDataValuesBatch(
        studyId: string,
        attributeIds: string[]
    ): Promise<Map<string, string[]>> {
        // Return empty map if no attributes requested
        if (attributeIds.length === 0) {
            return new Map();
        }

        // Construct batch request
        const result = await this.internalApi.fetchClinicalDataCountsUsingPOST({
            clinicalDataCountFilter: {
                attributes: attributeIds.map((id) => ({
                    attributeId: id,
                    values: [],
                })),
                studyViewFilter: { studyIds: [studyId] } as StudyViewFilter,
            },
        });

        // Transform result array into Map<attributeId, values[]>
        const valuesMap = new Map<string, string[]>();
        for (const item of result) {
            const values = item.counts.map((c) => c.value);
            valuesMap.set(item.attributeId, values);
        }

        return valuesMap;
    }

    /**
     * Get quartile bin ranges for NUMBER clinical attributes.
     *
     * Uses fetchClinicalDataBinCountsUsingPOST with
     * binMethod: "QUARTILE". Returns bins of { start?, end?, count } that
     * partition the cohort into 4 equal-sized groups, dropping the "NA" bin
     * (samples with no recorded value — not a usable range for filtering).
     * Mirrors the continuous-bins handling in getGeneSpecificCounts.
     *
     * @param studyId - Study identifier
     * @param attributeIds - Clinical attribute IDs (NUMBER datatype)
     * @returns Map of attributeId → bins array
     */
    async getClinicalDataBins(
        studyId: string,
        attributeIds: string[]
    ): Promise<
        Map<string, Array<{ start?: number; end?: number; count: number }>>
    > {
        if (attributeIds.length === 0) return new Map();

        const bins = await this.internalApi.fetchClinicalDataBinCountsUsingPOST(
            {
                dataBinMethod: 'DYNAMIC',
                clinicalDataBinCountFilter: {
                    attributes: attributeIds.map((attributeId) => ({
                        attributeId,
                        binMethod: 'QUARTILE',
                        disableLogScale: false,
                    })) as any,
                    studyViewFilter: { studyIds: [studyId] } as StudyViewFilter,
                },
            }
        );

        const map = new Map<
            string,
            Array<{ start?: number; end?: number; count: number }>
        >();
        for (const bin of bins as Array<{
            attributeId: string;
            start?: number;
            end?: number;
            count: number;
        }>) {
            if (bin.start === undefined && bin.end === undefined) continue;
            const arr = map.get(bin.attributeId) ?? [];
            arr.push({
                ...(bin.start !== undefined && { start: bin.start }),
                ...(bin.end !== undefined && { end: bin.end }),
                count: bin.count,
            });
            map.set(bin.attributeId, arr);
        }
        return map;
    }

    /**
     * Get all sample lists (case lists) for a study.
     *
     * Follows the pattern from cbioportal-frontend StudyViewPageStore.ts (lines 11831-11837)
     * - Uses ID projection to minimize response size (returns only IDs)
     *
     * @param studyId - Study identifier
     * @returns Array of sample lists with ID-level information only
     */
    async getCaseLists(studyId: string): Promise<SampleList[]> {
        return await this.api.getAllSampleListsInStudyUsingGET({
            studyId,
            projection: 'ID',
        });
    }

    /**
     * Get all molecular profiles for one or more studies.
     *
     * Follows the pattern from cbioportal-frontend StudyViewPageStore.ts (lines 5619-5633)
     * - Uses POST method to support multiple studyIds
     * - Uses ID projection to minimize response size (returns only IDs)
     *
     * @param studyIds - Array of study identifiers
     * @returns Array of molecular profiles with ID-level information only
     */
    async getMolecularProfiles(
        studyIds: string[]
    ): Promise<MolecularProfile[]> {
        return await this.api.fetchMolecularProfilesUsingPOST({
            molecularProfileFilter: {
                studyIds: studyIds,
            } as MolecularProfileFilter,
            // No projection - defaults to SUMMARY, needed for molecularAlterationType/genericAssayType/datatype
        });
    }

    /**
     * Get the number of generic assay entities for one or more molecular profiles.
     *
     * Uses ID projection (stableId only) which is ~6x lighter than SUMMARY.
     * Intended as a cheap pre-check before deciding whether to fetch full metadata:
     * if the count exceeds the caller's threshold, skip the expensive SUMMARY fetch.
     *
     * Note: META projection does NOT return a count-only response for this endpoint
     * (confirmed via curl — returns the same payload as SUMMARY). ID projection is
     * the lightest option available.
     *
     * @param molecularProfileIds - Array of GENERIC_ASSAY profile IDs
     * @returns Total number of entities across the given profiles
     */
    async getGenericAssayEntityCount(
        molecularProfileIds: string[]
    ): Promise<number> {
        if (molecularProfileIds.length === 0) return 0;
        const ids = await this.api.fetchGenericAssayMetaUsingPOST({
            projection: 'ID',
            genericAssayMetaFilter: {
                molecularProfileIds,
            } as GenericAssayMetaFilter,
        });
        return ids.length;
    }

    /**
     * Get generic assay entity metadata for one or more molecular profiles.
     *
     * Returns a list of entities (stableId, name, entityType) belonging to the
     * given GENERIC_ASSAY molecular profile IDs.
     *
     * @param molecularProfileIds - Array of GENERIC_ASSAY profile IDs
     * @returns Array of GenericAssayMeta objects
     */
    async getGenericAssayMeta(
        molecularProfileIds: string[]
    ): Promise<GenericAssayMeta[]> {
        if (molecularProfileIds.length === 0) return [];
        return await this.api.fetchGenericAssayMetaUsingPOST({
            genericAssayMetaFilter: {
                molecularProfileIds,
            } as GenericAssayMetaFilter,
        });
    }

    /**
     * Get value distributions for categorical generic assay entities.
     *
     * Uses fetchGenericAssayDataCountsUsingPOST.
     * Only meaningful for CATEGORICAL/BINARY datatypes; for LIMIT-VALUE callers
     * should skip this and rely on numerical range filters instead.
     *
     * @param studyId - Study identifier
     * @param profileType - Profile suffix (molecularProfileId minus "{studyId}_")
     * @param stableIds - Entity stable IDs to fetch value distributions for
     * @returns Map of stableId → array of distinct values found in the study
     */
    async getGenericAssayDataValues(
        studyId: string,
        profileType: string,
        stableIds: string[]
    ): Promise<Map<string, string[]>> {
        if (stableIds.length === 0) return new Map();

        const result =
            await this.internalApi.fetchGenericAssayDataCountsUsingPOST({
                genericAssayDataCountFilter: {
                    genericAssayDataFilters: stableIds.map((stableId) => ({
                        profileType,
                        stableId,
                    })) as any,
                    studyViewFilter: {
                        studyIds: [studyId],
                    } as StudyViewFilter,
                } as any,
            });

        const map = new Map<string, string[]>();
        for (const item of result) {
            map.set(
                item.stableId,
                item.counts.map((c) => c.value)
            );
        }
        return map;
    }

    /**
     * Get gene-specific value distributions for StudyView gene-specific filters.
     *
     * Routes automatically based on profileType and the molecular profile's datatype:
     * - mutations profileType → fetchMutationDataCountsUsingPOST (DETAILED projection)
     *   Returns mutation type strings (e.g. "Missense_Mutation", "In_Frame_Del") as `counts`
     *   Used in mutationDataFilters with categorization: "MUTATION_TYPE"
     * - discrete CNA (COPY_NUMBER_ALTERATION + datatype DISCRETE, e.g. gistic) →
     *   fetchGenomicDataCountsUsingPOST. Returns numeric CNA strings
     *   ("2"=AMP, "1"=GAIN, "0"=DIPLOID, "-1"=HETLOSS, "-2"=HOMDEL) as `counts`
     *   Used in genomicDataFilters
     * - everything else (continuous data: mRNA, protein, methylation, log2 CNA, etc.) →
     *   fetchGenomicDataBinCountsUsingPOST (QUARTILE binning). Returns `bins` of
     *   { start?, end?, count } that partition the cohort into 4 equal-sized groups.
     *   Used in genomicDataFilters as {start}/{end} ranges, including for
     *   navigate_to_group_comparison's `groups` mode.
     *
     * @param studyId - Study identifier
     * @param queries - Array of { hugoGeneSymbol, profileType } to query
     * @returns Array of results with `counts` (categorical) or `bins` (continuous) per gene+profile
     */
    async getGeneSpecificCounts(
        studyId: string,
        queries: Array<{ hugoGeneSymbol: string; profileType: string }>
    ): Promise<
        Array<{
            hugoGeneSymbol: string;
            profileType: string;
            counts?: Array<{ value: string; label: string; count: number }>;
            bins?: Array<{ start?: number; end?: number; count: number }>;
        }>
    > {
        if (queries.length === 0) return [];

        const studyViewFilter = { studyIds: [studyId] } as StudyViewFilter;

        // Split into mutation vs non-mutation queries
        const mutationQueries = queries.filter(
            (q) => q.profileType === 'mutations'
        );
        const nonMutationQueries = queries.filter(
            (q) => q.profileType !== 'mutations'
        );

        // For non-mutation queries, look up each profile's datatype to decide
        // whether it's discrete CNA (data-counts) or continuous (bin-counts).
        const profiles =
            nonMutationQueries.length > 0
                ? await this.getMolecularProfiles([studyId])
                : [];
        const profileMap = new Map(
            profiles.map((p) => [p.molecularProfileId, p])
        );
        const isDiscreteCna = (profileType: string): boolean => {
            const profile = profileMap.get(`${studyId}_${profileType}`);
            return (
                profile?.molecularAlterationType === 'COPY_NUMBER_ALTERATION' &&
                profile?.datatype === 'DISCRETE'
            );
        };

        const discreteQueries = nonMutationQueries.filter((q) =>
            isDiscreteCna(q.profileType)
        );
        const continuousQueries = nonMutationQueries.filter(
            (q) => !isDiscreteCna(q.profileType)
        );

        const [mutationResults, discreteResults, continuousBins] =
            await Promise.all([
                mutationQueries.length > 0
                    ? this.internalApi.fetchMutationDataCountsUsingPOST({
                          projection: 'DETAILED',
                          genomicDataCountFilter: {
                              genomicDataFilters: mutationQueries.map((q) => ({
                                  hugoGeneSymbol: q.hugoGeneSymbol,
                                  profileType: q.profileType,
                              })) as any,
                              studyViewFilter,
                          },
                      })
                    : Promise.resolve([]),
                discreteQueries.length > 0
                    ? this.internalApi.fetchGenomicDataCountsUsingPOST({
                          genomicDataCountFilter: {
                              genomicDataFilters: discreteQueries.map((q) => ({
                                  hugoGeneSymbol: q.hugoGeneSymbol,
                                  profileType: q.profileType,
                              })) as any,
                              studyViewFilter,
                          },
                      })
                    : Promise.resolve([]),
                continuousQueries.length > 0
                    ? this.internalApi.fetchGenomicDataBinCountsUsingPOST({
                          dataBinMethod: 'DYNAMIC',
                          genomicDataBinCountFilter: {
                              genomicDataBinFilters: continuousQueries.map(
                                  (q) => ({
                                      hugoGeneSymbol: q.hugoGeneSymbol,
                                      profileType: q.profileType,
                                      binMethod: 'QUARTILE',
                                      disableLogScale: false,
                                  })
                              ) as any,
                              studyViewFilter,
                          },
                      })
                    : Promise.resolve([]),
            ]);

        const countResults = [...mutationResults, ...discreteResults].map(
            (item) => ({
                hugoGeneSymbol: item.hugoGeneSymbol,
                profileType: item.profileType,
                counts: item.counts.map((c) => ({
                    value: c.value,
                    label: c.label,
                    count: c.count,
                })),
            })
        );

        // Group continuous bins by gene+profileType, dropping the "NA" bin
        // (samples with no data — not a usable range for filtering).
        const binsByQuery = new Map<
            string,
            Array<{ start?: number; end?: number; count: number }>
        >();
        for (const bin of continuousBins as Array<{
            hugoGeneSymbol: string;
            profileType: string;
            start?: number;
            end?: number;
            count: number;
        }>) {
            if (bin.start === undefined && bin.end === undefined) continue;
            const key = `${bin.hugoGeneSymbol}|${bin.profileType}`;
            const bins = binsByQuery.get(key) ?? [];
            bins.push({
                ...(bin.start !== undefined && { start: bin.start }),
                ...(bin.end !== undefined && { end: bin.end }),
                count: bin.count,
            });
            binsByQuery.set(key, bins);
        }
        const binResults = continuousQueries.map((q) => ({
            hugoGeneSymbol: q.hugoGeneSymbol,
            profileType: q.profileType,
            bins: binsByQuery.get(`${q.hugoGeneSymbol}|${q.profileType}`) ?? [],
        }));

        return [...countResults, ...binResults];
    }

    /**
     * Get available treatments for one or more studies.
     *
     * Uses the patient-level endpoint /api/treatments/patient-counts/fetch
     * to fetch all unique treatments available in the study.
     *
     * @param studyIds - Array of study identifiers
     * @returns Array of unique treatment names, sorted alphabetically
     */
    async getTreatments(studyIds: string[]): Promise<string[]> {
        const studyViewFilter = { studyIds } as StudyViewFilter;

        const report =
            await this.internalApi.fetchPatientTreatmentCountsUsingPOST({
                studyViewFilter,
            });

        // Extract and sort treatment names
        return report.patientTreatments.map((t) => t.treatment).sort();
    }
}

// Singleton instance
export const studyViewDataClient = new StudyViewDataClient();
