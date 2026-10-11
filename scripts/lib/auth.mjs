// @ts-check
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { Client as FtpClient } from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';
import { HTTPS_EXPRESSION, buildSiteHtaccess, mergeHtaccess } from './htaccess.mjs';

/**
 * @typedef {import('./deploy.mjs').DeployConfig} DeployConfig
 * @typedef {import('../../config/apache.mjs').ApacheConfig} ApacheConfig
 * @typedef {{
 *   user: string,
 *   password: string,
 *   serverRoot: string,
 *   htpasswdName: string,
 *   realm: string,
 * }} AuthConfig
 */

const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** @param {...Buffer} buffers */
function md5(...buffers) {
    const hash = crypto.createHash('md5');
    for (const buffer of buffers) hash.update(buffer);
    return hash.digest();
}

/**
 * Apache's custom base64-ish encoding (little-endian groups).
 * @param {number} value @param {number} count
 */
function to64(value, count) {
    let out = '';
    let v = value;
    for (let i = 0; i < count; i++) {
        out += ITOA64[v & 0x3f];
        v >>>= 6;
    }
    return out;
}

/**
 * Apache MD5 password hash (`$apr1$`), the default `htpasswd -m` format.
 * Salted, no external dependency, understood natively by Apache/o2switch.
 * @param {string} password
 * @param {string} salt Up to 8 chars from the apr1 alphabet.
 * @returns {string} e.g. `$apr1$<salt>$<hash>`
 */
export function apr1(password, salt) {
    const magic = '$apr1$';
    const pw = Buffer.from(password, 'utf8');
    const saltBuf = Buffer.from(salt, 'utf8');

    // Alternate digest: md5(password + salt + password).
    const alt = md5(pw, saltBuf, pw);

    /** @type {Buffer[]} */
    const ctx = [pw, Buffer.from(magic, 'ascii'), saltBuf];
    for (let pl = pw.length; pl > 0; pl -= 16) {
        ctx.push(alt.subarray(0, Math.min(pl, 16)));
    }
    // `final` is conceptually zeroed here; odd bits append a NUL byte, even bits the first pw byte.
    const zero = Buffer.from([0]);
    for (let i = pw.length; i !== 0; i >>= 1) {
        ctx.push(i & 1 ? zero : pw.subarray(0, 1));
    }
    let final = md5(...ctx);

    for (let i = 0; i < 1000; i++) {
        /** @type {Buffer[]} */
        const round = [];
        round.push(i & 1 ? pw : final);
        if (i % 3) round.push(saltBuf);
        if (i % 7) round.push(pw);
        round.push(i & 1 ? final : pw);
        final = md5(...round);
    }

    let encoded = '';
    encoded += to64((final[0] << 16) | (final[6] << 8) | final[12], 4);
    encoded += to64((final[1] << 16) | (final[7] << 8) | final[13], 4);
    encoded += to64((final[2] << 16) | (final[8] << 8) | final[14], 4);
    encoded += to64((final[3] << 16) | (final[9] << 8) | final[15], 4);
    encoded += to64((final[4] << 16) | (final[10] << 8) | final[5], 4);
    encoded += to64(final[11], 2);

    return `${magic}${salt}$${encoded}`;
}

/** @param {number} [len] @returns {string} */
function randomSalt(len = 8) {
    const bytes = crypto.randomBytes(len);
    let salt = '';
    for (let i = 0; i < len; i++) salt += ITOA64[bytes[i] & 0x3f];
    return salt;
}

/**
 * Reads and validates Basic Auth settings from the (already loaded) environment.
 * @returns {AuthConfig}
 */
