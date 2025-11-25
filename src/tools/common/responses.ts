/**
 * Response formatting utilities for tools
 */

import type {
    SuccessResponse,
    AmbiguityResponse,
    ErrorResponse,
} from './types.js';

/**
 * Create a success response
 */
export function createSuccessResponse(
    url: string,
    metadata: Record<string, any>
): SuccessResponse {
    return {
        success: true,
        url,
        metadata,
    };
}

/**
 * Create an ambiguity response (multiple matches found)
 */
export function createAmbiguityResponse(
    message: string,
    options: Array<{
        studyId: string;
        name: string;
        description?: string;
        sampleCount?: number;
    }>
): AmbiguityResponse {
    return {
        success: false,
        needsSelection: true,
        message,
        options,
    };
}

/**
 * Create an error response
 */
export function createErrorResponse(
    error: string,
    details?: any
): ErrorResponse {
    return {
        success: false,
        error,
        details,
    };
}
