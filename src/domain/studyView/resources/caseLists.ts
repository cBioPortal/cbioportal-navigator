/**
 * MCP Resource for StudyView Case Lists metadata.
 *
 * Provides a list of all case lists (sample lists) available in a study.
 * Case lists are pre-defined groups of samples used for filtering in StudyViewFilter.
 *
 * URI Template: cbioportal://study/{studyId}/filters/case-lists
 *
 * @packageDocumentation
 */

import { studyViewDataClient } from '../../../infrastructure/api/studyViewData.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

interface Variables {
    studyId?: string;
    [key: string]: unknown;
}

/**
 * Resource configuration for case lists.
 */
export const caseListsResource = {
    name: 'study-case-lists',
    uriTemplate: 'cbioportal://study/{studyId}/filters/case-lists',
    metadata: {
        title: 'Case Lists for Study',
        description:
            'List of all case lists (sample lists) available in a study. ' +
            'Case lists are pre-defined groups of samples that can be used ' +
            'in the caseLists field of StudyViewFilter. Each list includes ' +
            'its ID, name, description, and category.',
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

            // Fetch case lists for the study
            const caseLists = await studyViewDataClient.getCaseLists(studyId);

            // Transform to resource format
            const resourceData = {
                studyId,
                caseLists: caseLists.map((list) => ({
                    sampleListId: list.sampleListId,
                    name: list.name,
                    description: list.description,
                    category: list.category,
                    sampleCount: list.sampleCount,
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