export function authConfigFromEnv() {
    const user = process.env.AUTH_USER?.trim();
    const password = process.env.AUTH_PASSWORD;
    const serverRoot = process.env.AUTH_SERVER_ROOT?.trim();
    const htpasswdName = process.env.AUTH_HTPASSWD_NAME?.trim() || '.htpasswd';
    const realm = process.env.AUTH_REALM?.trim() || 'Restricted';

    const missing = [];
    if (!user) missing.push('AUTH_USER');
    if (!password) missing.push('AUTH_PASSWORD');
    if (!serverRoot) missing.push('AUTH_SERVER_ROOT');
    if (missing.length) {
        console.error(`❌ Basic Auth requires ${missing.join(', ')} in the vault .env file.`);
        console.error('   See the "Basic Auth" section of the vault .env.example.');
        process.exit(1);
    }

    if (!htpasswdName.startsWith('.')) {
        console.error('❌ AUTH_HTPASSWD_NAME should start with a dot so it stays hidden (e.g. .htpasswd).');
        process.exit(1);
    }

    return {
        user: /** @type {string} */ (user),
        password: /** @type {string} */ (password),
        serverRoot: /** @type {string} */ (serverRoot).replace(/\/+$/, ''),
        htpasswdName,
        realm,
    };
}

/**
 * @param {AuthConfig} auth
 * @returns {string} A single `user:hash` line.
 */
export function buildHtpasswd(auth) {
    return `${auth.user}:${apr1(auth.password, randomSalt())}\n`;
}

/**
 * @param {AuthConfig} auth
 * @param {{ httpsOnly?: boolean }} [options] `httpsOnly`: ask for credentials over HTTPS only, so
 *   the http:// → https:// redirect (site rules) happens before any password is sent in clear.
 * @returns {string} `.htaccess` content (Apache 2.4 Basic Auth).
 */
export function buildHtaccess(auth, { httpsOnly = false } = {}) {
    const authUserFile = `${auth.serverRoot}/${auth.htpasswdName}`;
    // AuthName must be quoted; escape any embedded quotes in the realm.
    const realm = auth.realm.replace(/"/g, '\\"');
    const directives = [
        'AuthType Basic',
        `AuthName "${realm}"`,
        `AuthUserFile ${authUserFile}`,
        'Require valid-user',
    ];
    const authBlock = httpsOnly
        ? [
              '# Credentials over HTTPS only; plain http:// is redirected by the site rules above.',
              `<If "${HTTPS_EXPRESSION}">`,
              ...directives.map((line) => `    ${line}`),
              '</If>',
          ]
        : directives;
    return [
        ...authBlock,
        '',
        '# Never serve the auth files themselves.',
        '<FilesMatch "^\\.ht">',
        '    Require all denied',
        '</FilesMatch>',
        '',
    ].join('\n');
}

/**
 * Full `.htaccess` for a protected site: site rules (site.config.json `apache`) then Basic Auth.
 * @param {AuthConfig} auth
 * @param {ApacheConfig | null | undefined} apache
 * @returns {string}
 */
export function buildAuthHtaccessFile(auth, apache) {
    return mergeHtaccess(
        buildSiteHtaccess(apache),
        buildHtaccess(auth, { httpsOnly: apache?.forceHttps === true }),
    );
}

/**
 * Site-root remote base (chroot root for FTPS, the configured dir for SFTP).
 * @param {string} remotePath
 */
function normalizeBase(remotePath) {
    return remotePath.replace(/\/+$/, '') || '/';
}

/** @param {string} dir @param {string} name */
const joinRemote = (dir, name) => (dir === '/' ? `/${name}` : `${dir}/${name}`);

/**
 * @param {DeployConfig} config
 * @param {(client: FtpClient, base: string) => Promise<void>} fn
 */
async function withFtps(config, fn) {
    const client = new FtpClient(120_000);
    try {
        await client.access({
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            secure: true,
            secureOptions: config.ftpsInsecure ? { rejectUnauthorized: false } : undefined,
        });
        const loginDir = (await client.pwd()).replace(/\/+$/, '') || '/';
        const base = normalizeBase(config.remotePath);
        if (base !== '/') await client.ensureDir(base);
        await client.cd(base);
        const absolute = base === '/' ? loginDir : `${loginDir}${base}`;
        console.log(`   Target: ftps://${config.host}:${config.port} (${absolute})`);
        await fn(client, base);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('CERT') || msg.includes('certificate') || msg.includes('altnames')) {
            console.error('❌ FTPS failed: TLS certificate does not match the FTP hostname.');
            console.error('   Set DEPLOY_FTPS_INSECURE=true in the vault .env (FileZilla ignores this).');
        } else {
            console.error('❌ FTPS operation failed:', error);
        }
        process.exit(1);
    } finally {
        client.close();
    }
}

