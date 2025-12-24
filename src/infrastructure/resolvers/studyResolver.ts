/**
 * Study identification and validation resolver.
 *
 * This module provides functionality to search for cancer studies by keywords
 * and validate study IDs against the cBioPortal API. It enables flexible study
 * identification through either exact IDs or fuzzy keyword matching across
 * study metadata (name, description, cancer type).
 *
 * @remarks
 * Key exports:
 * - `StudyResolver`: Class with search, validation, and retrieval methods
 * - `studyResolver`: Singleton instance for convenient access
 * - `ResolvedStudy`: Interface for study metadata
 *
 * Methods:
 * - `search(keywords)`: Find studies matching any keyword in metadata
 * - `validate(studyId)`: Check if a study ID exists
 * - `getById(studyId)`: Retrieve complete study details
 *
 * Search behavior:
 * Keywords are matched case-insensitively against studyId, name, description,
 * and cancer type. A study matches if any keyword appears in any field.
 *
 * @packageDocumentation
 */

import { apiClient } from '../api/cbioportalClient.js';

export interface ResolvedStudy {
    studyId: string;
    name: string;
    description?: string;
    cancerType?: string;
    allSampleCount?: number;
}

export class StudyResolver {
    /**
     * Search for studies by keywords
     * Returns studies where any keyword matches studyId, name, description, or cancer type
     */
    async search(keywords: string[]): Promise<ResolvedStudy[]> {
        const allStudies = await apiClient.getAllStudies();

        const matches = allStudies.filter((study) => {
            const searchText = [
                study.studyId,
                study.name,
                study.description,
                study.cancerType?.name,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return keywords.some((kw) => searchText.includes(kw.toLowerCase()));
        });

        return matches.map((study) => ({
            studyId: study.studyId,
            name: study.name,
            description: study.description,
            cancerType: study.cancerType?.name,
            allSampleCount: study.allSampleCount,
        }));
    }

    /**
     * Validate if a study ID exists
     */
    async validate(studyId: string): Promise<boolean> {
        try {
            await apiClient.getStudy(studyId);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get study details by ID
     */
    async getById(studyId: string): Promise<ResolvedStudy> {
        const study = await apiClient.getStudy(studyId);
        return {
            studyId: study.studyId,
            name: study.name,
            description: study.description,
            cancerType: study.cancerType?.name,
            allSampleCount: study.allSampleCount,
        };
    }
}

export const studyResolver = new StudyResolver();
