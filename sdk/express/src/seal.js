/**
 * Sealed cookie payloads.
 *
 * State that has to survive between requests is encrypted into a JWE with
 * `dir` + `A256GCM`, which is authenticated encryption: the browser can neither
 * read the contents nor alter them undetected. That is what makes a cookie a
 * safe place for tokens and for the PKCE verifier, and it is what removes the
 * need for a shared session store.
 *
 * The key is derived from your secret with HKDF-SHA256, using a distinct `info`
 * per purpose, so the session cookie and the login-transaction cookie end up
 * with different keys and one can never be replayed as the other.
 *
 * `secret` accepts an array. The first entry signs new cookies, every entry is
 * tried when opening one, so a secret can be rotated without signing everyone
 * out: deploy with `[next, current]`, then drop the old one later.
 */

import { hkdfSync } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { ConfigurationError } from './errors.js';

const MIN_SECRET_LENGTH = 32;
const SALT = 'oneidp.express.v1';

function deriveKey(secret, purpose) {
  return new Uint8Array(hkdfSync('sha256', secret, SALT, purpose, 32));
}

export function createSealer({ secret, purpose }) {
  const secrets = (Array.isArray(secret) ? secret : [secret]).filter(
    (entry) => typeof entry === 'string' && entry !== '',
  );

  if (secrets.length === 0) {
    throw new ConfigurationError('`secret` is required to hold the session in a cookie', {
      hint:
        'Generate one with `openssl rand -base64 32`, and give every instance the same value ' +
        'through the environment. An API that only verifies access tokens does not need one: use bearerAuth().',
    });
  }

  const tooShort = secrets.find((entry) => entry.length < MIN_SECRET_LENGTH);
  if (tooShort) {
    throw new ConfigurationError(
      `\`secret\` must be at least ${MIN_SECRET_LENGTH} characters (got ${tooShort.length})`,
      { hint: 'Generate one with `openssl rand -base64 32`.' },
    );
  }

  const keys = secrets.map((entry) => deriveKey(entry, purpose));

  return {
    async seal(payload, { maxAge }) {
      const now = Math.floor(Date.now() / 1000);

      return new EncryptJWT({ ...payload })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuedAt(now)
        // Expiry is inside the sealed payload as well as on the cookie, so a
        // cookie replayed after its lifetime is rejected on the server.
        .setExpirationTime(now + Math.floor(maxAge / 1000))
        .encrypt(keys[0]);
    },

    /**
     * Open a sealed value, or return null.
     *
     * Tampered, truncated, expired and foreign cookies all resolve to null: a
     * bad cookie means "not signed in", never a 500. A secret rotation is the
     * one case where trying every key matters.
     */
    async unseal(token) {
      if (typeof token !== 'string' || token === '') return null;

      for (const key of keys) {
        try {
          const { payload } = await jwtDecrypt(token, key, {
            contentEncryptionAlgorithms: ['A256GCM'],
            keyManagementAlgorithms: ['dir'],
          });
          return payload;
        } catch {
          // Try the next key; fall through to null when none work.
        }
      }

      return null;
    },
  };
}
