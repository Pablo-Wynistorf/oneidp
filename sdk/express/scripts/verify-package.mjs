/**
 * Prove the published artifact works, not just the source tree.
 *
 * Packs the tarball, installs it into a throwaway project alongside a real
 * `express`, mounts the middleware, and drives one request through the login
 * route. This catches the mistakes unit tests cannot see: a
 * file missing from `files`, a broken `exports` map, a dependency that was only
 * ever present because it sat in the repo's own `node_modules`.
 *
 *   node scripts/verify-package.mjs
 *
 * No network access to an IdP is needed: `discovery: false` makes the client
 * derive endpoints from the issuer locally.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `import.meta.dirname` would need Node 21.2, and `engines` allows 20.
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function pack() {
  const before = new Set(readdirSync(packageDir).filter((name) => name.endsWith('.tgz')));
  run('npm', ['pack', '--silent'], packageDir);
  const created = readdirSync(packageDir)
    .filter((name) => name.endsWith('.tgz'))
    .filter((name) => !before.has(name));

  assert.equal(created.length, 1, `expected one new tarball, got ${created.join(', ') || 'none'}`);
  return join(packageDir, created[0]);
}

const CONSUMER = `
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { oneidp, bearerAuth, OneidpClient, ConfigurationError } from '@oneidp/express';

const ISSUER = 'https://oneidp.ch';
const CLIENT_ID = 'c'.repeat(64);

const app = express();

const auth = oneidp({
  issuer: ISSUER,
  clientId: CLIENT_ID,
  clientSecret: 's'.repeat(64),
  redirectUri: 'http://127.0.0.1:9/auth/callback',
  // Stateless: no session middleware, no store.
  secret: 'verify-package-secret-long-enough-x',
  // Endpoints are derived from the issuer, so this needs no network.
  discovery: false,
});

app.use(auth);
app.get('/', (req, res) => res.json({ authenticated: req.oneidp.isAuthenticated }));

// The named exports the README documents must all be reachable.
assert.equal(typeof oneidp, 'function');
assert.equal(typeof auth.requireAuth, 'function');
assert.equal(typeof auth.requireRoles, 'function');
assert.equal(typeof auth.bearerAuth, 'function');
assert.equal(typeof bearerAuth({ issuer: ISSUER, clientId: CLIENT_ID, discovery: false }), 'function');
assert.ok(new OneidpClient({ issuer: ISSUER, clientId: CLIENT_ID }) instanceof OneidpClient);
assert.throws(() => new OneidpClient({ issuer: ISSUER, clientId: CLIENT_ID, scope: 'nope' }), ConfigurationError);

const server = http.createServer(app);
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;

const anonymous = await fetch(base + '/');
assert.deepEqual(await anonymous.json(), { authenticated: false });

const login = await fetch(base + '/auth/login', { redirect: 'manual' });
assert.equal(login.status, 302, 'login route should redirect');

// The login transaction must be sealed into an HttpOnly cookie.
const setCookie = login.headers.getSetCookie().join(' | ');
assert.match(setCookie, /oneidp_tx=/);
assert.match(setCookie, /HttpOnly/);

const target = new URL(login.headers.get('location'));
assert.equal(target.origin + target.pathname, ISSUER + '/api/oauth/authorize');
assert.equal(target.searchParams.get('client_id'), CLIENT_ID);
assert.equal(target.searchParams.get('response_type'), 'code');
assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
assert.equal(target.searchParams.get('scope'), 'openid profile email');
assert.ok(target.searchParams.get('state'));
assert.ok(target.searchParams.get('nonce'));

await new Promise((done) => server.close(done));
console.log('installed package works');
`;

const tarball = pack();
const workdir = mkdtempSync(join(tmpdir(), 'oneidp-express-verify-'));

try {
  writeFileSync(
    join(workdir, 'package.json'),
    JSON.stringify({ name: 'consumer', private: true, type: 'module', version: '0.0.0' }, null, 2),
  );
  writeFileSync(join(workdir, 'consumer.mjs'), CONSUMER);

  console.log(`Installing ${tarball} into ${workdir}`);
  run('npm', ['install', '--no-audit', '--no-fund', '--silent', tarball, 'express'], workdir);

  process.stdout.write(run('node', ['consumer.mjs'], workdir));
} finally {
  rmSync(workdir, { recursive: true, force: true });
  rmSync(tarball, { force: true });
}
