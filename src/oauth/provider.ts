/**
 * OAuth authorization server for MCP clients, backed by an upstream OIDC
 * login (see upstream.ts). Plugs into the SDK's standard OAuth router
 * (`mcpAuthRouter`), which handles request parsing, client authentication,
 * PKCE verification, and metadata; this class supplies the logic.
 *
 * Flow:
 * 1. MCP client registers (DCR) -> client_id is an encrypted registration.
 * 2. /authorize -> consent page (unless the redirect is Claude's hosted
 *    callback), then redirect to the upstream login with an encrypted
 *    transaction as `state`.
 * 3. /oauth/callback -> verify the upstream ID token, apply the email
 *    allowlist, redirect back to the client with an encrypted 60s code.
 * 4. /token -> signed access token (1h) + encrypted refresh token (30d,
 *    rotated on every use).
 *
 * Nothing is stored server-side except the replay guard (replayGuard.ts),
 * which makes codes single-use and detects refresh token reuse.
 *
 * @packageDocumentation
 */

import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { JWTPayload } from 'jose';
import type {
    AuthorizationParams,
    OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
    OAuthClientInformationFull,
    OAuthTokenRevocationRequest,
    OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
    InvalidClientMetadataError,
    InvalidGrantError,
    InvalidScopeError,
    InvalidTargetError,
    InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthConfig } from './config.js';
import type { ReplayGuard } from './replayGuard.js';
import { Keyring, fingerprint, randomId } from './tokens.js';
import { UpstreamProvider, type UpstreamIdentity } from './upstream.js';

const ACCESS_TOKEN_TTL = 60 * 60;
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60;
const CODE_TTL = 60;
const TRANSACTION_TTL = 10 * 60;

/**
 * Redirect URIs of Claude's hosted apps. A code sent there can only be
 * redeemed by Claude, so a client registering it gains nothing from skipping
 * consent. Every other client (including loopback redirects, which any local
 * process can claim) gets the consent page.
 */
const TRUSTED_REDIRECT_URIS = new Set([
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback',
]);

const CONSENT_COOKIE = 'navigator_oauth_consent';

function str(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}

function secondsLeft(claims: JWTPayload): number {
    return (claims.exp ?? 0) - Math.floor(Date.now() / 1000);
}

