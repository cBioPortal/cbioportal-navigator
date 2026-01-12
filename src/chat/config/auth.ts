/**
 * API key resolution with priority: request body > headers > environment variables.
 */

import type { Provider } from '../providers/types.js';
import { InvalidAPIKeyError } from '../utils/errors.js';

const ENV_VAR_MAPPING: Record<Provider, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
    openai: 'OPENAI_API_KEY',
};

/**
 * Resolve API key with priority: request body > env vars
 *
 * Note: Headers are intentionally skipped to allow LibreChat integration.
 * Navigator always uses environment variables for API keys, enabling
 * multi-provider support with a single endpoint configuration.
 */
export function resolveApiKey(
    provider: Provider,
    bodyKey?: string,
    headers?: Record<string, string>
): string {
    // 1. Request body (for testing/debugging)
    if (bodyKey) return bodyKey;

    // 2. Headers - SKIPPED
    // LibreChat sends a single API key for all models, but Navigator supports
    // multiple providers. Always use environment variables instead of headers
    // to ensure the correct API key is used based on the model's provider.

    // 3. Environment variables (primary source)
    const envKey = process.env[ENV_VAR_MAPPING[provider]];
    if (envKey) return envKey;

    throw new InvalidAPIKeyError(provider);
}
