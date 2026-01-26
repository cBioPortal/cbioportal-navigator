/**
 * MCP Tools Registry.
 *
 * Central registration point for all MCP tools in the cBioPortal Navigator.
 * This module imports all tool definitions and registers them with the MCP server.
 *
 * @packageDocumentation
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    resolveAndRouteTool,
    handleResolveAndRoute,
} from '../../domain/router/resolveAndRoute.js';
import {
    navigateToStudyViewTool,
    handleNavigateToStudyView,
} from '../../domain/studyView/navigateToStudyView.js';
import {
    navigateToPatientViewTool,
    handleNavigateToPatientView,
} from '../../domain/patientView/navigateToPatientView.js';
import {
    navigateToResultsViewTool,
    handleNavigateToResultsView,
} from '../../domain/resultsView/navigateToResultsView.js';
import {
    getClinicalAttributeValuesTool,
    handleGetClinicalAttributeValues,
} from '../../domain/studyView/getClinicalAttributeValues.js';
import {
    navigateToGroupComparisonTool,
    handleNavigateToGroupComparison,
} from '../../domain/groupComparison/navigateToGroupComparison.js';

/**
 * Register all MCP tools with the server.
 *
 * This function is called during server initialization to make tools
 * available to MCP clients.
 *
 * @param server - The MCP server instance
 */
export function registerTools(server: McpServer): void {
    // Register the main router tool
    server.registerTool(
        resolveAndRouteTool.name,
        {
            title: resolveAndRouteTool.title,
            description: resolveAndRouteTool.description,
            inputSchema: resolveAndRouteTool.inputSchema,
        },
        handleResolveAndRoute
    );

    // Register specialized navigation tools
    server.registerTool(
        navigateToStudyViewTool.name,
        {
            title: navigateToStudyViewTool.title,
            description: navigateToStudyViewTool.description,
            inputSchema: navigateToStudyViewTool.inputSchema,
        },
        handleNavigateToStudyView
    );

    server.registerTool(
        navigateToPatientViewTool.name,
        {
            title: navigateToPatientViewTool.title,
            description: navigateToPatientViewTool.description,
            inputSchema: navigateToPatientViewTool.inputSchema,
        },
        handleNavigateToPatientView
    );

    server.registerTool(
        navigateToResultsViewTool.name,
        {
            title: navigateToResultsViewTool.title,
            description: navigateToResultsViewTool.description,
            inputSchema: navigateToResultsViewTool.inputSchema,
        },
        handleNavigateToResultsView
    );

    server.registerTool(
        getClinicalAttributeValuesTool.name,
        {
            title: getClinicalAttributeValuesTool.title,
            description: getClinicalAttributeValuesTool.description,
            inputSchema: getClinicalAttributeValuesTool.inputSchema,
        },
        handleGetClinicalAttributeValues
    );

    server.registerTool(
        navigateToGroupComparisonTool.name,
        {
            title: navigateToGroupComparisonTool.title,
            description: navigateToGroupComparisonTool.description,
            inputSchema: navigateToGroupComparisonTool.inputSchema,
        },
        handleNavigateToGroupComparison
    );
}