/**
 * @param {DeployConfig} config
 * @param {(client: SftpClient, base: string) => Promise<void>} fn
 */
async function withSftp(config, fn) {
    const sftp = new SftpClient();
    try {
        await sftp.connect({
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            privateKey: config.privateKey,
            passphrase: config.passphrase,
        });
        const base = normalizeBase(config.remotePath);
        console.log(`   Target: sftp://${config.host}:${config.port}${base}`);
        await fn(sftp, base);
    } catch (error) {
        console.error('❌ SFTP operation failed:', error);
        process.exit(1);
    } finally {
        await sftp.end();
    }
}

/**
 * Uploads in-memory files to the site root, in order.
 * @param {DeployConfig} config
 * @param {{ name: string, content: string }[]} files
 */
export async function uploadRootFiles(config, files) {
    if (config.protocol === 'ftps') {
        await withFtps(config, async (client) => {
            for (const file of files) {
                await client.uploadFrom(Readable.from(Buffer.from(file.content, 'utf8')), file.name);
                console.log(`   ↑ ${file.name}`);
            }
        });
    } else {
        await withSftp(config, async (sftp, base) => {
            for (const file of files) {
                await sftp.put(Buffer.from(file.content, 'utf8'), joinRemote(base, file.name));
                console.log(`   ↑ ${file.name}`);
            }
        });
    }
}

/**
 * Generates and uploads `.htpasswd` then `.htaccess` (site rules + Basic Auth) to the site root.
 * @param {DeployConfig} config
 * @param {AuthConfig} auth
 * @param {{ apache?: ApacheConfig | null }} [options] site.config.json `apache` block.
 */
export async function installAuth(config, auth, { apache = null } = {}) {
    // Order matters: upload htpasswd first so .htaccess never points at a missing file.
    await uploadRootFiles(config, [
        { name: auth.htpasswdName, content: buildHtpasswd(auth) },
        { name: '.htaccess', content: buildAuthHtaccessFile(auth, apache) },
    ]);
}

/**
 * Removes Basic Auth from the site root. With site rules configured (`apache`), `.htaccess` is
 * replaced by the site rules alone instead of being deleted.
 * @param {DeployConfig} config
 * @param {AuthConfig} auth
 * @param {{ keepHtpasswd?: boolean, apache?: ApacheConfig | null }} [options]
 */
export async function removeAuth(config, auth, { keepHtpasswd = false, apache = null } = {}) {
    const siteRules = buildSiteHtaccess(apache);
    if (config.protocol === 'ftps') {
        await withFtps(config, async (client) => {
            if (siteRules) {
                await client.uploadFrom(Readable.from(Buffer.from(siteRules, 'utf8')), '.htaccess');
                console.log('   ↑ .htaccess (site rules only)');
            } else {
                await tryRemoveFtps(client, '.htaccess');
            }
            if (!keepHtpasswd) await tryRemoveFtps(client, auth.htpasswdName);
        });
    } else {
        await withSftp(config, async (sftp, base) => {
            if (siteRules) {
                await sftp.put(Buffer.from(siteRules, 'utf8'), joinRemote(base, '.htaccess'));
                console.log('   ↑ .htaccess (site rules only)');
            } else {
                await tryRemoveSftp(sftp, joinRemote(base, '.htaccess'));
            }
            if (!keepHtpasswd) await tryRemoveSftp(sftp, joinRemote(base, auth.htpasswdName));
        });
    }
}

/** @param {FtpClient} client @param {string} name */
async function tryRemoveFtps(client, name) {
    try {
        await client.remove(name);
        console.log(`   ✗ removed ${name}`);
    } catch {
        console.log(`   • ${name} not present (skipped)`);
    }
}

/** @param {SftpClient} sftp @param {string} remotePath */
async function tryRemoveSftp(sftp, remotePath) {
    try {
        if (await sftp.exists(remotePath)) {
            await sftp.delete(remotePath);
            console.log(`   ✗ removed ${remotePath}`);
        } else {
            console.log(`   • ${remotePath} not present (skipped)`);
        }
    } catch {
        console.log(`   • ${remotePath} not present (skipped)`);
    }
}
