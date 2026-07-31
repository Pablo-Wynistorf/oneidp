/**
 * `req.oneidp`: who the caller is, and the tokens to act on their behalf.
 *
 * The same object serves both ways in:
 *
 *   - a browser with a sealed session cookie, which the router loads and decodes
 *     once per request;
 *   - a service presenting `Authorization: Bearer`, verified against the JWKS
 *     with no cookie and no state at all.
 *
 * Nothing here reaches a shared store, so any instance can serve any request.
 */

/** Internal hand-off from the bearer guard. */
export const ATTACH_BEARER = Symbol('oneidp.attachBearer');

/**
 * Session cookie payload.
 *
 * Short keys because this is measured in cookie bytes: a full session with three
 * tokens is about 3.5 KB sealed, and the browser limit is 4 KB. `u` is stored
 * rather than derived from the ID token because the refresh grant returns an ID
 * token stripped of profile and email claims, so the ID token cannot be relied
 * on as the profile after the first refresh.
 */
export function encodeSession({ user, tokens, authenticatedAt }) {
  return {
    u: user,
    a: tokens?.accessToken ?? null,
    r: tokens?.refreshToken ?? null,
    i: tokens?.idToken ?? null,
    x: tokens?.expiresAt ?? null,
    t: authenticatedAt ?? null,
  };
}

export function decodeSession(raw) {
  if (!raw || typeof raw !== 'object' || !raw.u) return null;

  return {
    user: raw.u,
    tokens: {
      accessToken: raw.a ?? null,
      refreshToken: raw.r ?? null,
      idToken: raw.i ?? null,
      expiresAt: raw.x ?? null,
    },
    authenticatedAt: raw.t ?? null,
  };
}

export class OneidpContext {
  #req;
  #res;
  #runtime;
  #state;
  #bearer = null;

  constructor(req, res, runtime, state = null) {
    this.#req = req;
    this.#res = res;
    this.#runtime = runtime;
    this.#state = state;
  }

  [ATTACH_BEARER](token, payload, user) {
    this.#bearer = { token, payload, user };
  }

  get client() {
    return this.#runtime.client;
  }

  /** How this request authenticated: 'session', 'bearer', or null. */
  get authMethod() {
    if (this.#bearer) return 'bearer';
    return this.#state?.user ? 'session' : null;
  }

  get isAuthenticated() {
    return this.authMethod !== null;
  }

  /** Normalised profile, or null. `sub` is the only stable key. */
  get user() {
    return this.#bearer?.user ?? this.#state?.user ?? null;
  }

  /** ID token claims for a cookie session, access token claims for a bearer one. */
  get claims() {
    return this.#bearer?.payload ?? this.#state?.user?.raw ?? null;
  }

  /** Tokens minus the refresh token, which should not be handed around. */
  get tokens() {
    if (this.#bearer) {
      return {
        accessToken: this.#bearer.token,
        idToken: null,
        tokenType: 'Bearer',
        expiresAt: this.#bearer.payload.exp ? this.#bearer.payload.exp * 1000 : null,
        isExpired: false,
      };
    }

    if (!this.#state?.tokens?.accessToken) return null;

    return {
      accessToken: this.#state.tokens.accessToken,
      idToken: this.#state.tokens.idToken,
      tokenType: 'Bearer',
      expiresAt: this.#state.tokens.expiresAt,
      isExpired: this.#isExpired(),
    };
  }

  /** Verified access token claims, when a bearer token authenticated this request. */
  get tokenPayload() {
    return this.#bearer?.payload ?? null;
  }

  #isExpired() {
    const expiresAt = this.#state?.tokens?.expiresAt;
    if (!expiresAt) return false;
    return Date.now() >= expiresAt - this.#runtime.refreshSkew;
  }

  hasRole(...roles) {
    const wanted = roles.flat().filter(Boolean);
    const held = this.user?.roles ?? [];
    return wanted.some((role) => held.includes(role));
  }

  hasAllRoles(...roles) {
    const wanted = roles.flat().filter(Boolean);
    const held = this.user?.roles ?? [];
    return wanted.every((role) => held.includes(role));
  }

  /**
   * A usable access token, refreshed when it is close to expiry.
   *
   * Expiry is tracked from the token response's `expires_in`, never from the ID
   * token's `exp`, which is a fixed 48 hours and routinely outlives it.
   *
   * Returns null when nothing can be done without the user: no session, or an
   * expired token with no way to refresh it (public client, or no refresh token).
   */
  async getAccessToken() {
    // The caller's own token. This app cannot refresh someone else's.
    if (this.#bearer) return this.#bearer.token;

    const tokens = this.#state?.tokens;
    if (!tokens?.accessToken) return null;
    if (!this.#isExpired()) return tokens.accessToken;
    if (!tokens.refreshToken || !this.#runtime.client.canRefresh) return null;

    const refreshed = await this.#runtime.client.refresh(tokens.refreshToken);

    this.#state.tokens = {
      accessToken: refreshed.accessToken,
      // ONEIDP does not rotate refresh tokens, so the original carries forward.
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
      idToken: refreshed.idToken ?? tokens.idToken,
      expiresAt: refreshed.expiresAt,
    };

    // The refreshed ID token has no profile or email claims, so the stored
    // profile stays authoritative unless the app asked for a re-read.
    if (this.#runtime.refreshUserinfo) {
      this.#state.user = await this.#runtime.client.userinfo(refreshed.accessToken);
    }

    await this.#persist();
    return refreshed.accessToken;
  }

  /**
   * Read the profile from the IdP.
   *
   * Unlike the stored profile this checks the live session, so it doubles as a
   * revocation check. Do not call it per request: hosted ONEIDP sits behind
   * gateway throttling.
   */
  async userinfo({ cache = true } = {}) {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return null;

    const user = await this.#runtime.client.userinfo(accessToken);

    if (cache && this.#state) {
      this.#state.user = { ...user, raw: { ...(this.#state.user?.raw ?? {}), ...user.raw } };
      await this.#persist();
    }

    return user;
  }

  /** Is the session still live at the IdP? */
  async isSessionActive() {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return false;
    return this.#runtime.client.checkToken(accessToken);
  }

  /** URL of the login route, optionally with a local destination. */
  loginUrl(returnTo) {
    const login = this.#runtime.routes?.login;
    if (!login) return null;

    const target = this.#runtime.safeReturnTo(returnTo, null);
    return target ? `${login}?returnTo=${encodeURIComponent(target)}` : login;
  }

  logoutUrl() {
    return this.#runtime.routes?.logout ?? null;
  }

  /** Clear the session cookie without contacting the IdP. */
  async destroy() {
    this.#state = null;
    await this.#runtime.store?.clearSession(this.#req, this.#res);
  }

  /* --------------------------------------------------------------- internal */

  /** Replace the session, used by the callback route. */
  async [Symbol.for('oneidp.setSession')](state) {
    this.#state = state;
    await this.#persist({ force: true });
  }

  async #persist({ force = false } = {}) {
    const store = this.#runtime.store;
    if (!store || !this.#state) return;

    // A refresh triggered from deep inside a handler can land after the response
    // has begun, at which point no Set-Cookie can be added. The token still works
    // for this request; the next one refreshes again.
    if (!force && !store.canPersistLate(this.#res)) {
      this.#runtime.onWarning?.(
        'Access token was refreshed after the response had started, so the new token could not be ' +
          'stored. Call req.oneidp.getAccessToken() before writing the response.',
      );
      return;
    }

    await store.saveSession(this.#req, this.#res, encodeSession(this.#state));
  }
}

export const SET_SESSION = Symbol.for('oneidp.setSession');
