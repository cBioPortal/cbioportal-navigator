/**
 * Default configuration for chat completions.
 */

import type { Provider } from '../providers/types.js';
import { loadPrompt } from '../../../infrastructure/utils/promptLoader.js';

export const DEFAULT_SYSTEM_PROMPT = loadPrompt('chat/prompts/system.md');

export const DEFAULT_MODELS: Record<Provider, string> = {
    anthropic: 'claude-3-5-sonnet-20241022',
    google: 'gemini-2.0-flash-exp',
    openai: 'gpt-4-turbo-preview',
};

export const CONFIG = {
    // Max tool calling rounds to prevent infinite loops
    maxSteps: 10,

    // Default temperature
    defaultTemperature: 0.7,

    // Timeout for tool execution (ms)
    toolTimeout: 30000,
};
