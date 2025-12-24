/**
 * Provider-related type definitions.
 */

export type Provider = 'anthropic' | 'google' | 'openai';

export interface ProviderConfig {
    model: string;
    apiKey: string;
}
