/**
 * MCP Tools Registry.
 *
 * Central registration point for all MCP tools in the cBioPortal Navigator.
 * This module imports all tool definitions and registers them with the MCP server.
 *
 * @packageDocumentation
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveAndRouteTool, handleResolveAndRoute } from './router.js';
import {
    navigateToStudyViewTool,
    handleNavigateToStudyView,
} from '../studyView/mcp/tool.js';
import {
    navigateToPatientViewTool,
    handleNavigateToPatientView,
} from '../patientView/mcp/tool.js';
import {
    navigateToResultsViewTool,
    handleNavigateToResultsView,
} from '../resultsView/mcp/tool.js';

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
}
