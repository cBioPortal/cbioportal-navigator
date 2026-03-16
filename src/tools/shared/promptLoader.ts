/**
 * Prompt loader utility for MCP tools and system prompts.
 *
 * Loads prompts from local .md files at startup.
 *
 * Call `initPrompts()` at startup before any `loadPrompt()` calls.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROMPT_NAMES = [
    'navigator/resolve-and-route',
    'navigator/navigate-to-study-view',
    'navigator/navigate-to-patient-view',
    'navigator/navigate-to-results-view',
    'navigator/navigate-to-group-comparison',
    'navigator/get-studyviewfilter-options',
];

function toLocalFilename(name: string): string {
    return name.replace('navigator/', '').replace(/-/g, '_') + '.md';
}

/**
 * Resolved prompts from initial load (used by synchronous loadPrompt).
 */
const resolvedPrompts = new Map<string, string>();

/**
 * Pre-load all prompts from local .md files at startup.
 */
export function initPrompts(): void {
    for (const name of PROMPT_NAMES) {
        const filename = toLocalFilename(name);
        const absolutePath = join(__dirname, '../../prompts', filename);
        resolvedPrompts.set(name, readFileSync(absolutePath, 'utf-8'));
    }
}

/**
 * Load a prompt (must call initPrompts() first).
 *
 * @param name - Prompt name (e.g., 'navigator/resolve-and-route')
 * @returns The prompt content as a string
 */
export function loadPrompt(name: string): string {
    const content = resolvedPrompts.get(name);
    if (content) {
        return content;
    }

    throw new Error(
        `Prompt '${name}' not initialized. Call initPrompts() before loadPrompt().`
    );
}
