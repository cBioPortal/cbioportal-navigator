/**
 * MCP Tools Loader - Global Singleton
 *
 * The MCP client stays alive for the lifetime of the server and is reused across all requests.
 * This prevents "closed client" errors during tool execution.
 */
import { createMCPClientSession } from './client.js';

/**
 * Global MCP client instance (shared across all requests)
 */
let globalMCPClient: any = null;
let globalTools: Record<string, any> | null = null;

/**
 * Initialize global MCP client (called once on first request)
 */
async function initializeMCPClient() {
    if (globalMCPClient) {
        return; // Already initialized
    }

    const startTime = performance.now();
    globalMCPClient = await createMCPClientSession();
    const connectTime = performance.now();

    globalTools = await globalMCPClient.tools();
    const toolsTime = performance.now();

    console.log('[MCP Client] Initialized (global singleton)');
    console.log('[MCP]', {
        connection: `${(connectTime - startTime).toFixed(2)}ms`,
        tools: `${(toolsTime - connectTime).toFixed(2)}ms`,
        count: Object.keys(globalTools).length,
    });
}

/**
 * Get MCP tools (lazy initialization, with error recovery)
 */
export async function getMCPTools(): Promise<Record<string, any>> {
    try {
        await initializeMCPClient();
        return globalTools!;
    } catch (error) {
        // If initialization fails, reset state to allow retry
        console.error('[MCP Client] Initialization failed:', error);
        globalMCPClient = null;
        globalTools = null;
        throw error;
    }
}

/**
 * Reset global MCP client (called when connection errors detected)
 * Next getMCPTools() call will reconnect automatically
 */
export function resetMCPClient() {
    console.warn(
        '[MCP Client] Resetting connection (will reconnect on next request)'
    );
    if (globalMCPClient) {
        globalMCPClient.close().catch(() => {});
    }
    globalMCPClient = null;
    globalTools = null;
}

/**
 * Close global MCP client (called on server shutdown)
 */
export async function closeMCPClient() {
    if (globalMCPClient) {
        await globalMCPClient.close();
        globalMCPClient = null;
        globalTools = null;
        console.log('[MCP Client] Closed');
    }
}
