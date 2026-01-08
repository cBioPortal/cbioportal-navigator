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
 * Resolve API key with priority: request body > headers > env vars
 */
export function resolveApiKey(
    provider: Provider,
    bodyKey?: string,
    headers?: Record<string, string>
): string {
    // 1. Request body
    if (bodyKey) return bodyKey;

    // 2. Headers (check both Authorization and X-API-Key)
    if (headers) {
        const authHeader = headers.authorization || headers.Authorization;
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.slice(7);
        }

        const apiKeyHeader = headers['x-api-key'] || headers['X-API-Key'];
        if (apiKeyHeader) return apiKeyHeader;
    }

    // 3. Environment variables
    const envKey = process.env[ENV_VAR_MAPPING[provider]];
    if (envKey) return envKey;

    throw new InvalidAPIKeyError(provider);
}
