/**
 * MCP Tools Loader
 */
import { createMCPClientSession } from './client.js';

/**
 * Load tools from MCP server
 */
export async function getMCPTools(): Promise<Record<string, any>> {
    const startTime = performance.now();

    const mcpClient = await createMCPClientSession();
    const connectTime = performance.now();

    try {
        const tools = await mcpClient.tools();
        const toolsTime = performance.now();

        console.log('[MCP]', {
            connection: `${(connectTime - startTime).toFixed(2)}ms`,
            tools: `${(toolsTime - connectTime).toFixed(2)}ms`,
            count: Object.keys(tools).length,
        });

        return tools;
    } finally {
        await mcpClient.close();
    }
}
