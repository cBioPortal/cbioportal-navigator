/**
 * Prompt loader utility for MCP tools and system prompts.
 *
 * Loads prompts from external markdown files, making it easy for
 * testing teams to update prompts without modifying TypeScript code.
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
 * Load a prompt from a markdown file.
 *
 * Supports two types of paths:
 * - Domain prompts: relative to src/domain/ (e.g., 'router/prompts/resolve_and_route.md')
 * - Server prompts: relative to src/server/ (e.g., 'chat/prompts/system.md')
 *
 * @param relativePath - Path relative to src/domain/ or src/server/
 * @returns The prompt content as a string
 * @throws Error if the file cannot be read
 *
 * @example
 * ```typescript
 * // Domain tool prompt
 * const toolPrompt = loadPrompt('router/prompts/resolve_and_route.md');
 *
 * // Server system prompt
 * const systemPrompt = loadPrompt('chat/prompts/system.md');
 * ```
 */
export function loadPrompt(relativePath: string): string {
    // Check cache first
    if (promptCache.has(relativePath)) {
        return promptCache.get(relativePath)!;
    }

    try {
        // Construct absolute path
        // __dirname is: src/infrastructure/utils

        let absolutePath: string;

        // Detect if this is a server path (starts with server component names)
        if (
            relativePath.startsWith('chat/') ||
            relativePath.startsWith('mcp-server/')
        ) {
            // Server path: go up to src/ then navigate to server/
            absolutePath = join(__dirname, '../../server', relativePath);
        } else {
            // Domain path: go up to src/ then navigate to domain/
            absolutePath = join(__dirname, '../../domain', relativePath);
        }

        // Read file synchronously (tool definitions are initialized at startup)
        const content = readFileSync(absolutePath, 'utf-8');

        // Cache the result
        promptCache.set(relativePath, content);

        return content;
    } catch (error) {
        throw new Error(
            `Failed to load prompt from ${relativePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}
