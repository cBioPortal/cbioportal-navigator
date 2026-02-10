/**
 * Main handler for chat completions endpoint.
 *
 * Handles both streaming and non-streaming chat completion requests.
 */

import { generateText, streamText, stepCountIs } from 'ai';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { chatCompletionRequestSchema } from './schemas.js';
import { createProvider } from './providerFactory.js';
import { createMCPClientWithTools, closeMCPClient } from './toolsLoader.js';
import { DEFAULT_SYSTEM_PROMPT, CONFIG } from './defaults.js';
import { ChatCompletionError, createErrorResponse } from './errors.js';
import { RequestLogger, generateRequestId } from './logger.js';
import type { Provider } from './providerTypes.js';

/**
 * Detect provider from model name
 */
function detectProvider(model: string, requestProvider?: Provider): Provider {
    if (requestProvider) {
        return requestProvider;
    }

    // Pattern matching
    if (/^claude-/.test(model)) return 'anthropic';
    if (/^gemini-/.test(model)) return 'google';
    if (/^gpt-/.test(model)) return 'openai';

    // Default to openai for unknown models
    return 'openai';
}

/**
 * Main handler for chat completion requests
 */
export async function handleChatCompletion(req: Request, res: Response) {
    const requestId = generateRequestId();
    const logger = new RequestLogger(requestId);
    let mcpClient: any = null;

    try {
        // 1. Validate request
        const requestData = chatCompletionRequestSchema.parse(req.body);

        // 2. Detect provider
        const provider = detectProvider(
            requestData.model,
            requestData.provider
        );

        // 3. Create provider instance
        const model = createProvider(
            requestData,
            req.headers as Record<string, string>
        );

        // 4. Log request
        logger.logRequest({
            model: requestData.model,
            provider,
            messages: requestData.messages,
            stream: requestData.stream ?? false,
        });

        // 5. Create MCP client and get tools for this request
        const { client, tools } = await createMCPClientWithTools();
        mcpClient = client; // Store for cleanup in finally block
        logger.logToolsLoaded(tools);

        // 6. Prepare messages (inject system prompt if not present)
        const messages = [...requestData.messages]; // Clone to avoid mutation
        if (!messages.some((m) => m.role === 'system')) {
            messages.unshift({
                role: 'system',
                content: DEFAULT_SYSTEM_PROMPT,
            });
        }

        // 7. Execute (streaming or non-streaming)
        // Tools will be executed during generateText/streamText
        // Client will be closed in finally block after completion
        if (requestData.stream) {
            return await handleStreaming(res, {
                model,
                messages,
                tools,
                requestData,
                logger,
            });
        } else {
            return await handleNonStreaming(res, {
                model,
                messages,
                tools,
                requestData,
                logger,
            });
        }
    } catch (error) {
        console.error('Chat completion error:', error);
        logger.logComplete({
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (error instanceof ZodError) {
            return res
                .status(400)
                .json(createErrorResponse('Invalid request', error.issues));
        }

        if (error instanceof ChatCompletionError) {
            return res
                .status(error.statusCode)
                .json(createErrorResponse(error.message, error.details));
        }

        return res
            .status(500)
            .json(createErrorResponse('Internal server error'));
    } finally {
        // CRITICAL: Close MCP client after request completes
        // This executes after generateText/streamText finishes,
        // ensuring all tool calls have completed
        await closeMCPClient(mcpClient);
    }
}

/**
 * Handle non-streaming response
 */
async function handleNonStreaming(
    res: Response,
    params: {
        model: any;
        messages: any[];
        tools: Record<string, any>;
        requestData: any;
        logger: RequestLogger;
    }
) {
    const { model, messages, tools, requestData, logger } = params;

    try {
        // AI SDK automatically handles multi-turn tool calling
        const result = await generateText({
            model,
            messages,
            tools,
            stopWhen: stepCountIs(CONFIG.maxSteps),
            temperature: requestData.temperature ?? CONFIG.defaultTemperature,
            ...(requestData.max_tokens && {
                maxOutputTokens: requestData.max_tokens,
            }),
            topP: requestData.top_p,
            ...(requestData.stop && {
                stopSequences: Array.isArray(requestData.stop)
                    ? requestData.stop
                    : [requestData.stop],
            }),
        });

        // Log tool calls and results
        if (result.steps) {
            for (const step of result.steps) {
                if (step.toolCalls) {
                    for (const tc of step.toolCalls) {
                        logger.logToolCall({
                            toolName: tc.toolName,
                            toolCallId: tc.toolCallId,
                            input: tc.input,
                        });
                    }
                }
                if (step.toolResults) {
                    for (const tr of step.toolResults) {
                        logger.logToolResult({
                            toolName: tr.toolName,
                            toolCallId: tr.toolCallId,
                            result: tr.output,
                        });
                    }
                }
            }
        }

        // Convert to OpenAI format with tool call visibility
        const response = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model.modelId,
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: result.text,
                        // Include tool calls for transparency (OpenAI-compatible)
                        tool_calls:
                            result.steps
                                ?.flatMap((step) =>
                                    step.toolCalls?.map((tc) => ({
                                        id: tc.toolCallId,
                                        type: 'function' as const,
                                        function: {
                                            name: tc.toolName,
                                            arguments: JSON.stringify(tc.input),
                                        },
                                    }))
                                )
                                .filter(Boolean) || null,
                    },
                    finish_reason: result.finishReason || 'stop',
                },
            ],
            usage: {
                prompt_tokens: result.usage?.inputTokens || 0,
                completion_tokens: result.usage?.outputTokens || 0,
                total_tokens:
                    (result.usage?.inputTokens || 0) +
                    (result.usage?.outputTokens || 0),
            },
        };

        // Log AI response
        const toolCallsCount = result.steps?.reduce(
            (count, step) => count + (step.toolCalls?.length || 0),
            0
        );
        logger.logResponse({
            content: result.text,
            finishReason: result.finishReason || 'stop',
            toolCallsCount,
        });

        // Log completion with usage stats
        logger.logComplete({
            usage: response.usage,
        });

        return res.json(response);
    } catch (error) {
        console.error('Text generation error:', error);
        throw new ChatCompletionError(
            error instanceof Error ? error.message : 'Text generation failed'
        );
    }
}

