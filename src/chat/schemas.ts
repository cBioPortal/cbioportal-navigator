/**
 * Request/response schemas for chat completions endpoint.
 *
 * Defines OpenAI-compatible chat completion request schema with provider extensions.
 */

import { z } from 'zod';

/**
 * Message schema following OpenAI format
 */
export const messageSchema = z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string(),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
    tool_calls: z.array(z.any()).optional(),
});

/**
 * Chat completion request schema
 * Compatible with OpenAI Chat Completions API with provider extensions
 */
export const chatCompletionRequestSchema = z.object({
    // Core fields
    model: z.string(),
    messages: z.array(messageSchema),

    // Provider selection (optional - can be detected from model name)
    provider: z.enum(['anthropic', 'google', 'openai']).optional(),

    // API key (optional - can use headers or env vars)
    api_key: z.string().optional(),

    // Streaming
    stream: z.boolean().optional().default(false),

    // Optional parameters
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().positive().optional(),
    top_p: z.number().min(0).max(1).optional(),
    stop: z.union([z.string(), z.array(z.string())]).optional(),
});

export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;
export type Message = z.infer<typeof messageSchema>;
