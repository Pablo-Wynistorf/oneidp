/**
 * The ONEIDP client: everything protocol-level, with no Express in sight.
 *
 * Use this directly if you are not building a web app (background jobs, scripts,
 * a resource server) or if you want to drive the flow yourself. The Express
 * middleware in `middleware.js` is a thin layer over these methods.
 */

import { jwtVerify, decodeJwt } from 'jose';
import { createProvider } from './discovery.js';
import {
  ApiError,
  ConfigurationError,
  IdTokenError,
  TokenError,
  errorFromResponse,
} from './errors.js';
import { codeChallenge, randomCodeVerifier, randomNonce, randomState } from './crypto.js';

const ALLOWED_SCOPES = new Set(['openid', 'profile', 'email', 'offline_access']);

/**
 * ONEIDP registers redirect URIs against `^[a-zA-Z0-9\.:\/_!?-]+$`, which
 * excludes `%`, `&`, `=`, `~` and `@`. A URI that fails this cannot be
 * registered, so catching it here turns a confusing runtime redirect mismatch
 * into a startup error.
 */
const REGISTRABLE_URI = /^[a-zA-Z0-9.:/_!?-]+$/;

function normaliseIssuer(issuer) {
  if (typeof issuer !== 'string' || issuer.trim() === '') {
    throw new ConfigurationError('`issuer` is required, for example https://oneidp.ch');
  }

  const trimmed = issuer.trim().replace(/\/+$/, '');

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConfigurationError(`\`issuer\` is not a valid URL: ${issuer}`);
  }

  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new ConfigurationError(
      `\`issuer\` must use https (got ${parsed.protocol}//). Tokens and codes travel over this origin.`,
    );
  }

  return trimmed;
}

function normaliseScope(scope) {
  const list = (Array.isArray(scope) ? scope : String(scope).split(/\s+/)).filter(Boolean);
  const unique = [...new Set(list)];

  const invalid = unique.filter((entry) => !ALLOWED_SCOPES.has(entry));
  if (invalid.length > 0) {
    throw new ConfigurationError(
      `Unsupported scope(s): ${invalid.join(', ')}. ONEIDP allows openid, profile, email, offline_access.`,
    );
  }

  // Without `openid` this is not an OIDC request and no ID token comes back.
  if (!unique.includes('openid')) unique.unshift('openid');

  return unique.join(' ');
}

function validateRedirectUri(redirectUri) {
  if (typeof redirectUri !== 'string' || redirectUri.trim() === '') {
    throw new ConfigurationError('`redirectUri` is required and must match the value registered in ONEIDP');
  }

  const value = redirectUri.trim();

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigurationError(`\`redirectUri\` is not an absolute URL: ${redirectUri}`);
  }

  if (parsed.search || parsed.hash) {
    throw new ConfigurationError(
      `\`redirectUri\` must not carry a query string or fragment: ${redirectUri}`,
      {
        hint:
          'ONEIDP compares the redirect URI with strict equality and its validation regex rejects `?`, ' +
          '`&`, `=` and `%`. Use a plain path such as https://app.example.com/callback.',
      },
    );
  }

  if (!REGISTRABLE_URI.test(value)) {
    throw new ConfigurationError(
      `\`redirectUri\` contains characters ONEIDP will not accept at registration: ${redirectUri}`,
      { hint: 'Allowed characters are letters, digits and . : / _ ! ? -' },
    );
  }

  return value;
}

/** ONEIDP claim names mapped to a stable shape, with the raw claims kept. */
export function mapClaimsToUser(claims) {
  const roles = Array.isArray(claims.roles) ? claims.roles : [];

  return {
    // The only identifier safe to key records on. Usernames and emails change.
    sub: claims.sub,
    username: claims.username ?? null,
    name: claims.name ?? null,
    givenName: claims.given_name ?? claims.firstName ?? null,
    familyName: claims.family_name ?? claims.lastName ?? null,
    email: claims.email ?? null,
    roles,
    // Whether the account has TOTP configured, not whether it was used to sign
    // in. ONEIDP issues no `amr`/`acr`, so this cannot tell you the latter.
    mfaEnabled: claims.mfaEnabled ?? null,
    raw: claims,
  };
}

export class OneidpClient {
  #provider;
  #config;
  #refreshInFlight = new Map();

