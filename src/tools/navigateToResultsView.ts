/**
 * MCP tool for navigating to cBioPortal ResultsView (OncoPrint).
 *
 * ResultsView analyzes specific genes across samples, displaying alteration
 * patterns through OncoPrint matrices, mutation details, copy number analysis,
 * co-occurrence patterns, survival curves, and expression correlations. This
 * tool handles study resolution, gene validation, and complex URL construction.
 *
 * @remarks
 * Key exports:
 * - `navigateToResultsViewTool`: Tool definition with schema and documentation
 * - `handleNavigateToResultsView()`: MCP tool handler
 * - `navigateToResultsView()`: Core navigation logic
 *
 * Features:
 * - Study resolution via keywords or direct studyId
 * - Batch gene validation (filters out invalid genes)
 * - Supports tabs: oncoprint, mutations, structuralVariants, cancerTypesSummary,
 *   mutualExclusivity, plots, survival, coexpression, comparison (+ subtabs),
 *   cnSegments, pathways, download
 * - Optional case set selection and Z-score thresholds
 * - Default case set: {studyId}_all (all samples)
 * - Oncoprint annotation tracks: clinical, heatmap (mRNA/protein/methylation),
 *   and generic assay tracks via oncoprintClinicalTracks/oncoprintHeatmapTracks/
 *   oncoprintGenericAssayTracks
 *
 * Architecture:
 * Uses studyResolver for study identification, geneResolver for gene validation,
 * and buildResultsUrl for URL construction. Returns success response with
 * validated genes, or ambiguity/error responses.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { studyResolver } from './shared/studyResolver.js';
import { geneResolver } from './shared/geneResolver.js';
import { plotsSelectionParamSchema } from './shared/plotsSchemas.js';
import {
    buildResultsUrl,
    formatTrackGroups,
} from './resultsView/buildResultsUrl.js';
import { MainSessionClient } from './resultsView/mainSessionClient.js';
import { apiClient } from './shared/cbioportalClient.js';
import { getConfig } from './shared/config.js';
import { buildCBioPortalPageUrl } from './shared/cbioportalUrlBuilder.js';
import {
    createNavigationResponse,
    createErrorResponse,
} from './shared/responses.js';
import type { ToolResponse } from './shared/types.js';
import { loadPrompt } from './shared/promptLoader.js';
import { buildStudyUrl } from './studyView/buildStudyUrl.js';
import { validateTabAvailability } from './studyView/validateStudyViewTab.js';
import { getResultsViewPageDescription } from './shared/pageDescriptions.js';
import * as oqlParser from './resultsView/oql-parser.js';

/**
 * Tool definition schema (without description, which is loaded at startup)
 */
