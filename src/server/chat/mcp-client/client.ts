/**
 * MCP client configuration and lifecycle management
 */
import { createMCPClient } from '@ai-sdk/mcp';

/**
 * Get MCP server URL based on environment
 */
function getMCPServerURL(): string {
    // Use environment variable if set
    if (process.env.MCP_SERVER_URL) {
        return process.env.MCP_SERVER_URL;
    }

    // Docker environment
    if (process.env.DOCKER_ENV === 'true') {
        return 'http://localhost:8002/mcp';
    }

    // Local development
    return 'http://localhost:8002/mcp';
}

/**
 * Create MCP client session
 */
export async function createMCPClientSession() {
    const url = getMCPServerURL();

    const client = await createMCPClient({
        transport: {
            type: 'http',
            url,
        },
        name: 'chat-completions-client',
        onUncaughtError: (error) => {
            console.error('[MCP Client] Uncaught error:', error);
        },
    });

    return client;
}
