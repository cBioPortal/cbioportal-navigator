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
    navigateToStudyViewPageTool,
    handleNavigateToStudyViewPage,
} from '../../domain/studyViewPage/navigateToStudyView.js';
import {
    navigateToPatientViewPageTool,
    handleNavigateToPatientViewPage,
} from '../../domain/patientViewPage/navigateToPatientView.js';
import {
    navigateToResultsViewPageTool,
    handleNavigateToResultsViewPage,
} from '../../domain/resultsViewPage/navigateToResultsView.js';
import {
    getClinicalAttributeValuesTool,
    handleGetClinicalAttributeValues,
} from '../../domain/studyViewPage/getClinicalAttributeValues.js';

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
        navigateToStudyViewPageTool.name,
        {
            title: navigateToStudyViewPageTool.title,
            description: navigateToStudyViewPageTool.description,
            inputSchema: navigateToStudyViewPageTool.inputSchema,
        },
        handleNavigateToStudyViewPage
    );

    server.registerTool(
        navigateToPatientViewPageTool.name,
        {
            title: navigateToPatientViewPageTool.title,
            description: navigateToPatientViewPageTool.description,
            inputSchema: navigateToPatientViewPageTool.inputSchema,
        },
        handleNavigateToPatientViewPage
    );

    server.registerTool(
        navigateToResultsViewPageTool.name,
        {
            title: navigateToResultsViewPageTool.title,
            description: navigateToResultsViewPageTool.description,
            inputSchema: navigateToResultsViewPageTool.inputSchema,
        },
        handleNavigateToResultsViewPage
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
}
