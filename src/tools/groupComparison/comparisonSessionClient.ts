/**
 * Client for creating and managing comparison sessions.
 *
 * This module provides an HTTP client for interacting with cBioPortal's
 * session service to create and retrieve group comparison sessions.
 *
 * Based on: cbioportal-frontend/src/shared/api/session-service/ComparisonGroupClient.ts
 *
 * @packageDocumentation
 */

import { SessionGroupData } from './groupBuilder.js';

/**
 * Comparison session data structure
 */
export interface ComparisonSession {
    groups: SessionGroupData[];
    origin: string[];
    clinicalAttributeName?: string;
    groupNameOrder?: string[];
}

/**
 * Response from session creation
 */
export interface ComparisonSessionResponse {
    id: string;
}

/**
 * Client for comparison session operations
 */
export class ComparisonSessionClient {
    constructor(private baseUrl: string) {}

    /**
     * Create a comparison session on the backend.
     *
     * Posts session data to the session service and returns a session ID
     * that can be used to construct comparison page URLs.
     *
     * Based on: ComparisonGroupClient.ts:60-72 (addComparisonSession)
     *
     * @param session - Session data with groups and metadata
     * @returns Session ID for URL construction
     * @throws Error if session creation fails
     *
     * @example
     * ```typescript
     * const client = new ComparisonSessionClient('https://www.cbioportal.org');
     * const { id } = await client.createSession({
     *   groups: [...],
     *   origin: ['luad_tcga'],
     *   clinicalAttributeName: 'Sex'
     * });
     * ```
     */
    async createSession(
        session: ComparisonSession
    ): Promise<ComparisonSessionResponse> {
        const url = `${this.baseUrl}/api/session/comparison_session`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(session),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Failed to create comparison session (${response.status}): ${errorText}`
            );
        }

        return (await response.json()) as ComparisonSessionResponse;
    }

    /**
     * Retrieve a comparison session by ID.
     *
     * @param id - Session ID
     * @returns Complete session data
     * @throws Error if session retrieval fails
     */
    async getSession(id: string): Promise<ComparisonSession & { id: string }> {
        const url = `${this.baseUrl}/api/session/comparison_session/${id}`;

        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Failed to retrieve comparison session (${response.status}): ${errorText}`
            );
        }

        const result = (await response.json()) as {
            id: string;
            data: ComparisonSession;
        };
        return { ...result.data, id: result.id };
    }
}