function sameResource(a: string, b: string): boolean {
    const normalize = (url: string) =>
        url.replace(/#.*$/, '').replace(/\/$/, '');
    return normalize(a) === normalize(b);
}

function isAllowedRedirectUri(uri: string): boolean {
    try {
        const url = new URL(uri);
        if (url.protocol === 'https:') return true;
        return (
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        );
    } catch {
        return false;
    }
}

function escapeHtml(text: string): string {
    return text.replace(
        /[&<>"']/g,
        (c) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[c]!
    );
}

function readCookie(req: Request, name: string): string | undefined {
    for (const part of (req.headers.cookie || '').split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) return decodeURIComponent(rest.join('='));
    }
    return undefined;
}

function safeEqual(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}

export class NavigatorOAuthProvider implements OAuthServerProvider {
    private readonly keyring: Keyring;
    private readonly upstream: UpstreamProvider;
    private readonly secureCookies: boolean;

    constructor(
        private readonly config: OAuthConfig,
        private readonly guard: ReplayGuard
    ) {
        this.keyring = new Keyring(config.secrets, config.issuer);
        this.upstream = new UpstreamProvider(config);
        this.secureCookies = config.publicUrl.startsWith('https:');
    }

    get clientsStore(): OAuthRegisteredClientsStore {
        return {
            getClient: (clientId) => this.getClient(clientId),
            registerClient: (client) =>
                this.registerClient(client as OAuthClientInformationFull),
        };
    }

    /** client_id is the encrypted registration itself, so lookup is decryption. */
    private async getClient(
        clientId: string
    ): Promise<OAuthClientInformationFull | undefined> {
        const claims = await this.keyring.open('client', clientId);
        if (!claims) return undefined;
        const authMethod = str(claims.am) ?? 'none';
        return {
            client_id: clientId,
            client_id_issued_at: claims.iat,
            client_name: str(claims.nm),
            redirect_uris: claims.ru as string[],
            token_endpoint_auth_method: authMethod,
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            ...(authMethod !== 'none' && {
                client_secret: this.keyring.clientSecret(clientId),
                client_secret_expires_at: 0,
            }),
        };
    }

    private async registerClient(
        client: OAuthClientInformationFull
    ): Promise<OAuthClientInformationFull> {
        const invalid = client.redirect_uris.filter(
            (uri) => !isAllowedRedirectUri(uri)
        );
        if (invalid.length) {
            throw new InvalidClientMetadataError(
                `redirect_uris must be https or http loopback: ${invalid.join(', ')}`
            );
        }
        // The SDK's token endpoint authenticates confidential clients with
        // client_secret_post, so every non-public client is registered as that.
        const authMethod =
            client.token_endpoint_auth_method === 'none'
                ? 'none'
                : 'client_secret_post';
        const clientId = await this.keyring.seal('client', {
            ru: client.redirect_uris,
            nm: client.client_name,
            am: authMethod,
        });
        const registered = await this.getClient(clientId);
        return { ...client, ...registered! };
    }

    private checkResource(resource?: URL): void {
        if (resource && !sameResource(resource.href, this.config.resource)) {
            throw new InvalidTargetError(
                `Unknown resource ${resource.href}; this server issues tokens for ${this.config.resource}`
            );
        }
    }

    isAllowed(email: string | undefined, emailVerified: boolean): boolean {
        const { allowedEmails, allowedEmailDomains } = this.config;
        if (!allowedEmails.length && !allowedEmailDomains.length) return true;
        if (!email || !emailVerified) return false;
        return (
            allowedEmails.includes(email) ||
            allowedEmailDomains.includes(email.split('@')[1] ?? '')
        );
    }

    async authorize(
        client: OAuthClientInformationFull,
        params: AuthorizationParams,
        res: Response
    ): Promise<void> {
        this.checkResource(params.resource);
        const transaction = {
            cid: fingerprint(client.client_id),
            ru: params.redirectUri,
            st: params.state,
            cc: params.codeChallenge,
            sc: (params.scopes ?? []).join(' '),
            uv: randomId(32),
            nn: randomId(),
        };

        if (TRUSTED_REDIRECT_URIS.has(params.redirectUri)) {
            res.redirect(302, await this.upstreamLoginUrl(transaction));
            return;
        }

        // Consent is bound to this browser via a SameSite=Lax cookie, so a
        // consent form submitted cross-site (with a transaction an attacker
        // started) is rejected.
        const browserNonce = randomId();
        const sealed = await this.keyring.seal(
            'txn',
            { ...transaction, bn: browserNonce },
            TRANSACTION_TTL
        );
        res.setHeader(
            'Set-Cookie',
            this.consentCookie(browserNonce, TRANSACTION_TTL)
        );
        this.sendPage(
            res,
            200,
            this.consentPage(
                client.client_name || 'An unnamed application',
                new URL(params.redirectUri).host,
                sealed
            )
        );
    }

    /** POST /oauth/consent */
    async handleConsent(req: Request, res: Response): Promise<void> {
        const claims = await this.keyring.open(
            'txn',
            String(req.body?.txn ?? '')
        );
        const browserNonce = readCookie(req, CONSENT_COOKIE);
        res.setHeader('Set-Cookie', this.consentCookie('', 0));
        if (
            !claims ||
            !browserNonce ||
            !safeEqual(browserNonce, String(claims.bn))
        ) {
            this.sendPage(
                res,
                400,
                this.messagePage(
                    'This sign-in request expired or was started in another browser. Go back to your app and connect again.'
                )
            );
            return;
        }
        // Drop the browser nonce and the JWT's own claims; upstreamLoginUrl
        // seals the rest again as the upstream `state`.
        const {
            bn: _bn,
            iss: _iss,
            iat: _iat,
            exp: _exp,
            typ: _typ,
            ...transaction
        } = claims;
        if (req.body?.action !== 'approve') {
            res.redirect(
                302,
                this.clientRedirect(String(claims.ru), {
                    error: 'access_denied',
                    error_description: 'The user denied access',
                    state: str(claims.st),
                })
            );
            return;
        }
        res.redirect(302, await this.upstreamLoginUrl(transaction));
    }

    private async upstreamLoginUrl(transaction: JWTPayload): Promise<string> {
        return this.upstream.authorizationUrl({
            state: await this.keyring.seal('txn', transaction, TRANSACTION_TTL),
            nonce: String(transaction.nn),
            codeVerifier: String(transaction.uv),
        });
    }

    /** GET /oauth/callback, the upstream provider's redirect back to us. */
    async handleCallback(req: Request, res: Response): Promise<void> {
        const transaction = await this.keyring.open(
            'txn',
            String(req.query.state ?? '')
        );
        if (!transaction) {
            this.sendPage(
                res,
                400,
                this.messagePage(
                    'This sign-in request expired. Go back to your app and connect again.'
                )
            );
            return;
        }
        const redirectUri = String(transaction.ru);
        const state = str(transaction.st);

        if (req.query.error || !req.query.code) {
            res.redirect(
                302,
                this.clientRedirect(redirectUri, {
                    error: 'access_denied',
                    error_description: 'Sign-in was cancelled or failed',
                    state,
                })
            );
            return;
        }

        let identity: UpstreamIdentity;
        try {
            identity = await this.upstream.identify(
                String(req.query.code),
                String(transaction.uv),
                String(transaction.nn)
            );
        } catch (error) {
            console.error('[OAuth] Upstream sign-in failed:', error);
            res.redirect(
                302,
                this.clientRedirect(redirectUri, {
                    error: 'server_error',
                    error_description:
                        'Sign-in with the identity provider failed',
                    state,
                })
            );
            return;
        }

        if (!this.isAllowed(identity.email, identity.emailVerified)) {
            res.redirect(
                302,
                this.clientRedirect(redirectUri, {
                    error: 'access_denied',
                    error_description:
                        'This account is not allowed to use this server',
                    state,
                })
            );
            return;
        }

        const code = await this.keyring.seal(
            'code',
            {
                cid: transaction.cid,
                ru: redirectUri,
                cc: transaction.cc,
                sc: transaction.sc,
                sub: identity.sub,
                em: identity.email,
                ev: identity.emailVerified,
                nm: identity.name,
                jti: randomId(),
            },
            CODE_TTL
        );
        res.redirect(302, this.clientRedirect(redirectUri, { code, state }));
    }

    private async openCode(
        client: OAuthClientInformationFull,
        code: string
    ): Promise<JWTPayload> {
        const claims = await this.keyring.open('code', code);
        if (!claims || claims.cid !== fingerprint(client.client_id)) {
            throw new InvalidGrantError(
                'Invalid or expired authorization code'
            );
        }
        return claims;
    }

    async challengeForAuthorizationCode(
        client: OAuthClientInformationFull,
        authorizationCode: string
    ): Promise<string> {
        return String((await this.openCode(client, authorizationCode)).cc);
    }

    async exchangeAuthorizationCode(
        client: OAuthClientInformationFull,
        authorizationCode: string,
        _codeVerifier?: string,
        redirectUri?: string,
        resource?: URL
    ): Promise<OAuthTokens> {
        const claims = await this.openCode(client, authorizationCode);
        if (redirectUri !== undefined && redirectUri !== claims.ru) {
            throw new InvalidGrantError(
                'redirect_uri does not match the authorization request'
            );
        }
        this.checkResource(resource);
        if (
            !(await this.guard.markUsed(
                `code:${claims.jti}`,
                secondsLeft(claims)
            ))
        ) {
            throw new InvalidGrantError('Authorization code was already used');
        }
        return this.issueTokens(
            client,
            claims,
            String(claims.sc ?? ''),
            randomId()
        );
    }

    async exchangeRefreshToken(
        client: OAuthClientInformationFull,
        refreshToken: string,
        scopes?: string[],
        resource?: URL
    ): Promise<OAuthTokens> {
        const claims = await this.keyring.open('refresh', refreshToken);
        if (!claims || claims.cid !== fingerprint(client.client_id)) {
            throw new InvalidGrantError('Invalid or expired refresh token');
        }
        this.checkResource(resource);

        const family = `family:${claims.fam}`;
        if (await this.guard.isMarked(family)) {
            throw new InvalidGrantError('Refresh token was revoked');
        }
        // Rotation: each refresh token works once. A second use means it
        // leaked, so the whole chain issued from that login is revoked.
        if (
            !(await this.guard.markUsed(
                `refresh:${claims.jti}`,
                secondsLeft(claims)
            ))
        ) {
            await this.guard.markUsed(family, REFRESH_TOKEN_TTL);
            throw new InvalidGrantError(
                'Refresh token was already used; sign in again'
            );
        }
        // Re-apply the allowlist so removing someone takes effect within an hour.
        if (!this.isAllowed(str(claims.em), claims.ev === true)) {
            throw new InvalidGrantError(
                'This account is no longer allowed to use this server'
            );
        }

        const granted = String(claims.sc ?? '')
            .split(' ')
            .filter(Boolean);
        if (scopes?.some((scope) => !granted.includes(scope))) {
            throw new InvalidScopeError(
                'Requested scope exceeds the original grant'
            );
        }
        const scope = scopes?.length ? scopes.join(' ') : granted.join(' ');
        return this.issueTokens(client, claims, scope, String(claims.fam));
    }

    private async issueTokens(
        client: OAuthClientInformationFull,
        user: JWTPayload,
        scope: string,
        family: string
    ): Promise<OAuthTokens> {
        const cid = fingerprint(client.client_id);
        const sub = String(user.sub);
        const accessToken = await this.keyring.signAccessToken(
            { cid, email: user.em, name: user.nm, ...(scope && { scope }) },
            sub,
            this.config.resource,
            ACCESS_TOKEN_TTL
        );
        const refreshToken = await this.keyring.seal(
            'refresh',
            {
                cid,
                sub,
                em: user.em,
                ev: user.ev,
                nm: user.nm,
                sc: scope,
                fam: family,
                jti: randomId(),
            },
            REFRESH_TOKEN_TTL
        );
        return {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: ACCESS_TOKEN_TTL,
            refresh_token: refreshToken,
            ...(scope && { scope }),
        };
    }

    async verifyAccessToken(token: string): Promise<AuthInfo> {
        const claims = await this.keyring.verifyAccessToken(
            token,
            this.config.resource
        );
        if (!claims?.sub || typeof claims.exp !== 'number') {
            throw new InvalidTokenError('Invalid or expired access token');
        }
        return {
            token,
            clientId: String(claims.cid ?? ''),
            scopes: str(claims.scope)?.split(' ') ?? [],
            expiresAt: claims.exp,
            resource: new URL(this.config.resource),
            extra: {
                sub: claims.sub,
                email: str(claims.email),
                name: str(claims.name),
            },
        };
    }

    /**
     * Revoking a refresh token revokes its whole chain (on this replica).
     * Access tokens are self-contained and simply expire within the hour.
     */
    async revokeToken(
        client: OAuthClientInformationFull,
        request: OAuthTokenRevocationRequest
    ): Promise<void> {
        const claims = await this.keyring.open('refresh', request.token);
        if (claims && claims.cid === fingerprint(client.client_id)) {
            await this.guard.markUsed(
                `family:${claims.fam}`,
                REFRESH_TOKEN_TTL
            );
        }
    }

    private clientRedirect(
        redirectUri: string,
        params: Record<string, string | undefined>
    ): string {
        const url = new URL(redirectUri);
        for (const [key, value] of Object.entries(params)) {
            if (value) url.searchParams.set(key, value);
        }
        // RFC 9207: lets the client confirm which server sent the response.
        url.searchParams.set('iss', this.config.issuer);
        return url.href;
    }

    private consentCookie(value: string, maxAge: number): string {
        return [
            `${CONSENT_COOKIE}=${encodeURIComponent(value)}`,
            'Path=/',
            `Max-Age=${maxAge}`,
            'HttpOnly',
            'SameSite=Lax',
            ...(this.secureCookies ? ['Secure'] : []),
        ].join('; ');
    }

    private sendPage(res: Response, status: number, html: string): void {
        res.status(status)
            .set({
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
                'X-Frame-Options': 'DENY',
                'Content-Security-Policy':
                    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
            })
            .send(html);
    }

    private page(body: string): string {
        return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>cBioPortal Navigator</title>
<style>
body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222}
.box{border:1px solid #ddd;border-radius:8px;padding:1.5rem}
button{font-size:1rem;padding:.5rem 1.25rem;margin-right:.5rem;border-radius:6px;border:1px solid #888;cursor:pointer}
button[value=approve]{background:#1974b8;color:#fff;border-color:#1974b8}
code{background:#f3f3f3;padding:.1rem .3rem;border-radius:4px}
</style></head><body><div class="box">${body}</div></body></html>`;
    }

    private consentPage(
        clientName: string,
        redirectHost: string,
        txn: string
    ): string {
        return this.page(`<h2>Connect to cBioPortal Navigator?</h2>
<p><strong>${escapeHtml(clientName)}</strong> wants to use cBioPortal Navigator on your behalf.</p>
<p>After you sign in, you will be sent back to <code>${escapeHtml(redirectHost)}</code>.
Only continue if you started this connection yourself.</p>
<form method="post" action="${escapeHtml(this.config.publicUrl)}/oauth/consent">
<input type="hidden" name="txn" value="${escapeHtml(txn)}">
<button type="submit" name="action" value="approve">Continue</button>
<button type="submit" name="action" value="deny">Cancel</button>
</form>`);
    }

    private messagePage(message: string): string {
        return this.page(
            `<h2>cBioPortal Navigator</h2><p>${escapeHtml(message)}</p>`
        );
    }
}
