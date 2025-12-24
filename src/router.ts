/**
 * Main router MCP tool that resolves studies and recommends navigation tools.
 *
 * This tool acts as the primary entry point for cBioPortal navigation,
 * resolving study identifiers and recommending which specialized navigation
 * tool to use next. It handles study keyword search, validation, and
 * ambiguity resolution before delegating to page-specific tools.
 *
 * @remarks
 * Key exports:
 * - `resolveAndRouteTool`: Tool definition with detailed routing guidance
 * - `handleResolveAndRoute()`: Handler that resolves studies and recommends tools
 *
 * Workflow:
 * 1. Resolve studyKeywords or validate studyIds
 * 2. Handle ambiguity (multiple matches) - let user choose
 * 3. Return recommendation: which tool to use + resolved studyIds
 * 4. AI calls the recommended nav tool with resolved studyIds
 *
 * Routing logic:
 * - targetPage='study' → recommends navigate_to_studyview
 * - targetPage='patient' → recommends navigate_to_patientview
 * - targetPage='results' → recommends navigate_to_resultsview
 *
 * The tool provides extensive inline documentation explaining when to use each
 * page type, including use cases, example queries, and key features for each.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { studyResolver } from './shared/resolvers/studyResolver.js';
import {
    createSuccessResponse,
    createAmbiguityResponse,
    createErrorResponse,
} from './shared/utils/responses.js';
import type { ToolResponse } from './shared/utils/types.js';

/**
 * Tool definition for MCP registration
 */
export const resolveAndRouteTool = {
    name: 'resolve_and_route',
    title: 'Resolve Studies and Route to Page',
    description: `Main router tool for cBioPortal navigation - resolves studies and recommends next tool.

WHAT THIS TOOL DOES:
1. Resolves study identifiers (keywords → studyIds or validates provided studyIds)
2. Handles ambiguity when multiple studies match (returns options for user to choose)
3. Recommends which specialized navigation tool to use next
4. Returns validated studyIds for the AI to pass to the recommended tool

This tool helps you choose the right cBioPortal page based on user intent and prepares
the study context for specialized navigation tools.

═══════════════════════════════════════════════════════════════════════════════
HOW TO CHOOSE targetPage
═══════════════════════════════════════════════════════════════════════════════

📊 targetPage: 'study' (StudyView Page)
────────────────────────────────────────────────────────────────────────────────
PURPOSE: Research cohort overview and analysis

USE WHEN THE USER WANTS TO:
• View overall statistics of a research study/cohort
• Compare different patient subgroups within a study
• Filter patients by clinical attributes (age, gender, stage, etc.)
• See survival analysis for the entire cohort
• Explore genomic feature distributions across the study
• View summary charts and custom visualizations

EXAMPLE QUERIES:
• "Show me the TCGA lung cancer study"
• "What's the overview of the breast cancer cohort?"
• "Display survival curves for melanoma study"
• "Show clinical characteristics of pancreatic cancer patients"

KEY FEATURES:
• Cohort statistics (sample counts, mutation frequencies)
• Clinical data distributions
• Survival analysis with stratification
• Custom charts and filters


🧬 targetPage: 'patient' (PatientView Page)
────────────────────────────────────────────────────────────────────────────────
PURPOSE: Individual patient/sample detailed information

USE WHEN THE USER WANTS TO:
• View a specific patient's complete profile
• Track a patient's clinical timeline and events
• See all genomic alterations for one individual
• Compare multiple samples from the same patient
• View treatment response data for a case
• Access pathology images for a patient

EXAMPLE QUERIES:
• "Show me patient TCGA-001 details"
• "Display the clinical timeline for this case"
• "What mutations does patient ID 12345 have?"
• "Show genomic data for sample TCGA-001-01A"

KEY FEATURES:
• Patient summary and demographics
• Clinical event timeline
• Genomic alteration tracks
• Pathway impact visualization
• Tissue/pathology images


🔬 targetPage: 'results' (ResultsView/OncoPrint Page)
────────────────────────────────────────────────────────────────────────────────
PURPOSE: Cross-sample gene alteration analysis

USE WHEN THE USER WANTS TO:
• Analyze specific genes across multiple samples
• Find mutation patterns and frequencies
• Identify co-occurring or mutually exclusive mutations
• Compare alterations in multiple genes
• Perform survival analysis by genotype
• Analyze gene expression correlations

EXAMPLE QUERIES:
• "Show me TP53 mutations in lung cancer"
• "Compare EGFR and KRAS alterations"
• "Find co-occurring mutations with BRAF"
• "Analyze PIK3CA mutation patterns"
• "Survival analysis for EGFR mutant patients"

KEY FEATURES:
• OncoPrint visualization (alteration matrix)
• Mutation details and frequencies
• Copy number alterations
• Gene co-occurrence analysis
• Survival curves by genotype
• Gene expression plots


═══════════════════════════════════════════════════════════════════════════════
DECISION FLOWCHART
═══════════════════════════════════════════════════════════════════════════════

Question 1: Does the user mention specific gene name(s)?
├─ YES → targetPage: 'results'
│        (Gene-focused analysis)
│
└─ NO → Question 1b: Is this a discovery question about genes (which/what/how many genes...)?
        ├─ YES → targetPage: 'study' (for unbiased gene discovery)
        │
        └─ NO → Question 2: Is it about a specific patient/case?
                ├─ YES → targetPage: 'patient'
                │        (Individual patient focus)
                │
                └─ NO → targetPage: 'study'
                        (Cohort/study overview)


═══════════════════════════════════════════════════════════════════════════════
ROUTING DETAILS
═══════════════════════════════════════════════════════════════════════════════

This tool will recommend one of these specialized tools:
• navigate_to_studyview   - for StudyView (cohort overview) pages
• navigate_to_patientview - for PatientView (individual patient) pages
• navigate_to_resultsview - for ResultsView (gene alteration analysis) pages

WORKFLOW EXAMPLE:
1. User: "Show me TP53 mutations in TCGA lung cancer"
2. AI calls: resolve_and_route(targetPage='results', studyKeywords=['TCGA', 'lung'])
3. Router returns: {
     status: 'success',
     recommendedTool: 'navigate_to_resultsview',
     resolvedStudyIds: ['luad_tcga', 'lusc_tcga'],
     message: 'Found 2 studies. Use navigate_to_resultsview with these studyIds.'
   }
4. AI calls: navigate_to_resultsview(studyIds=['luad_tcga', 'lusc_tcga'], genes=['TP53'])

PARAMETERS:
- targetPage: Which page type (study/patient/results)
- studyKeywords: Array of keywords to search for studies (e.g., ["TCGA", "lung"]) OR
- studyIds: Array of direct study IDs to validate (e.g., ["luad_tcga", "brca_tcga"])

For detailed information about parameters for each page type, please refer to
the documentation of the specific navigation tools after receiving the recommendation.`,
    inputSchema: {
        targetPage: z
            .enum(['study', 'patient', 'results'])
            .describe(
                'The type of cBioPortal page to navigate to (study/patient/results)'
            ),
        studyKeywords: z
            .array(z.string())
            .optional()
            .describe(
                'Keywords to search for studies (e.g., ["TCGA", "lung", "adenocarcinoma"])'
            ),
        studyIds: z
            .array(z.string())
            .optional()
            .describe(
                'Direct study IDs to validate (e.g., ["luad_tcga", "brca_tcga"]). Use this for cross-study queries.'
            ),
    },
};

