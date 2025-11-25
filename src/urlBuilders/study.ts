/**
 * Study View URL builders
 */

import { buildCBioPortalPageUrl, QueryParams, BuildUrlParams } from './core.js';

export interface StudyUrlOptions {
    studyIds: string | string[];
    tab?: string;

    // Comprehensive filter (goes in hash)
    filterJson?: Record<string, any>; // StudyViewFilter type

    // Legacy single-attribute filtering (goes in query)
    filterAttributeId?: string;
    filterValues?: string;

    // Plots configuration (goes in query)
    plotsHorzSelection?: Record<string, any>;
    plotsVertSelection?: Record<string, any>;
    plotsColoringSelection?: Record<string, any>;
}

/**
 * Build a Study View URL
 */
export function buildStudyUrl(options: StudyUrlOptions): string {
    const {
        studyIds,
        tab,
        filterJson,
        filterAttributeId,
        filterValues,
        plotsHorzSelection,
        plotsVertSelection,
        plotsColoringSelection,
    } = options;

    const studyIdArray = Array.isArray(studyIds) ? studyIds : [studyIds];
    const query: QueryParams = {
        id: studyIdArray.join(','),
    };

    // Add legacy filter parameters to query string
    if (filterAttributeId) {
        query.filterAttributeId = filterAttributeId;
    }
    if (filterValues) {
        query.filterValues = filterValues;
    }

    // Add plots parameters to query string
    // serializeQueryParams will handle JSON.stringify for objects
    if (plotsHorzSelection) {
        query.plots_horz_selection = plotsHorzSelection;
    }
    if (plotsVertSelection) {
        query.plots_vert_selection = plotsVertSelection;
    }
    if (plotsColoringSelection) {
        query.plots_coloring_selection = plotsColoringSelection;
    }

    // Build pathname with tab if specified
    const pathname = tab ? `/study/${tab}` : '/study';

    // Build URL with filterJson in hash if provided
    const buildParams: BuildUrlParams = {
        pathname,
        query,
    };

    if (filterJson) {
        buildParams.hashParams = { filterJson };
    }

    return buildCBioPortalPageUrl(buildParams);
}

/**
 * Get Study Summary URL (convenience function)
 */
export function getStudySummaryUrl(studyIds: string | string[]): string {
    return buildStudyUrl({ studyIds });
}
