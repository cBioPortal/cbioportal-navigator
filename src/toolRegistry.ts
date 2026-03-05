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
} from './tools/resolveAndRoute.js';
import {
    navigateToStudyViewTool,
    handleNavigateToStudyView,
} from './tools/navigateToStudyView.js';
import {
    navigateToPatientViewTool,
    handleNavigateToPatientView,
} from './tools/navigateToPatientView.js';
import {
    navigateToResultsViewTool,
    handleNavigateToResultsView,
} from './tools/navigateToResultsView.js';
import {
    getStudyviewfilterOptionsTool,
    handleGetStudyviewfilterOptions,
} from './tools/getStudyviewfilterOptions.js';
import {
    navigateToGroupComparisonTool,
    handleNavigateToGroupComparison,
} from './tools/navigateToGroupComparison.js';

/**
 * Register all MCP tools with the server.
 *
 * @param server - The MCP server instance
 */
export function registerTools(server: McpServer): void {
    server.registerTool(
        resolveAndRouteTool.name,
        {
            title: resolveAndRouteTool.title,
            description: resolveAndRouteTool.description,
            inputSchema: resolveAndRouteTool.inputSchema,
        },
        handleResolveAndRoute
    );

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
        getStudyviewfilterOptionsTool.name,
        {
            title: getStudyviewfilterOptionsTool.title,
            description: getStudyviewfilterOptionsTool.description,
            inputSchema: getStudyviewfilterOptionsTool.inputSchema,
        },
        handleGetStudyviewfilterOptions
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
