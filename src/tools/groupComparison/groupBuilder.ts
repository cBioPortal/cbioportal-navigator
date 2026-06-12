/**
 * Utilities for building comparison groups from sample identifiers.
 *
 * This module provides functions to:
 * - Convert sample identifiers to session group data format
 *
 * Based on cbioportal-frontend:
 * - ComparisonGroupManagerUtils.ts: getStudiesAttr, getGroupParameters
 */

import _ from 'lodash';

/**
 * Sample identifier with studyId and sampleId
 */
export interface SampleIdentifier {
    studyId: string;
    sampleId: string;
}

/**
 * Group data structure for comparison session
 */
export interface SessionGroupData {
    name: string;
    description: string;
    studies: {
        id: string;
        samples: string[];
    }[];
    origin: string[];
}

/**
 * Sample with study and patient information
 */
export interface Sample {
    studyId: string;
    sampleId: string;
    patientId: string;
    uniqueSampleKey?: string;
    uniquePatientKey?: string;
}

/**
 * Convert SampleIdentifier[] to studies format required by SessionGroupData.
 * Groups samples by studyId and extracts unique sampleIds.
 *
 * Based on: cbioportal-frontend/src/pages/groupComparison/comparisonGroupManager/ComparisonGroupManagerUtils.ts:27-48
 *
 * @param sampleIdentifiers - Array of sample identifiers
 * @returns Array of studies with their sample lists
 */
export function getStudiesAttr(
    sampleIdentifiers: SampleIdentifier[]
): { id: string; samples: string[] }[] {
    const samplesByStudy = _.groupBy(sampleIdentifiers, (id) => id.studyId);
    const studyIds = Object.keys(samplesByStudy);

    return studyIds.map((studyId) => ({
        id: studyId,
        samples: _.uniq(samplesByStudy[studyId].map((s) => s.sampleId)),
    }));
}

/**
 * Create a single group's data structure.
 *
 * Based on: cbioportal-frontend/src/pages/groupComparison/comparisonGroupManager/ComparisonGroupManagerUtils.ts:50-63
 *
 * @param name - Group name (e.g., "Male", "Female", "T1", "T2")
 * @param sampleIdentifiers - Samples in this group
 * @param origin - Study IDs this comparison originates from
 * @returns SessionGroupData object
 */
export function createGroup(
    name: string,
    sampleIdentifiers: SampleIdentifier[],
    origin: string[]
): SessionGroupData {
    return {
        name,
        description: '',
        studies: getStudiesAttr(sampleIdentifiers),
        origin,
    };
}
