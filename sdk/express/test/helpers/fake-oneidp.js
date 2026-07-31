/**
 * A stand-in ONEIDP instance for the tests.
 *
 * It signs real RS256 tokens with a real JWKS, and reproduces the behaviours the
 * SDK exists to paper over: 20 second single-use codes, refreshed ID tokens that
 * drop profile claims, `401` instead of `400` on grant errors, and a revoke
 * endpoint that always answers `200 { success: true }`.
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

export async function startFakeOneidp({ clients = [] } = {}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  const kid = 'test-key';
  jwk.kid = kid;
  jwk.alg = 'RS256';

  const registry = new Map(clients.map((client) => [client.clientId, client]));
  const codes = new Map();
  const sessions = new Set();
  const refreshSessions = new Map();

  /** Requests received, for assertions about what the SDK actually sent. */
  const log = [];

  let issuer = '';

  const user = {
    userId: '482913',
    username: 'ada',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    roles: ['admin', 'billing'],
    mfaEnabled: true,
  };

  async function sign(payload, expiresIn) {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(privateKey);
  }

  function json(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(payload);
  }

  async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (raw === '') return {};
    if ((req.headers['content-type'] ?? '').includes('application/json')) return JSON.parse(raw);
    return Object.fromEntries(new URLSearchParams(raw));
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, issuer);
    log.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams) });

    /* ------------------------------------------------------------ metadata */

    if (url.pathname === '/.well-known/openid-configuration') {
      json(res, 200, {
        issuer,
        authorization_endpoint: `${issuer}/api/oauth/authorize`,
        token_endpoint: `${issuer}/api/oauth/token`,
        userinfo_endpoint: `${issuer}/api/oauth/userinfo`,
        end_session_endpoint: `${issuer}/api/oauth/logout`,
        revocation_endpoint: `${issuer}/api/oauth/revoke`,
        jwks_uri: `${issuer}/.well-known/jwks.json`,
        // Advertised by the real instance but not implemented. The SDK must not
        // act on these.
        response_types_supported: ['code', 'token', 'id_token', 'code id_token'],
        token_endpoint_auth_signing_alg_values_supported: ['RS256'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
        id_token_signing_alg_values_supported: ['RS256'],
      });
      return;
    }

    if (url.pathname === '/.well-known/jwks.json') {
      json(res, 200, { keys: [jwk] });
      return;
    }

    /* ----------------------------------------------------------- authorize */

    if (url.pathname === '/api/oauth/authorize') {
      const clientId = url.searchParams.get('client_id');
      const redirectUri = url.searchParams.get('redirect_uri');
      const client = registry.get(clientId);

      if (!client) {
        json(res, 401, { error: 'Invalid Request', error_description: 'Invalid client_id provided' });
        return;
      }
      // Strict equality, as in the real implementation.
      if (redirectUri !== client.redirectUri) {
        json(res, 405, { error: 'Invalid Request', error_description: 'Provided redirect_uri not allowed' });
        return;
      }

      const code = randomUUID().replaceAll('-', '');
      codes.set(code, {
        clientId,
        redirectUri,
        scope: url.searchParams.get('scope') ?? 'openid',
        nonce: url.searchParams.get('nonce') ?? undefined,
        codeChallenge: url.searchParams.get('code_challenge') ?? undefined,
        codeChallengeMethod: url.searchParams.get('code_challenge_method') ?? undefined,
        expiresAt: Date.now() + 20_000,
      });

      const state = url.searchParams.get('state');
      // Interpolated without encoding, exactly like the real endpoint. A state
      // containing `&` or `=` would corrupt this URL.
      const location = state ? `${redirectUri}?code=${code}&state=${state}` : `${redirectUri}?code=${code}`;
      res.writeHead(302, { location });
      res.end();
      return;
    }

    /* --------------------------------------------------------------- token */

    if (url.pathname === '/api/oauth/token') {
      const body = await readBody(req);
      const grantType = body.grant_type;

      if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
        json(res, 400, { error: 'unsupported_grant_type', error_description: 'Only authorization_code and refresh_token are supported' });
        return;
      }

      const client = registry.get(body.client_id);
      if (!client) {
        json(res, 401, { error: 'invalid_client', error_description: 'Invalid client credentials or public client not found' });
        return;
      }
      if (!client.isPublicClient && body.client_secret !== client.clientSecret) {
        json(res, 401, { error: 'invalid_client', error_description: 'client_secret is required for confidential clients' });
        return;
      }

      if (grantType === 'refresh_token') {
        if (client.isPublicClient || !body.client_secret) {
          json(res, 401, { error: 'invalid_client', error_description: 'Invalid client credentials or refresh token' });
          return;
        }
        if (!refreshSessions.has(body.refresh_token)) {
          json(res, 401, { error: 'invalid_grant', error_description: 'Refresh Token is invalid or expired' });
          return;
        }

        const osid = randomUUID();
        sessions.add(osid);

        json(res, 200, {
          access_token: await sign(
            { userId: user.userId, osid, clientId: client.clientId, iss: issuer, sub: user.userId, aud: client.clientId },
            `${client.accessTokenValidity}s`,
          ),
          expires_in: client.accessTokenValidity,
          token_type: 'Bearer',
          // Base claims only: the refresh grant loses the original scope, so no
          // profile, no email, no nonce. And no new refresh token.
          id_token: await sign(
            { iss: issuer, sub: user.userId, aud: client.clientId, osid },
            '48h',
          ),
        });
        return;
      }

      const record = codes.get(body.code);
      if (!record || record.expiresAt < Date.now()) {
        json(res, 401, { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });
        return;
      }

      if (!body.redirect_uri || body.redirect_uri !== record.redirectUri) {
        codes.delete(body.code);
        json(res, 400, { error: 'invalid_request', error_description: 'redirect_uri does not match the one used in the authorization request' });
        return;
      }

      // Single use.
      codes.delete(body.code);

      if (body.code_verifier) {
        const { createHash } = await import('node:crypto');
        const expected = createHash('sha256').update(body.code_verifier).digest('base64url');
        if (expected !== record.codeChallenge) {
          json(res, 401, { error: 'invalid_grant', error_description: 'Code verifier does not match code challenge' });
          return;
        }
      } else if (client.isPublicClient) {
        json(res, 401, { error: 'invalid_grant', error_description: 'Public clients must use PKCE' });
        return;
      }

      const scope = record.scope.split(' ');
      const osid = randomUUID();
      sessions.add(osid);

      const idClaims = { iss: issuer, sub: user.userId, aud: client.clientId, osid };
      if (record.nonce) idClaims.nonce = record.nonce;
      if (scope.includes('profile')) {
        idClaims.username = user.username;
        idClaims.name = `${user.firstName} ${user.lastName}`;
        idClaims.given_name = user.firstName;
        idClaims.family_name = user.lastName;
        idClaims.roles = user.roles;
        idClaims.mfaEnabled = user.mfaEnabled;
      }
      if (scope.includes('email')) idClaims.email = user.email;

      const refreshToken = await sign(
        { userId: user.userId, orsid: randomUUID(), clientId: client.clientId, iss: issuer, sub: user.userId, aud: client.clientId },
        '20d',
      );
      // Always issued, whether or not offline_access was requested.
      refreshSessions.set(refreshToken, client.clientId);

      json(res, 200, {
        access_token: await sign(
          { userId: user.userId, osid, clientId: client.clientId, iss: issuer, sub: user.userId, aud: client.clientId },
          `${client.accessTokenValidity}s`,
        ),
        expires_in: client.accessTokenValidity,
        token_type: 'Bearer',
        id_token: await sign(idClaims, '48h'),
        refresh_token: refreshToken,
      });
      return;
    }

    /* ------------------------------------------------------------ userinfo */

    if (url.pathname === '/api/oauth/userinfo') {
      const token = (req.headers.authorization ?? '').replace(/^Bearer /i, '');
      if (!token) {
        json(res, 400, { success: false, error: 'Access Token not provided' });
        return;
      }
      // Scope is ignored here, as in the real implementation.
      json(res, 200, {
        sub: user.userId,
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        roles: user.roles,
        mfaEnabled: user.mfaEnabled,
      });
      return;
    }

    if (url.pathname === '/api/oauth/check_token') {
      const token = (req.headers.authorization ?? '').replace(/^Bearer /i, '');
      if (!token) {
        json(res, 400, { success: false, error: 'Access Token not provided' });
        return;
      }
      const { decodeJwt } = await import('jose');
      const { osid } = decodeJwt(token);
      if (!sessions.has(osid)) {
        json(res, 401, { success: false, error: 'Access Token is invalid' });
        return;
      }
      json(res, 200, { success: true, description: 'Access Token is valid' });
      return;
    }

    if (url.pathname === '/api/oauth/revoke') {
      const body = await readBody(req);
      const { decodeJwt } = await import('jose');
      try {
        const { osid } = decodeJwt(body.token);
        // Only the access token's session. Refresh tokens survive.
        sessions.delete(osid);
      } catch {
        // Ignored: the real endpoint answers 200 before validating.
      }
      json(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/oauth/logout') {
      const postLogout = url.searchParams.get('post_logout_redirect_uri');
      if (!url.searchParams.get('id_token_hint')) {
        json(res, 400, { error: 'invalid_request', error_description: 'Token not provided' });
        return;
      }
      // Not validated against the client, and redirects before checking.
      res.writeHead(302, { location: postLogout ?? '/' });
      res.end();
      return;
    }

    json(res, 404, { error: 'not_found' });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${server.address().port}`;

  return {
    issuer,
    user,
    log,
    /**
     * Register a client after startup, for when its redirect URI is only known
     * once the app (or its load balancer) is listening.
     */
    registerClient(client) {
      registry.set(client.clientId, client);
    },
    /** Kill the session behind an access token, as `/revoke` would. */
    endSession(osid) {
      sessions.delete(osid);
    },
    /** Invalidate a refresh token server-side. */
    endRefreshSession(refreshToken) {
      refreshSessions.delete(refreshToken);
    },
    expireCodes() {
      for (const record of codes.values()) record.expiresAt = 0;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
