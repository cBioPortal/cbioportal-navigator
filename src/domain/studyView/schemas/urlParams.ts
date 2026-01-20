/**
 * Zod schemas for StudyView URL parameters.
 *
 * These schemas are manually maintained based on type definitions from
 * cbioportal-frontend repository. They define the structure of URL parameters
 * specific to StudyView pages.
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
 * Used for plots_horz_selection and plots_vert_selection URL parameters
 */
export const plotsSelectionParamSchema = z.object({
    selectedGeneOption: z.string().optional(), // Gene entrez ID as string
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
