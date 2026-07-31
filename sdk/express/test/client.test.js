/** Client-level behaviour, including the ONEIDP quirks worth pinning down. */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ConfigurationError, OneidpClient, TokenError, defaultEndpoints } from '../src/index.js';
import { startFakeOneidp } from './helpers/fake-oneidp.js';

const CLIENT_ID = 'c'.repeat(64);
const CLIENT_SECRET = 's'.repeat(64);
const PUBLIC_CLIENT_ID = 'p'.repeat(64);
const REDIRECT_URI = 'https://app.example.com/callback';

describe('configuration', () => {
  const base = { issuer: 'https://oneidp.ch', clientId: CLIENT_ID };

  it('requires an issuer and a client id', () => {
    assert.throws(() => new OneidpClient({ clientId: CLIENT_ID }), ConfigurationError);
    assert.throws(() => new OneidpClient({ issuer: 'https://oneidp.ch' }), ConfigurationError);
  });

  it('trims a trailing slash, since the issuer must match the iss claim exactly', () => {
    assert.equal(new OneidpClient({ ...base, issuer: 'https://oneidp.ch/' }).issuer, 'https://oneidp.ch');
  });

  it('insists on https except on localhost', () => {
    assert.throws(() => new OneidpClient({ ...base, issuer: 'http://oneidp.ch' }), ConfigurationError);
    assert.doesNotThrow(() => new OneidpClient({ ...base, issuer: 'http://localhost:3000' }));
  });

  it('rejects a redirect URI ONEIDP could not register', () => {
    // The registration regex rejects `?`, `&`, `=` and `%`.
    assert.throws(
      () => new OneidpClient({ ...base, redirectUri: 'https://app.example.com/cb?tenant=acme' }),
      ConfigurationError,
    );
    assert.throws(
      () => new OneidpClient({ ...base, redirectUri: 'https://app.example.com/cb~1' }),
      ConfigurationError,
    );
    assert.doesNotThrow(() => new OneidpClient({ ...base, redirectUri: REDIRECT_URI }));
  });

  it('rejects scopes the instance does not support', () => {
    assert.throws(() => new OneidpClient({ ...base, scope: 'openid groups' }), ConfigurationError);
  });

  it('always includes openid', () => {
    assert.equal(new OneidpClient({ ...base, scope: 'profile' }).scope, 'openid profile');
    assert.equal(new OneidpClient({ ...base, scope: ['email'] }).scope, 'openid email');
  });

  it('treats a missing secret as a public client', () => {
    const publicClient = new OneidpClient(base);
    assert.equal(publicClient.isConfidential, false);
    assert.equal(publicClient.canRefresh, false);

    const confidential = new OneidpClient({ ...base, clientSecret: CLIENT_SECRET });
    assert.equal(confidential.canRefresh, true);
  });

  it('derives the standard endpoints from the issuer alone', () => {
    assert.deepEqual(defaultEndpoints('https://oneidp.ch'), {
      authorization_endpoint: 'https://oneidp.ch/api/oauth/authorize',
      token_endpoint: 'https://oneidp.ch/api/oauth/token',
      userinfo_endpoint: 'https://oneidp.ch/api/oauth/userinfo',
      end_session_endpoint: 'https://oneidp.ch/api/oauth/logout',
      revocation_endpoint: 'https://oneidp.ch/api/oauth/revoke',
      jwks_uri: 'https://oneidp.ch/.well-known/jwks.json',
      check_token_endpoint: 'https://oneidp.ch/api/oauth/check_token',
    });
  });

  it('works with discovery switched off', async () => {
    const client = new OneidpClient({ ...base, discovery: false });
    const endpoints = await client.endpoints();
    assert.equal(endpoints.token_endpoint, 'https://oneidp.ch/api/oauth/token');
  });

  it('falls back to derived paths when discovery is unreachable', async () => {
    const warnings = [];
    const client = new OneidpClient({
      ...base,
      // Nothing listening: discovery must fail without taking logins down.
      issuer: 'http://127.0.0.1:1',
      timeout: 300,
      onWarning: (message) => warnings.push(message),
    });

    const endpoints = await client.endpoints();
    assert.equal(endpoints.token_endpoint, 'http://127.0.0.1:1/api/oauth/token');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Discovery failed/);
  });
});

