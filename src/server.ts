/**
 * MCP server factory and tool registration hub.
 *
 * This module creates and configures the MCP server instance by registering
 * all available navigation tools. It acts as the central configuration point
 * connecting the MCP protocol layer with the cBioPortal navigation tools.
 *
 * @remarks
 * Key exports:
 * - `createMcpServer()`: Factory function that returns a configured McpServer instance
 *
 * Registered tools:
 * - `resolve_and_route`: Main router that delegates to specialized tools
 * - `navigate_to_studyview`: Study overview page navigation
 * - `navigate_to_patientview`: Patient detail page navigation
 * - `navigate_to_resultsview`: Results/OncoPrint page navigation
 *
 * Architecture:
 * The server is stateless and can be instantiated per-request (HTTP mode) or
 * as a long-lived instance (stdio mode). Each tool registration includes its
 * name, schema, and handler function.
 *
 * @packageDocumentation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

    return server;
}
