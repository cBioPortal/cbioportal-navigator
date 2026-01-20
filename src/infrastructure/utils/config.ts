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

let config: UrlConfig = {
    baseUrl: process.env.CBIOPORTAL_BASE_URL || 'https://www.cbioportal.org',
    protocol: 'https:',
};

export function getConfig(): UrlConfig {
    return config;
}

export function setConfig(newConfig: Partial<UrlConfig>): void {
    config = { ...config, ...newConfig };
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
