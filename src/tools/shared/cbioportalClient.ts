/**
 * HTTP client wrapper for cBioPortal API interactions.
 *
 * This module provides a simplified interface to the cBioPortal REST API by
 * wrapping the cbioportal-ts-api-client library. It exposes commonly used
 * operations for retrieving studies, genes, patients, molecular profiles,
 * and case sets, abstracting away the complexity of direct API calls.
 *
 * @remarks
 * Key exports:
 * - `CbioportalApiClient`: Wrapper class around CBioPortalAPI and CBioPortalAPIInternal
 * - `apiClient`: Singleton instance configured with environment-based base URL
 *
 * API methods:
 * - `getAllStudies()`: Fetch all available cancer studies
 * - `getStudy(studyId)`: Retrieve specific study details
 * - `getGene(geneId)`: Validate and retrieve gene information
 * - `getMolecularProfiles(studyId)`: Get molecular data types for a study
 * - `getCaseLists(studyId)`: Get sample sets/cohorts for a study
 * - `getPatientsInStudy(studyId)`: List all patients in a study
 * - `getPatient(studyId, patientId)`: Get specific patient details
 * - `getSamplesForPatient(studyId, patientId)`: Get samples for a patient
 * - `getRawApi()`: Access underlying CBioPortalAPI for advanced operations
 * - `getInternalApi()`: Access underlying CBioPortalAPIInternal for StudyView endpoints
 *
 * Configuration:
 * The base URL is the constructor parameter, else getApiBaseUrl()
 * (CBIOPORTAL_API_URL, falling back to CBIOPORTAL_BASE_URL). Session clients
 * use the same address, so all server-side calls go one way.
 *
 * Every request carries the current caller's cBioPortal token, if any
 * (see portalAuth.ts).
 *
 * @packageDocumentation
 */

import { CBioPortalAPI, CBioPortalAPIInternal } from 'cbioportal-ts-api-client';
import { getApiBaseUrl } from './config.js';
import { portalAuthHeaders, toPortalAuthError } from './portalAuth.js';

/**
 * Attach the caller's token to every request a generated client makes, and
 * turn 401/403 into PortalAuthError. The generated clients build headers per
 * call with no hook for extra ones, so wrap their shared `request` method.
 */
function withPortalAuth(client: object): void {
    const target = client as { request: (...args: any[]) => void };
    const request = target.request.bind(client);
    target.request = (
        method,
        url,
        body,
        headers,
        queryParameters,
        form,
        reject,
        resolve,
        errorHandlers
    ) =>
        request(
            method,
            url,
            body,
            { ...headers, ...portalAuthHeaders() },
            queryParameters,
            form,
            (error: any) => reject(toPortalAuthError(error?.status) ?? error),
            resolve,
            errorHandlers
        );
}

export class CbioportalApiClient {
    private api: CBioPortalAPI;
    private internalApi: CBioPortalAPIInternal;

    constructor(baseUrl?: string) {
        const apiBaseUrl = baseUrl || getApiBaseUrl();
        this.api = new CBioPortalAPI(apiBaseUrl);
        this.internalApi = new CBioPortalAPIInternal(apiBaseUrl);
        withPortalAuth(this.api);
        withPortalAuth(this.internalApi);
    }

    /**
     * Get all studies
     */
    async getAllStudies() {
        return await this.api.getAllStudiesUsingGET({});
    }

    /**
     * Get a specific study by ID
     */
    async getStudy(studyId: string) {
        return await this.api.getStudyUsingGET({ studyId });
    }

    /**
     * Get a gene by Hugo gene symbol or Entrez gene ID
     */
    async getGene(geneId: string) {
        return await this.api.getGeneUsingGET({ geneId });
    }

    /**
     * Get all molecular profiles for a study
     */
    async getMolecularProfiles(studyId: string) {
        return await this.api.getAllMolecularProfilesInStudyUsingGET({
            studyId,
        });
    }

    /**
     * Get all sample lists (case sets) for a study
     */
    async getCaseLists(studyId: string) {
        return await this.api.getAllSampleListsInStudyUsingGET({ studyId });
    }

    /**
     * Get all patients in a study
     */
    async getPatientsInStudy(studyId: string) {
        return await this.api.getAllPatientsInStudyUsingGET({ studyId });
    }

    /**
     * Get a specific patient
     */
    async getPatient(studyId: string, patientId: string) {
        return await this.api.getPatientInStudyUsingGET({ studyId, patientId });
    }

    /**
     * Get all samples for a patient
     */
    async getSamplesForPatient(studyId: string, patientId: string) {
        return await this.api.getAllSamplesOfPatientInStudyUsingGET({
            studyId,
            patientId,
        });
    }

    /**
     * Fetch filtered samples based on StudyViewFilter
     *
     * @remarks
     * Returns samples matching the provided filter criteria.
     *
     * @param studyViewFilter - Filter object (uses studyIds if no other filters specified)
     * @returns Array of Sample objects with studyId, sampleId, patientId
     */
    async fetchFilteredSamples(studyViewFilter?: any) {
        return await this.internalApi.fetchFilteredSamplesUsingPOST({
            studyViewFilter: studyViewFilter || { studyIds: [] },
        });
    }

    /**
     * Get the underlying CBioPortalAPI instance for direct access
     * Use this for methods not wrapped by CbioportalApiClient
     */
    getRawApi(): CBioPortalAPI {
        return this.api;
    }

    /**
     * Get the underlying CBioPortalAPIInternal instance for internal/StudyView endpoints
     * Use this for StudyView-specific methods like fetchClinicalDataCountsUsingPOST
     */
    getInternalApi(): CBioPortalAPIInternal {
        return this.internalApi;
    }
}

// Singleton instance
export const apiClient = new CbioportalApiClient();
