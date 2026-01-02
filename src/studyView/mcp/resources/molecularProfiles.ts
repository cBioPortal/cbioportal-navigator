/**
 * MCP Resource for StudyView Molecular Profiles metadata.
 *
 * Provides a list of all molecular profiles available in a study.
 * Molecular profiles represent different types of molecular data (mutations, CNA, expression, etc.)
 * and can be used in genomicProfiles and other filter fields of StudyViewFilter.
 *
 * URI Template: cbioportal://study/{studyId}/filters/molecular-profiles
 *
 * @packageDocumentation
 */

import { studyViewDataClient } from '../../../shared/api/studyViewData.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

interface Variables {
    studyId?: string;
    [key: string]: unknown;
}

/**
 * Resource configuration for molecular profiles.
 */
export const molecularProfilesResource = {
    name: 'study-molecular-profiles',
    uriTemplate: 'cbioportal://study/{studyId}/filters/molecular-profiles',
    metadata: {
        title: 'Molecular Profiles for Study',
        description:
            'List of all molecular profiles available in a study. ' +
            'Molecular profiles represent different types of molecular data ' +
            '(mutations, copy number alterations, mRNA expression, etc.). ' +
            'Profile IDs can be used in genomicProfiles and other filter fields.',
        mimeType: 'application/json',
    },
    handler: async (
        uri: URL,
        variables: Variables
    ): Promise<ReadResourceResult> => {
        try {
            const studyId = variables.studyId as string;

            if (!studyId) {
                throw new Error('studyId is required in URI template');
            }

            // Fetch molecular profiles for the study
            const profiles = await studyViewDataClient.getMolecularProfiles([
                studyId,
            ]);

            // Transform to resource format
            const resourceData = {
                studyId,
                profiles: profiles.map((profile) => ({
                    molecularProfileId: profile.molecularProfileId,
                    name: profile.name,
                    description: profile.description,
                    molecularAlterationType: profile.molecularAlterationType,
                    datatype: profile.datatype,
                    showProfileInAnalysisTab: profile.showProfileInAnalysisTab,
                })),
            };

            return {
                contents: [
                    {
                        uri: uri.toString(),
                        mimeType: 'application/json',
                        text: JSON.stringify(resourceData, null, 2),
                    },
                ],
            };
        } catch (error) {
            // Return error as resource content
            return {
                contents: [
                    {
                        uri: uri.toString(),
                        mimeType: 'application/json',
                        text: JSON.stringify(
                            {
                                error: true,
                                message:
                                    error instanceof Error
                                        ? error.message
                                        : 'Unknown error',
                                studyId: variables.studyId,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        }
    },
};
