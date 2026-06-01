// @ts-check
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { apr1, buildHtaccess, buildHtpasswd, authConfigFromEnv } from '../scripts/lib/auth.mjs';

/** @type {NodeJS.ProcessEnv} */
let savedEnv;

beforeEach(() => {
    savedEnv = { ...process.env };
});

afterEach(() => {
    process.env = savedEnv;
});

test('apr1 produces stable Apache MD5 hash', () => {
    assert.equal(apr1('password', 'xx'), '$apr1$xx$2eRrCdRwKOfJOth0w31wR.');
});

test('buildHtpasswd emits user:hash line', () => {
    const line = buildHtpasswd({
        user: 'admin',
        password: 'password',
        serverRoot: '/home/user',
        htpasswdName: '.htpasswd',
        realm: 'Restricted',
    });
    assert.match(line, /^admin:\$apr1\$[./A-Za-z0-9]{8}\$/);
    assert.ok(line.endsWith('\n'));
});

test('buildHtaccess includes Basic Auth directives and file protection', () => {
    const content = buildHtaccess({
        user: 'admin',
        password: 'password',
        serverRoot: '/home/user/public_html',
        htpasswdName: '.htpasswd',
        realm: 'My Site',
    });
    assert.match(content, /^AuthType Basic/m);
    assert.match(content, /AuthName "My Site"/);
    assert.match(content, /AuthUserFile \/home\/user\/public_html\/\.htpasswd/);
    assert.match(content, /Require valid-user/);
    assert.match(content, /<FilesMatch "\^\\\.ht">/);
});

test('authConfigFromEnv reads required vars and defaults', () => {
    process.env.AUTH_USER = 'admin';
    process.env.AUTH_PASSWORD = 'secret';
    process.env.AUTH_SERVER_ROOT = '/home/user/public_html/';
    delete process.env.AUTH_HTPASSWD_NAME;
    delete process.env.AUTH_REALM;

    const auth = authConfigFromEnv();
    assert.equal(auth.user, 'admin');
    assert.equal(auth.password, 'secret');
    assert.equal(auth.serverRoot, '/home/user/public_html');
    assert.equal(auth.htpasswdName, '.htpasswd');
    assert.equal(auth.realm, 'Restricted');
});
