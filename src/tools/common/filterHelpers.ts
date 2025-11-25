/**
 * Filter transformation helpers for cBioPortal Navigator
 *
 * IMPORTANT: These helpers exist to work around cBioPortal frontend limitations.
 * The frontend requires ALL GeneFilterQuery fields to be present, even though
 * they have sensible defaults. Without complete objects, the frontend throws:
 * "Cannot read properties of undefined (reading 'length')"
 *
 * Frontend Error Locations:
 * - Type: cbioportal-frontend/packages/cbioportal-ts-api-client/src/generated/CBioPortalAPIInternal.ts
 * - Loading: cbioportal-frontend/src/pages/studyView/StudyViewPageStore.ts:2326
 * - Trigger: cbioportal-frontend/src/pages/studyView/StudyViewUtils.tsx:983
 *
 * Future: If frontend types become optional, this workaround could be simplified or removed.
 */

import type { GeneFilterQuery, GeneFilter } from 'cbioportal-ts-api-client';

/**
 * Default values for GeneFilterQuery fields.
 * These represent the most permissive filtering (include everything).
 */
const DEFAULT_GENE_FILTER_QUERY: Omit<GeneFilterQuery, 'hugoGeneSymbol'> = {
    entrezGeneId: 0, // 0 = resolve from hugoGeneSymbol
    alterations: [], // Empty = all CNA types
    includeDriver: true, // Include driver mutations
    includeVUS: true, // Include variants of unknown significance
    includeUnknownOncogenicity: true, // Include unknown oncogenicity
    tiersBooleanMap: {}, // Empty = no tier filtering
    includeUnknownTier: true, // Include unknown tier
    includeGermline: true, // Include germline mutations
    includeSomatic: true, // Include somatic mutations
    includeUnknownStatus: true, // Include unknown germline/somatic status
};

/**
 * Build a complete GeneFilterQuery with all required defaults.
 *
 * @param input - Partial GeneFilterQuery with at least hugoGeneSymbol
 * @returns Complete GeneFilterQuery with all required fields
 * @throws Error if hugoGeneSymbol is missing
 *
 * @example
 * // Minimal usage
 * const query = buildCompleteGeneFilterQuery({ hugoGeneSymbol: 'TP53' });
 *
 * @example
 * // Override defaults
 * const query = buildCompleteGeneFilterQuery({
 *   hugoGeneSymbol: 'KRAS',
 *   includeDriver: false,
 *   alterations: ['AMP', 'GAIN']
 * });
 */
export function buildCompleteGeneFilterQuery(
    input: Partial<GeneFilterQuery> & Pick<GeneFilterQuery, 'hugoGeneSymbol'>
): GeneFilterQuery {
    if (!input.hugoGeneSymbol) {
        throw new Error(
            'hugoGeneSymbol is required for GeneFilterQuery. ' +
                'This is the gene symbol to filter by (e.g., "TP53", "KRAS").'
        );
    }

    return {
        ...DEFAULT_GENE_FILTER_QUERY,
        ...input,
    };
}

/**
 * Build a complete GeneFilter with all required defaults for geneQueries.
 *
 * @param molecularProfileIds - Array of molecular profile IDs
 * @param geneQueries - Nested array of partial GeneFilterQuery objects
 * @returns Complete GeneFilter with all defaults applied
 *
 * @example
 * // Single gene
 * const filter = buildGeneFilter(
 *   ['luad_tcga_mutations'],
 *   [[{ hugoGeneSymbol: 'TP53' }]]
 * );
 *
 * @example
 * // Multiple genes with OR logic
 * const filter = buildGeneFilter(
 *   ['luad_tcga_mutations'],
 *   [[{ hugoGeneSymbol: 'TP53' }, { hugoGeneSymbol: 'KRAS' }]]
 * );
 */
export function buildGeneFilter(
    molecularProfileIds: string[],
    geneQueries: Array<
        Array<
            Partial<GeneFilterQuery> & Pick<GeneFilterQuery, 'hugoGeneSymbol'>
        >
    >
): GeneFilter {
    return {
        molecularProfileIds,
        geneQueries: geneQueries.map((orGroup) =>
            orGroup.map((query) => buildCompleteGeneFilterQuery(query))
        ),
    };
}
