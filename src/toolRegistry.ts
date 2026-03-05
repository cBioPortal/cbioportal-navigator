/**
 * MCP Tools Registry.
 *
 * Central registration point for all MCP tools in the cBioPortal Navigator.
 * This module imports all tool definitions and registers them with the MCP server.
 *
 * Must be called after initPrompts() so that prompt content is available.
 *
 * @packageDocumentation
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    createResolveAndRouteTool,
    handleResolveAndRoute,
} from './tools/resolveAndRoute.js';
import {
    createNavigateToStudyViewTool,
    handleNavigateToStudyView,
} from './tools/navigateToStudyView.js';
import {
    createNavigateToPatientViewTool,
    handleNavigateToPatientView,
} from './tools/navigateToPatientView.js';
import {
    createNavigateToResultsViewTool,
    handleNavigateToResultsView,
} from './tools/navigateToResultsView.js';
import {
    createGetStudyviewfilterOptionsTool,
    handleGetStudyviewfilterOptions,
} from './tools/getStudyviewfilterOptions.js';
import {
    createNavigateToGroupComparisonTool,
    handleNavigateToGroupComparison,
} from './tools/navigateToGroupComparison.js';

/**
 * Register all MCP tools with the server.
 *
 * @param server - The MCP server instance
 */
export function registerTools(server: McpServer): void {
    const tools = [
        { create: createResolveAndRouteTool, handler: handleResolveAndRoute },
        {
            create: createNavigateToStudyViewTool,
            handler: handleNavigateToStudyView,
        },
        {
            create: createNavigateToPatientViewTool,
            handler: handleNavigateToPatientView,
        },
        {
            create: createNavigateToResultsViewTool,
            handler: handleNavigateToResultsView,
        },
        {
            create: createGetStudyviewfilterOptionsTool,
            handler: handleGetStudyviewfilterOptions,
        },
        {
            create: createNavigateToGroupComparisonTool,
            handler: handleNavigateToGroupComparison,
        },
    ];

    for (const { create, handler } of tools) {
        const tool = create();
        server.registerTool(
            tool.name,
            {
                title: tool.title,
                description: tool.description,
                inputSchema: tool.inputSchema,
            },
            handler
        );
    }
}
