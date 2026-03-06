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
 * Langfuse prompt names (stored under the "navigator/" folder).
 * Local fallback filename is derived: "navigator/resolve-and-route" → "resolve_and_route.md"
 */
const PROMPT_NAMES = [
    'navigator/resolve-and-route',
    'navigator/navigate-to-study-view',
    'navigator/navigate-to-patient-view',
    'navigator/navigate-to-results-view',
    'navigator/navigate-to-group-comparison',
    'navigator/get-studyviewfilter-options',
];

function toLocalFilename(langfuseName: string): string {
    return langfuseName.replace('navigator/', '').replace(/-/g, '_') + '.md';
}

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
 * If Langfuse env vars are not set, falls back to local .md files.
 * Uses the SDK's built-in `fallback` parameter: Langfuse SDK logs errors
 * to stderr automatically when a prompt cannot be fetched.
 */
export async function initPrompts(): Promise<void> {
    const hasLangfuse =
        process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY;

    if (!hasLangfuse) {
        console.error('[Langfuse] Not configured — using local prompts');
        for (const name of PROMPT_NAMES) {
            resolvedPrompts.set(name, readLocalPrompt(toLocalFilename(name)));
        }
        return;
    }

    const baseUrl =
        process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';
    console.error(`[Langfuse] Connecting to ${baseUrl}`);

    const langfuse = new LangfuseClient();

    for (const name of PROMPT_NAMES) {
        const localContent = readLocalPrompt(toLocalFilename(name));
        const prompt = await langfuse.prompt.get(name, {
            fallback: localContent,
        });
        resolvedPrompts.set(name, prompt.compile());
    }

    console.error(`[Langfuse] ${PROMPT_NAMES.length} prompts loaded`);

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
