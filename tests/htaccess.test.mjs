// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseApacheBlock } from '../config/apache.mjs';
import {
    authEnvKeysSet,
    buildSiteHtaccess,
    describeApacheConfig,
    mergeHtaccess,
} from '../scripts/lib/htaccess.mjs';
import { buildAuthHtaccessFile, buildHtaccess } from '../scripts/lib/auth.mjs';

const auth = {
    user: 'admin',
    password: 'password',
    serverRoot: '/home/user/site',
    htpasswdName: '.htpasswd',
    realm: 'My Site',
};

test('parseApacheBlock returns null when absent or enabling nothing', () => {
    assert.equal(parseApacheBlock(undefined), null);
    assert.equal(parseApacheBlock('yes'), null);
    assert.equal(parseApacheBlock([]), null);
    assert.equal(parseApacheBlock({}), null);
    assert.equal(parseApacheBlock({ forceHttps: 'true' }), null);
});

test('parseApacheBlock keeps valid options and drops unsafe 404 paths', () => {
    assert.deepEqual(parseApacheBlock({ forceHttps: true, notFoundPage: ' /404.html ' }), {
        forceHttps: true,
        notFoundPage: '/404.html',
    });
    assert.deepEqual(parseApacheBlock({ notFoundPage: '/404.html' }), {
        forceHttps: false,
        notFoundPage: '/404.html',
    });
    const warn = console.warn;
    console.warn = () => {};
    try {
        assert.deepEqual(parseApacheBlock({ forceHttps: true, notFoundPage: '404.html' }), {
            forceHttps: true,
            notFoundPage: null,
        });
        assert.equal(parseApacheBlock({ notFoundPage: '/a b"\nRewriteEngine Off' }), null);
    } finally {
        console.warn = warn;
    }
});

test('buildSiteHtaccess is empty without an apache block', () => {
    assert.equal(buildSiteHtaccess(null), '');
    assert.equal(buildSiteHtaccess(undefined), '');
    assert.equal(buildSiteHtaccess({ forceHttps: false, notFoundPage: null }), '');
});

test('buildSiteHtaccess emits the HTTPS redirect and the 404 page', () => {
    const rules = buildSiteHtaccess({ forceHttps: true, notFoundPage: '/404.html' });
    assert.match(rules, /^RewriteEngine On$/m);
    assert.match(rules, /^RewriteCond %\{HTTPS\} off$/m);
    assert.match(rules, /^RewriteCond %\{HTTP:X-Forwarded-Proto\} !https$/m);
    assert.match(rules, /^RewriteRule \^ https:\/\/%\{HTTP_HOST\}%\{REQUEST_URI\} \[L,R=301\]$/m);
    assert.match(rules, /^ErrorDocument 404 \/404\.html$/m);
    assert.ok(rules.endsWith('\n'));
});

test('buildSiteHtaccess emits only the configured rules', () => {
    const notFoundOnly = buildSiteHtaccess({ forceHttps: false, notFoundPage: '/404.html' });
    assert.doesNotMatch(notFoundOnly, /Rewrite/);
    assert.match(notFoundOnly, /ErrorDocument 404 \/404\.html/);
    const httpsOnly = buildSiteHtaccess({ forceHttps: true, notFoundPage: null });
    assert.doesNotMatch(httpsOnly, /ErrorDocument/);
});

test('mergeHtaccess joins non-empty sections, site rules first', () => {
    assert.equal(mergeHtaccess('', ''), '');
    assert.equal(mergeHtaccess('A\n', '\nB\n'), 'A\n\nB\n');
    assert.equal(mergeHtaccess('', 'B'), 'B\n');
});

test('buildAuthHtaccessFile prepends site rules and asks for credentials over HTTPS only', () => {
    const file = buildAuthHtaccessFile(auth, { forceHttps: true, notFoundPage: '/404.html' });
    const redirect = file.indexOf('RewriteRule');
    const authType = file.indexOf('AuthType Basic');
    assert.ok(redirect >= 0 && authType > redirect, 'site rules come before Basic Auth');
    assert.match(
        file,
        /<If "%\{HTTPS\} == 'on' \|\| %\{HTTP:X-Forwarded-Proto\} == 'https'">\n {4}AuthType Basic/,
    );
    assert.match(file, / {4}Require valid-user\n<\/If>/);
    assert.match(file, /<FilesMatch "\^\\\.ht">/);
});

test('buildAuthHtaccessFile without forceHttps keeps Basic Auth unconditional', () => {
    assert.equal(buildAuthHtaccessFile(auth, null), buildHtaccess(auth));
    const file = buildAuthHtaccessFile(auth, { forceHttps: false, notFoundPage: '/404.html' });
    assert.match(file, /^ErrorDocument 404 \/404\.html$/m);
    assert.doesNotMatch(file, /<If /);
    assert.match(file, /^AuthType Basic$/m);
});

test('describeApacheConfig and authEnvKeysSet support the scripts', () => {
    assert.match(describeApacheConfig(null), /^none/);
    assert.equal(
        describeApacheConfig({ forceHttps: true, notFoundPage: null }),
        'forceHttps=true, notFoundPage=none',
    );
    assert.deepEqual(authEnvKeysSet({}), []);
    assert.deepEqual(
        authEnvKeysSet({ AUTH_USER: 'reader', AUTH_PASSWORD: ' ', AUTH_SERVER_ROOT: '/home/u' }),
        ['AUTH_USER', 'AUTH_SERVER_ROOT'],
    );
});
