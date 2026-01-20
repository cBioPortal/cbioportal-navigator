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

import { apiClient } from './cbioportalClient.js';
import _ from 'lodash';
import type {
    ClinicalAttribute,
    SampleList,
    MolecularProfile,
    StudyViewFilter,
    MolecularProfileFilter,
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
            } as MolecularProfileFilter, // Type assertion needed due to API client type definition
            projection: 'ID',
        });
    }
}

// Singleton instance
export const studyViewDataClient = new StudyViewDataClient();
