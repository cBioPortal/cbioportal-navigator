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
 * The base URL is determined by (in priority order):
 * 1. Constructor parameter
 * 2. CBIOPORTAL_API_URL environment variable
 * 3. Default: https://www.cbioportal.org
 *
 * @packageDocumentation
 */

import { CBioPortalAPI, CBioPortalAPIInternal } from 'cbioportal-ts-api-client';

export class CbioportalApiClient {
    private api: CBioPortalAPI;
    private internalApi: CBioPortalAPIInternal;

    constructor(baseUrl?: string) {
        const apiBaseUrl =
            baseUrl ||
            process.env.CBIOPORTAL_API_URL ||
            'https://www.cbioportal.org';
        this.api = new CBioPortalAPI(apiBaseUrl);
        this.internalApi = new CBioPortalAPIInternal(apiBaseUrl);
        this.overrideApisForColumnStore();
    }

    /**
     * Override API request methods to route specific endpoints to column-store.
     *
     * @remarks
     * This implements the same pattern as cbioportal-frontend's proxyColumnStore
     * using a whitelist approach. Only endpoints that have column-store implementations
     * in the backend are rewritten.
     *
     * Backend column-store controllers:
     * - ColumnarStoreStudyViewController: StudyView-specific endpoints
     * - ColumnStoreStudyController: Public study endpoints
     * - ColumnStoreSampleController: Public sample endpoints
     */
    private overrideApisForColumnStore(): void {
        // Override internalApi for StudyView endpoints
        // Based on cbioportal-frontend/src/shared/api/cbioportalInternalClientInstance.ts
        this.overrideRequestMethod(this.internalApi, (url) => {
            const internalApiEndpoints = [
                'clinical-data-counts', // fetchClinicalDataCounts - Currently in use
                'filtered-samples', // fetchFilteredSamples
                'mutated-genes', // fetchMutatedGenes
                'molecular-profile-sample-counts', // fetchMolecularProfileSampleCounts
                'cna-genes', // fetchCNAGenes
                'structuralvariant-genes', // fetchStructuralVariantGenes
                'sample-lists-counts', // fetchCaseListCounts
                'clinical-data-bin-counts', // fetchClinicalDataBinCounts
                'clinical-data-density-plot', // fetchClinicalDataDensityPlot
                'mutation-data-counts', // fetchMutationDataCounts
                'treatments/patient-counts', // fetchPatientTreatmentCounts
                'treatments/sample-counts', // fetchSampleTreatmentCounts
                'clinical-event-type-counts', // getClinicalEventTypeCounts
                'genomic-data-counts', // fetchGenomicDataCounts
                'genomic-data-bin-counts', // fetchGenomicDataBinCounts
                'generic-assay-data-bin-counts', // fetchGenericAssayDataBinCounts
                'generic-assay-data-counts', // fetchGenericAssayDataCounts
                'clinical-data-violin-plots', // fetchClinicalDataViolinPlots
                'alteration-enrichments', // fetchAlterationEnrichments
                'custom-data-counts', // fetchCustomDataCounts
                'custom-data-bin-counts', // fetchCustomDataBinCounts
            ];

            // Check if URL matches any whitelisted endpoint
            if (
                internalApiEndpoints.some((endpoint) => url.includes(endpoint))
            ) {
                return url.replace(/^\/api\//, '/api/column-store/');
            }
            return url;
        });

        // Override api for public endpoints
        // Based on cbioportal-frontend/src/shared/api/cbioportalClientInstance.ts
        this.overrideRequestMethod(this.api, (url) => {
            // Match studies endpoints: /api/studies or /api/studies/meta
            // Corresponds to: getAllStudies
            if (/^\/api\/studies(\?|\/meta|$)/.test(url)) {
                return url.replace(/^\/api\//, '/api/column-store/');
            }

            // Match samples endpoints:
            // - /api/samples (fetchSamples, getSamplesByKeyword)
            // - /api/studies/{studyId}/samples (getAllSamplesInStudy, getSampleInStudy)
            // - /api/studies/{studyId}/patients/{patientId}/samples (getAllSamplesOfPatientInStudy)
            if (
                /^\/api\/(samples|studies\/[^/]+\/(samples|patients\/[^/]+\/samples))/.test(
                    url
                )
            ) {
                return url.replace(/^\/api\//, '/api/column-store/');
            }

            return url;
        });
    }

    /**
     * Generic method to override the request method of an API client.
     *
     * @param client - The API client (CBioPortalAPI or CBioPortalAPIInternal)
     * @param urlTransformer - Function that transforms URLs (returns original or modified URL)
     */
    private overrideRequestMethod(
        client: any,
        urlTransformer: (url: string) => string
    ): void {
        const oldRequest = client.request;
        client.request = function (...args: any[]) {
            // args[0] = HTTP method (GET/POST/etc)
            // args[1] = URL path
            // args[2] = request body
            // args[3] = headers
            if (args[1] && typeof args[1] === 'string') {
                args[1] = urlTransformer(args[1]);
            }
            return oldRequest.apply(this, args);
        };
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
