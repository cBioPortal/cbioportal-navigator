/**
 * Global configuration for cBioPortal URL construction.
 *
 * This module manages the base URL configuration used by all URL builders,
 * allowing dynamic configuration through environment variables or programmatic
 * updates. It provides utilities for URL string manipulation.
 *
 * @remarks
 * Key exports:
 * - `UrlConfig`: Interface for configuration structure
 * - `getConfig()`: Retrieve current configuration
 * - `setConfig()`: Update configuration (partial updates supported)
 * - `trimTrailingSlash()`: Remove trailing slashes from URLs
 * - `removeProtocol()`: Strip protocol prefixes from URLs
 *
 * Configuration:
 * The base URL defaults to https://www.cbioportal.org and can be overridden
 * via the CBIOPORTAL_BASE_URL environment variable or by calling setConfig().
 * This enables support for private cBioPortal instances.
 *
 * @packageDocumentation
 */
export interface UrlConfig {
    baseUrl: string;
    protocol: string;
}

/** URLs follow the base URL's scheme (e.g. http for a local instance); https otherwise. */
function protocolOf(baseUrl: string): string {
    return /^http:\/\//i.test(baseUrl) ? 'http:' : 'https:';
}

const defaultBaseUrl =
    process.env.CBIOPORTAL_BASE_URL || 'https://www.cbioportal.org';

let config: UrlConfig = {
    baseUrl: defaultBaseUrl,
    protocol: protocolOf(defaultBaseUrl),
};

export function getConfig(): UrlConfig {
    return config;
}

/**
 * Base URL for the navigator's own (server-side) cBioPortal calls: data
 * queries and session creation. Defaults to the instance URL users open.
 * Set CBIOPORTAL_API_URL when the navigator must reach the portal at a
 * different address, e.g. an internal network name when it runs next to the
 * portal and can't reach the public URL. Generated links always use baseUrl.
 */
export function getApiBaseUrl(): string {
    return trimTrailingSlash(process.env.CBIOPORTAL_API_URL || config.baseUrl);
}

export function setConfig(newConfig: Partial<UrlConfig>): void {
    const protocol =
        newConfig.protocol ??
        (newConfig.baseUrl ? protocolOf(newConfig.baseUrl) : config.protocol);
    config = { ...config, ...newConfig, protocol };
}

export function trimTrailingSlash(str: string): string {
    return str.replace(/\/$/g, '');
}

/**
 * Remove protocol prefix (http:// or https://) from URL string
 * Handles multiple protocol prefixes (e.g., https://https://)
 */
export function removeProtocol(str: string): string {
    return str.replace(/^(https?:\/\/)+/i, '');
}
