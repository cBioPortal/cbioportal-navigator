/**
 * Checks clinical filters in a StudyView link against the studies' real
 * attributes and values, so the tool refuses a link the portal would
 * silently ignore (e.g. a value the attribute never takes).
 */

import { studyViewDataClient } from './studyViewDataClient.js';

export interface ClinicalFilterRequest {
    attributeId: string;
    /** Categorical values to check; numeric ranges are not checked. */
    values: string[];
}

export interface ClinicalFilterProblem {
    attributeId: string;
    reason: 'unknown_attribute' | 'unknown_values';
    invalidValues?: string[];
    validValues?: string[];
}

export interface ClinicalFilterDeps {
    getAttributes: (
        studyIds: string[]
    ) => Promise<{ clinicalAttributeId: string; datatype: string }[]>;
    getValues: (
        studyId: string,
        attributeIds: string[]
    ) => Promise<Map<string, string[]>>;
}

const defaultDeps: ClinicalFilterDeps = {
    getAttributes: (studyIds) =>
        studyViewDataClient.getClinicalAttributes(studyIds),
    getValues: (studyId, attributeIds) =>
        studyViewDataClient.getClinicalDataValuesBatch(studyId, attributeIds),
};

const norm = (v: string) => v.trim().toLowerCase();

export async function validateClinicalFilters(
    studyIds: string[],
    filters: ClinicalFilterRequest[],
    deps: ClinicalFilterDeps = defaultDeps
): Promise<ClinicalFilterProblem[]> {
    if (filters.length === 0) return [];

    const attributes = await deps.getAttributes(studyIds);
    const datatypeById = new Map(
        attributes.map((a) => [a.clinicalAttributeId, a.datatype])
    );

    const problems: ClinicalFilterProblem[] = [];
    const categorical: ClinicalFilterRequest[] = [];
    for (const f of filters) {
        const datatype = datatypeById.get(f.attributeId);
        if (datatype === undefined) {
            problems.push({
                attributeId: f.attributeId,
                reason: 'unknown_attribute',
            });
        } else if (datatype !== 'NUMBER' && f.values.length > 0) {
            categorical.push(f);
        }
    }
    if (categorical.length === 0) return problems;

    const ids = [...new Set(categorical.map((f) => f.attributeId))];
    const perStudy = await Promise.all(
        studyIds.map((s) => deps.getValues(s, ids))
    );
    for (const f of categorical) {
        const valid = [
            ...new Set(perStudy.flatMap((m) => m.get(f.attributeId) ?? [])),
        ];
        const known = new Set(valid.map(norm));
        const invalid = f.values.filter(
            (v) => norm(v) !== 'na' && !known.has(norm(v))
        );
        if (invalid.length > 0) {
            problems.push({
                attributeId: f.attributeId,
                reason: 'unknown_values',
                invalidValues: invalid,
                validValues: valid,
            });
        }
    }
    return problems;
}

/**
 * Collects the categorical clinical filters from the legacy
 * filterAttributeId/filterValues pair and from filterJson.clinicalDataFilters.
 */
export function collectClinicalFilters(params: {
    filterAttributeId?: string;
    filterValues?: string;
    filterJson?: {
        clinicalDataFilters?: {
            attributeId: string;
            values: ({ value: string } | { start?: number; end?: number })[];
        }[];
    };
}): ClinicalFilterRequest[] {
    const out: ClinicalFilterRequest[] = [];
    if (params.filterAttributeId) {
        out.push({
            attributeId: params.filterAttributeId,
            values: (params.filterValues ?? '')
                .split(',')
                .map((v) => v.trim())
                .filter(
                    (v) => v !== '' && !/^-?[\d.]+\s*-\s*-?[\d.]*$/.test(v)
                ),
        });
    }
    for (const f of params.filterJson?.clinicalDataFilters ?? []) {
        out.push({
            attributeId: f.attributeId,
            values: f.values.flatMap((v) => ('value' in v ? [v.value] : [])),
        });
    }
    return out;
}
