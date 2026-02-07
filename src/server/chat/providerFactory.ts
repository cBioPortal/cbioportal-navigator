/**
 * Provider factory for creating LLM SDK instances.
 *
 * Auto-detects provider from model name and creates appropriate SDK instance.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { ChatCompletionRequest } from './schemas.js';
import type { Provider } from './providerTypes.js';
import { resolveApiKey } from './auth.js';
import { UnsupportedProviderError } from './errors.js';

/**
 * Pattern matching for provider detection from model name
 */
const PROVIDER_MODEL_PATTERNS: Record<Provider, RegExp> = {
    anthropic: /^claude-/,
    google: /^gemini-/,
    openai: /^gpt-/,
};

/**
 * Detect provider from model name
 */
function detectProviderFromModel(model: string): Provider {
    for (const [providerName, pattern] of Object.entries(
        PROVIDER_MODEL_PATTERNS
    )) {
        if (pattern.test(model)) {
            return providerName as Provider;
        }
    }
    throw new UnsupportedProviderError(
        `Cannot detect provider from model name: ${model}`
    );
}

/**
 * Create provider SDK instance
 */
export function createProvider(
    request: ChatCompletionRequest,
    headers: Record<string, string>
): LanguageModel {
    // Determine provider
    let provider = request.provider;
    if (!provider) {
        provider = detectProviderFromModel(request.model);
    }

    // Resolve API key (request body > headers > env vars)
    const apiKey = resolveApiKey(provider, request.api_key, headers);

    // Create provider-specific SDK instance
    switch (provider) {
        case 'anthropic':
            return createAnthropicProvider(request.model, apiKey);
        case 'google':
            return createGoogleProvider(request.model, apiKey);
        case 'openai':
            return createOpenAIProvider(request.model, apiKey);
        default:
            throw new UnsupportedProviderError(provider);
    }
}

function createAnthropicProvider(model: string, apiKey: string): LanguageModel {
    const anthropic = createAnthropic({ apiKey });
    return anthropic(model);
}

function createGoogleProvider(model: string, apiKey: string): LanguageModel {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(model);
}

function createOpenAIProvider(model: string, apiKey: string): LanguageModel {
    const openai = createOpenAI({ apiKey });
    return openai(model);
}