const inputSchema = {
    studyIds: z
        .array(z.string())
        .min(1)
        .describe(
            'Array of validated study IDs (e.g., ["luad_tcga"] or ["luad_tcga", "lusc_tcga"] for cross-study). These should be pre-resolved by route_to_target_page tool.'
        ),
    genes: z
        .array(z.string())
        .min(1)
        .describe(
            'Gene symbols (required, at least 1). All genes that appear in any axis or analysis must be included — the frontend populates gene dropdowns only from this list.'
        ),
    caseSetId: z
        .string()
        .optional()
        .describe('Case set ID (defaults to {studyId}_all)'),
    tab: z
        .enum([
            'oncoprint',
            'mutations',
            'structuralVariants',
            'cancerTypesSummary',
            'mutualExclusivity',
            'plots',
            'survival',
            'coexpression',
            'comparison',
            'comparison/overlap',
            'comparison/survival',
            'comparison/clinical',
            'comparison/mrna',
            'comparison/protein',
            'comparison/dna_methylation',
            'comparison/alterations',
            'cnSegments',
            'pathways',
            'download',
        ])
        .optional()
        .default('oncoprint')
        .describe('Tab (or tab/subtab) to navigate to'),
    profileFilter: z
        .string()
        .optional()
        .describe(
            'Comma-separated molecular profile suffixes to activate. Required when OQL contains EXP or PROT — must include ALL desired profiles (suffix mode overrides defaults). Suffix = molecularProfileId.replace(studyId + "_", ""). See prompt for construction rules.'
        ),
    zScoreThreshold: z
        .number()
        .optional()
        .describe('Z-score threshold for expression data'),
    rppaScoreThreshold: z
        .number()
        .optional()
        .describe('RPPA score threshold for protein data'),
    studyViewFilter: z
        .record(z.string(), z.any())
        .optional()
        .describe(
            'StudyViewFilter object to restrict analysis to a filtered sample subset. When provided, fetches matching samples and creates a session-based URL (?session_id=...). Same format as navigate_to_study_view filterJson.'
        ),
    plotsHorzSelection: plotsSelectionParamSchema
        .optional()
        .describe(
            'Horizontal axis configuration for the plots tab. Set selectedGeneOption to a Hugo gene symbol (e.g. "IDH1") — it will be resolved to an Entrez ID automatically.'
        ),
    plotsVertSelection: plotsSelectionParamSchema
        .optional()
        .describe(
            'Vertical axis configuration for the plots tab. Same structure as plotsHorzSelection.'
        ),
    comparisonSelectedGroups: z
        .array(z.string())
        .optional()
        .describe(
            'Pre-select groups in the comparison tab. Two types of groups exist: aggregate ("Altered group" / "Unaltered group") and per-gene (one per queried gene, named after the gene symbol when using default OQL). Pass gene symbols to compare gene-specific altered groups, e.g. ["IDH1", "EGFR"]. Omit to use the default (Altered vs Unaltered).'
        ),
    oncoprintClinicalTracks: z
        .array(z.string())
        .optional()
        .describe(
            'Clinical attribute IDs to display as annotation tracks below the oncoprint genomic tracks (e.g. ["AGE", "SEX"]). Use IDs from resolve_and_route metadata.clinicalAttributeIds. Only affects the oncoprint tab.'
        ),
    oncoprintHeatmapTracks: z
        .array(
            z.object({
                molecularProfileId: z
                    .string()
                    .describe(
                        'Full molecular profile ID of an mRNA, protein, or methylation profile (e.g. "luad_tcga_pan_can_atlas_2018_rna_seq_v2_mrna_median_all_sample_Zscores"). Use the exact ID from resolve_and_route metadata.heatmapProfileIds — not a suffix.'
                    ),
                entities: z
                    .array(z.string())
                    .min(1)
                    .describe(
                        'Hugo gene symbols to show as heatmap rows for this profile.'
                    ),
            })
        )
        .optional()
        .describe(
            'Adds expression/methylation heatmap rows to the oncoprint, grouped by molecular profile. Only affects the oncoprint tab.'
        ),
    oncoprintGenericAssayTracks: z
        .array(
            z.object({
                molecularProfileId: z
                    .string()
                    .describe(
                        'Full GENERIC_ASSAY molecular profile ID (e.g. treatment response, arm-level CNA, genetic ancestry). Use the exact ID from resolve_and_route metadata.genericAssayProfiles — not a suffix.'
                    ),
                entities: z
                    .array(z.string())
                    .min(1)
                    .describe(
                        'Generic assay entity stable IDs to show as rows for this profile. Obtain these from get_studyviewfilter_options(genericAssayProfileIds).'
                    ),
            })
        )
        .optional()
        .describe(
            'Adds generic assay data rows (e.g. treatment response, arm-level CNA, genetic ancestry) to the oncoprint, grouped by molecular profile. Only affects the oncoprint tab.'
        ),
};

/**
 * Factory function for MCP registration (call after initPrompts)
 */
export function createNavigateToResultsViewTool() {
    return {
        name: 'navigate_to_results_view',
        title: 'Navigate to ResultsView',
        description: loadPrompt('navigator/navigate-to-results-view'),
        inputSchema,
    };
}

