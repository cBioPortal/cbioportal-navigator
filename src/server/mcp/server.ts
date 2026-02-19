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
 * - `resolve_and_route`: Main router that delegates to specialized tools (includes filter metadata)
 * - `navigate_to_study_view`: StudyView navigation
 * - `navigate_to_patient_view`: PatientView navigation
 * - `navigate_to_results_view`: ResultsView/OncoPrint navigation
 * - `get_studyviewfilter_options`: Get clinical attribute values / generic assay entities for filtering (on-demand)
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

    // Resources removed - replaced by router metadata + get_studyviewfilter_options tool
    // This provides better UX for Chat Completions API (lightweight, on-demand fetching)

    return server;
}
