/**
 * Input validation utilities for tool parameter verification.
 *
 * This module provides reusable validation functions for common parameter
 * patterns across navigation tools, ensuring consistent error messages and
 * validation logic. Used by tool handlers before processing requests.
 *
 * @remarks
 * Key exports:
 * - `validateStudyIdentification()`: Ensures either studyId or studyKeywords provided
 * - `requireEitherOr()`: Validates at least one of two parameters exists
 *
 * Validation pattern:
 * All validators return an object with `valid: boolean` and optional `error: string`.
 * This allows tool handlers to check validation results and return appropriate
 * error responses when validation fails.
 *
 * @packageDocumentation
 */

import type { StudyIdentificationParams } from './types.js';

/**
 * Validate that either studyKeywords or studyId is provided
 */
export function validateStudyIdentification(
    params: StudyIdentificationParams
): { valid: boolean; error?: string } {
    if (
        !params.studyId &&
        (!params.studyKeywords || params.studyKeywords.length === 0)
    ) {
        return {
            valid: false,
            error: 'Either studyId or studyKeywords must be provided',
        };
    }
    return { valid: true };
}

/**
 * Validate that at least one of the required parameters is provided
 */
export function requireEitherOr(
    params: Record<string, any>,
    param1: string,
    param2: string
): { valid: boolean; error?: string } {
    if (!params[param1] && !params[param2]) {
        return {
            valid: false,
            error: `Either ${param1} or ${param2} must be provided`,
        };
    }
    return { valid: true };
}
