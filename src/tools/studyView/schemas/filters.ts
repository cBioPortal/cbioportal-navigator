/**
 * Zod schemas for StudyView Filter API.
 *
 * These schemas are manually maintained for the StudyViewFilter object and its
 * nested types. They define the structure of filter parameters sent to the
 * cBioPortal API.
 *
 * IMPORTANT: These schemas are NOT auto-generated because the TypeScript type
 * definitions in cbioportal-ts-api-client have known issues (e.g., DataFilterValue
 * fields should be optional and mutually exclusive, but are defined as required).
 *
 * Maintenance:
 * - When cBioPortal API changes, update these schemas manually
 * - Refer to cbioportal backend Java classes for ground truth
 * - Test with actual API calls to ensure correctness
 *
 * Source references:
 * - Backend: cbioportal/src/main/java/org/cbioportal/legacy/web/parameter/
 * - Frontend: cbioportal-frontend/src/pages/studyView/StudyViewPageStore.ts
 *
 * @packageDocumentation
 */

import { z } from 'zod';

// ============================================================================
// Core Filter Value Types
// ============================================================================

/**
 * DataFilterValue - Corrected schema for filter values.
 *
 * BACKEND VALIDATION: eitherValueOrRangePresentInClinicalDataIntervalFilters
 *
 * This type is used for filtering both categorical and numerical data:
 * - Categorical: { value: "Female" }
 * - Numerical range: { start: 50, end: 70 }
 * - Open-ended: { start: 10 } or { end: 100 }
 *
 * IMPORTANT: Must have EITHER value OR start/end, NOT both.
 *
 * Backend source: DataFilterValue.java
 * ```java
 * private BigDecimal start;  // optional
 * private BigDecimal end;    // optional
 * private String value;      // optional
 * ```
 */
export const dataFilterValueSchema = z.union([
    // Categorical filter: only value field
    z.object({
        value: z.string(),
    }),
    // Numerical filter: start and/or end
    z
        .object({
            start: z.number().optional(),
            end: z.number().optional(),
        })
        .refine((data) => data.start !== undefined || data.end !== undefined, {
            message: 'Numerical filter must have at least start or end',
        }),
]);

// ============================================================================
// Sample and Patient Identifiers
// ============================================================================

export const sampleIdentifierSchema = z.object({
    sampleId: z.string(),
    studyId: z.string(),
});

export const patientIdentifierSchema = z.object({
    patientId: z.string(),
    studyId: z.string(),
});

// ============================================================================
// Clinical Data Filters
// ============================================================================

export const clinicalDataFilterSchema = z.object({
    attributeId: z.string(),
    values: z.array(dataFilterValueSchema),
});

export const dataFilterSchema = z.object({
    values: z.array(dataFilterValueSchema),
});

// ============================================================================
// Gene Filters
// ============================================================================

export const geneFilterQuerySchema = z.object({
    alterations: z
        .array(
            z.union([
                z.literal('AMP'),
                z.literal('GAIN'),
                z.literal('DIPLOID'),
                z.literal('HETLOSS'),
                z.literal('HOMDEL'),
            ])
        )
        .optional(),
    entrezGeneId: z.number().optional(),
    hugoGeneSymbol: z.string().optional(),
    includeDriver: z.boolean().optional(),
    includeGermline: z.boolean().optional(),
    includeSomatic: z.boolean().optional(),
    includeUnknownOncogenicity: z.boolean().optional(),
    includeUnknownStatus: z.boolean().optional(),
    includeUnknownTier: z.boolean().optional(),
    includeVUS: z.boolean().optional(),
    tiersBooleanMap: z.record(z.string(), z.boolean()).optional(),
});

export const geneFilterSchema = z.object({
    geneQueries: z.array(z.array(geneFilterQuerySchema)),
    molecularProfileIds: z.array(z.string()),
});

export const alterationFilterSchema = z.object({
    copyNumberAlterationEventTypes: z
        .record(z.string(), z.boolean())
        .optional(),
    includeDriver: z.boolean().optional(),
    includeGermline: z.boolean().optional(),
    includeSomatic: z.boolean().optional(),
    includeUnknownOncogenicity: z.boolean().optional(),
    includeUnknownStatus: z.boolean().optional(),
    includeUnknownTier: z.boolean().optional(),
    includeVUS: z.boolean().optional(),
    mutationEventTypes: z.record(z.string(), z.boolean()).optional(),
    structuralVariants: z.boolean().optional(),
    tiersBooleanMap: z.record(z.string(), z.boolean()).optional(),
});

// ============================================================================
// Genomic Data Filters
// ============================================================================

export const genomicDataFilterSchema = z.object({
    hugoGeneSymbol: z.string(),
    profileType: z.string(),
    values: z.array(dataFilterValueSchema),
});

export const mutationDataFilterSchema = z.object({
    categorization: z.union([z.literal('MUTATED'), z.literal('MUTATION_TYPE')]),
    hugoGeneSymbol: z.string(),
    profileType: z.string(),
    values: z.array(z.array(dataFilterValueSchema)),
});

export const genericAssayDataFilterSchema = z.object({
    profileType: z.string(),
    stableId: z.string(),
    values: z.array(dataFilterValueSchema),
});

// ============================================================================
// Structural Variant Filters
// ============================================================================

