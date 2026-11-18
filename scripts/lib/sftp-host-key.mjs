// @ts-check
/**
 * SSH host key check for SFTP connections.
 *
 * Without a check, ssh2 accepts any server key: someone able to sit between this machine and the host could
 * pose as the server and receive the deploy password. With `DEPLOY_HOST_FINGERPRINT` set (the
 * `SHA256:…` value printed by `ssh-keygen -lf` or shown at the first connection), a server presenting another
 * key is refused before any credential is sent. Without it, the connection goes on as before and the server's
 * fingerprint is printed with the line to add to the vault `.env`.
 */
import crypto from 'node:crypto';

/**
 * OpenSSH-style fingerprint of a raw host key: `SHA256:` + unpadded base64 of its SHA-256.
 * @param {Buffer} key
 */
export function hostKeyFingerprint(key) {
    return `SHA256:${crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
}

/**
 * Normalizes a fingerprint as written by a person: optional `SHA256:` prefix, optional base64 padding.
 * @param {string} value
 */
export function normalizeFingerprint(value) {
    return `SHA256:${value.trim().replace(/^SHA256:/i, '').replace(/=+$/, '')}`;
}

/**
 * ssh2 `hostVerifier` for the given expected fingerprint (or none).
 * @param {string | undefined} expected
 * @param {(message: string) => void} [log]
 * @returns {(key: Buffer) => boolean}
 */
export function createHostVerifier(expected, log = (m) => console.warn(m)) {
    return (key) => {
        const actual = hostKeyFingerprint(key);
        if (!expected) {
            log(
                `⚠️  SFTP host key not checked. Server fingerprint: ${actual}\n` +
                    `   Check it with your host, then add to the vault .env: DEPLOY_HOST_FINGERPRINT=${actual}`,
            );
            return true;
        }
        if (normalizeFingerprint(expected) === actual) return true;
        log(
            `❌ SFTP host key mismatch: expected ${normalizeFingerprint(expected)}, server sent ${actual}. ` +
                'Connection refused (no credential sent). If the host changed its key, update DEPLOY_HOST_FINGERPRINT.',
        );
        return false;
    };
}

/**
 * Connection options for ssh2-sftp-client, host key check included.
 * @param {import('./deploy.mjs').DeployConfig} config
 */
export function sftpConnectOptions(config) {
    return {
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
        passphrase: config.passphrase,
        hostVerifier: createHostVerifier(config.hostFingerprint),
    };
}