// Infer type from Zod schema
type NavigateToResultsViewInput = {
    studyIds: z.infer<typeof inputSchema.studyIds>;
    genes: z.infer<typeof inputSchema.genes>;
    caseSetId?: z.infer<typeof inputSchema.caseSetId>;
    tab?: z.infer<typeof inputSchema.tab>;
    zScoreThreshold?: z.infer<typeof inputSchema.zScoreThreshold>;
    rppaScoreThreshold?: z.infer<typeof inputSchema.rppaScoreThreshold>;
    studyViewFilter?: z.infer<typeof inputSchema.studyViewFilter>;
    profileFilter?: z.infer<typeof inputSchema.profileFilter>;
    plotsHorzSelection?: z.infer<typeof inputSchema.plotsHorzSelection>;
    plotsVertSelection?: z.infer<typeof inputSchema.plotsVertSelection>;
    comparisonSelectedGroups?: z.infer<
        typeof inputSchema.comparisonSelectedGroups
    >;
    oncoprintClinicalTracks?: z.infer<
        typeof inputSchema.oncoprintClinicalTracks
    >;
    oncoprintHeatmapTracks?: z.infer<typeof inputSchema.oncoprintHeatmapTracks>;
    oncoprintGenericAssayTracks?: z.infer<
        typeof inputSchema.oncoprintGenericAssayTracks
    >;
};

/**
 * Tool handler for MCP
 */
export async function handleNavigateToResultsView(
    input: NavigateToResultsViewInput
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
        const result = await navigateToResultsView(input);
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(result),
                },
            ],
        };
    } catch (error) {
        const errorResponse = createErrorResponse(
            error instanceof Error ? error.message : 'Unknown error occurred',
            error
        );
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(errorResponse),
                },
            ],
        };
    }
}

/**
 * Main navigation logic for ResultsView
 */
