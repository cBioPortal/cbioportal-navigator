/**
 * Error handling utilities for chat completions endpoint.
 */

export class ChatCompletionError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public details?: any
    ) {
        super(message);
        this.name = 'ChatCompletionError';
    }
}

export function createErrorResponse(message: string, details?: any) {
    return {
        error: {
            message,
            type: 'chat_completion_error',
            details,
        },
    };
}

export class InvalidAPIKeyError extends ChatCompletionError {
    constructor(provider: string) {
        super(`Invalid or missing API key for provider: ${provider}`, 401);
    }
}

export class UnsupportedProviderError extends ChatCompletionError {
    constructor(provider: string) {
        super(
            `Unsupported provider: ${provider}. Supported: anthropic, google, openai`,
            400
        );
    }
}

export class ToolExecutionError extends ChatCompletionError {
    constructor(toolName: string, originalError: any) {
        super(`Tool execution failed: ${toolName}`, 500, {
            toolName,
            originalError: originalError?.message,
        });
    }
}
