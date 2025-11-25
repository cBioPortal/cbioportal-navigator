/**
 * cBioPortal Navigator - MCP Server
 * Creates MCP server instance with registered tools
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    routeToTargetPageTool,
    handleRouteToTargetPage,
} from './tools/routeToTargetPage.js';
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

/**
 * Create and configure MCP server with all tools registered
 */
export function createMcpServer(): McpServer {
    const server = new McpServer({
        name: 'cbioportal-navigator',
        version: '1.0.0',
    });

    // Register the main router tool
    server.registerTool(
        routeToTargetPageTool.name,
        {
            title: routeToTargetPageTool.title,
            description: routeToTargetPageTool.description,
            inputSchema: routeToTargetPageTool.inputSchema,
        },
        handleRouteToTargetPage
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

    return server;
}
