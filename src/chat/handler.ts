/**
 * Main handler for chat completions endpoint.
 *
 * Handles both streaming and non-streaming chat completion requests.
 */

import { generateText, streamText, stepCountIs } from 'ai';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { chatCompletionRequestSchema } from './schemas.js';
import { createProvider } from './providers/factory.js';
import { getAllTools } from './tools/converter.js';
import { DEFAULT_SYSTEM_PROMPT, CONFIG } from './config/defaults.js';
import { ChatCompletionError, createErrorResponse } from './utils/errors.js';

/**
 * Main handler for chat completion requests
 */
export async function handleChatCompletion(req: Request, res: Response) {
    try {
        // 1. Validate request
        const requestData = chatCompletionRequestSchema.parse(req.body);

        // 2. Create provider instance
        const model = createProvider(
            requestData,
            req.headers as Record<string, string>
        );

        // 3. Get converted tools
        const tools = getAllTools();

        // 4. Prepare messages (inject system prompt if not present)
        const messages = [...requestData.messages]; // Clone to avoid mutation
        if (!messages.some((m) => m.role === 'system')) {
            messages.unshift({
                role: 'system',
                content: DEFAULT_SYSTEM_PROMPT,
            });
        }

        // 5. Execute (streaming or non-streaming)
        if (requestData.stream) {
            return await handleStreaming(res, {
                model,
                messages,
                tools,
                requestData,
            });
        } else {
            return await handleNonStreaming(res, {
                model,
                messages,
                tools,
                requestData,
            });
        }
    } catch (error) {
        console.error('Chat completion error:', error);

        if (error instanceof ZodError) {
            return res
                .status(400)
                .json(createErrorResponse('Invalid request', error.errors));
        }

        if (error instanceof ChatCompletionError) {
            return res
                .status(error.statusCode)
                .json(createErrorResponse(error.message, error.details));
        }

        return res
            .status(500)
            .json(createErrorResponse('Internal server error'));
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
    }
) {
    const { model, messages, tools, requestData } = params;

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
    }
) {
    const { model, messages, tools, requestData } = params;

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

        // Stream chunks in OpenAI format
        for await (const chunk of streamResult.textStream) {
            const sseChunk = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: model.modelId,
                choices: [
                    {
                        index: 0,
                        delta: { content: chunk },
                        finish_reason: null,
                    },
                ],
            };

            res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
        }

        // Get final result to obtain finishReason
        const finalResult = await streamResult;

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
                    finish_reason: finalResult.finishReason || 'stop',
                },
            ],
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);

        // Send [DONE]
        res.write(`data: [DONE]\n\n`);
        res.end();
    } catch (error) {
        console.error('Streaming error:', error);
        if (!res.headersSent) {
            throw new ChatCompletionError(
                error instanceof Error ? error.message : 'Streaming failed'
            );
        }
        // If headers already sent, just end the stream
        res.end();
    }
}
