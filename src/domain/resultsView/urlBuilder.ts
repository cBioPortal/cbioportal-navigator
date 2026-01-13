/**
 * ResultsView (OncoPrint) page URL construction.
 *
 * This module builds URLs for cBioPortal ResultsView pages, which analyze
 * specific genes across samples with alteration visualizations, mutation
 * details, survival analysis, and expression correlations. It handles
 * complex URL construction with numerous optional parameters.
 *
 * @remarks
 * Key exports:
 * - `buildResultsUrl()`: Main function to construct ResultsView URLs
 * - `ResultsUrlOptions`: Interface for URL construction parameters
 *
 * URL structure:
 * /results[/tab]?cancer_study_list=...&gene_list=...&case_set_id=...&...
 *
 * Required parameters:
 * - studies: Array of study IDs
 * - genes: Array of gene symbols (space-separated in URL)
 * - caseSelection: Type ('all', 'case_set', 'custom'), IDs, or specific set
 *
 * Optional parameters (25+):
 * - Z-score thresholds for expression data
 * - OncoPrint sorting and clustering options
 * - Plots configuration (axis selection, coloring)
 * - Profile filters and display options
 *
 * @packageDocumentation
 */

import {
    buildCBioPortalPageUrl,
    QueryParams,
} from '../../infrastructure/utils/urlBuilder.js';

export interface ResultsUrlOptions {
    studies: string[];
    genes: string[];
    caseSelection: {
        type: 'all' | 'case_set' | 'custom';
        caseSetId?: string;
        caseIds?: string[];
    };
    tab?: string;
    options?: {
        zScoreThreshold?: number;
        rppaScoreThreshold?: number;
        profileFilter?: string;
        excludeGermlineMutations?: boolean;
        hideUnprofiledSamples?: boolean;
        // Oncoprint options
        sortBy?: Record<string, any>;
        clusterProfile?: string;
        sortByMutationType?: boolean;
        sortByDrivers?: boolean;
        // Plots options
        plotsHorzSelection?: Record<string, any>;
        plotsVertSelection?: Record<string, any>;
        plotsColoringSelection?: Record<string, any>;
        // Generic
        genericAssayGroups?: string;
        genesetList?: string;
        [key: string]: any;
    };
}

/**
 * Build a Results View URL
 */
export function buildResultsUrl(options: ResultsUrlOptions): string {
    const { studies, genes, caseSelection, tab, options: urlOptions } = options;

    const query: QueryParams = {
        cancer_study_list: studies.join(','),
        gene_list: genes.join(' '),
    };

    // Handle case selection
    if (caseSelection.type === 'case_set' && caseSelection.caseSetId) {
        query.case_set_id = caseSelection.caseSetId;
    } else if (caseSelection.type === 'custom' && caseSelection.caseIds) {
        query.case_ids = caseSelection.caseIds.join(',');
    }
    // For 'all', we typically use case_set_id with the "all" case set

    // Add optional parameters
    if (urlOptions) {
        if (urlOptions.zScoreThreshold !== undefined) {
            query.Z_SCORE_THRESHOLD = urlOptions.zScoreThreshold;
        }
        if (urlOptions.rppaScoreThreshold !== undefined) {
            query.RPPA_SCORE_THRESHOLD = urlOptions.rppaScoreThreshold;
        }
        if (urlOptions.profileFilter) {
            query.profileFilter = urlOptions.profileFilter;
        }
        if (urlOptions.excludeGermlineMutations !== undefined) {
            query.exclude_germline_mutations =
                urlOptions.excludeGermlineMutations;
        }
        if (urlOptions.hideUnprofiledSamples !== undefined) {
            query.hide_unprofiled_samples = urlOptions.hideUnprofiledSamples;
        }
        if (urlOptions.sortBy) {
            query.oncoprint_sortby = urlOptions.sortBy;
        }
        if (urlOptions.clusterProfile) {
            query.oncoprint_cluster_profile = urlOptions.clusterProfile;
        }
        if (urlOptions.sortByMutationType !== undefined) {
            query.oncoprint_sort_by_mutation_type =
                urlOptions.sortByMutationType;
        }
        if (urlOptions.sortByDrivers !== undefined) {
            query.oncoprint_sort_by_drivers = urlOptions.sortByDrivers;
        }
        if (urlOptions.plotsHorzSelection) {
            query.plots_horz_selection = urlOptions.plotsHorzSelection;
        }
        if (urlOptions.plotsVertSelection) {
            query.plots_vert_selection = urlOptions.plotsVertSelection;
        }
        if (urlOptions.plotsColoringSelection) {
            query.plots_coloring_selection = urlOptions.plotsColoringSelection;
        }
        if (urlOptions.genericAssayGroups) {
            query.generic_assay_groups = urlOptions.genericAssayGroups;
        }
        if (urlOptions.genesetList) {
            query.geneset_list = urlOptions.genesetList;
        }

        // Add any other custom options
        for (const [key, value] of Object.entries(urlOptions)) {
            if (
                value !== undefined &&
                !query.hasOwnProperty(key) &&
                ![
                    'zScoreThreshold',
                    'rppaScoreThreshold',
                    'profileFilter',
                    'excludeGermlineMutations',
                    'hideUnprofiledSamples',
                    'sortBy',
                    'clusterProfile',
                    'sortByMutationType',
                    'sortByDrivers',
                    'plotsHorzSelection',
                    'plotsVertSelection',
                    'plotsColoringSelection',
                    'genericAssayGroups',
                    'genesetList',
                ].includes(key)
            ) {
                query[key] = value;
            }
        }
    }

    // Build pathname with tab if specified
    const pathname = tab ? `/results/${tab}` : '/results';

    return buildCBioPortalPageUrl(pathname, query);
}
