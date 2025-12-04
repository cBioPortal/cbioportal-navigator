/**
 * Main router MCP tool that delegates to specialized navigation tools.
 *
 * This tool acts as the primary entry point for cBioPortal navigation,
 * analyzing user intent to determine the appropriate target page type
 * (study, patient, or results) and routing the request to the corresponding
 * specialized tool. It includes comprehensive documentation to guide AI
 * assistants in choosing the correct page type based on user queries.
 *
 * @remarks
 * Key exports:
 * - `routeToTargetPageTool`: Tool definition with detailed routing guidance
 * - `handleRouteToTargetPage()`: Handler that delegates to specialized tools
 *
 * Routing logic:
 * - targetPage='study' → delegates to navigateToStudyView (cohort overview)
 * - targetPage='patient' → delegates to navigateToPatientView (individual patient)
 * - targetPage='results' → delegates to navigateToResultsView (gene analysis)
 *
 * The tool provides extensive inline documentation explaining when to use each
 * page type, including use cases, example queries, and key features for each.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { handleNavigateToStudyView } from './navigateToStudyView.js';
import { handleNavigateToPatientView } from './navigateToPatientView.js';
import { handleNavigateToResultsView } from './navigateToResultsView.js';

/**
 * Tool definition for MCP registration
 */
export const routeToTargetPageTool = {
    name: 'route_to_target_page',
    title: 'cBioPortal Page Router',
    description: `Main router tool for navigating to cBioPortal pages.

This tool helps you choose the right cBioPortal page based on user intent and routes
the request to the appropriate specialized navigation tool.

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

This tool will route your request to:
• navigate_to_studyview   - for StudyView (cohort overview) pages
• navigate_to_patientview - for PatientView (individual patient) pages
• navigate_to_resultsview - for ResultsView (gene alteration analysis) pages

You can also call those specialized tools directly if you prefer.

For detailed information about parameters for each page type, please refer to
the documentation of the specific navigation tools.`,
    inputSchema: {
        targetPage: z
            .enum(['study', 'patient', 'results'])
            .describe(
                'The type of cBioPortal page to navigate to (study/patient/results)'
            ),
        parameters: z
            .record(z.any())
            .describe(
                'Page-specific parameters (see individual navigation tool schemas for details)'
            ),
    },
};

// Infer type from Zod schema
type ToolInput = {
    targetPage: z.infer<typeof routeToTargetPageTool.inputSchema.targetPage>;
    parameters: z.infer<typeof routeToTargetPageTool.inputSchema.parameters>;
};

/**
 * Tool handler for MCP
 * Routes to appropriate navigation tool based on targetPage
 */
export async function handleRouteToTargetPage(input: ToolInput) {
    const { targetPage, parameters } = input;

    // Route to appropriate specialized tool
    // We cast parameters as any since the specific tool will validate them
    switch (targetPage) {
        case 'study':
            return await handleNavigateToStudyView(parameters as any);
        case 'patient':
            return await handleNavigateToPatientView(parameters as any);
        case 'results':
            return await handleNavigateToResultsView(parameters as any);
        default:
            // This should never happen due to Zod validation
            throw new Error(`Unknown target page: ${targetPage}`);
    }
}
