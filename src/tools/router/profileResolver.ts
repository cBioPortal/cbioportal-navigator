/**
 * Molecular profile resolution for study data types.
 *
 * This module resolves molecular profiles (data types) available in cBioPortal
 * studies, mapping user-friendly alteration type names to cBioPortal's internal
 * molecular alteration types. Used to determine available data and provide
 * metadata for URL construction.
 *
 * @remarks
 * Key exports:
 * - `ProfileResolver`: Class with profile resolution methods
 * - `profileResolver`: Singleton instance for convenient access
 * - `AlterationType`: User-friendly alteration type names
 * - `ResolvedProfile`: Interface for profile metadata
 *
 * Methods:
 * - `getForStudy(studyId, type)`: Get specific profile type for a study
 * - `getAllForStudy(studyId)`: Get all available profiles for a study
 * - `mapAlterationType(type)`: Convert friendly names to cBioPortal types
 *
 * Supported alteration types:
 * - mutation → MUTATION_EXTENDED
 * - cna → COPY_NUMBER_ALTERATION
 * - fusion → FUSION
 * - mrna → MRNA_EXPRESSION
 * - protein → PROTEIN_LEVEL
 * - methylation → METHYLATION
 *
 * @packageDocumentation
 */

import { apiClient } from '../shared/cbioportalClient.js';

export type AlterationType =
    | 'mutation'
    | 'cna'
    | 'fusion'
    | 'mrna'
    | 'protein'
    | 'methylation';

export interface ResolvedProfile {
    molecularProfileId: string;
    molecularAlterationType: string;
    name: string;
    description?: string;
}

export class ProfileResolver {
    /**
     * Map user-friendly alteration type to cBioPortal molecular alteration type
     */
    private mapAlterationType(type: AlterationType): string {
        const mapping: Record<AlterationType, string> = {
            mutation: 'MUTATION_EXTENDED',
            cna: 'COPY_NUMBER_ALTERATION',
            fusion: 'FUSION',
            mrna: 'MRNA_EXPRESSION',
            protein: 'PROTEIN_LEVEL',
            methylation: 'METHYLATION',
        };
        return mapping[type] || 'MUTATION_EXTENDED';
    }

    /**
     * Get molecular profile for a study and alteration type
     */
    async getForStudy(
        studyId: string,
        alterationType: AlterationType = 'mutation'
    ): Promise<ResolvedProfile | null> {
        try {
            const profiles = await apiClient.getMolecularProfiles(studyId);
            const targetType = this.mapAlterationType(alterationType);

            // Find matching profile
            const profile = profiles.find(
                (p) => p.molecularAlterationType === targetType
            );

            if (!profile) {
                return null;
            }

            return {
                molecularProfileId: profile.molecularProfileId,
                molecularAlterationType: profile.molecularAlterationType,
                name: profile.name,
                description: profile.description,
            };
        } catch (error) {
            console.error(
                `Error fetching profiles for study ${studyId}:`,
                error
            );
            return null;
        }
    }

    /**
     * Get all molecular profiles for a study
     */
    async getAllForStudy(studyId: string): Promise<ResolvedProfile[]> {
        try {
            const profiles = await apiClient.getMolecularProfiles(studyId);
            return profiles.map((p) => ({
                molecularProfileId: p.molecularProfileId,
                molecularAlterationType: p.molecularAlterationType,
                name: p.name,
                description: p.description,
            }));
        } catch (error) {
            console.error(
                `Error fetching profiles for study ${studyId}:`,
                error
            );
            return [];
        }
    }
}

export const profileResolver = new ProfileResolver();
