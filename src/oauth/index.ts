/**
 * Wires `MCP_AUTH_MODE=oauth` into the express app: the SDK's standard OAuth
 * endpoints and metadata, the two routes the upstream login needs, and the
 * bearer-token middleware that protects `/mcp`.
 *
 * Routes (all at the root of MCP_PUBLIC_URL):
 * - `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server`
 * - `/register`, `/authorize`, `/token`, `/revoke` (SDK handlers)
 * - `/oauth/consent` (consent form), `/oauth/callback` (upstream redirect)
 *
 * @packageDocumentation
 */

import express from 'express';
import {
    getOAuthProtectedResourceMetadataUrl,
    mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { loadOAuthConfig } from './config.js';
import { NavigatorOAuthProvider } from './provider.js';
import { MemoryReplayGuard } from './replayGuard.js';

/**
 * Install the OAuth routes on `app` and return the middleware for `/mcp`.
 * Throws on incomplete configuration, so a misconfigured deployment fails at
 * startup.
 */
export function setupOAuth(app: express.Express): express.RequestHandler {
    const config = loadOAuthConfig();
    const provider = new NavigatorOAuthProvider(
        config,
        new MemoryReplayGuard()
    );

    app.use(
        mcpAuthRouter({
            provider,
            issuerUrl: new URL(config.issuer),
            resourceServerUrl: new URL(config.resource),
            resourceName: 'cBioPortal Navigator',
            // /token, /register and /revoke are called server-to-server, and
            // Claude's hosted apps call them from one shared IP range, so a
            // per-IP limit would throttle all users together. /authorize is
            // hit by each user's browser and keeps the SDK's default limit.
            tokenOptions: { rateLimit: false },
            revocationOptions: { rateLimit: false },
            clientRegistrationOptions: {
                rateLimit: false,
                // Client secrets are derived from the client_id and never expire.
                clientSecretExpirySeconds: 0,
            },
        })
    );
    app.get('/oauth/callback', (req, res) => provider.handleCallback(req, res));
    app.post(
        '/oauth/consent',
        express.urlencoded({ extended: false }),
        (req, res) => provider.handleConsent(req, res)
    );

    console.log(
        `OAuth issuer: ${config.issuer} (upstream ${config.upstream.issuer})`
    );
    return requireBearerAuth({
        verifier: provider,
        resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(
            new URL(config.resource)
        ),
    });
}
