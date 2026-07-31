/** End-to-end: a browser signing in through the middleware against a fake IdP. */

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import express from 'express';

import { bearerAuth, oneidp } from '../src/index.js';
import { startFakeOneidp } from './helpers/fake-oneidp.js';
import { createAgent } from './helpers/agent.js';

describe('login flow', () => {
  let idp;
  let server;
  let appUrl;
  let auth;

  before(async () => {
    // Two ports are needed before either app can be configured, so the app
    // listens first and the client is registered with its real callback URL.
    const appServer = http.createServer();
    await new Promise((resolve) => appServer.listen(0, '127.0.0.1', resolve));
    const { port } = appServer.address();
    await new Promise((resolve) => appServer.close(resolve));

    appUrl = `http://127.0.0.1:${port}`;

    idp = await startFakeOneidp({
      clients: [
        {
          clientId: 'c'.repeat(64),
          clientSecret: 's'.repeat(64),
          redirectUri: `${appUrl}/auth/callback`,
          accessTokenValidity: 3600,
          isPublicClient: false,
        },
      ],
    });

    const app = express();
    app.set('trust proxy', true);

    auth = oneidp({
      issuer: idp.issuer,
      clientId: 'c'.repeat(64),
      clientSecret: 's'.repeat(64),
      redirectUri: `${appUrl}/auth/callback`,
      // No session middleware and no store: state lives in a sealed cookie.
      secret: 'test-cookie-secret-at-least-32-chars',
      postLogoutRedirectUri: `${appUrl}/goodbye`,
      routes: { me: '/auth/me' },
    });

    app.use(auth);

    app.get('/', (req, res) => {
      res.type('html').send(req.oneidp.isAuthenticated ? `hello ${req.oneidp.user.name}` : 'anonymous');
    });

    app.get('/private', auth.requireAuth, (req, res) => {
      res.type('html').send(`private:${req.oneidp.user.sub}`);
    });

    app.get('/admin', auth.requireRoles('admin'), (req, res) => {
      res.type('html').send('admin area');
    });

    app.get('/owner', auth.requireRoles('owner'), (req, res) => {
      res.type('html').send('owner area');
    });

    app.get('/token', auth.requireAuth, async (req, res) => {
      res.json({ accessToken: await req.oneidp.getAccessToken() });
    });

    app.get('/live', auth.requireAuth, async (req, res) => {
      res.json({ active: await req.oneidp.isSessionActive() });
    });

    app.get('/api/ping', auth.bearerAuth, (req, res) => {
      res.json({ sub: req.oneidp.user.sub, method: req.oneidp.authMethod });
    });

    app.get('/api/strict', auth.bearerAuth({ verifySession: true }), (req, res) => {
      res.json({ ok: true });
    });

    app.get('/api/profile', auth.bearerAuth({ loadUserinfo: true }), (req, res) => {
      res.json({ email: req.oneidp.user.email, roles: req.oneidp.user.roles });
    });

    // A standalone guard, configured with nothing but issuer and client id.
    app.get(
      '/standalone/ping',
      bearerAuth({ issuer: idp.issuer, clientId: 'c'.repeat(64) }),
      (req, res) => res.json({ sub: req.oneidp.user.sub, method: req.oneidp.authMethod }),
    );

    app.get('/goodbye', (req, res) => res.type('html').send('bye'));

    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, _next) => {
      res.status(error.status ?? 500).json({ code: error.code, message: error.message });
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await idp.close();
  });

  it('sends an unauthenticated browser through the IdP and back', async () => {
    const agent = createAgent();

    const { body, hops } = await agent.request(`${appUrl}/private`);

    assert.equal(body, 'private:482913');

    // login -> IdP authorize -> callback -> original destination
    const paths = hops.map((hop) => new URL(hop.url).pathname);
    assert.deepEqual(paths, [
      '/private',
      '/auth/login',
      '/api/oauth/authorize',
      '/auth/callback',
      '/private',
    ]);
  });

  it('requests PKCE, state, nonce and response_type=code', async () => {
    const agent = createAgent();
    await agent.request(`${appUrl}/private`);

    const authorize = idp.log.filter((entry) => entry.path === '/api/oauth/authorize').at(-1);

    assert.equal(authorize.query.response_type, 'code');
    assert.equal(authorize.query.code_challenge_method, 'S256');
    assert.equal(authorize.query.scope, 'openid profile email');
    assert.match(authorize.query.code_challenge, /^[\w-]{43}$/);
    assert.ok(authorize.query.state);
    assert.ok(authorize.query.nonce);
    // URL-safe, because ONEIDP interpolates state into the redirect unencoded.
    assert.doesNotMatch(authorize.query.state, /[&=?#/+]/);
  });

  it('exposes mapped ONEIDP claims', async () => {
    const agent = createAgent();
    await agent.request(`${appUrl}/private`);

    const { body } = await agent.request(`${appUrl}/auth/me`, { headers: { accept: 'application/json' } });
    const user = JSON.parse(body);

    assert.deepEqual(user, {
      sub: '482913',
      username: 'ada',
      name: 'Ada Lovelace',
      givenName: 'Ada',
      familyName: 'Lovelace',
      email: 'ada@example.com',
      roles: ['admin', 'billing'],
      mfaEnabled: true,
    });
  });

  it('keeps the session across requests', async () => {
    const agent = createAgent();
    await agent.request(`${appUrl}/private`);

    const { body } = await agent.request(`${appUrl}/`);
    assert.equal(body, 'hello Ada Lovelace');
  });

  it('answers 401 JSON for API callers instead of redirecting', async () => {
    const agent = createAgent();
    const { response, body } = await agent.request(`${appUrl}/private`, {
      headers: { accept: 'application/json' },
    });

    assert.equal(response.status, 401);
    assert.equal(JSON.parse(body).error, 'unauthenticated');
  });

  it('allows a held role and denies a missing one', async () => {
    const agent = createAgent();
    await agent.request(`${appUrl}/private`);

    const allowed = await agent.request(`${appUrl}/admin`);
    assert.equal(allowed.body, 'admin area');

    const denied = await agent.request(`${appUrl}/owner`);
    assert.equal(denied.response.status, 403);
    assert.deepEqual(JSON.parse(denied.body), {
      error: 'forbidden',
      required_roles: ['owner'],
      mode: 'any',
    });
  });

  it('rejects a callback with no login in progress', async () => {
    const agent = createAgent();
    const { response, body } = await agent.request(`${appUrl}/auth/callback?code=abc&state=nope`);

    assert.equal(response.status, 400);
    assert.equal(JSON.parse(body).code, 'state_mismatch');
  });

  it('rejects a callback with no code', async () => {
    const agent = createAgent();
    const { response, body } = await agent.request(`${appUrl}/auth/callback?state=nope`);

    assert.equal(response.status, 400);
    assert.equal(JSON.parse(body).code, 'invalid_request');
  });

  it('refuses an off-site returnTo', async () => {
    const agent = createAgent();
    const { hops } = await agent.request(`${appUrl}/auth/login?returnTo=https://evil.example.com/`);

    const final = hops.at(-1);
    assert.equal(new URL(final.url).origin, appUrl);
  });

  it('checks the live session at the IdP', async () => {
    const agent = createAgent();
    await agent.request(`${appUrl}/private`);

    const { body } = await agent.request(`${appUrl}/live`, { headers: { accept: 'application/json' } });
    assert.deepEqual(JSON.parse(body), { active: true });
  });

  it('clears the local session on logout and visits the IdP', async () => {
    const agent = createAgent();
    await agent.request(`${appUrl}/private`);

    const { hops, body } = await agent.request(`${appUrl}/auth/logout`);

    assert.equal(body, 'bye');
    assert.ok(hops.some((hop) => new URL(hop.url).pathname === '/api/oauth/logout'));

    const after = await agent.request(`${appUrl}/`);
    assert.equal(after.body, 'anonymous');
  });

  describe('bearer tokens', () => {
    async function getAccessToken() {
      const agent = createAgent();
      await agent.request(`${appUrl}/private`);
      const { body } = await agent.request(`${appUrl}/token`, { headers: { accept: 'application/json' } });
      return JSON.parse(body).accessToken;
    }

    it('accepts a valid token', async () => {
      const token = await getAccessToken();
      const { response, body } = await createAgent().request(`${appUrl}/api/ping`, {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(body), { sub: '482913', method: 'bearer' });
    });

    it('rejects a missing token with WWW-Authenticate', async () => {
      const { response } = await createAgent().request(`${appUrl}/api/ping`, {
        headers: { accept: 'application/json' },
      });

      assert.equal(response.status, 401);
      assert.match(response.headers.get('www-authenticate'), /^Bearer realm="oneidp"/);
    });

    it('rejects a garbage token', async () => {
      const { response, body } = await createAgent().request(`${appUrl}/api/ping`, {
        headers: { accept: 'application/json', authorization: 'Bearer not-a-jwt' },
      });

      assert.equal(response.status, 401);
      assert.equal(JSON.parse(body).error, 'invalid_token');
    });

    it('works as a standalone guard, with no secret, cookie or redirect URI', async () => {
      const token = await getAccessToken();
      const { response, body } = await createAgent().request(`${appUrl}/standalone/ping`, {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(body), { sub: '482913', method: 'bearer' });
    });

    it('loads the profile on request, since access tokens carry none', async () => {
      const token = await getAccessToken();
      const { body } = await createAgent().request(`${appUrl}/api/profile`, {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      });

      assert.deepEqual(JSON.parse(body), {
        email: 'ada@example.com',
        roles: ['admin', 'billing'],
      });
    });

    it('catches a revoked session that still verifies locally', async () => {
      const token = await getAccessToken();
      const agent = createAgent();

      const before = await agent.request(`${appUrl}/api/strict`, {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      });
      assert.equal(before.response.status, 200);

      // What /revoke or /logout does server-side: the JWT stays signed and
      // unexpired, only the session record goes.
      const { decodeJwt } = await import('jose');
      idp.endSession(decodeJwt(token).osid);

      const lenient = await agent.request(`${appUrl}/api/ping`, {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      });
      assert.equal(lenient.response.status, 200, 'local validation cannot see revocation');

      const strict = await agent.request(`${appUrl}/api/strict`, {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      });
      assert.equal(strict.response.status, 401, 'verifySession catches it');
    });
  });
});
