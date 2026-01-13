/**
 * MCP Resource for StudyView Clinical Attributes metadata.
 *
 * Provides a list of all clinical attributes available for filtering in a study.
 * This helps AI understand what clinical data dimensions are available before
 * constructing clinicalDataFilters in StudyViewFilter.
 *
 * URI Template: cbioportal://study/{studyId}/filters/clinical-attributes
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
 * Resource configuration for clinical attributes.
 */
export const clinicalAttributesResource = {
    name: 'study-clinical-attributes',
    uriTemplate: 'cbioportal://study/{studyId}/filters/clinical-attributes',
    metadata: {
        title: 'Clinical Attributes for Study',
        description:
            'List of all clinical attributes available for filtering in a study. ' +
            'Provides attribute IDs, display names, data types, and descriptions. ' +
            'Use this to discover what clinical data dimensions are available ' +
            'before constructing clinicalDataFilters in StudyViewFilter.',
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

            // Fetch clinical attributes for the study
            const attributes = await studyViewDataClient.getClinicalAttributes([
                studyId,
            ]);

            // Transform to resource format
            const resourceData = {
                studyId,
                attributes: attributes.map((attr) => ({
                    attributeId: attr.clinicalAttributeId,
                    displayName: attr.displayName,
                    datatype: attr.datatype,
                    description: attr.description,
                    patientAttribute: attr.patientAttribute,
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
