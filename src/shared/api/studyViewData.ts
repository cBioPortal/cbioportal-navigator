/**
 * API client for fetching StudyView filter metadata.
 *
 * This module provides methods for retrieving metadata needed to construct
 * filterJson parameters for StudyView. It encapsulates the cBioPortal API calls
 * and data transformations required to support MCP resources for filter options.
 *
 * Implementation follows patterns from cbioportal-frontend/src/pages/studyView/StudyViewPageStore.ts
 *
 * @packageDocumentation
 */

import { apiClient } from './client.js';
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
     * - Deduplicates based on combination of patientAttribute and clinicalAttributeId
     *
     * @param studyIds - Array of study identifiers
     * @returns Deduplicated list of clinical attributes
     */
    async getClinicalAttributes(
        studyIds: string[]
    ): Promise<ClinicalAttribute[]> {
        const attributes = await this.api.fetchClinicalAttributesUsingPOST({
            studyIds: studyIds,
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
     * Get all sample lists (case lists) for a study.
     *
     * Follows the pattern from cbioportal-frontend StudyViewPageStore.ts (lines 11831-11837)
     * - Uses SUMMARY projection to reduce response size
     *
     * @param studyId - Study identifier
     * @returns Array of sample lists with summary information
     */
    async getCaseLists(studyId: string): Promise<SampleList[]> {
        return await this.api.getAllSampleListsInStudyUsingGET({
            studyId,
            projection: 'SUMMARY',
        });
    }

    /**
     * Get all molecular profiles for one or more studies.
     *
     * Follows the pattern from cbioportal-frontend StudyViewPageStore.ts (lines 5619-5633)
     * - Uses POST method to support multiple studyIds
     *
     * @param studyIds - Array of study identifiers
     * @returns Array of molecular profiles
     */
    async getMolecularProfiles(
        studyIds: string[]
    ): Promise<MolecularProfile[]> {
        return await this.api.fetchMolecularProfilesUsingPOST({
            molecularProfileFilter: {
                studyIds: studyIds,
            } as MolecularProfileFilter, // Type assertion needed due to API client type definition
        });
    }
}

// Singleton instance
export const studyViewDataClient = new StudyViewDataClient();
