/**
 * Response builder utilities for consistent tool output formatting.
 *
 * This module provides factory functions to create standardized response
 * objects for MCP tool handlers. All tools return one of three response
 * types: success (with URL and metadata), ambiguity (multiple matches
 * requiring user selection), or error (with details).
 *
 * @remarks
 * Key exports:
 * - `createSuccessResponse()`: Success response with URL and metadata
 * - `createAmbiguityResponse()`: Response for multiple matches (e.g., study search)
 * - `createErrorResponse()`: Error response with message and optional details
 *
 * Response structure:
 * All responses include a `success` boolean. Success responses include `url`
 * and `metadata` fields. Ambiguity responses include `needsSelection: true`,
 * a message, and an array of options. Error responses include an `error`
 * message and optional `details` object.
 *
 * This standardization ensures consistent error handling and response parsing
 * across all navigation tools.
 *
 * @packageDocumentation
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