async function navigateToResultsView(
    params: NavigateToResultsViewInput
): Promise<ToolResponse> {
    const { studyIds } = params;

    // studyIds are already validated by router, no need to validate again

    // 1. Validate genes
    if (!params.genes || params.genes.length === 0) {
        return createErrorResponse('At least one gene must be provided');
    }

    // 1a. Parse OQL — validate syntax and extract gene symbols from AST
    const oqlQuery = params.genes.join('\n');
    let parsedOql: ReturnType<typeof oqlParser.parse>;
    try {
        parsedOql = oqlParser.parse(oqlQuery.toUpperCase());
    } catch (e: any) {
        return createErrorResponse('Invalid OQL syntax in genes', {
            error: e.message,
            location: e.location,
        });
    }

    // Extract gene symbols from AST — handles plain genes, OQL statements,
    // merged tracks, and skips DATATYPES pseudo-gene
    const geneSymbols = (parsedOql ?? [])
        .flatMap((entry: any) => {
            if (entry.list) {
                // MergedGeneQuery: ["label" GENE1 GENE2]
                return entry.list.map((q: any) => q.gene);
            }
            return [entry.gene];
        })
        .filter((g: string) => g.toUpperCase() !== 'DATATYPES');

    const validSymbols = await geneResolver.validateBatch(geneSymbols);

    if (validSymbols.length === 0) {
        return createErrorResponse('No valid genes found', {
            providedGenes: params.genes,
        });
    }

    // Rebuild gene entries: drop entries whose extracted symbol is entirely invalid
    const validSymbolSet = new Set(validSymbols.map((s) => s.toUpperCase()));
    const validGeneEntries = params.genes.filter((g) => {
        const parsed = oqlParser.parse(g.toUpperCase()) ?? [];
        return parsed.some((entry: any) => {
            const genes = entry.list
                ? entry.list.map((q: any) => q.gene)
                : [entry.gene];
            return genes.some(
                (sym: string) =>
                    sym.toUpperCase() !== 'DATATYPES' &&
                    validSymbolSet.has(sym.toUpperCase())
            );
        });
    });

    if (validGeneEntries.length < params.genes.length) {
        const invalidGenes = params.genes.filter(
            (g) => !validGeneEntries.includes(g)
        );
        console.warn(
            `Some genes were invalid and skipped: ${invalidGenes.join(', ')}`
        );
    }

    // Validate cnSegments tab availability (requires actual segment data)
    if (params.tab === 'cnSegments') {
        const validationResults = await Promise.all(
            studyIds.map(async (id) => ({
                studyId: id,
                validation: await validateTabAvailability(id, 'cnSegments'),
            }))
        );
        const unavailable = validationResults.filter(
            (r) => !r.validation.available
        );
        if (unavailable.length > 0) {
            return createErrorResponse(
                `Tab "cnSegments" is not available for some studies`,
                {
                    unavailableStudies: unavailable.map((s) => ({
                        studyId: s.studyId,
                        reason: s.validation.reason,
                    })),
                    suggestion: 'This study has no copy number segment data',
                }
            );
        }
    }

    // Validate gene symbols in heatmap track entities, drop tracks left with
    // no valid genes. Generic assay entity IDs are not genes — passed through.
    const oncoprintHeatmapTracks = params.oncoprintHeatmapTracks
        ? (
              await Promise.all(
                  params.oncoprintHeatmapTracks.map(async (track) => ({
                      molecularProfileId: track.molecularProfileId,
                      entities: await geneResolver.validateBatch(
                          track.entities
                      ),
                  }))
              )
          ).filter((track) => track.entities.length > 0)
        : undefined;

    const studyDetails = await Promise.all(
        studyIds.map((id) => studyResolver.getById(id))
    );

    // 2a. Filter path: fetch samples → create session → session_id URL
    if (params.studyViewFilter) {
        const filter = { ...params.studyViewFilter, studyIds };
        const samples = await apiClient.fetchFilteredSamples(filter);

        if (samples.length === 0) {
            return createErrorResponse(
                'No samples match the provided studyViewFilter'
            );
        }

        const caseIds = samples
            .map((s) => `${s.studyId}:${s.sampleId}`)
            .join('+');

        const config = getConfig();
        const sessionClient = new MainSessionClient(config.baseUrl);
        const { id: sessionId } = await sessionClient.createSession({
            cancer_study_list: studyIds.join(','),
            gene_list: validGeneEntries.join('\n'),
            case_set_id: '-1',
            case_ids: caseIds,
            tab_index: 'tab_visualize',
            Action: 'Submit',
            ...(params.zScoreThreshold !== undefined && {
                Z_SCORE_THRESHOLD: String(params.zScoreThreshold),
            }),
            ...(params.rppaScoreThreshold !== undefined && {
                RPPA_SCORE_THRESHOLD: String(params.rppaScoreThreshold),
            }),
        });

        const url = buildCBioPortalPageUrl(
            params.tab ? `/results/${params.tab}` : '/results',
            {
                session_id: sessionId,
                ...(params.oncoprintClinicalTracks &&
                    params.oncoprintClinicalTracks.length > 0 && {
                        clinicallist: params.oncoprintClinicalTracks.join(','),
                    }),
                ...(oncoprintHeatmapTracks &&
                    oncoprintHeatmapTracks.length > 0 && {
                        heatmap_track_groups: formatTrackGroups(
                            oncoprintHeatmapTracks
                        ),
                    }),
                ...(params.oncoprintGenericAssayTracks &&
                    params.oncoprintGenericAssayTracks.length > 0 && {
                        generic_assay_groups: formatTrackGroups(
                            params.oncoprintGenericAssayTracks
                        ),
                    }),
            }
        );

        // Build companion StudyView URL for exploring the filtered cohort
        const studyViewUrl = buildStudyUrl({
            studyIds,
            filterJson: params.studyViewFilter,
        });

        return createNavigationResponse(url, {
            studyIds,
            studies: studyDetails.map((s) => ({
                studyId: s.studyId,
                name: s.name,
                sampleCount: s.allSampleCount,
            })),
            genes: validSymbols,
            filteredSampleCount: samples.length,
            caseSetId: '-1',
            sessionId,
            studyViewUrl,
            ...(oncoprintHeatmapTracks &&
                oncoprintHeatmapTracks.length > 0 && {
                    oncoprintHeatmapTracks,
                }),
            ...(getResultsViewPageDescription(params.tab, {
                plotsHorz: params.plotsHorzSelection,
                plotsVert: params.plotsVertSelection,
                comparisonSelectedGroups: params.comparisonSelectedGroups,
            }) && {
                pageDescription: getResultsViewPageDescription(params.tab, {
                    plotsHorz: params.plotsHorzSelection,
                    plotsVert: params.plotsVertSelection,
                    comparisonSelectedGroups: params.comparisonSelectedGroups,
                }),
            }),
        });
    }

    // 2b. Default path: case set ID
    let caseSetId: string;
    if (params.caseSetId) {
        caseSetId = params.caseSetId;
    } else if (studyIds.length === 1) {
        caseSetId = `${studyIds[0]}_all`;
    } else {
        caseSetId = 'all';
    }

    // Resolve gene symbols in plots selections to Entrez IDs
    const [plotsHorzSelection, plotsVertSelection] = await Promise.all([
        geneResolver.resolvePlotsGene(params.plotsHorzSelection),
        geneResolver.resolvePlotsGene(params.plotsVertSelection),
    ]);

    // When genes use OQL (alterations !== false), cBioPortal names the per-gene
    // comparison group after the full OQL string (e.g. "CDKN2A: HOMDEL"), not the
    // bare symbol. Expand comparisonSelectedGroups to include both forms so the
    // groups are correctly pre-selected regardless of naming.
    let comparisonSelectedGroups = params.comparisonSelectedGroups;
    if (comparisonSelectedGroups && comparisonSelectedGroups.length > 0) {
        const symbolToOqlEntry = new Map<string, string>();
        for (const entry of validGeneEntries) {
            const parsed = oqlParser.parse(entry.toUpperCase()) ?? [];
            for (const node of parsed) {
                if ('gene' in node && node.alterations !== false) {
                    symbolToOqlEntry.set(node.gene.toUpperCase(), entry);
                }
            }
        }
        const oqlForms = comparisonSelectedGroups
            .map((g) => symbolToOqlEntry.get(g.toUpperCase()))
            .filter(
                (e): e is string =>
                    e !== undefined && !comparisonSelectedGroups!.includes(e)
            );
        if (oqlForms.length > 0) {
            comparisonSelectedGroups = [
                ...comparisonSelectedGroups,
                ...oqlForms,
            ];
        }
    }

    // 3. Build URL (supports multiple studies)
    const url = buildResultsUrl({
        studies: studyIds,
        genes: validGeneEntries,
        caseSelection: {
            type: 'case_set',
            caseSetId,
        },
        tab: params.tab,
        options: {
            ...(params.profileFilter && {
                profileFilter: params.profileFilter,
            }),
            ...(params.zScoreThreshold !== undefined && {
                zScoreThreshold: params.zScoreThreshold,
            }),
            ...(params.rppaScoreThreshold !== undefined && {
                rppaScoreThreshold: params.rppaScoreThreshold,
            }),
            ...(plotsHorzSelection && { plotsHorzSelection }),
            ...(plotsVertSelection && { plotsVertSelection }),
            ...(comparisonSelectedGroups && {
                comparisonSelectedGroups,
            }),
            ...(params.oncoprintClinicalTracks &&
                params.oncoprintClinicalTracks.length > 0 && {
                    oncoprintClinicalTracks: params.oncoprintClinicalTracks,
                }),
            ...(oncoprintHeatmapTracks &&
                oncoprintHeatmapTracks.length > 0 && {
                    oncoprintHeatmapTracks,
                }),
            ...(params.oncoprintGenericAssayTracks &&
                params.oncoprintGenericAssayTracks.length > 0 && {
                    oncoprintGenericAssayTracks:
                        params.oncoprintGenericAssayTracks,
                }),
        },
    });

    return createNavigationResponse(url, {
        studyIds,
        studies: studyDetails.map((s) => ({
            studyId: s.studyId,
            name: s.name,
            sampleCount: s.allSampleCount,
        })),
        genes: validSymbols,
        caseSetId,
        ...(oncoprintHeatmapTracks &&
            oncoprintHeatmapTracks.length > 0 && {
                oncoprintHeatmapTracks,
            }),
        ...(getResultsViewPageDescription(params.tab, {
            plotsHorz: params.plotsHorzSelection,
            plotsVert: params.plotsVertSelection,
            comparisonSelectedGroups: params.comparisonSelectedGroups,
        }) && {
            pageDescription: getResultsViewPageDescription(params.tab, {
                plotsHorz: params.plotsHorzSelection,
                plotsVert: params.plotsVertSelection,
                comparisonSelectedGroups: params.comparisonSelectedGroups,
            }),
        }),
    });
}
