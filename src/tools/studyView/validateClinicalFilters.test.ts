import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    collectClinicalFilters,
    validateClinicalFilters,
    type ClinicalFilterDeps,
} from './validateClinicalFilters.js';

const deps: ClinicalFilterDeps = {
    getAttributes: async () => [
        { clinicalAttributeId: 'PRIOR_MED_TO_MSK', datatype: 'STRING' },
        { clinicalAttributeId: 'AGE', datatype: 'NUMBER' },
    ],
    getValues: async () =>
        new Map([
            [
                'PRIOR_MED_TO_MSK',
                ['No prior medications', 'Prior medications to MSK', 'Unknown'],
            ],
        ]),
};

test('rejects a value the attribute never takes (issue #54)', async () => {
    const problems = await validateClinicalFilters(
        ['msk_chord_2024'],
        collectClinicalFilters({
            filterAttributeId: 'PRIOR_MED_TO_MSK',
            filterValues: 'Radiation Therapy',
        }),
        deps
    );
    assert.equal(problems.length, 1);
    assert.equal(problems[0].reason, 'unknown_values');
    assert.deepEqual(problems[0].invalidValues, ['Radiation Therapy']);
});

test('rejects an attribute the study does not have', async () => {
    const problems = await validateClinicalFilters(
        ['msk_chord_2024'],
        [{ attributeId: 'RADIATION', values: ['Yes'] }],
        deps
    );
    assert.equal(problems[0].reason, 'unknown_attribute');
});

test('accepts valid values, NA, numeric ranges and case differences', async () => {
    const problems = await validateClinicalFilters(
        ['msk_chord_2024'],
        collectClinicalFilters({
            filterAttributeId: 'AGE',
            filterValues: '40-60',
            filterJson: {
                clinicalDataFilters: [
                    {
                        attributeId: 'PRIOR_MED_TO_MSK',
                        values: [
                            { value: 'prior medications to msk' },
                            { value: 'NA' },
                        ],
                    },
                    { attributeId: 'AGE', values: [{ start: 60 }] },
                ],
            },
        }),
        deps
    );
    assert.deepEqual(problems, []);
});

test('no clinical filters means no lookups', async () => {
    let called = false;
    const problems = await validateClinicalFilters(['x'], [], {
        getAttributes: async () => {
            called = true;
            return [];
        },
        getValues: async () => new Map(),
    });
    assert.deepEqual(problems, []);
    assert.equal(called, false);
});
