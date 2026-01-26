/**
 * Numerical data binning utilities for group comparison.
 *
 * Implements quartile-based binning of numerical clinical attributes.
 * Splits samples into equal-sized groups based on sorted numeric values.
 *
 * Based on: cbioportal-frontend/src/pages/groupComparison/GroupComparisonUtils.tsx:628-647
 *
 * @packageDocumentation
 */

import { type ClinicalDataItem } from './groupBuilder.js';

/**
 * A quartile (or bin) of data with range information
 */
export interface Quartile {
    /** Clinical data items in this quartile */
    data: ClinicalDataItem[];
    /** Minimum numeric value in this quartile */
    minValue: number;
    /** Maximum numeric value in this quartile */
    maxValue: number;
    /** Display name (e.g., "45.2-67.8") */
    name: string;
}

/**
 * Split numerical clinical data into equal-sized groups (quartiles).
 *
 * Algorithm:
 * 1. Filter out NaN values
 * 2. Sort by numeric value (ascending)
 * 3. Divide into N equal-sized groups by sample count
 * 4. Name each group by min-max value range
 *
 * @param data - Array of clinical data items with numeric values
 * @param numberOfSplits - Number of groups to create (default: 4 for quartiles)
 * @returns Array of quartiles, may be less than numberOfSplits if data is too small
 *
 * @example
 * ```typescript
 * const data = [
 *   { value: "45.2", studyId: "study1", sampleId: "s1" },
 *   { value: "67.8", studyId: "study1", sampleId: "s2" },
 *   { value: "52.1", studyId: "study1", sampleId: "s3" },
 *   { value: "71.5", studyId: "study1", sampleId: "s4" },
 * ];
 * const quartiles = splitDataIntoQuartiles(data, 4);
 * // Returns: [
 * //   { name: "45.2-52.1", minValue: 45.2, maxValue: 52.1, data: [...] },
 * //   { name: "67.8-71.5", minValue: 67.8, maxValue: 71.5, data: [...] }
 * // ]
 * ```
 */
export function splitDataIntoQuartiles(
    data: ClinicalDataItem[],
    numberOfSplits: number = 4
): Quartile[] {
    // Step 1: Filter out NaN values
    const validData = data.filter((d) => {
        const numValue = parseFloat(d.value);
        return !isNaN(numValue);
    });

    if (validData.length === 0) {
        return [];
    }

    // Step 2: Sort by numeric value (ascending)
    const sortedData = validData.sort((a, b) => {
        return parseFloat(a.value) - parseFloat(b.value);
    });

    // Step 3: Split into equal-sized groups by sample count
    const splitLength = sortedData.length / numberOfSplits;
    const quartiles: Quartile[] = [];

    for (let i = 0; i < numberOfSplits; i++) {
        const start = Math.floor(splitLength * i);
        const end = Math.floor(splitLength * (i + 1));
        const quartileData = sortedData.slice(start, end);

        // Handle edge case where some quartiles might be empty
        if (quartileData.length > 0) {
            const minValue = parseFloat(quartileData[0].value);
            const maxValue = parseFloat(
                quartileData[quartileData.length - 1].value
            );
            const name = `${formatNumber(minValue)}-${formatNumber(maxValue)}`;

            quartiles.push({
                data: quartileData,
                minValue,
                maxValue,
                name,
            });
        }
    }

    return quartiles;
}

/**
 * Format a number for display in group names.
 * Matches cbioportal-frontend StudyViewUtils.tsx:2970
 *
 * - Integers: no decimal places (e.g., 67)
 * - Non-integers: 2 decimal places (e.g., 45.23)
 *
 * @param n - Number to format
 * @returns Formatted string
 */
function formatNumber(n: number): string {
    return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2);
}
