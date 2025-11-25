/**
 * Shared types for cBioPortal Navigator tools
 */

/**
 * Base parameters for study identification
 */
export interface StudyIdentificationParams {
    studyKeywords?: string[];
    studyId?: string;
}

/**
 * Parameters for StudyView navigation
 */
export interface StudyViewParams extends StudyIdentificationParams {
    tab?: string;
    filters?: Record<string, any>;
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
