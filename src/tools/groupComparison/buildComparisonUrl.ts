/**
 * URL builder for Group Comparison pages.
 *
 * This module provides functions to construct URLs for group comparison pages
 * with session IDs and optional tab/filter parameters.
 *
 * Based on: cbioportal-frontend/src/shared/api/urls.ts:297-299 (redirectToComparisonPage)
 *
 * @packageDocumentation
 */

import {
    buildCBioPortalPageUrl,
    QueryParams,
} from '../shared/cbioportalUrlBuilder.js';

/**
 * Available tabs in the comparison page.
 * Mirrors GroupComparisonTab enum in cbioportal-frontend.
 * generic_assay_* tabs are dynamic (one per genericAssayType, lowercase).
 */
export type ComparisonTab =
    | 'overlap'
    | 'survival'
    | 'clinical'
    | 'alterations'
    | 'mutations'
    | 'mrna'
    | 'protein'
    | 'dna_methylation'
    | `generic_assay_${string}`;

/**
 * Build comparison page URL from session ID.
 *
 * @param sessionId - Comparison session ID from backend
 * @param tab - Optional tab to navigate to (default: overview)
 * @returns Full cBioPortal comparison URL
 *
 * @example
 * ```typescript
 * // Basic comparison URL
 * buildComparisonUrl('abc123')
 * // => "https://www.cbioportal.org/comparison?comparisonId=abc123"
 *
 * // With specific tab
 * buildComparisonUrl('abc123', 'survival')
 * // => "https://www.cbioportal.org/comparison/survival?comparisonId=abc123"
 * ```
 */
export function buildComparisonUrl(
    sessionId: string,
    tab?: ComparisonTab
): string {
    const query: QueryParams = {
        comparisonId: sessionId,
    };

    // Tab is part of pathname, not query param
    const pathname = tab ? `/comparison/${tab}` : '/comparison';

    return buildCBioPortalPageUrl({
        pathname,
        query,
    });
}
