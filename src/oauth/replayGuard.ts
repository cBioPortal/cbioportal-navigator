/**
 * Remembers single-use OAuth artifacts (authorization codes, refresh tokens)
 * that have been spent, and refresh-token families that have been revoked.
 *
 * Tokens themselves are stateless (see tokens.ts), so this is hardening, not
 * correctness: losing it (restart, eviction) never breaks a valid login, it
 * only reopens a short replay window. The in-memory implementation is
 * per-replica, which gives full single-use/rotation guarantees with one
 * replica. A shared backend (e.g. Redis `SET NX EX`) can implement the same
 * interface if the deployment ever runs several replicas.
 *
 * @packageDocumentation
 */

export interface ReplayGuard {
    /** Record `key`; true the first time, false if already recorded. */
    markUsed(key: string, ttlSeconds: number): Promise<boolean>;
    isMarked(key: string): Promise<boolean>;
}

export class MemoryReplayGuard implements ReplayGuard {
    private readonly entries = new Map<string, number>();

    /** Oldest entries are dropped beyond this; that only weakens replay protection. */
    constructor(private readonly maxEntries = 100_000) {}

    async markUsed(key: string, ttlSeconds: number): Promise<boolean> {
        if (await this.isMarked(key)) return false;
        this.entries.set(key, Date.now() + Math.max(ttlSeconds, 1) * 1000);
        this.prune();
        return true;
    }

    async isMarked(key: string): Promise<boolean> {
        const expiresAt = this.entries.get(key);
        if (expiresAt === undefined) return false;
        if (expiresAt > Date.now()) return true;
        this.entries.delete(key);
        return false;
    }

    /**
     * Drop entries from the oldest end while they are expired or the map is
     * over capacity. Entries further in are left for lazy expiry in isMarked.
     */
    private prune(): void {
        const now = Date.now();
        for (const [key, expiresAt] of this.entries) {
            const overCapacity = this.entries.size > this.maxEntries;
            if (!overCapacity && expiresAt > now) break;
            this.entries.delete(key);
        }
    }
}
