/**
 * Unified exports for StudyView schemas.
 *
 * This file exports all schemas used by StudyView, organized by category:
 * - URL parameter schemas (plots configuration)
 * - Filter API schemas (StudyViewFilter and related types)
 *
 * @packageDocumentation
 */

// URL Parameter Schemas
export {
    plotsSelectionParamSchema,
    plotsColoringParamSchema,
} from './urlParams.js';

// Filter API Schemas
export {
    // Core filter value types
    dataFilterValueSchema,
    sampleIdentifierSchema,
    patientIdentifierSchema,
    // Clinical filters
    clinicalDataFilterSchema,
    dataFilterSchema,
    // Gene filters
    geneFilterQuerySchema,
    geneFilterSchema,
    alterationFilterSchema,
    // Genomic data filters
    genomicDataFilterSchema,
    mutationDataFilterSchema,
    genericAssayDataFilterSchema,
    // Structural variant filters
    structuralVariantGeneSubQuerySchema,
    structuralVariantFilterQuerySchema,
    studyViewStructuralVariantFilterSchema,
    // Namespace data filters
    namespaceDataFilterSchema,
    // Treatment filters
    patientTreatmentFilterSchema,
    oredPatientTreatmentFiltersSchema,
    andedPatientTreatmentFiltersSchema,
    sampleTreatmentFilterSchema,
    oredSampleTreatmentFiltersSchema,
    andedSampleTreatmentFiltersSchema,
    // Main filter schema
    studyViewFilterSchema,
    // TypeScript types
    type StudyViewFilter,
    type ClinicalDataFilter,
    type GeneFilter,
    type GeneFilterQuery,
    type DataFilterValue,
} from './filters.js';
