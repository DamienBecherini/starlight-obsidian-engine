// @ts-check
import fs from 'node:fs';
import path from 'node:path';

/**
 * Loads `.env` from `envRoot` into `process.env`.
 * @param {string} envRoot Directory containing `.env`
 * @param {{ override?: boolean }} [options] When `override` is true, existing variables are replaced.
 */
export function loadEnvFile(envRoot, { override = false } = {}) {
    const envPath = path.join(envRoot, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
        if (!match || line.trimStart().startsWith('#')) continue;
        const key = match[1];
        const value = match[2].replace(/^["']|["']$/g, '').trim();
        if (override || process.env[key] === undefined) process.env[key] = value;
    }
}
