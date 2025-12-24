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
    NavigationResponse,
    DataResponse,
    ErrorResponse,
} from './types.js';

/**
 * Create a navigation response (for tools that return URLs)
 */
export function createNavigationResponse(
    url: string,
    data?: Record<string, any>
): NavigationResponse {
    return {
        success: true,
        message: `Navigating to ${url}`,
        url,
        data: data || {},
    };
}

/**
 * Create a data response (for tools that return data without URLs)
 */
export function createDataResponse(
    message: string,
    data: Record<string, any>
): DataResponse {
    return {
        success: true,
        message,
        data,
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

/**
 * Legacy function for backward compatibility
 * @deprecated Use createNavigationResponse instead
 */
export function createSuccessResponse(
    url: string,
    metadata: Record<string, any>
): NavigationResponse {
    return createNavigationResponse(url, metadata);
}
