/**
 * Tab Validator
 * Validates tab availability for studies based on data existence
 */

import { apiClient } from '../api/client.js';

export interface TabValidationResult {
    available: boolean;
    reason?: string; // Why tab is unavailable
}

/**
 * Validate if a tab is available for a given study
 * @param studyId - The study ID to check
 * @param tab - The tab name to validate
 * @returns TabValidationResult indicating if tab is available and why
 */
export async function validateTabAvailability(
    studyId: string,
    tab: string
): Promise<TabValidationResult> {
    // Always available tabs - no validation needed
    if (tab === 'summary' || tab === 'plots') {
        return { available: true };
    }

    try {
        // Get raw API client for direct access to methods
        const api = apiClient.getRawApi();

        // Get study samples (needed for most checks)
        const samples = await api.fetchSamplesUsingPOST({
            sampleFilter: {
                sampleListIds: [`${studyId}_all`],
                sampleIdentifiers: [],
                uniqueSampleKeys: [],
            },
            projection: 'SUMMARY',
        });

        // Check clinical data tab
        if (tab === 'clinicalData') {
            if (samples.length === 0) {
                return {
                    available: false,
                    reason: 'No samples available for this study',
                };
            }
            return { available: true };
        }

        // Check CN segments tab
        if (tab === 'cnSegments') {
            try {
                const cnSegmentResponse =
                    await api.fetchCopyNumberSegmentsUsingPOSTWithHttpInfo({
                        sampleIdentifiers: samples.map((s) => ({
                            sampleId: s.sampleId,
                            studyId: s.studyId,
                        })),
                        projection: 'META',
                    });

                const count = parseInt(
                    cnSegmentResponse.header['total-count'] || '0',
                    10
                );

                if (count === 0) {
                    return {
                        available: false,
                        reason: 'No copy number segment data available for this study',
                    };
                }
                return { available: true };
            } catch (error) {
                return {
                    available: false,
                    reason: 'Unable to check copy number segment data availability',
                };
            }
        }

        // Unknown tab - let frontend handle it
        return { available: true };
    } catch (error) {
        // If validation fails, allow navigation but note the error
        console.error(`Tab validation error for ${tab}:`, error);
        return {
            available: true, // Allow navigation on validation errors
        };
    }
}
