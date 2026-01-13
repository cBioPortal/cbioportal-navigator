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
 * Registered resources:
 * - `cbioportal://study/{studyId}/filters/clinical-attributes`: Clinical attributes metadata
 * - `cbioportal://study/{studyId}/filters/case-lists`: Case lists metadata
 * - `cbioportal://study/{studyId}/filters/molecular-profiles`: Molecular profiles metadata
 *
 * Architecture:
 * The server is stateless and can be instantiated per-request (HTTP mode) or
 * as a long-lived instance (stdio mode). Each tool registration includes its
 * name, schema, and handler function.
 *
 * @packageDocumentation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './toolRegistry.js';
import { registerResources } from './resourceRegistry.js';

/**
 * Create and configure MCP server with all tools and resources registered
 */
export function createMcpServer(): McpServer {
    const server = new McpServer({
        name: 'cbioportal-navigator',
        version: '1.0.0',
    });

    // Register all tools
    registerTools(server);

    // Register all resources
    registerResources(server);

    return server;
}
