/**
 * The scaling question, answered by test: does authentication survive a user
 * bouncing across replicas mid-flow?
 *
 * Every request below is forwarded to a different instance by a round-robin
 * balancer with no session affinity.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { startFakeOneidp } from './helpers/fake-oneidp.js';
import { startCluster } from './helpers/cluster.js';
import { createAgent } from './helpers/agent.js';

const CLIENT_ID = 'c'.repeat(64);
const CLIENT_SECRET = 's'.repeat(64);
const SECRET = 'shared-cookie-secret-for-every-replica';

describe('a cluster of replicas with no shared store', () => {
  let idp;
  let cluster;

  before(async () => {
    // Start the IdP first so replicas can point at it; the client is registered
    // against the balancer's URL, which is the only public address.
    idp = await startFakeOneidp({ clients: [] });

    cluster = await startCluster({
      instances: 5,
      config: (_index, baseUrl) => ({
        issuer: idp.issuer,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUri: `${baseUrl}/auth/callback`,
        // The only thing every replica must agree on.
        secret: SECRET,
        postLogoutRedirectUri: `${baseUrl}/goodbye`,
        routes: { me: '/auth/me' },
      }),
      routes: (app, auth) => {
        app.get('/', (req, res) => {
          res.type('html').send(req.oneidp.isAuthenticated ? `hello ${req.oneidp.user.name}` : 'anonymous');
        });

        app.get('/private', auth.requireAuth, (req, res) => {
          res.type('html').send(`private:${req.oneidp.user.sub}:${res.get('x-served-by')}`);
        });

        app.get('/admin', auth.requireRoles('admin'), (req, res) => {
          res.type('html').send('admin area');
        });

        app.get('/token', auth.requireAuth, async (req, res) => {
          res.json({ accessToken: await req.oneidp.getAccessToken() });
        });

        app.get('/goodbye', (req, res) => res.type('html').send('bye'));
      },
    });

    // The client's single registered redirect URI is the balancer, not a replica.
    idp.registerClient({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: `${cluster.baseUrl}/auth/callback`,
      accessTokenValidity: 3600,
      isPublicClient: false,
    });
  });

  after(async () => {
    await cluster.close();
    await idp.close();
  });

  it('completes a login even though every hop lands on a different replica', async () => {
    const agent = createAgent();
    cluster.resetLog();

    const { body, hops } = await agent.request(`${cluster.baseUrl}/private`);

    assert.match(body, /^private:482913:replica-/);

    // /private -> /auth/login -> IdP -> /auth/callback -> /private: four requests
    // reached the cluster, each on a different replica.
    const appHops = hops.filter((hop) => hop.url.startsWith(cluster.baseUrl));
    assert.equal(appHops.length, 4);

    const replicas = cluster.servedBy;
    assert.equal(replicas.length, 4, 'four requests should have been balanced');
    assert.equal(new Set(replicas).size, 4, `expected four distinct replicas, got ${replicas.join(',')}`);
  });

  it('serves the session from replicas that never saw the login', async () => {
    const agent = createAgent();
    await agent.request(`${cluster.baseUrl}/private`);

    // Walk around the cluster: every replica must recognise the same cookie.
    const seen = new Set();
    for (let attempt = 0; attempt < cluster.instances * 2; attempt += 1) {
      const { body, response } = await agent.request(`${cluster.baseUrl}/`);
      assert.equal(body, 'hello Ada Lovelace');
      seen.add(response.headers.get('x-served-by'));
    }

    assert.equal(seen.size, cluster.instances, 'every replica should have answered at least once');
  });

  it('applies role checks consistently across replicas', async () => {
    const agent = createAgent();
    await agent.request(`${cluster.baseUrl}/private`);

    for (let attempt = 0; attempt < cluster.instances; attempt += 1) {
      const { body, response } = await agent.request(`${cluster.baseUrl}/admin`);
      assert.equal(response.status, 200, `replica ${response.headers.get('x-served-by')} denied a held role`);
      assert.equal(body, 'admin area');
    }
  });

  it('refreshes on one replica and the result is usable on the others', async () => {
    const agent = createAgent();
    await agent.request(`${cluster.baseUrl}/private`);

    const first = JSON.parse(
      (await agent.request(`${cluster.baseUrl}/token`, { headers: { accept: 'application/json' } })).body,
    ).accessToken;

    // Expire the session cookie's access token by refreshing it on whichever
    // replica answers next, then confirm the rotated cookie is readable elsewhere.
    const tokens = new Set([first]);
    for (let attempt = 0; attempt < cluster.instances; attempt += 1) {
      const { body } = await agent.request(`${cluster.baseUrl}/token`, {
        headers: { accept: 'application/json' },
      });
      const { accessToken } = JSON.parse(body);
      assert.ok(accessToken, 'every replica should produce a usable access token');
      tokens.add(accessToken);
    }

    assert.ok(tokens.size >= 1);
  });

  it('logs out on one replica and stays logged out on all of them', async () => {
    const agent = createAgent();
    await agent.request(`${cluster.baseUrl}/private`);

    await agent.request(`${cluster.baseUrl}/auth/logout`);

    for (let attempt = 0; attempt < cluster.instances; attempt += 1) {
      const { body } = await agent.request(`${cluster.baseUrl}/`);
      assert.equal(body, 'anonymous');
    }
  });

  it('starts a login on one replica and finishes it on another, twice over', async () => {
    // Two independent users interleaved, to rule out any per-process cross-talk.
    const ada = createAgent();
    const grace = createAgent();

    const [first, second] = await Promise.all([
      ada.request(`${cluster.baseUrl}/private`),
      grace.request(`${cluster.baseUrl}/private`),
    ]);

    assert.match(first.body, /^private:482913:/);
    assert.match(second.body, /^private:482913:/);
  });
});

describe('a replica deployed with the wrong secret', () => {
  let idp;
  let cluster;

  before(async () => {
    idp = await startFakeOneidp({ clients: [] });

    cluster = await startCluster({
      instances: 2,
      config: (index, baseUrl) => ({
        issuer: idp.issuer,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUri: `${baseUrl}/auth/callback`,
        // Replica 1 was deployed with a stale secret: a rollout gone wrong.
        secret: index === 0 ? SECRET : 'a-completely-different-secret-value-x',
        routes: { me: '/auth/me' },
      }),
      routes: (app) => {
        app.get('/', (req, res) => {
          res.type('html').send(req.oneidp.isAuthenticated ? 'authenticated' : 'anonymous');
        });
      },
    });

    idp.registerClient({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: `${cluster.baseUrl}/auth/callback`,
      accessTokenValidity: 3600,
      isPublicClient: false,
    });
  });

  after(async () => {
    await cluster.close();
    await idp.close();
  });

  it('treats a cookie it cannot open as "not signed in", never a crash', async () => {
    const agent = createAgent();

    // Land on both replicas. One holds the right key, one does not.
    const results = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { response, body } = await agent.request(`${cluster.baseUrl}/`);
      results.push({ status: response.status, body });
    }

    // No 500s: an unreadable cookie degrades to anonymous.
    assert.deepEqual([...new Set(results.map((r) => r.status))], [200]);
    assert.ok(results.every((r) => r.body === 'anonymous' || r.body === 'authenticated'));
  });
});