describe('protocol', () => {
  let idp;
  let client;
  let publicClient;

  before(async () => {
    idp = await startFakeOneidp({
      clients: [
        {
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          redirectUri: REDIRECT_URI,
          accessTokenValidity: 3600,
          isPublicClient: false,
        },
        {
          clientId: PUBLIC_CLIENT_ID,
          redirectUri: REDIRECT_URI,
          accessTokenValidity: 900,
          isPublicClient: true,
        },
      ],
    });

    client = new OneidpClient({
      issuer: idp.issuer,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: REDIRECT_URI,
    });

    publicClient = new OneidpClient({
      issuer: idp.issuer,
      clientId: PUBLIC_CLIENT_ID,
      redirectUri: REDIRECT_URI,
    });
  });

  after(async () => {
    await idp.close();
  });

  /** Walk the authorize redirect the way a browser would, and return the code. */
  async function getCode(target, authState) {
    const url = await target.buildAuthorizationUrl(authState);
    const response = await fetch(url, { redirect: 'manual' });
    const location = response.headers.get('location');
    assert.ok(location, `expected a redirect, got ${response.status}`);
    return new URL(location).searchParams.get('code');
  }

  it('completes a confidential code exchange', async () => {
    const authState = client.createAuthorizationState();
    const code = await getCode(client, authState);

    const result = await client.exchangeCode(code, {
      codeVerifier: authState.codeVerifier,
      nonce: authState.nonce,
    });

    assert.ok(result.accessToken);
    assert.ok(result.idToken);
    // Always issued on this grant, whether or not offline_access was requested.
    assert.ok(result.refreshToken);
    assert.equal(result.tokenType, 'Bearer');
    assert.equal(result.expiresIn, 3600);
    assert.equal(result.claims.nonce, authState.nonce);
    assert.equal(result.user.sub, '482913');
    assert.deepEqual(result.user.roles, ['admin', 'billing']);
  });

  it('rejects a code that has already been used', async () => {
    const authState = client.createAuthorizationState();
    const code = await getCode(client, authState);

    await client.exchangeCode(code, { codeVerifier: authState.codeVerifier, nonce: authState.nonce });

    await assert.rejects(
      () => client.exchangeCode(code, { codeVerifier: authState.codeVerifier, nonce: authState.nonce }),
      (error) => {
        assert.ok(error instanceof TokenError);
        assert.equal(error.code, 'invalid_grant');
        // The 20 second TTL is the usual cause, so the hint says so.
        assert.match(error.hint, /20 seconds/);
        return true;
      },
    );
  });

  it('explains an expired code', async () => {
    const authState = client.createAuthorizationState();
    const code = await getCode(client, authState);
    idp.expireCodes();

    await assert.rejects(
      () => client.exchangeCode(code, { codeVerifier: authState.codeVerifier, nonce: authState.nonce }),
      /expired authorization code/i,
    );
  });

  it('detects a nonce mismatch', async () => {
    const authState = client.createAuthorizationState();
    const code = await getCode(client, authState);

    await assert.rejects(
      () => client.exchangeCode(code, { codeVerifier: authState.codeVerifier, nonce: 'not-the-nonce' }),
      /nonce/i,
    );
  });

  it('lets a public client through with PKCE and blocks it without', async () => {
    const authState = publicClient.createAuthorizationState();
    const code = await getCode(publicClient, authState);

    const result = await publicClient.exchangeCode(code, {
      codeVerifier: authState.codeVerifier,
      nonce: authState.nonce,
    });
    assert.ok(result.accessToken);

    const second = publicClient.createAuthorizationState();
    const secondCode = await getCode(publicClient, second);

    await assert.rejects(
      () => publicClient.exchangeCode(secondCode, { codeVerifier: null, nonce: second.nonce }),
      (error) => {
        assert.equal(error.code, 'invalid_grant');
        assert.match(error.message, /must use PKCE/);
        return true;
      },
    );
  });

  it('refuses to refresh without a secret', async () => {
    await assert.rejects(() => publicClient.refresh('whatever'), (error) => {
      assert.equal(error.code, 'unsupported_grant_type');
      assert.match(error.hint, /public clients/i);
      return true;
    });
  });

  it('refreshes, and the new ID token has lost its profile claims', async () => {
    const authState = client.createAuthorizationState();
    const code = await getCode(client, authState);
    const first = await client.exchangeCode(code, {
      codeVerifier: authState.codeVerifier,
      nonce: authState.nonce,
    });

    assert.equal(first.claims.email, 'ada@example.com');

    const refreshed = await client.refresh(first.refreshToken);

    assert.ok(refreshed.accessToken);
    assert.notEqual(refreshed.accessToken, first.accessToken);
    // No rotation server-side, so the SDK carries the original forward.
    assert.equal(refreshed.refreshToken, first.refreshToken);
    // The documented gotcha: base claims only, and no nonce.
    assert.equal(refreshed.claims.sub, '482913');
    assert.equal(refreshed.claims.email, undefined);
    assert.equal(refreshed.claims.roles, undefined);
    assert.equal(refreshed.claims.nonce, undefined);
  });

  it('coalesces concurrent refreshes of the same token', async () => {
    const authState = client.createAuthorizationState();
    const code = await getCode(client, authState);
    const first = await client.exchangeCode(code, {
      codeVerifier: authState.codeVerifier,
      nonce: authState.nonce,
    });

    const before = idp.log.filter((entry) => entry.path === '/api/oauth/token').length;

    const results = await Promise.all([
      client.refresh(first.refreshToken),
      client.refresh(first.refreshToken),
      client.refresh(first.refreshToken),
    ]);

    const calls = idp.log.filter((entry) => entry.path === '/api/oauth/token').length - before;
    assert.equal(calls, 1, 'three concurrent refreshes should hit the IdP once');
    assert.equal(new Set(results.map((result) => result.accessToken)).size, 1);
  });

  it('reports an invalid refresh token', async () => {
    const authState = client.createAuthorizationState();
    const code = await getCode(client, authState);
    const first = await client.exchangeCode(code, {
      codeVerifier: authState.codeVerifier,
      nonce: authState.nonce,
    });

    idp.endRefreshSession(first.refreshToken);

    await assert.rejects(() => client.refresh(first.refreshToken), (error) => {
      assert.equal(error.code, 'invalid_grant');
      assert.match(error.hint, /20 days/);
      return true;
    });
  });

  it('reads the profile, checks liveness, and revokes', async () => {
    const authState = client.createAuthorizationState();
    const code = await getCode(client, authState);
    const tokens = await client.exchangeCode(code, {
      codeVerifier: authState.codeVerifier,
      nonce: authState.nonce,
    });

    const user = await client.userinfo(tokens.accessToken);
    assert.equal(user.email, 'ada@example.com');
    // ONEIDP sends firstName/lastName rather than given_name/family_name.
    assert.equal(user.givenName, 'Ada');
    assert.equal(user.familyName, 'Lovelace');

    assert.equal(await client.checkToken(tokens.accessToken), true);
    assert.equal(await client.revoke(tokens.accessToken), true);
    assert.equal(await client.checkToken(tokens.accessToken), false);

    // Revocation only touches the access token's session; the refresh token is
    // still good, which is exactly why it must be treated as a secret.
    const stillWorks = await client.refresh(tokens.refreshToken);
    assert.ok(stillWorks.accessToken);
  });

  it('rejects a token signed by the wrong key', async () => {
    const { SignJWT, generateKeyPair } = await import('jose');
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });

    const forged = await new SignJWT({ sub: '482913' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .setIssuer(idp.issuer)
      .setAudience(CLIENT_ID)
      .setExpirationTime('1h')
      .sign(privateKey);

    await assert.rejects(() => client.validateIdToken(forged), /validation failed/i);
  });

  it('rejects a token issued for another client', async () => {
    const authState = publicClient.createAuthorizationState();
    const code = await getCode(publicClient, authState);
    const other = await publicClient.exchangeCode(code, {
      codeVerifier: authState.codeVerifier,
      nonce: authState.nonce,
    });

    await assert.rejects(() => client.validateIdToken(other.idToken), /"aud" claim/i);
  });

  it('builds a logout URL', async () => {
    const url = new URL(
      await client.buildLogoutUrl({ idToken: 'the-id-token', postLogoutRedirectUri: 'https://app.example.com/' }),
    );

    assert.equal(url.pathname, '/api/oauth/logout');
    assert.equal(url.searchParams.get('id_token_hint'), 'the-id-token');
    assert.equal(url.searchParams.get('post_logout_redirect_uri'), 'https://app.example.com/');
  });
});
