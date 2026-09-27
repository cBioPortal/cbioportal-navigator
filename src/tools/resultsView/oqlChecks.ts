/**
 * Checks on parsed OQL for forms that parse but don't do what the caller intends,
 * plus normalization of spelled-out driver terms to the bare DRIVER modifier.
 * OQL reference: https://docs.cbioportal.org/user-guide/oql/
 */

type Alteration = {
    alteration_type: string;
    constr_rel?: string;
    constr_type?: string;
    constr_val?: string | number;
    info?: Record<string, unknown>;
    modifiers?: { type: string; start?: number; end?: number }[];
};

type GeneQuery = { gene: string; alterations: Alteration[] | false };

export type OqlCheck = {
    /** Problems that make the query wrong; the caller should fix and retry. */
    errors: string[];
    /** Gene entries rewritten to an equivalent, simpler form (original -> replacement). */
    rewrites: { from: string; to: string }[];
};

const isMutation = (a: Alteration) => a.alteration_type === 'mut';

function geneErrors(q: GeneQuery): string[] {
    const errors: string[] = [];
    const alterations = q.alterations || [];
    const excluded = alterations.filter(
        (a) => isMutation(a) && a.constr_rel === '!='
    );
    const included = alterations.filter(
        (a) => isMutation(a) && a.constr_rel !== '!='
    );

    for (const a of excluded) {
        if (a.modifiers?.some((m) => m.type === 'RANGE')) {
            errors.push(
                `${q.gene}: "!=" does not work with position ranges (cBioPortal ignores it). ` +
                    `To exclude a codon use the amino acid form (e.g. "${q.gene}: MUT != G12"), ` +
                    `or include the ranges around it (e.g. "${q.gene}: MUT = (-11) MUT = (13-)").`
            );
        }
        if (
            a.constr_type === 'name' &&
            /^[A-Z]\d+\*$/.test(String(a.constr_val))
        ) {
            const position = String(a.constr_val).slice(0, -1);
            errors.push(
                `${q.gene}: "MUT != ${a.constr_val}" excludes only the nonsense change ${a.constr_val}. ` +
                    `To exclude every mutation at that position use "${q.gene}: MUT != ${position}".`
            );
        }
    }
    if (excluded.length > 1 || (excluded.length && included.length)) {
        errors.push(
            `${q.gene}: OQL combines terms with OR, so more than one "!=", or "!=" with another mutation term, ` +
                `matches all mutations. Exclude a single event with "!=" ` +
                `(e.g. "${q.gene}: MUT != G12"), or include position ranges instead ` +
                `(e.g. "${q.gene}: MUT = (-11) MUT = (14-)" to exclude codons 12-13).`
        );
    }
    for (const a of alterations) {
        if (a.constr_type === 'name' && /^P\./.test(String(a.constr_val))) {
            errors.push(
                `${q.gene}: protein changes are written without the "p." prefix ` +
                    `(e.g. "${q.gene}: ${String(a.constr_val).slice(2)}").`
            );
        }
    }
    return errors;
}

/** Alteration types that are only DRIVER-filtered, with no other constraint. */
function driverOnlyTypes(q: GeneQuery): Set<string> | null {
    const alterations = q.alterations || [];
    if (alterations.length < 2) return null;
    const types = new Set<string>();
    for (const a of alterations) {
        const modifiers = a.modifiers ?? [];
        if (modifiers.length !== 1 || modifiers[0].type !== 'DRIVER')
            return null;
        if (isMutation(a)) {
            if (a.constr_type || Object.keys(a.info ?? {}).length) return null;
            types.add('mut');
        } else if (a.alteration_type === 'cna' && a.constr_rel === '=') {
            types.add(String(a.constr_val));
        } else if (
            a.alteration_type === 'fusion' ||
            a.alteration_type === 'structural_variant'
        ) {
            types.add('fusion');
        } else {
            return null;
        }
    }
    return types.size >= 2 ? types : null;
}

/**
 * Check each gene entry (as passed by the caller) against its parse.
 * `parse` is the OQL parser's parse function.
 */
export function checkOql(
    entries: string[],
    parse: (q: string) => any[] | undefined
): OqlCheck {
    const result: OqlCheck = { errors: [], rewrites: [] };
    for (const entry of entries) {
        const parsed = parse(entry.toUpperCase()) ?? [];
        for (const node of parsed) {
            const queries: GeneQuery[] = node.list ?? [node];
            for (const q of queries) result.errors.push(...geneErrors(q));
        }
        // Spelled-out drivers for several alteration types ("EGFR: MUT_DRIVER AMP_DRIVER")
        // mean "driver events"; the bare DRIVER modifier covers them in one term.
        if (
            parsed.length === 1 &&
            !parsed[0].list &&
            driverOnlyTypes(parsed[0])
        ) {
            result.rewrites.push({
                from: entry,
                to: `${parsed[0].gene}: DRIVER`,
            });
        }
    }
    return result;
}