// Infer type from Zod schema
type ToolInput = {
    targetPage: z.infer<typeof resolveAndRouteTool.inputSchema.targetPage>;
    studyKeywords?: z.infer<
        typeof resolveAndRouteTool.inputSchema.studyKeywords
    >;
    studyIds?: z.infer<typeof resolveAndRouteTool.inputSchema.studyIds>;
};

/**
 * Tool handler for MCP
 * Resolves studies and recommends the appropriate navigation tool
 */
export async function handleResolveAndRoute(
    input: ToolInput
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
        const result = await resolveAndRoute(input);
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(result, null, 2),
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
                    text: JSON.stringify(errorResponse, null, 2),
                },
            ],
        };
    }
}

/**
 * Main routing logic
 */
async function resolveAndRoute(params: ToolInput): Promise<ToolResponse> {
    const { targetPage, studyKeywords, studyIds } = params;

    // Validate input - must provide either studyKeywords or studyIds
    if (!studyKeywords && !studyIds) {
        return createErrorResponse(
            'Either studyKeywords or studyIds must be provided'
        );
    }

    let resolvedStudyIds: string[];

    // 1. Resolve or validate study IDs
    if (studyIds && studyIds.length > 0) {
        // Validate provided study IDs
        const validationResults = await Promise.all(
            studyIds.map(async (id) => ({
                id,
                valid: await studyResolver.validate(id),
            }))
        );

        const invalidIds = validationResults
            .filter((r) => !r.valid)
            .map((r) => r.id);

        if (invalidIds.length > 0) {
            return createErrorResponse(
                `Invalid study ID(s): ${invalidIds.join(', ')}`,
                { invalidIds, providedIds: studyIds }
            );
        }

        resolvedStudyIds = studyIds;
    } else if (studyKeywords && studyKeywords.length > 0) {
        // Search by keywords
        const matches = await studyResolver.search(studyKeywords);

        if (matches.length === 0) {
            return createErrorResponse('No matching studies found', {
                searchTerms: studyKeywords,
            });
        }

        if (matches.length > 1) {
            // Return options for user to choose
            return createAmbiguityResponse(
                'Multiple studies found. Please specify which one(s) to use by calling this tool again with studyIds parameter:',
                matches.map((s) => ({
                    studyId: s.studyId,
                    name: s.name,
                    description: s.description,
                    sampleCount: s.allSampleCount,
                }))
            );
        }

        resolvedStudyIds = [matches[0].studyId];
    } else {
        return createErrorResponse(
            'Either studyKeywords or studyIds must be provided'
        );
    }

    // 2. Determine recommended tool based on target page
    const toolMapping = {
        study: 'navigate_to_studyview',
        patient: 'navigate_to_patientview',
        results: 'navigate_to_resultsview',
    };

    const recommendedTool = toolMapping[targetPage];

    // 3. Get study details for metadata
    const studyDetails = await Promise.all(
        resolvedStudyIds.map((id) => studyResolver.getById(id))
    );

    // 4. Return success response with recommendation
    return createSuccessResponse(
        `Found ${resolvedStudyIds.length} study(ies). Please use the ${recommendedTool} tool with the resolved studyIds.`,
        {
            recommendedTool,
            resolvedStudyIds,
            studies: studyDetails.map((s) => ({
                studyId: s.studyId,
                name: s.name,
                sampleCount: s.allSampleCount,
            })),
        }
    );
}
