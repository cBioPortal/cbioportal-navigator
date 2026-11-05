/**
 * Self-contained OAuth artifacts: everything this server issues carries its
 * own state, so any replica with the same secret can verify it and restarts
 * don't invalidate anything.
 *
 * All of them are encrypted (JWE, `dir` + A256GCM): client registrations,
 * the upstream login transaction, authorization codes, refresh tokens and
 * access tokens. Their contents (PKCE verifiers, emails, the forwarded
 * cBioPortal token) must not be readable by clients or anyone who sees a
 * token in transit.
 *
 * Each artifact has a `typ` claim so one kind can't be replayed as another
 * (e.g. an authorization code presented as a refresh token). Keys are
 * derived per secret with HKDF and identified by `kid`, so rotating
 * MCP_AUTH_SECRET keeps artifacts issued under the previous secret valid.
 *
 * @packageDocumentation
 */

import { createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import {
    EncryptJWT,
    decodeProtectedHeader,
    jwtDecrypt,
    type JWTPayload,
} from 'jose';

export type ArtifactType = 'client' | 'txn' | 'code' | 'refresh' | 'access';

interface Key {
    kid: string;
    sign: Uint8Array;
    encrypt: Uint8Array;
}

function deriveKey(secret: string): Key {
    const derive = (info: string) =>
        new Uint8Array(
            hkdfSync('sha256', secret, 'cbioportal-navigator-oauth', info, 32)
        );
    return {
        kid: createHash('sha256')
            .update(secret)
            .digest('base64url')
            .slice(0, 8),
        sign: derive('sign'),
        encrypt: derive('encrypt'),
    };
}

export function randomId(bytes = 16): string {
    return randomBytes(bytes).toString('base64url');
}

/** Short stable fingerprint, used to bind artifacts to a client_id. */
export function fingerprint(value: string): string {
    return createHash('sha256').update(value).digest('base64url').slice(0, 22);
}

export class Keyring {
    private readonly keys: Key[];

    constructor(
        secrets: string[],
        private readonly issuer: string
    ) {
        this.keys = secrets.map(deriveKey);
    }

    private get current(): Key {
        return this.keys[0];
    }

    private keyFor(token: string): Key | undefined {
        try {
            const { kid } = decodeProtectedHeader(token);
            return this.keys.find((key) => key.kid === kid);
        } catch {
            return undefined;
        }
    }

    /** Encrypt `claims` as an artifact of type `typ`, optionally expiring. */
    async seal(
        typ: ArtifactType,
        claims: JWTPayload,
        ttlSeconds?: number
    ): Promise<string> {
        const jwt = new EncryptJWT({ ...claims, typ })
            .setProtectedHeader({
                alg: 'dir',
                enc: 'A256GCM',
                kid: this.current.kid,
            })
            .setIssuer(this.issuer)
            .setIssuedAt();
        if (ttlSeconds !== undefined) jwt.setExpirationTime(`${ttlSeconds}s`);
        return jwt.encrypt(this.current.encrypt);
    }

    /** Decrypt and validate an artifact; undefined if invalid, expired, of another type, or for another audience. */
    async open(
        typ: ArtifactType,
        token: string,
        audience?: string
    ): Promise<JWTPayload | undefined> {
        const key = this.keyFor(token);
        if (!key) return undefined;
        try {
            const { payload } = await jwtDecrypt(token, key.encrypt, {
                issuer: this.issuer,
                ...(audience !== undefined && { audience }),
            });
            return payload.typ === typ ? payload : undefined;
        } catch {
            return undefined;
        }
    }

    /** Client secret for a confidential client, derived from its client_id. */
    clientSecret(clientId: string): string | undefined {
        const key = this.keyFor(clientId);
        if (!key) return undefined;
        return createHmac('sha256', key.sign)
            .update(`client-secret:${clientId}`)
            .digest('base64url');
    }
}
