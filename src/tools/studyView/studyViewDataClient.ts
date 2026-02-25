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
     * Uses fetchGenericAssayDataCountsUsingPOST (column-store whitelisted).
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
     * Get available treatments for one or more studies.
     *
     * Uses the patient-level endpoint /api/column-store/treatments/patient-counts/fetch
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
