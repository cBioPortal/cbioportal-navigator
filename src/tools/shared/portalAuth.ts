/**
 * Per-request cBioPortal credentials.
 *
 * Private cBioPortal instances (authenticate=saml/oauth2 with dat.method set)
 * require a data access token on every /api request. The navigator does not
 * check study permissions itself: it forwards the caller's own token, and
 * cBioPortal decides what that caller can see.
 *
 * Where the token comes from:
 * - HTTP mode, `MCP_AUTH_MODE=header`: the `x-auth-token` request header.
 *   index.ts rejects requests without it before any tool runs.
 * - HTTP mode, `MCP_AUTH_MODE=none` (default): no token is forwarded.
 * - HTTP mode, `MCP_AUTH_MODE=oauth`: `x-auth-token` if present (optional;
 *   the OAuth login identifies the caller, the header grants portal access).
 * - stdio mode: `CBIOPORTAL_TOKEN`, read once at startup. HTTP mode never
 *   falls back to it, so a shared server cannot act with one person's token.
 *
 * The token travels through AsyncLocalStorage so the shared API client and
 * session clients can attach it without threading it through every tool.
 *
 * @packageDocumentation
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export type AuthMode = 'none' | 'header' | 'oauth';

/** Request header carrying the caller's cBioPortal data access token. */
export const TOKEN_HEADER = 'x-auth-token';

const AUTH_MODES: AuthMode[] = ['none', 'header', 'oauth'];

export function getAuthMode(): AuthMode {
    const mode = (process.env.MCP_AUTH_MODE || 'none').trim().toLowerCase();
    if ((AUTH_MODES as string[]).includes(mode)) return mode as AuthMode;
    throw new Error(
        `Invalid MCP_AUTH_MODE '${mode}'. Valid options: ${AUTH_MODES.join(', ')}`
    );
}

/**
 * Normalize a header or env value to a bare token. Accepts `<token>`,
 * `Bearer <token>`, and `token: <token>` (the first line of the file
 * cBioPortal downloads), since connector UIs send header values verbatim.
 */
export function normalizeToken(
    value: string | string[] | undefined
): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    const token = raw
        ?.trim()
        .replace(/^(bearer\s+|token:\s*)/i, '')
        .trim();
    return token || undefined;
}

const requestToken = new AsyncLocalStorage<string | undefined>();
let processToken: string | undefined;

/** Set the token for the whole process. Only for stdio (single-user) mode. */
export function setProcessPortalToken(value: string | undefined): void {
    processToken = normalizeToken(value);
}

/** Run `fn` with `token` as the cBioPortal token for every API call it makes. */
export function runWithPortalToken<T>(
    token: string | undefined,
    fn: () => T
): T {
    return requestToken.run(token, fn);
}

export function getPortalToken(): string | undefined {
    return requestToken.getStore() ?? processToken;
}

/** Authorization header for cBioPortal API requests, or none without a token. */
export function portalAuthHeaders(): Record<string, string> {
    const token = getPortalToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * cBioPortal rejected the caller's credentials (401) or permissions (403).
 * Resolvers that treat lookup failures as "not found" must rethrow this, so
 * an expired token isn't reported as a missing study or gene.
 */
export class PortalAuthError extends Error {
    constructor(readonly status: 401 | 403) {
        super(
            status === 401
                ? 'cBioPortal rejected the request as unauthenticated (HTTP 401). ' +
                      'The cBioPortal data access token for this connection is missing, ' +
                      'expired, or was replaced by a newer token. Download a new token ' +
                      `from the cBioPortal web page and update the connection's ` +
                      `${TOKEN_HEADER} header (or CBIOPORTAL_TOKEN in stdio mode).`
                : 'cBioPortal denied access (HTTP 403): the user behind this ' +
                      'connection is not authorized to access the requested study or data.'
        );
        this.name = 'PortalAuthError';
    }
}

export function toPortalAuthError(
    status: number | undefined
): PortalAuthError | undefined {
    return status === 401 || status === 403
        ? new PortalAuthError(status)
        : undefined;
}
