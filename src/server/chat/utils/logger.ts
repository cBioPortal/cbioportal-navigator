/**
 * Structured logger for chat completions
 */

export class RequestLogger {
    private requestId: string;
    private startTime: number;

    constructor(requestId: string) {
        this.requestId = requestId;
        this.startTime = performance.now();
    }

    /**
     * Log request start with user messages
     */
    logRequest(params: {
        model: string;
        provider: string;
        messages: any[];
        stream: boolean;
    }) {
        const userMessages = params.messages.filter(
            (m) => m.role === 'user' || m.role === 'system'
        );

        console.log('\n' + '='.repeat(80));
        console.log(`[Request ${this.requestId}] START`);
        console.log('─'.repeat(80));
        console.log('Model:', params.model);
        console.log('Provider:', params.provider);
        console.log('Streaming:', params.stream);
        console.log('Messages:');
        userMessages.forEach((msg, idx) => {
            console.log(`  [${idx + 1}] ${msg.role}:`);
            const content =
                typeof msg.content === 'string'
                    ? msg.content
                    : JSON.stringify(msg.content);
            // Truncate long messages for readability
            const truncated =
                content.length > 500
                    ? content.substring(0, 500) + '... (truncated)'
                    : content;
            console.log(`      ${truncated}`);
        });
        console.log('─'.repeat(80));
    }

    /**
     * Log MCP tools loading
     */
    logToolsLoaded(tools: Record<string, any>) {
        console.log(`[Request ${this.requestId}] MCP Tools Loaded:`);
        Object.keys(tools).forEach((name) => {
            console.log(`  - ${name}`);
        });
    }

    /**
     * Log tool call
     */
    logToolCall(params: { toolName: string; toolCallId: string; input: any }) {
        console.log('\n' + '─'.repeat(80));
        console.log(
            `[Request ${this.requestId}] TOOL CALL: ${params.toolName}`
        );
        console.log(`ID: ${params.toolCallId}`);
        console.log('Input:');
        console.log(JSON.stringify(params.input, null, 2));
    }

    /**
     * Log tool result
     */
    logToolResult(params: {
        toolName: string;
        toolCallId: string;
        result: any;
        durationMs?: number;
    }) {
        console.log(
            `[Request ${this.requestId}] TOOL RESULT: ${params.toolName}`
        );
        console.log(`ID: ${params.toolCallId}`);
        if (params.durationMs !== undefined) {
            console.log(`Duration: ${params.durationMs.toFixed(2)}ms`);
        }
        console.log('Result:');
        const resultStr =
            typeof params.result === 'string'
                ? params.result
                : JSON.stringify(params.result, null, 2);
        // Truncate long results
        const truncated =
            resultStr.length > 1000
                ? resultStr.substring(0, 1000) + '... (truncated)'
                : resultStr;
        console.log(truncated);
        console.log('─'.repeat(80));
    }

    /**
     * Log MCP resources access (if used)
     */
    logResourceAccess(params: { uri: string; content?: any }) {
        console.log(`[Request ${this.requestId}] MCP RESOURCE: ${params.uri}`);
        if (params.content) {
            const contentStr =
                typeof params.content === 'string'
                    ? params.content
                    : JSON.stringify(params.content, null, 2);
            const truncated =
                contentStr.length > 500
                    ? contentStr.substring(0, 500) + '... (truncated)'
                    : contentStr;
            console.log('Content:', truncated);
        }
    }

    /**
     * Log final AI response
     */
    logResponse(params: {
        content: string;
        finishReason: string;
        toolCallsCount?: number;
    }) {
        console.log('\n' + '─'.repeat(80));
        console.log(`[Request ${this.requestId}] AI RESPONSE:`);
        console.log('Finish Reason:', params.finishReason);
        if (params.toolCallsCount) {
            console.log('Tool Calls Made:', params.toolCallsCount);
        }
        console.log('Content:');
        // Truncate long responses
        const truncated =
            params.content.length > 1000
                ? params.content.substring(0, 1000) + '... (truncated)'
                : params.content;
        console.log(truncated);
        console.log('─'.repeat(80));
    }

    /**
     * Log request completion with stats
     */
    logComplete(params: {
        usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
        };
        error?: string;
    }) {
        const duration = performance.now() - this.startTime;

        console.log('\n' + '='.repeat(80));
        console.log(
            `[Request ${this.requestId}] ${params.error ? 'ERROR' : 'COMPLETE'}`
        );
        console.log('─'.repeat(80));
        console.log(`Duration: ${duration.toFixed(2)}ms`);

        if (params.usage) {
            console.log('Token Usage:');
            console.log(`  Prompt: ${params.usage.prompt_tokens}`);
            console.log(`  Completion: ${params.usage.completion_tokens}`);
            console.log(`  Total: ${params.usage.total_tokens}`);
        }

        if (params.error) {
            console.log('Error:', params.error);
        }

        console.log('='.repeat(80) + '\n');
    }

    /**
     * Get elapsed time
     */
    getElapsedMs(): number {
        return performance.now() - this.startTime;
    }
}

/**
 * Generate unique request ID
 */
export function generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