export const structuralVariantGeneSubQuerySchema = z.object({
    entrezId: z.number().optional(),
    hugoSymbol: z.string().optional(),
    specialValue: z
        .union([z.literal('ANY_GENE'), z.literal('NO_GENE')])
        .optional(),
});

export const structuralVariantFilterQuerySchema = z.object({
    gene1Query: structuralVariantGeneSubQuerySchema.optional(),
    gene2Query: structuralVariantGeneSubQuerySchema.optional(),
    includeDriver: z.boolean().optional(),
    includeGermline: z.boolean().optional(),
    includeSomatic: z.boolean().optional(),
    includeUnknownOncogenicity: z.boolean().optional(),
    includeUnknownStatus: z.boolean().optional(),
    includeUnknownTier: z.boolean().optional(),
    includeVUS: z.boolean().optional(),
    tiersBooleanMap: z.record(z.string(), z.boolean()).optional(),
});

export const studyViewStructuralVariantFilterSchema = z.object({
    molecularProfileIds: z.array(z.string()).optional(),
    structVarQueries: z
        .array(z.array(structuralVariantFilterQuerySchema))
        .optional(),
});

// ============================================================================
// Namespace Data Filters
// ============================================================================

export const namespaceDataFilterSchema = z.object({
    outerKey: z.string(),
    innerKey: z.string(),
    values: z.array(z.array(dataFilterValueSchema)),
});

// ============================================================================
// Treatment Filters
// ============================================================================

export const patientTreatmentFilterSchema = z.object({
    treatment: z.string(),
});

export const oredPatientTreatmentFiltersSchema = z.object({
    filters: z.array(patientTreatmentFilterSchema),
});

export const andedPatientTreatmentFiltersSchema = z.object({
    filters: z.array(oredPatientTreatmentFiltersSchema),
});

export const sampleTreatmentFilterSchema = z.object({
    time: z.union([z.literal('Pre'), z.literal('Post')]),
    treatment: z.string(),
});

export const oredSampleTreatmentFiltersSchema = z.object({
    filters: z.array(sampleTreatmentFilterSchema),
});

export const andedSampleTreatmentFiltersSchema = z.object({
    filters: z.array(oredSampleTreatmentFiltersSchema),
});

// ============================================================================
// Main StudyViewFilter Schema
// ============================================================================

/**
 * StudyViewFilter - Main filter object for StudyView API requests.
 *
 * All fields are optional. Filters are combined with AND logic.
 *
 * Usage examples:
 * ```typescript
 * // Clinical filter only
 * { clinicalDataFilters: [{ attributeId: "AGE", values: [{ start: 50, end: 70 }] }] }
 *
 * // Gene filter only
 * { geneFilters: [{ molecularProfileIds: ["study_mutations"], geneQueries: [[{ hugoGeneSymbol: "TP53" }]] }] }
 *
 * // Combined filters (AND logic)
 * {
 *   clinicalDataFilters: [{ attributeId: "SEX", values: [{ value: "Female" }] }],
 *   geneFilters: [{ molecularProfileIds: ["study_mutations"], geneQueries: [[{ hugoGeneSymbol: "TP53" }]] }]
 * }
 * ```
 */
export const studyViewFilterSchema = z.object({
    alterationFilter: alterationFilterSchema.optional(),
    caseLists: z.array(z.array(z.string())).optional(),
    clinicalDataFilters: z.array(clinicalDataFilterSchema).optional(),
    clinicalEventFilters: z.array(dataFilterSchema).optional(),
    customDataFilters: z.array(clinicalDataFilterSchema).optional(),
    geneFilters: z.array(geneFilterSchema).optional(),
    genericAssayDataFilters: z.array(genericAssayDataFilterSchema).optional(),
    genomicDataFilters: z.array(genomicDataFilterSchema).optional(),
    genomicProfiles: z.array(z.array(z.string())).optional(),
    mutationDataFilters: z.array(mutationDataFilterSchema).optional(),
    namespaceDataFilters: z.array(namespaceDataFilterSchema).optional(),
    patientTreatmentFilters: andedPatientTreatmentFiltersSchema.optional(),
    patientTreatmentGroupFilters: andedPatientTreatmentFiltersSchema.optional(),
    patientTreatmentTargetFilters:
        andedPatientTreatmentFiltersSchema.optional(),
    sampleIdentifiers: z.array(sampleIdentifierSchema).optional(),
    sampleTreatmentFilters: andedSampleTreatmentFiltersSchema.optional(),
    sampleTreatmentGroupFilters: andedSampleTreatmentFiltersSchema.optional(),
    sampleTreatmentTargetFilters: andedSampleTreatmentFiltersSchema.optional(),
    structuralVariantFilters: z
        .array(studyViewStructuralVariantFilterSchema)
        .optional(),
    studyIds: z.array(z.string()).optional(),
});

// Export inferred types for TypeScript usage
export type StudyViewFilter = z.infer<typeof studyViewFilterSchema>;
export type ClinicalDataFilter = z.infer<typeof clinicalDataFilterSchema>;
export type GeneFilter = z.infer<typeof geneFilterSchema>;
export type GeneFilterQuery = z.infer<typeof geneFilterQuerySchema>;
export type DataFilterValue = z.infer<typeof dataFilterValueSchema>;
