/**
 * Upstream OpenID Connect provider (e.g. Google) that performs the actual
 * user login. This server is a confidential client there, with one fixed
 * redirect URI (`<MCP_PUBLIC_URL>/oauth/callback`), and uses PKCE and a nonce
 * on every login.
 *
 * Only the verified ID token is used: the user's identity (sub, email) is all
 * the navigator needs, so upstream access/refresh tokens are discarded.
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { OAuthConfig } from './config.js';

export interface UpstreamIdentity {
    sub: string;
    email?: string;
    emailVerified: boolean;
    name?: string;
}

interface Discovery {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
}

const TIMEOUT_MS = 10_000;

function pkceChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
}

export class UpstreamProvider {
    private discovery?: Promise<Discovery>;
    private jwks?: ReturnType<typeof createRemoteJWKSet>;

    constructor(private readonly config: OAuthConfig) {}

    /** Fetched lazily and cached; a failed fetch is retried on the next login. */
    private getDiscovery(): Promise<Discovery> {
        if (!this.discovery) {
            const url = `${this.config.upstream.issuer}/.well-known/openid-configuration`;
            this.discovery = fetch(url, {
                signal: AbortSignal.timeout(TIMEOUT_MS),
            })
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(
                            `OIDC discovery failed (${response.status}): ${url}`
                        );
                    }
                    return (await response.json()) as Discovery;
                })
                .catch((error) => {
                    this.discovery = undefined;
                    throw error;
                });
        }
        return this.discovery;
    }

    async authorizationUrl(params: {
        state: string;
        nonce: string;
        codeVerifier: string;
    }): Promise<string> {
        const { authorization_endpoint } = await this.getDiscovery();
        const url = new URL(authorization_endpoint);
        url.search = new URLSearchParams({
            response_type: 'code',
            client_id: this.config.upstream.clientId,
            redirect_uri: this.config.callbackUrl,
            scope: this.config.upstream.scopes,
            state: params.state,
            nonce: params.nonce,
            code_challenge: pkceChallenge(params.codeVerifier),
            code_challenge_method: 'S256',
        }).toString();
        return url.href;
    }

    /** Exchange the upstream authorization code and return the verified identity. */
    async identify(
        code: string,
        codeVerifier: string,
        nonce: string
    ): Promise<UpstreamIdentity> {
        const discovery = await this.getDiscovery();
        const response = await fetch(discovery.token_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: this.config.callbackUrl,
                client_id: this.config.upstream.clientId,
                client_secret: this.config.upstream.clientSecret,
                code_verifier: codeVerifier,
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const body = (await response.json().catch(() => ({}))) as {
            id_token?: string;
            error?: string;
        };
        if (!response.ok || !body.id_token) {
            throw new Error(
                `Upstream token exchange failed (${response.status}): ${body.error ?? 'no id_token'}`
            );
        }

        this.jwks ??= createRemoteJWKSet(new URL(discovery.jwks_uri));
        const { payload } = await jwtVerify(body.id_token, this.jwks, {
            issuer: discovery.issuer,
            audience: this.config.upstream.clientId,
        });
        if (payload.nonce !== nonce) {
            throw new Error('Upstream ID token nonce mismatch');
        }
        if (!payload.sub) {
            throw new Error('Upstream ID token has no subject');
        }
        return {
            sub: payload.sub,
            email:
                typeof payload.email === 'string'
                    ? payload.email.toLowerCase()
                    : undefined,
            emailVerified:
                payload.email_verified === true ||
                payload.email_verified === 'true',
            name: typeof payload.name === 'string' ? payload.name : undefined,
        };
    }
}
