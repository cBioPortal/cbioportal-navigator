/**
 * cBioPortal API Client
 * Wrapper around cbioportal-ts-api-client for MCP server usage
 */

import { CBioPortalAPI } from 'cbioportal-ts-api-client';

export class CbioportalApiClient {
    private api: CBioPortalAPI;

    constructor(baseUrl?: string) {
        const apiBaseUrl =
            baseUrl ||
            process.env.CBIOPORTAL_API_URL ||
            'https://www.cbioportal.org';
        this.api = new CBioPortalAPI(apiBaseUrl);
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
}

// Singleton instance
export const apiClient = new CbioportalApiClient();
