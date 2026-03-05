/**
 * Prompt loader utility for MCP tools and system prompts.
 *
 * Loads prompts from Langfuse with local .md files as fallback
 * (via SDK's built-in `fallback` parameter).
 *
 * Call `initPrompts()` at startup before any `loadPrompt()` calls.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LangfuseClient } from '@langfuse/client';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Mapping from local filename to Langfuse prompt name.
 * Langfuse prompts are stored under the "navigator/" folder.
 */
const PROMPT_NAMES: Record<string, string> = {
    'system.md': 'navigator/system',
    'resolve_and_route.md': 'navigator/resolve-and-route',
    'navigate_to_study_view.md': 'navigator/navigate-to-study-view',
    'navigate_to_patient_view.md': 'navigator/navigate-to-patient-view',
    'navigate_to_results_view.md': 'navigator/navigate-to-results-view',
    'navigate_to_group_comparison.md': 'navigator/navigate-to-group-comparison',
    'get_studyviewfilter_options.md': 'navigator/get-studyviewfilter-options',
};

/**
 * Resolved prompts from initial fetch (used by synchronous loadPrompt).
 */
const resolvedPrompts = new Map<string, string>();

/**
 * Read a local prompt file.
 */
function readLocalPrompt(filename: string): string {
    const absolutePath = join(__dirname, '../../prompts', filename);
    return readFileSync(absolutePath, 'utf-8');
}

/**
 * Pre-fetch all prompts from Langfuse at startup.
 *
 * Uses the SDK's `fallback` parameter: if Langfuse is unreachable,
 * local .md file content is used automatically.
 */
export async function initPrompts(): Promise<void> {
    const langfuse = new LangfuseClient();

    for (const [filename, langfuseName] of Object.entries(PROMPT_NAMES)) {
        const localContent = readLocalPrompt(filename);
        const prompt = await langfuse.prompt.get(langfuseName, {
            fallback: localContent,
        });
        resolvedPrompts.set(filename, prompt.compile());
    }

    await langfuse.shutdown();
}

/**
 * Load a prompt (must call initPrompts() first).
 *
 * @param filename - Prompt filename (e.g., 'resolve_and_route.md')
 * @returns The prompt content as a string
 */
export function loadPrompt(filename: string): string {
    const content = resolvedPrompts.get(filename);
    if (content) {
        return content;
    }

    throw new Error(
        `Prompt '${filename}' not initialized. Call initPrompts() before loadPrompt().`
    );
}
