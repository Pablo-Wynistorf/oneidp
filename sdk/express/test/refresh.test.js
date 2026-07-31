/**
 * Auto-refresh through the middleware.
 *
 * The access token here is configured to be considered expired immediately
 * (validity below the refresh skew), so any authenticated request refreshes.
 * The point being pinned down: a refreshed ID token carries no profile or email
 * claims, so the cached user must survive the refresh untouched.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import express from 'express';

import { oneidp } from '../src/index.js';
import { startFakeOneidp } from './helpers/fake-oneidp.js';
import { createAgent } from './helpers/agent.js';

const CLIENT_ID = 'c'.repeat(64);
const CLIENT_SECRET = 's'.repeat(64);

async function buildApp({ refreshUserinfo }) {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));

  const appUrl = `http://127.0.0.1:${port}`;

  const idp = await startFakeOneidp({
    clients: [
      {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUri: `${appUrl}/auth/callback`,
        // Shorter than the 60s default skew, so it is always due for refresh.
        accessTokenValidity: 30,
        isPublicClient: false,
      },
    ],
  });

  const app = express();

  const auth = oneidp({
    issuer: idp.issuer,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: `${appUrl}/auth/callback`,
    secret: 'test-cookie-secret-at-least-32-chars',
    refreshUserinfo,
  });

  app.use(auth);

  app.get('/whoami', auth.requireAuth, async (req, res) => {
    const accessToken = await req.oneidp.getAccessToken();
    res.json({ accessToken, user: { name: req.oneidp.user.name, email: req.oneidp.user.email, roles: req.oneidp.user.roles } });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    appUrl,
    idp,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await idp.close();
    },
  };
}

describe('token refresh through the middleware', () => {
  let harness;

  before(async () => {
    harness = await buildApp({ refreshUserinfo: false });
  });

  after(async () => {
    await harness.close();
  });

  it('refreshes transparently and keeps the cached profile', async () => {
    const agent = createAgent();
    const login = await agent.request(`${harness.appUrl}/whoami`);
    const first = JSON.parse(login.body);

    assert.equal(first.user.name, 'Ada Lovelace');
    assert.equal(first.user.email, 'ada@example.com');

    const second = JSON.parse(
      (await agent.request(`${harness.appUrl}/whoami`, { headers: { accept: 'application/json' } })).body,
    );

    // A fresh access token came back...
    assert.notEqual(second.accessToken, first.accessToken);
    // ...and the profile did not degrade, even though the refreshed ID token
    // contains none of these claims.
    assert.deepEqual(second.user, first.user);
  });

  it('does not call userinfo unless asked to', async () => {
    const agent = createAgent();
    await agent.request(`${harness.appUrl}/whoami`);
    await agent.request(`${harness.appUrl}/whoami`, { headers: { accept: 'application/json' } });

    const userinfoCalls = harness.idp.log.filter((entry) => entry.path === '/api/oauth/userinfo');
    assert.equal(userinfoCalls.length, 0);
  });
});

describe('refreshUserinfo', () => {
  let harness;

  before(async () => {
    harness = await buildApp({ refreshUserinfo: true });
  });

  after(async () => {
    await harness.close();
  });

  it('re-reads the profile after refreshing', async () => {
    const agent = createAgent();
    await agent.request(`${harness.appUrl}/whoami`);

    const second = JSON.parse(
      (await agent.request(`${harness.appUrl}/whoami`, { headers: { accept: 'application/json' } })).body,
    );

    assert.deepEqual(second.user.roles, ['admin', 'billing']);
    assert.ok(harness.idp.log.some((entry) => entry.path === '/api/oauth/userinfo'));
  });
});
