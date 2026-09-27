import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as oqlParser from './oql-parser.js';
import { checkOql } from './oqlChecks.js';

const check = (...entries: string[]) =>
    checkOql(entries, (q) => oqlParser.parse(q));

test('valid exclusions and ranges pass unchanged', () => {
    for (const entry of [
        'KRAS: MUT != G12',
        'IDH1: MUT != R132',
        'EGFR: MUT != T790M',
        'TP53: MUT != MISSENSE',
        'KRAS: MUT = (-11) MUT = (13-)',
        'KRAS: MUT = (1-11) MUT = (13-)',
        'BRAF: V600E',
        'EGFR: DRIVER',
        'EGFR: AMP_DRIVER',
        'KRAS: MUT_DRIVER',
        'TP53: MUT = TRUNC INFRAME',
        '["KINASE DOMAIN DRIVERS" EGFR: MUT = (712-979)_DRIVER; ERBB2: MUT = (719-987)_DRIVER]',
    ]) {
        assert.deepEqual(check(entry), { errors: [], rewrites: [] }, entry);
    }
});

test('"!=" with a position range is rejected', () => {
    const { errors } = check('KRAS: MUT != (12-12)');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /does not work with position ranges/);
    assert.match(errors[0], /KRAS: MUT != G12/);
});

test('excluding a nonsense change when a position was meant is rejected', () => {
    const { errors } = check('KRAS: MUT != G12*');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /KRAS: MUT != G12"/);
});

test('more than one exclusion, or an exclusion with another mutation term, is rejected', () => {
    for (const entry of [
        'KRAS: MUT != G12 MUT != G13',
        'BRAF: MUT = V600 MUT != V600E',
        'KRAS: MUT MUT != G12',
    ]) {
        const { errors } = check(entry);
        assert.equal(errors.length, 1, entry);
        assert.match(errors[0], /matches all mutations/, entry);
    }
});

test('a "p." prefix on a protein change is rejected', () => {
    const { errors } = check('KRAS: p.G12C');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /without the "p\." prefix.*KRAS: G12C/);
});

test('driver terms spelled out for several alteration types become DRIVER', () => {
    const { errors, rewrites } = check(
        'EGFR: MUT_DRIVER AMP_DRIVER',
        'ALK: MUT_DRIVER FUSION_DRIVER',
        'MET: AMP_DRIVER',
        'ERBB2: MUT_DRIVER AMP'
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(rewrites, [
        { from: 'EGFR: MUT_DRIVER AMP_DRIVER', to: 'EGFR: DRIVER' },
        { from: 'ALK: MUT_DRIVER FUSION_DRIVER', to: 'ALK: DRIVER' },
    ]);
});

test('driver terms with a constraint are left alone', () => {
    assert.deepEqual(
        check('EGFR: MUT = MISSENSE_DRIVER AMP_DRIVER').rewrites,
        []
    );
});

test('every OQL example in the results view prompt parses and passes the checks', async () => {
    const { readFile } = await import('node:fs/promises');
    const prompt = await readFile(
        new URL('../../prompts/navigate_to_results_view.md', import.meta.url),
        'utf8'
    );
    const examples = [...prompt.matchAll(/^\|[^|]+\|(.+)\|\s*$/gm)]
        .flatMap((m) => [...m[1].matchAll(/`(\[.*?\])`/g)].map((c) => c[1]))
        .map((json) => JSON.parse(json) as string[]);
    assert.ok(examples.length >= 15, `found ${examples.length} examples`);
    for (const genes of examples) {
        assert.doesNotThrow(
            () => oqlParser.parse(genes.join('\n').toUpperCase()),
            genes.join(' | ')
        );
        assert.deepEqual(check(...genes).errors, [], genes.join(' | '));
    }
});
