/**
 * Core URL construction utilities for cBioPortal pages.
 *
 * This module provides the foundational URL building logic used by all
 * page-specific URL builders. It handles query parameter serialization,
 * hash parameter construction, and complete URL assembly with proper
 * protocol and host handling.
 *
 * @remarks
 * Key exports:
 * - `buildCBioPortalPageUrl()`: Main function to construct complete URLs
 * - `serializeQueryParams()`: Convert parameter objects to query strings
 * - `QueryParams`: Type for query parameter objects
 * - `BuildUrlParams`: Type for URL construction parameters
 *
 * URL structure:
 * URLs are built as: {protocol}//{host}{pathname}?{query}#{hash}
 * - Arrays are comma-separated in query strings
 * - Objects are JSON-stringified in query/hash parameters
 * - Hash parameters support structured data (e.g., filterJson)
 *
 * Protocol handling:
 * The function strips any protocol prefixes from the base URL to avoid
 * duplication (e.g., https://https://...) when combining with configured protocol.
 *
 * @packageDocumentation
 */

import { getConfig, trimTrailingSlash, removeProtocol } from './config.js';

export interface QueryParams {
    [key: string]:
        | string
        | string[]
        | number
        | boolean
        | undefined
        | null
        | any;
}

export interface BuildUrlParams {
    pathname?: string;
    query?: QueryParams;
    hash?: string; // Simple hash string
    hashParams?: Record<string, any>; // Structured hash parameters (e.g., filterJson)
}

/**
 * Serialize query parameters to URL query string
 */
export function serializeQueryParams(params: QueryParams): string {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) {
            continue;
        }

        if (Array.isArray(value)) {
            // Arrays are joined with commas for cBioPortal
            searchParams.append(key, value.join(','));
        } else if (typeof value === 'object') {
            // Objects are JSON stringified
            searchParams.append(key, JSON.stringify(value));
        } else {
            searchParams.append(key, String(value));
        }
    }

    return searchParams.toString();
}

/**
 * Build a complete cBioPortal page URL
 */
export function buildCBioPortalPageUrl(params: BuildUrlParams): string;
export function buildCBioPortalPageUrl(
    pathname: string,
    query?: QueryParams,
    hash?: string
): string;
export function buildCBioPortalPageUrl(
    pathnameOrParams: string | BuildUrlParams,
    query?: QueryParams,
    hash?: string
): string {
    const params: BuildUrlParams =
        typeof pathnameOrParams === 'string'
            ? { pathname: pathnameOrParams, query, hash }
            : pathnameOrParams;

    const config = getConfig();
    const protocol = config.protocol;
    // Remove any protocol prefix from baseUrl to avoid duplication (e.g., https://https://...)
    const host = trimTrailingSlash(removeProtocol(config.baseUrl));

    let url = `${protocol}//${host}`;

    if (params.pathname) {
        const pathname = params.pathname.startsWith('/')
            ? params.pathname
            : '/' + params.pathname;
        url += pathname;
    }

    if (params.query) {
        const queryString = serializeQueryParams(params.query);
        if (queryString) {
            url += '?' + queryString;
        }
    }

    // Handle structured hash parameters (e.g., filterJson)
    // Matches cbioportal-frontend StudyViewPage.tsx:405-410
    if (params.hashParams) {
        const hashPairs = Object.entries(params.hashParams)
            .filter(([_, v]) => v !== undefined && v !== null)
            .map(([k, v]) => {
                // JSON.stringify for objects, no encodeURIComponent needed
                // Browser handles URL encoding automatically for hash fragments
                const value =
                    typeof v === 'object' ? JSON.stringify(v) : String(v);
                return `${k}=${value}`;
            });
        if (hashPairs.length > 0) {
            url += '#' + hashPairs.join('&');
        }
    } else if (params.hash) {
        // Legacy simple hash string
        const hash = params.hash.startsWith('#')
            ? params.hash
            : '#' + params.hash;
        url += hash;
    }

    return url;
}
