/**
 * Tool converter: Converts MCP tools to AI SDK format.
 *
 * This module provides the critical bridge between MCP tool definitions and
 * Vercel AI SDK tool format, enabling 100% reuse of existing tool logic.
 */

import { tool } from 'ai';
import { z } from 'zod';

// Import existing MCP tools
import {
    handleResolveAndRoute,
    resolveAndRouteTool,
} from '../../mcp/router.js';
import {
    handleNavigateToStudyView,
    navigateToStudyViewTool,
} from '../../studyView/mcp/tool.js';
import {
    handleNavigateToPatientView,
    navigateToPatientViewTool,
} from '../../patientView/mcp/tool.js';
import {
    handleNavigateToResultsView,
    navigateToResultsViewTool,
} from '../../resultsView/mcp/tool.js';

/**
 * MCP Tool definition structure
 */
interface MCPTool {
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, z.ZodTypeAny>;
    handler: (
        input: any
    ) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

/**
 * Convert MCP tool to AI SDK tool format using tool() helper
 */
function convertMCPToolToAISDK(mcpTool: MCPTool) {
    // Use the Zod object directly - AI SDK supports Zod schemas
    const zodObject = z.object(mcpTool.inputSchema);

    // Use AI SDK's tool() helper for proper schema conversion
    return tool({
        title: mcpTool.title,
        description: mcpTool.description,
        inputSchema: zodObject,
        execute: async (args) => {
            try {
                // Call existing MCP handler (zero duplication!)
                const mcpResult = await mcpTool.handler(args);

                // Extract text content from MCP response format and return as string for AI SDK
                return mcpResult.content
                    .filter((c) => c.type === 'text')
                    .map((c) => c.text)
                    .join('\n');
            } catch (error) {
                console.error(`Tool ${mcpTool.name} execution failed:`, error);
                // Return error as tool result so LLM can see it
                return `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
            }
        },
    });
}

/**
 * Get all MCP tools in AI SDK format
 */
export function getAllTools(): Record<string, any> {
    const mcpTools: MCPTool[] = [
        {
            ...resolveAndRouteTool,
            handler: handleResolveAndRoute,
        },
        {
            ...navigateToStudyViewTool,
            handler: handleNavigateToStudyView,
        },
        {
            ...navigateToPatientViewTool,
            handler: handleNavigateToPatientView,
        },
        {
            ...navigateToResultsViewTool,
            handler: handleNavigateToResultsView,
        },
    ];

    return Object.fromEntries(
        mcpTools.map((tool) => [tool.name, convertMCPToolToAISDK(tool)])
    );
}