  constructor(options = {}) {
    const {
      issuer,
      clientId,
      clientSecret,
      redirectUri,
      scope = 'openid profile email',
      pkce = true,
      clockTolerance = 5,
      timeout = 10_000,
      discovery = true,
      endpoints,
      fetch: fetchImpl,
      onWarning = (message) => console.warn(`[oneidp] ${message}`),
    } = options;

    if (typeof clientId !== 'string' || clientId.trim() === '') {
      throw new ConfigurationError('`clientId` is required. Register an application at /oidc/apps.');
    }

    const normalisedIssuer = normaliseIssuer(issuer);

    this.#config = {
      issuer: normalisedIssuer,
      clientId: clientId.trim(),
      clientSecret: clientSecret?.trim() || null,
      redirectUri: redirectUri === undefined ? null : validateRedirectUri(redirectUri),
      scope: normaliseScope(scope),
      // Optional for confidential clients and verified when sent, so it is on by
      // default: it costs nothing and removes a class of code interception.
      pkce: Boolean(pkce),
      clockTolerance,
      timeout,
      fetch: fetchImpl ?? globalThis.fetch,
      onWarning,
    };

    this.#provider = createProvider({
      issuer: normalisedIssuer,
      endpoints,
      discovery,
      fetch: this.#config.fetch,
      timeout,
      onWarning,
    });
  }

  get issuer() {
    return this.#config.issuer;
  }

  get clientId() {
    return this.#config.clientId;
  }

  get scope() {
    return this.#config.scope;
  }

  get redirectUri() {
    return this.#config.redirectUri;
  }

  /** Confidential clients hold a secret; only they can refresh or revoke. */
  get isConfidential() {
    return this.#config.clientSecret !== null;
  }

  get canRefresh() {
    return this.isConfidential;
  }

  endpoints() {
    return this.#provider.endpoints();
  }

  /* ---------------------------------------------------------------- authorize */

  /**
   * Fresh `state`, `nonce` and PKCE verifier for one login attempt. Store the
   * result server-side and pass it back to `exchangeCode`.
   */
  createAuthorizationState() {
    return {
      state: randomState(),
      nonce: randomNonce(),
      codeVerifier: this.#config.pkce ? randomCodeVerifier() : null,
      createdAt: Date.now(),
    };
  }

  /**
   * The URL to send the browser to. This is a navigation, never a fetch: the
   * OAuth endpoints only allow CORS from the IdP's own origin.
   */
  async buildAuthorizationUrl({ state, nonce, codeVerifier, scope, redirectUri } = {}) {
    const { authorization_endpoint: authorizationEndpoint } = await this.endpoints();
    const url = new URL(authorizationEndpoint);

    const effectiveRedirectUri = redirectUri ?? this.#config.redirectUri;
    if (!effectiveRedirectUri) {
      throw new ConfigurationError('`redirectUri` is required to build an authorization URL');
    }

    url.searchParams.set('client_id', this.#config.clientId);
    url.searchParams.set('redirect_uri', effectiveRedirectUri);
    // Not read by ONEIDP, which always runs the code flow. Sent because strict
    // client libraries and proxies expect it.
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scope ? normaliseScope(scope) : this.#config.scope);

    if (state) url.searchParams.set('state', state);
    if (nonce) url.searchParams.set('nonce', nonce);

    if (codeVerifier) {
      url.searchParams.set('code_challenge', codeChallenge(codeVerifier));
      // S256 only. ONEIDP rejects `plain`.
      url.searchParams.set('code_challenge_method', 'S256');
    }

    return url.href;
  }

  /* -------------------------------------------------------------------- token */

  async #postToken(params) {
    const { token_endpoint: tokenEndpoint } = await this.endpoints();

    const body = new URLSearchParams(params);
    body.set('client_id', this.#config.clientId);

    // client_secret_post on both grants. `client_secret_basic` is only parsed on
    // the authorization_code grant server-side, so using the body throughout is
    // the one option that works everywhere.
    if (this.#config.clientSecret) body.set('client_secret', this.#config.clientSecret);

    let response;
    try {
      response = await this.#config.fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body,
        signal: AbortSignal.timeout(this.#config.timeout),
      });
    } catch (error) {
      throw new TokenError(`Token request to ${tokenEndpoint} failed`, {
        code: 'network_error',
        cause: error,
      });
    }

    const payload = await readJson(response);

    if (!response.ok) {
      throw errorFromResponse(response, payload, {
        ErrorClass: TokenError,
        fallbackCode: 'token_request_failed',
      });
    }

    if (!payload?.access_token) {
      throw new TokenError('Token response contained no access_token', { code: 'invalid_token_response' });
    }

    return payload;
  }

  /**
   * Exchange an authorization code for tokens and validate the ID token.
   *
   * Codes expire 20 seconds after issue and are single use, so call this as soon
   * as the callback arrives.
   *
   * @param {string} code
   * @param {{ codeVerifier?: string|null, nonce?: string|null, redirectUri?: string }} [options]
   */
  async exchangeCode(code, { codeVerifier = null, nonce = null, redirectUri } = {}) {
    if (typeof code !== 'string' || code === '') {
      throw new TokenError('No authorization code provided', { code: 'invalid_request' });
    }

    const effectiveRedirectUri = redirectUri ?? this.#config.redirectUri;

    const params = {
      grant_type: 'authorization_code',
      code,
      // Required, and compared for strict equality against the authorize request.
      redirect_uri: effectiveRedirectUri,
    };
    if (codeVerifier) params.code_verifier = codeVerifier;

    const tokens = await this.#postToken(params);
    const claims = await this.validateIdToken(tokens.id_token, { nonce });

    return { ...this.#shapeTokens(tokens), claims, user: mapClaimsToUser(claims) };
  }

  /**
   * Swap a refresh token for a new access token.
   *
   * Requires a client secret; public clients cannot refresh and must re-run the
   * authorize flow, which is silent while the IdP session is alive.
   *
   * The ID token that comes back carries only `iss`, `sub`, `aud`, `iat`, `exp`
   * and `osid`: the refresh grant does not recover the original scope, so
   * profile and email claims are dropped and there is no `nonce`. Keep the user
   * profile from the initial exchange, or call `userinfo()` afterwards. Nothing
   * new is issued for the refresh token itself; the original stays valid for its
   * full 20 days.
   */
  async refresh(refreshToken) {
    if (!this.canRefresh) {
      throw new TokenError('Refreshing requires a client secret', {
        code: 'unsupported_grant_type',
        hint:
          'ONEIDP rejects the refresh grant without a secret. Public clients should redirect through ' +
          '/authorize again instead, which does not prompt while the IdP session is alive.',
      });
    }

    if (typeof refreshToken !== 'string' || refreshToken === '') {
      throw new TokenError('No refresh token provided', { code: 'invalid_grant' });
    }

    // Concurrent requests on the same session would otherwise each refresh.
    const existing = this.#refreshInFlight.get(refreshToken);
    if (existing) return existing;

    const attempt = (async () => {
      const tokens = await this.#postToken({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      // No nonce expected here: refreshed ID tokens do not carry one.
      const claims = tokens.id_token ? await this.validateIdToken(tokens.id_token, { nonce: null }) : null;

      return {
        // No rotation server-side, so the caller keeps the token it already has.
        ...this.#shapeTokens({ refresh_token: refreshToken, ...tokens }),
        claims,
      };
    })().finally(() => {
      this.#refreshInFlight.delete(refreshToken);
    });

    this.#refreshInFlight.set(refreshToken, attempt);
    return attempt;
  }

  #shapeTokens(tokens) {
    return {
      accessToken: tokens.access_token,
      idToken: tokens.id_token ?? null,
      refreshToken: tokens.refresh_token ?? null,
      tokenType: tokens.token_type ?? 'Bearer',
      expiresIn: tokens.expires_in ?? null,
      // Drive refreshes from this, never from the ID token's `exp`: ID tokens
      // live a fixed 48 hours and routinely outlive the access token.
      expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
    };
  }

  /* ------------------------------------------------------------- validation */

  /**
   * Verify an ID token: RS256 signature against the JWKS, `iss`, `aud`, `exp`,
   * and `nonce` when one was requested.
   *
   * `at_hash` and `auth_time` are not checked because ONEIDP does not issue
   * them.
   */
  async validateIdToken(idToken, { nonce = null } = {}) {
    if (typeof idToken !== 'string' || idToken === '') {
      throw new IdTokenError('Token response contained no id_token', {
        hint: 'Request the `openid` scope, which the SDK adds by default.',
      });
    }

    const jwks = await this.#provider.jwks();

    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, jwks, {
        // Pinned: ONEIDP signs with one static RS256 key.
        algorithms: ['RS256'],
        issuer: this.#config.issuer,
        audience: this.#config.clientId,
        clockTolerance: this.#config.clockTolerance,
      }));
    } catch (error) {
      throw new IdTokenError(`ID token validation failed: ${error.message}`, { cause: error });
    }

    if (nonce !== null && nonce !== undefined) {
      if (payload.nonce !== nonce) {
        throw new IdTokenError('ID token nonce does not match the authorization request', {
          code: 'nonce_mismatch',
        });
      }
    }

    return payload;
  }

  /**
   * Verify an access token locally.
   *
   * Signature, `iss`, `aud` and `exp` only. Revocation in ONEIDP is
   * session-based, so a token whose session was ended by `/revoke` or `/logout`
   * still passes here until it expires. Pass `verifySession: true` to also check
   * the live session, at the cost of a call to the IdP.
   */
  async validateAccessToken(accessToken, { verifySession = false, audience } = {}) {
    if (typeof accessToken !== 'string' || accessToken === '') {
      throw new ApiError('No access token provided', { code: 'invalid_token', status: 401 });
    }

    const jwks = await this.#provider.jwks();

    let payload;
    try {
      ({ payload } = await jwtVerify(accessToken, jwks, {
        algorithms: ['RS256'],
        issuer: this.#config.issuer,
        audience: audience ?? this.#config.clientId,
        clockTolerance: this.#config.clockTolerance,
      }));
    } catch (error) {
      throw new ApiError(`Access token validation failed: ${error.message}`, {
        code: 'invalid_token',
        status: 401,
        cause: error,
      });
    }

    if (verifySession) {
      const live = await this.checkToken(accessToken);
      if (!live) {
        throw new ApiError('Access token session is no longer active', {
          code: 'invalid_token',
          status: 401,
          hint: 'The token signature is still valid but the session behind it was revoked or logged out.',
        });
      }
    }

    return payload;
  }

  /** Claims without verifying anything. Debugging only. */
  decode(token) {
    return decodeJwt(token);
  }

  /* ----------------------------------------------------------------- profile */

  /**
   * Fetch the profile for an access token.
   *
   * Every call checks the server-side session, so this doubles as a liveness
   * check. It also ignores the granted scope and returns email and name for a
   * bare `openid` grant, so do not read consent from the response. Do not call
   * it per request: cache the result in your session.
   */
  async userinfo(accessToken) {
    const { userinfo_endpoint: userinfoEndpoint } = await this.endpoints();

    const response = await this.#call(userinfoEndpoint, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    });

    const payload = await readJson(response);

    if (!response.ok) {
      throw errorFromResponse(response, payload, {
        ErrorClass: ApiError,
        fallbackCode: 'userinfo_failed',
        context: 'userinfo',
      });
    }

    return mapClaimsToUser(payload);
  }

  /**
   * Is this access token still backed by a live session?
   *
   * Non-standard ONEIDP endpoint, not RFC 7662 introspection: it returns a
   * boolean and no claims. Resolves false rather than throwing, so it can be
   * used in a conditional.
   */
  async checkToken(accessToken) {
    const { check_token_endpoint: checkTokenEndpoint } = await this.endpoints();

    const response = await this.#call(checkTokenEndpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    });

    return response.ok;
  }

  /**
   * End the session behind an access token.
   *
   * Two things worth knowing. The endpoint answers `200 { success: true }`
   * before it has validated anything, so the response cannot confirm the
   * revocation; this method resolves true when the request was accepted, not
   * when revocation is proven. And only the access token's session dies:
   * **refresh tokens cannot be revoked through the API** and keep minting access
   * tokens for up to 20 days. To cut a user off completely they have to remove
   * the app under Authorized apps in their ONEIDP account.
   */
  async revoke(accessToken) {
    if (!this.isConfidential) {
      throw new ApiError('Revocation requires a client secret', { code: 'invalid_client' });
    }

    const { revocation_endpoint: revocationEndpoint } = await this.endpoints();

    const response = await this.#call(revocationEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        token: accessToken,
        client_secret: this.#config.clientSecret,
      }),
    });

    return response.ok;
  }

  /* ------------------------------------------------------------------ logout */

  /**
   * RP-initiated logout URL. Best effort only, and deliberately so:
   *
   *  - only the OAuth session tied to this ID token ends, so the user's ONEIDP
   *    browser session survives and the next `/authorize` signs them straight
   *    back in without a prompt;
   *  - `post_logout_redirect_uri` is not validated against the client, so never
   *    build this from untrusted input;
   *  - the redirect happens before the hint is checked, and refresh tokens live
   *    on.
   *
   * Destroy your own session first and treat this as an extra.
   */
  async buildLogoutUrl({ idToken, postLogoutRedirectUri } = {}) {
    const { end_session_endpoint: endSessionEndpoint } = await this.endpoints();
    const url = new URL(endSessionEndpoint);

    if (idToken) url.searchParams.set('id_token_hint', idToken);
    if (postLogoutRedirectUri) url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);

    return url.href;
  }

  /* ------------------------------------------------------------------ shared */

  async #call(url, init) {
    try {
      return await this.#config.fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.#config.timeout),
      });
    } catch (error) {
      throw new ApiError(`Request to ${url} failed`, { code: 'network_error', cause: error });
    }
  }
}

async function readJson(response) {
  const text = await response.text();
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createClient(options) {
  return new OneidpClient(options);
}
