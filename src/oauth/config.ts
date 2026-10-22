/**
 * Configuration for `MCP_AUTH_MODE=oauth`, read once at startup.
 *
 * The navigator acts as an OAuth authorization server for MCP clients
 * (Claude.ai, Claude Desktop, Claude Code, ...) and delegates the actual
 * login to an upstream OpenID Connect provider (e.g. Google). It must be
 * served at its own origin with no path prefix, so the SDK's standard
 * root-level endpoints and `/.well-known` metadata paths apply.
 *
 * Environment variables:
 * - `MCP_PUBLIC_URL`: public origin of this server, e.g.
 *   `https://navigator.example.org` (no path). https required except localhost.
 * - `MCP_AUTH_SECRET`: at least 32 characters. Signs and encrypts every
 *   OAuth artifact this server issues; all replicas must share it.
 * - `MCP_AUTH_SECRET_PREVIOUS`: optional, for rotation. Still accepted for
 *   verification/decryption, never used to issue new artifacts.
 * - `OAUTH_ISSUER`: upstream OIDC issuer, e.g. `https://accounts.google.com`.
 * - `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET`: this server's client at the
 *   upstream provider. Register `<MCP_PUBLIC_URL>/oauth/callback` there.
 * - `OAUTH_SCOPES`: upstream scopes, default `openid email profile`.
 * - `OAUTH_ALLOWED_EMAIL_DOMAINS` / `OAUTH_ALLOWED_EMAILS`: optional
 *   comma-separated allowlists. When either is set, only matching verified
 *   emails may sign in; when both are empty, any upstream account may.
 *
 * @packageDocumentation
 */

export interface OAuthConfig {
    /** Public origin, no trailing slash, e.g. `https://navigator.example.org`. */
    publicUrl: string;
    /** Authorization server issuer identifier (`publicUrl` + `/`). */
    issuer: string;
    /** Protected resource (the MCP endpoint) tokens are bound to. */
    resource: string;
    /** Upstream redirect URI: `<publicUrl>/oauth/callback`. */
    callbackUrl: string;
    /** Signing/encryption secrets, current first. */
    secrets: string[];
    upstream: {
        issuer: string;
        clientId: string;
        clientSecret: string;
        scopes: string;
    };
    allowedEmailDomains: string[];
    allowedEmails: string[];
}

function list(value: string | undefined): string[] {
    return (value || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

export function loadOAuthConfig(env = process.env): OAuthConfig {
    const required = [
        'MCP_PUBLIC_URL',
        'MCP_AUTH_SECRET',
        'OAUTH_ISSUER',
        'OAUTH_CLIENT_ID',
        'OAUTH_CLIENT_SECRET',
    ];
    const missing = required.filter((name) => !env[name]?.trim());
    if (missing.length) {
        throw new Error(
            `MCP_AUTH_MODE=oauth requires ${missing.join(', ')} to be set`
        );
    }

    const url = new URL(env.MCP_PUBLIC_URL!.trim());
    if (url.pathname !== '/' || url.search || url.hash) {
        throw new Error(
            `MCP_PUBLIC_URL must be a bare origin with no path (got ${url.href}). ` +
                'OAuth discovery uses root-level /.well-known paths, so the ' +
                'OAuth-enabled navigator needs its own hostname rather than a path prefix.'
        );
    }
    const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !isLocal) {
        throw new Error('MCP_PUBLIC_URL must use https (except localhost)');
    }

    const secrets = [env.MCP_AUTH_SECRET, env.MCP_AUTH_SECRET_PREVIOUS]
        .map((s) => s?.trim())
        .filter((s): s is string => Boolean(s));
    if (secrets.some((s) => s.length < 32)) {
        throw new Error(
            'MCP_AUTH_SECRET (and MCP_AUTH_SECRET_PREVIOUS) must be at least 32 characters'
        );
    }

    const publicUrl = url.origin;
    return {
        publicUrl,
        issuer: `${publicUrl}/`,
        resource: `${publicUrl}/mcp`,
        callbackUrl: `${publicUrl}/oauth/callback`,
        secrets,
        upstream: {
            issuer: env.OAUTH_ISSUER!.trim().replace(/\/$/, ''),
            clientId: env.OAUTH_CLIENT_ID!.trim(),
            clientSecret: env.OAUTH_CLIENT_SECRET!.trim(),
            scopes: env.OAUTH_SCOPES?.trim() || 'openid email profile',
        },
        allowedEmailDomains: list(env.OAUTH_ALLOWED_EMAIL_DOMAINS),
        allowedEmails: list(env.OAUTH_ALLOWED_EMAILS),
    };
}
