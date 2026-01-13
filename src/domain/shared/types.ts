/**
 * TypeScript type definitions for MCP tools and responses.
 *
 * This module defines all shared types used across the navigation tools,
 * including parameter interfaces for different page types, response formats,
 * and specialized configuration objects for plots and filters. It re-exports
 * types from the cBioPortal API client for convenience.
 *
 * @remarks
 * Key type categories:
 * - Parameter types: StudyViewParams, PatientViewParams, ResultsViewParams
 * - Response types: SuccessResponse, AmbiguityResponse, ErrorResponse, ToolResponse
 * - Configuration types: PlotsSelectionParam, PlotsColoringParam
 * - Base types: StudyIdentificationParams
 *
 * Re-exported from cbioportal-ts-api-client:
 * - StudyViewFilter: Comprehensive filter object for study views
 * - GeneFilterQuery, GeneFilter: Gene filtering structures
 *
 * All tool handlers use ToolResponse as their return type, which is a union
 * of success, ambiguity, and error responses.
 *
 * @packageDocumentation
 */

import type {
    StudyViewFilter,
    GeneFilterQuery,
    GeneFilter,
} from 'cbioportal-ts-api-client';

// Re-export for convenience
export type { GeneFilterQuery, GeneFilter };

/**
 * Base parameters for study identification
 */
export interface StudyIdentificationParams {
    studyKeywords?: string[];
    studyId?: string;
}

/**
 * Configuration for scatter plot horizontal/vertical axis selection
 */
export interface PlotsSelectionParam {
    selectedGeneOption?: number; // Entrez gene ID
    selectedGenesetOption?: string; // Geneset identifier
    selectedGenericAssayOption?: string; // Generic assay identifier
    dataType?: string; // Molecular profile type or 'clinical_attribute'
    selectedDataSourceOption?: string; // Clinical attribute or data source ID
    mutationCountBy?: string; // 'MutationType' or 'MutatedVsWildType'
    structuralVariantCountBy?: string; // 'VariantType' or 'MutatedVsWildType'
    logScale?: 'true' | 'false'; // Boolean as string in URL
    [key: string]: any; // Allow additional fields for extensibility
}

/**
 * Configuration for scatter plot point coloring
 */
export interface PlotsColoringParam {
    selectedOption?: string; // Coloring attribute identifier
    logScale?: 'true' | 'false'; // Boolean as string in URL
    colorByMutationType?: 'true' | 'false'; // Boolean as string
    colorByCopyNumber?: 'true' | 'false'; // Boolean as string
    colorBySv?: 'true' | 'false'; // Boolean as string for structural variants
    [key: string]: any; // Allow additional fields for extensibility
}

/**
 * Parameters for StudyView navigation
 */
export interface StudyViewParams extends StudyIdentificationParams {
    tab?: string;

    // Comprehensive filter object (placed in URL hash)
    filterJson?: StudyViewFilter;

    // Legacy single-attribute filtering (query params)
    filterAttributeId?: string;
    filterValues?: string; // "value1,value2" or "10-20,30-40" for ranges

    // Plots tab configuration (query params)
    plotsHorzSelection?: PlotsSelectionParam;
    plotsVertSelection?: PlotsSelectionParam;
    plotsColoringSelection?: PlotsColoringParam;
}

/**
 * Parameters for PatientView navigation
 */
export interface PatientViewParams {
    studyId: string;
    patientId?: string;
    sampleId?: string;
    tab?: string;
    navIds?: string[];
}

/**
 * Parameters for ResultsView navigation
 */
export interface ResultsViewParams extends StudyIdentificationParams {
    genes: string[];
    alterations?: string[];
    caseSetId?: string;
    tab?: string;
    zScoreThreshold?: number;
    rppaScoreThreshold?: number;
}

/**
 * Success response format
 */
export interface SuccessResponse {
    success: true;
    url: string;
    metadata: Record<string, any>;
}

/**
 * Ambiguity response format (when multiple options need user selection)
 */
export interface AmbiguityResponse {
    success: false;
    needsSelection: true;
    message: string;
    options: Array<{
        studyId: string;
        name: string;
        description?: string;
        sampleCount?: number;
    }>;
}

/**
 * Error response format
 */
export interface ErrorResponse {
    success: false;
    error: string;
    details?: any;
}

/**
 * Union type for all tool responses
 */
export type ToolResponse = SuccessResponse | AmbiguityResponse | ErrorResponse;
