/**
 * Configuration for URL building
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
