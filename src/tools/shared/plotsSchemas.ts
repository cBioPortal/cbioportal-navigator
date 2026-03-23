/**
 * Zod schemas for plots tab URL parameters.
 *
 * Shared between StudyView and ResultsView, both of which use the same
 * PlotsTab component and identical URL parameter structure.
 *
 * Source references:
 * - PlotsSelectionParam: cbioportal-frontend/src/pages/studyView/StudyViewURLWrapper.ts
 * - PlotsColoringParam: cbioportal-frontend/src/pages/studyView/StudyViewURLWrapper.ts
 *
 * Note: These are URL parameters, so all values are strings (even numeric IDs).
 */

import { z } from 'zod';

/**
 * Schema for plots tab axis selection (horizontal/vertical)
 *
 * Used for plots_horz_selection and plots_vert_selection URL parameters.
 * selectedGeneOption accepts a Hugo gene symbol (e.g. "IDH1") or a numeric
 * Entrez ID string — callers should resolve symbols to Entrez IDs before
 * building the URL.
 */
export const plotsSelectionParamSchema = z.object({
    selectedGeneOption: z.string().optional(), // Hugo symbol or Entrez ID string
    selectedGenesetOption: z.string().optional(),
    selectedGenericAssayOption: z.string().optional(),
    dataType: z.string().optional(),
    selectedDataSourceOption: z.string().optional(),
    mutationCountBy: z.string().optional(),
    structuralVariantCountBy: z.string().optional(),
    logScale: z.union([z.literal('true'), z.literal('false')]).optional(),
});

/**
 * Schema for plots tab point coloring configuration
 *
 * Used for plots_coloring_selection URL parameter
 */
export const plotsColoringParamSchema = z.object({
    selectedOption: z.string().optional(),
    logScale: z.union([z.literal('true'), z.literal('false')]).optional(),
    colorByMutationType: z
        .union([z.literal('true'), z.literal('false')])
        .optional(),
    colorByCopyNumber: z
        .union([z.literal('true'), z.literal('false')])
        .optional(),
    colorBySv: z.union([z.literal('true'), z.literal('false')]).optional(),
});
