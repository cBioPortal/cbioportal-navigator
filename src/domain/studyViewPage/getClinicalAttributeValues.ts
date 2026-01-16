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

/**
 * Tool definition for MCP registration
 */
export const getClinicalAttributeValuesTool = {
    name: 'get_clinical_attribute_values',
    title: 'Get Clinical Attribute Values for Filtering',
    description: `Retrieve detailed information for clinical attributes to construct accurate filters.

WHAT THIS TOOL DOES:
Fetches datatype and valid option values for specific clinical attributes.
Use this AFTER reviewing clinicalAttributeIds from the router response to get
exact values needed for filterJson.clinicalDataFilters construction.

WHEN TO USE:
- User wants to filter by clinical attributes (age, gender, stage, etc.)
- You need to know valid values for categorical attributes
- You need to confirm datatype for proper filter construction

INPUT:
- studyId: The study identifier (from router response)
- attributeIds: Array of clinical attribute IDs to fetch options for
  Example: ["SEX", "TUMOR_GRADE", "AGE"]

OUTPUT:
Array of attribute details:
- attributeId: The attribute identifier
- displayName: Human-readable name
- description: Attribute description
- datatype: "STRING", "NUMBER", or "BOOLEAN"
- values: Array of valid values for all types
  - STRING types: Array of categorical values (e.g., ["Male", "Female"])
  - BOOLEAN types: Array of boolean values (e.g., ["true", "false"])
  - NUMBER types: Array of actual numeric values found in the data

WORKFLOW EXAMPLE:
1. Router returns: clinicalAttributeIds: ["AGE", "SEX", "TUMOR_GRADE", ...]
2. User asks: "Show me female patients with high tumor grade"
3. Call this tool: { studyId: "luad_tcga", attributeIds: ["SEX", "TUMOR_GRADE"] }
4. Get response: [
     { attributeId: "SEX", datatype: "STRING", values: ["Male", "Female"] },
     { attributeId: "TUMOR_GRADE", datatype: "STRING", values: ["G1", "G2", "G3", "G4", "GX"] }
   ]
5. Construct filter with exact values: "Female", "G3", "G4"

PERFORMANCE:
- Uses batch API call to fetch values for multiple attributes at once
- Fetches values for all attribute types when queried by ID
- Typical response time: 150-250ms for 3-5 attributes`,
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
