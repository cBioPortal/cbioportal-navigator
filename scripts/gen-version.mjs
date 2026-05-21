import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

let version;
try {
    version = execSync('git log -1 --format=%h').toString().trim();
} catch {
    const env = process.env.GIT_VERSION ?? 'unknown';
    // github.sha is 40 chars — truncate to short form
    version = /^[0-9a-f]{40}$/.test(env) ? env.slice(0, 7) : env;
}
writeFileSync('src/version.ts', `export const GIT_VERSION = ${JSON.stringify(version)};\n`);
