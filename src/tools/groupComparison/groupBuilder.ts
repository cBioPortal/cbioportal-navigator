/**
 * Utilities for building comparison groups from samples and clinical data.
 *
 * This module provides functions to:
 * - Group samples by clinical attribute values
 * - Convert sample identifiers to session group data format
 * - Handle NA values (samples without the clinical attribute)
 *
 * Based on cbioportal-frontend:
 * - ComparisonGroupManagerUtils.ts: getStudiesAttr, getGroupParameters
 * - StudyViewPageStore.ts: createCategoricalAttributeComparisonSession (line 1944-1983)
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
 * Clinical data item with value
 */
export interface ClinicalDataItem {
    studyId: string;
    sampleId?: string;
    patientId?: string;
    entityId?: string;
    value: string;
    uniqueSampleKey?: string;
    uniquePatientKey?: string;
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

/**
 * Group samples by clinical attribute values.
 *
 * Handles both patient-level and sample-level attributes by mapping
 * clinical data back to samples using appropriate keys.
 *
 * Based on: cbioportal-frontend/src/pages/studyView/StudyViewPageStore.ts:1944-1983
 *
 * @param clinicalData - Array of ClinicalData with values
 * @param samples - All samples to potentially group
 * @param isPatientAttribute - Whether this is a patient-level attribute
 * @returns Map of attribute value → sample identifiers
 */
export function groupSamplesByAttributeValue(
    clinicalData: ClinicalDataItem[],
    samples: Sample[],
    isPatientAttribute: boolean
): Map<string, SampleIdentifier[]> {
    // For patient-level attributes, we need to map back to samples
    // because clinical data uses patientId but we need sampleIds for groups
    if (isPatientAttribute) {
        // Create lookup by uniquePatientKey
        const patientKeyToData = _.keyBy(
            clinicalData,
            (d) => d.uniquePatientKey
        );

        // Map each sample to its patient's clinical data value
        // Filter out samples without data - they'll be handled by createNAGroup
        const dataWithSamples = samples
            .map((sample) => {
                const datum = patientKeyToData[sample.uniquePatientKey!];
                if (!datum) return null; // Skip samples without data
                return {
                    sampleId: sample.sampleId,
                    studyId: sample.studyId,
                    value: datum.value,
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

        // Group by value (case-insensitive)
        return new Map(
            Object.entries(
                _.groupBy(dataWithSamples, (d) => d.value.toLowerCase())
            ).map(([key, items]) => [
                // Use original case from first item
                items[0].value,
                items.map((item) => ({
                    studyId: item.studyId,
                    sampleId: item.sampleId,
                })),
            ])
        );
    } else {
        // For sample-level attributes, direct grouping
        // Group by value (case-insensitive)
        const lcValueToSampleIdentifiers = _.groupBy(clinicalData, (d) =>
            d.value.toLowerCase()
        );

        return new Map(
            Object.entries(lcValueToSampleIdentifiers).map(
                ([lcValue, items]) => [
                    // Use original case from first item
                    items[0].value,
                    items.map((item) => ({
                        studyId: item.studyId,
                        sampleId: item.sampleId!,
                    })),
                ]
            )
        );
    }
}

/**
 * Create NA group for samples that don't have the clinical attribute.
 *
 * @param samplesWithData - Set of sampleKeys that have clinical data
 * @param allSamples - All samples in the filtered set
 * @param origin - Study IDs this comparison originates from
 * @returns SessionGroupData for NA group, or null if no NA samples exist
 */
export function createNAGroup(
    samplesWithData: Set<string>,
    allSamples: Sample[],
    origin: string[]
): SessionGroupData | null {
    const naSamples = allSamples.filter(
        (s) => !samplesWithData.has(`${s.studyId}_${s.sampleId}`)
    );

    if (naSamples.length === 0) {
        return null;
    }

    return createGroup(
        'NA',
        naSamples.map((s) => ({ studyId: s.studyId, sampleId: s.sampleId })),
        origin
    );
}
