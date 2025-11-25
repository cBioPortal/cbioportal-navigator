/**
 * Study Resolver
 * Handles study ID resolution and validation
 */

import { apiClient } from '../api/client.js';

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
