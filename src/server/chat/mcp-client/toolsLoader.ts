/**
 * MCP Tools Loader - Per-Request Mode
 *
 * Each request creates a new MCP client and closes it after use.
 * This prevents connection issues and follows the same pattern as the /mcp endpoint.
 */
import { createMCPClientSession } from './client.js';

/**
 * MCP Client wrapper with tools
 */
export interface MCPClientWithTools {
    client: any;
    tools: Record<string, any>;
}

/**
 * Create a new MCP client and load tools for this request
 *
 * IMPORTANT: The returned client MUST be closed after the request completes
 * to avoid resource leaks. Use try/finally to ensure cleanup.
 */
export async function createMCPClientWithTools(): Promise<MCPClientWithTools> {
    const startTime = performance.now();

    try {
        // Create new client for this request
        const client = await createMCPClientSession();
        const connectTime = performance.now();

        // Load tools from MCP server
        const tools = await client.tools();
        const toolsTime = performance.now();

        console.log('[MCP Client] Created for request', {
            connection: `${(connectTime - startTime).toFixed(2)}ms`,
            tools: `${(toolsTime - connectTime).toFixed(2)}ms`,
            count: Object.keys(tools).length,
        });

        return { client, tools };
    } catch (error) {
        console.error('[MCP Client] Failed to create client:', error);
        throw error;
    }
}

/**
 * Safely close MCP client after request completes
 *
 * This should be called in a finally block to ensure cleanup
 * even if the request throws an error.
 */
export async function closeMCPClient(client: any): Promise<void> {
    if (client) {
        try {
            await client.close();
            console.log('[MCP Client] Closed after request');
        } catch (error) {
            // Ignore errors during cleanup
            console.warn('[MCP Client] Error during close (ignored):', error);
        }
    }
}
