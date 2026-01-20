/**
 * MCP tool for retrieving clinical attribute values for filtering.
 *
 * This tool fetches detailed information (datatype and valid values) for
 * specific clinical attributes. Use this after reviewing clinicalAttributeIds
 * from the router to get exact values for filter construction.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { studyViewDataClient } from '../../infrastructure/api/studyViewDataClient.js';
import {
    createDataResponse,
    createErrorResponse,
} from '../shared/responses.js';
import type { ToolResponse } from '../shared/types.js';
import { loadPrompt } from '../../infrastructure/utils/promptLoader.js';

/**
 * Tool definition for MCP registration
 */
export const getClinicalAttributeValuesTool = {
    name: 'get_clinical_attribute_values',
    title: 'Get Clinical Attribute Values for Filtering',
    description: loadPrompt(
        'studyView/prompts/get_clinical_attribute_values.md'
    ),
    inputSchema: {
        studyId: z.string().describe('Study identifier (e.g., "luad_tcga")'),
        attributeIds: z
            .array(z.string())
            .min(1)
            .describe(
                'Array of clinical attribute IDs to fetch values for (e.g., ["SEX", "TUMOR_GRADE", "AGE"])'
            ),
    },
};

// Infer type from Zod schema
type ToolInput = {
    studyId: z.infer<typeof getClinicalAttributeValuesTool.inputSchema.studyId>;
    attributeIds: z.infer<
        typeof getClinicalAttributeValuesTool.inputSchema.attributeIds
    >;
};

/**
 * Tool handler for MCP
 */
export async function handleGetClinicalAttributeValues(
    input: ToolInput
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
        const result = await getClinicalAttributeValues(input);
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(result),
                },
            ],
        };
    } catch (error) {
        const errorResponse = createErrorResponse(
            error instanceof Error ? error.message : 'Unknown error occurred',
            error
        );
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(errorResponse),
                },
            ],
        };
    }
}

/**
 * Main logic for fetching clinical attribute values
 */
async function getClinicalAttributeValues(
    params: ToolInput
): Promise<ToolResponse> {
    const { studyId, attributeIds } = params;

    // 1. Fetch clinical attributes metadata to get datatypes
    const allAttributes = await studyViewDataClient.getClinicalAttributes([
        studyId,
    ]);

    // Filter to requested attributes
    const requestedAttributes = allAttributes.filter((attr) =>
        attributeIds.includes(attr.clinicalAttributeId)
    );

    // Check if all requested attributes were found
    const foundIds = requestedAttributes.map(
        (attr) => attr.clinicalAttributeId
    );
    const missingIds = attributeIds.filter((id) => !foundIds.includes(id));

    if (missingIds.length > 0) {
        return createErrorResponse(
            `Some clinical attributes not found in study: ${missingIds.join(', ')}`,
            {
                studyId,
                requestedIds: attributeIds,
                missingIds,
                availableIds: allAttributes.map(
                    (attr) => attr.clinicalAttributeId
                ),
            }
        );
    }

    // 2. Batch fetch values for all requested attributes
    let valuesMap: Map<string, string[]> = new Map();

    if (requestedAttributes.length > 0) {
        valuesMap = await studyViewDataClient.getClinicalDataValuesBatch(
            studyId,
            requestedAttributes.map((attr) => attr.clinicalAttributeId)
        );
    }

    // 4. Construct response with datatype and values
    const attributeDetails = requestedAttributes.map((attr) => ({
        attributeId: attr.clinicalAttributeId,
        displayName: attr.displayName,
        description: attr.description,
        datatype: attr.datatype,
        values: valuesMap.get(attr.clinicalAttributeId) || [],
    }));

    return createDataResponse(
        'Successfully retrieved clinical attribute values',
        {
            studyId,
            attributes: attributeDetails,
        }
    );
}