/**
 * Handle streaming response (SSE)
 */
async function handleStreaming(
    res: Response,
    params: {
        model: any;
        messages: any[];
        tools: Record<string, any>;
        requestData: any;
        logger: RequestLogger;
    }
) {
    const { model, messages, tools, requestData, logger } = params;

    try {
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const streamResult = streamText({
            model,
            messages,
            tools,
            stopWhen: stepCountIs(CONFIG.maxSteps),
            temperature: requestData.temperature ?? CONFIG.defaultTemperature,
            ...(requestData.max_tokens && {
                maxOutputTokens: requestData.max_tokens,
            }),
            topP: requestData.top_p,
            ...(requestData.stop && {
                stopSequences: Array.isArray(requestData.stop)
                    ? requestData.stop
                    : [requestData.stop],
            }),
        });

        // Track accumulated text for logging
        let accumulatedText = '';
        let toolCallsCount = 0;

        // Use fullStream to get both text and tool call events
        for await (const delta of streamResult.fullStream) {
            if (delta.type === 'text-delta') {
                // Accumulate text for logging
                accumulatedText += delta.text;

                // Text content
                const sseChunk = {
                    id: `chatcmpl-${Date.now()}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model: model.modelId,
                    choices: [
                        {
                            index: 0,
                            delta: { content: delta.text },
                            finish_reason: null,
                        },
                    ],
                };
                res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
            }

            if (delta.type === 'tool-call') {
                // Count tool calls
                toolCallsCount++;

                // Log tool call
                logger.logToolCall({
                    toolName: delta.toolName,
                    toolCallId: delta.toolCallId,
                    input: delta.input,
                });

                // Tool call with complete arguments
                const toolCallChunk = {
                    id: `chatcmpl-${Date.now()}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model: model.modelId,
                    choices: [
                        {
                            index: 0,
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: delta.toolCallId,
                                        type: 'function' as const,
                                        function: {
                                            name: delta.toolName,
                                            arguments: JSON.stringify(
                                                delta.input
                                            ),
                                        },
                                    },
                                ],
                            },
                            finish_reason: null,
                        },
                    ],
                };
                res.write(`data: ${JSON.stringify(toolCallChunk)}\n\n`);
            }

            if (delta.type === 'tool-result') {
                // Log tool result
                logger.logToolResult({
                    toolName: delta.toolName,
                    toolCallId: delta.toolCallId,
                    result: delta.output,
                });
            }

            if (delta.type === 'tool-error') {
                console.error('[Tool Error]', {
                    toolName: delta.toolName,
                    toolCallId: delta.toolCallId,
                    error: delta.error,
                });
            }
        }

        // Get final result to obtain finishReason and usage
        const finalResult = await streamResult;
        const finishReason = (await finalResult.finishReason) || 'stop';
        const usageData = await finalResult.usage;

        // Log AI response
        logger.logResponse({
            content: accumulatedText,
            finishReason,
            toolCallsCount: toolCallsCount > 0 ? toolCallsCount : undefined,
        });

        // Log completion with usage stats
        const usage = usageData
            ? {
                  prompt_tokens: usageData.inputTokens || 0,
                  completion_tokens: usageData.outputTokens || 0,
                  total_tokens:
                      (usageData.inputTokens || 0) +
                      (usageData.outputTokens || 0),
              }
            : undefined;
        logger.logComplete({ usage });

        // Send final chunk with finish_reason
        const finalChunk = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model.modelId,
            choices: [
                {
                    index: 0,
                    delta: {},
                    finish_reason: finishReason,
                },
            ],
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);

        // Send [DONE]
        res.write(`data: [DONE]\n\n`);
        res.end();
    } catch (error) {
        console.error('Streaming error:', error);
        logger.logComplete({
            error: error instanceof Error ? error.message : 'Streaming failed',
        });

        if (!res.headersSent) {
            throw new ChatCompletionError(
                error instanceof Error ? error.message : 'Streaming failed'
            );
        }
        // If headers already sent, just end the stream
        res.end();
    }
}
