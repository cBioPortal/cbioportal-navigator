/**
 * Prompt loader utility for MCP tools and system prompts.
 *
 * Loads prompts from the centralized src/prompts/ directory.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Cache for loaded prompts to avoid repeated file reads
 */
const promptCache = new Map<string, string>();

/**
 * Load a prompt from a markdown file in the prompts/ directory.
 *
 * @param filename - Prompt filename (e.g., 'system.md', 'resolve_and_route.md')
 * @returns The prompt content as a string
 * @throws Error if the file cannot be read
 *
 * @example
 * ```typescript
 * const toolPrompt = loadPrompt('resolve_and_route.md');
 * const systemPrompt = loadPrompt('system.md');
 * ```
 */
export function loadPrompt(filename: string): string {
    // Check cache first
    if (promptCache.has(filename)) {
        return promptCache.get(filename)!;
    }

    try {
        // __dirname is: src/tools/shared (or dist/tools/shared)
        // prompts are at: src/prompts/ (or dist/prompts/)
        const absolutePath = join(__dirname, '../../prompts', filename);

        // Read file synchronously (tool definitions are initialized at startup)
        const content = readFileSync(absolutePath, 'utf-8');

        // Cache the result
        promptCache.set(filename, content);

        return content;
    } catch (error) {
        throw new Error(
            `Failed to load prompt '${filename}': ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}
