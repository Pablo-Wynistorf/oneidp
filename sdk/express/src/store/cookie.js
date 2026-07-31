/**
 * Stateless store: everything lives in sealed cookies.
 *
 * The default, and the one to use when the app runs as more than one process.
 * There is nothing to share between containers, nothing to evict, and no store
 * to fall over: each request carries its own state and any instance can serve
 * it after one local AES-GCM decrypt.
 *
 * Two cookies, because they have very different lifetimes:
 *
 *   oneidp      the session: profile and tokens, hours to days
 *   oneidp_tx   one login in flight: state, nonce, PKCE verifier, minutes
 *
 * Both are `HttpOnly` unconditionally. They carry tokens, and a refresh token in
 * particular is a bearer credential for 20 days that ONEIDP cannot revoke, so
 * exposing it to `document.cookie` is never a reasonable trade.
 */

import { clearCookie, readCookie, writeCookie } from '../cookies.js';
import { createSealer } from '../seal.js';

const DEFAULT_MAX_AGE = 12 * 60 * 60 * 1000;
const DEFAULT_TX_MAX_AGE = 10 * 60 * 1000;

export function createCookieStore({ secret, cookie = {}, redirectUri }) {
  const {
    name = 'oneidp',
    path = '/',
    domain,
    sameSite = 'lax',
    // Inferred from where the app actually runs, so local development works
    // without a flag and production is secure by default.
    secure = !isLocalhost(redirectUri),
    maxAge = DEFAULT_MAX_AGE,
    txMaxAge = DEFAULT_TX_MAX_AGE,
  } = cookie;

  // `strict` would withhold the cookie on the callback navigation from the IdP,
  // which shows up as "state mismatch" on every single login.
  if (String(sameSite).toLowerCase() === 'strict') {
    throw new Error(
      "cookie.sameSite must not be 'strict': the browser would withhold the cookie when ONEIDP " +
        "redirects back to the callback, breaking every login. Use 'lax'.",
    );
  }

  const sessionSeal = createSealer({ secret, purpose: 'session' });
  const txSeal = createSealer({ secret, purpose: 'transaction' });

  const txName = `${name}_tx`;
  // httpOnly is not configurable: these cookies hold tokens.
  const base = { path, domain, sameSite, secure, httpOnly: true };

  return {
    kind: 'cookie',
    /** Whether a mid-request change can still be persisted. */
    canPersistLate: (res) => !res.headersSent,

    async loadSession(req) {
      return sessionSeal.unseal(readCookie(req, name));
    },

    async saveSession(req, res, data) {
      const sealed = await sessionSeal.seal(data, { maxAge });
      writeCookie(req, res, name, sealed, { ...base, maxAge });
    },

    async clearSession(req, res) {
      clearCookie(req, res, name, base);
    },

    async loadTx(req) {
      return txSeal.unseal(readCookie(req, txName));
    },

    async saveTx(req, res, data) {
      const sealed = await txSeal.seal(data, { maxAge: txMaxAge });
      writeCookie(req, res, txName, sealed, { ...base, maxAge: txMaxAge });
    },

    async clearTx(req, res) {
      clearCookie(req, res, txName, base);
    },
  };
}

function isLocalhost(url) {
  if (typeof url !== 'string') return false;
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]');
  } catch {
    return false;
  }
}
