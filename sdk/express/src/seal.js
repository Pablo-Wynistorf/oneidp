/**
 * Sealed cookie payloads.
 *
 * State that has to survive between requests is encrypted with `dir` + `A256GCM`,
 * which is authenticated encryption: the browser can neither read the contents
 * nor alter them undetected. That is what makes a cookie a safe place for tokens
 * and for the PKCE verifier, and what removes the need for a shared session
 * store.
 *
 * The key is derived from your secret with HKDF-SHA256 using a distinct `info`
 * per purpose, so the session cookie and the login-transaction cookie get
 * different keys and one can never be replayed as the other.
 *
 * `secret` accepts an array. The first entry seals new cookies, every entry is
 * tried when opening one, so a secret can be rotated without signing everyone
 * out: deploy with `[next, current]`, then drop the old one later.
 *
 * ## Why the payload is compressed
 *
 * A session holding an access token, a refresh token and an ID token is around
 * 3 KB of JSON, and base64url on the outside of the JWE adds a third on top.
 * That pushed it past the 4 KB per-cookie browser limit and split it across two
 * cookies, which then rode on every request.
 *
 * DEFLATE fixes it, and fixes it well, because JWTs are base64: only 64 symbols
 * in an 8-bit byte, so roughly a quarter of every token is redundancy the
 * compressor reclaims. Measured on a realistic ONEIDP session:
 *
 *     JSON claims, uncompressed   4204 bytes   2 cookies
 *     DEFLATE + binary JWE        2240 bytes   1 cookie
 *
 * Brotli came out 180 bytes smaller but costs far more CPU on a path that runs
 * on every request, and DEFLATE is the compression RFC 7516 specifies for JWE.
 */

import { hkdfSync } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { CompactEncrypt, compactDecrypt } from 'jose';
import { ConfigurationError } from './errors.js';

const MIN_SECRET_LENGTH = 32;
const SALT = 'oneidp.express.v1';

/**
 * First byte of the plaintext, marking the format.
 *
 * 1.0.x sealed the claim set as plain JSON with `EncryptJWT`, so its plaintext
 * begins with `{` (0x7b). A leading 0x01 means DEFLATE-compressed JSON instead.
 * Both are still readable, so upgrading does not sign anyone out.
 */
const FORMAT_DEFLATED_JSON = 0x01;

/**
 * Ceiling on the inflated payload.
 *
 * Only a holder of the key can produce a cookie that decrypts at all, so a
 * decompression bomb would have to be self-inflicted. The cap is here so a bug
 * cannot turn into unbounded memory use.
 */
const MAX_INFLATED_BYTES = 64 * 1024;

function deriveKey(secret, purpose) {
  return new Uint8Array(hkdfSync('sha256', secret, SALT, purpose, 32));
}

/** Read either format, or null if the bytes are not something we wrote. */
function parsePlaintext(plaintext) {
  try {
    if (plaintext[0] === FORMAT_DEFLATED_JSON) {
      const json = inflateRawSync(plaintext.subarray(1), { maxOutputLength: MAX_INFLATED_BYTES });
      return JSON.parse(json.toString('utf8'));
    }

    // A cookie written by 1.0.x.
    return JSON.parse(Buffer.from(plaintext).toString('utf8'));
  } catch {
    return null;
  }
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

      // Expiry travels inside the sealed payload as well as on the cookie, so a
      // cookie replayed past its lifetime is rejected server-side.
      const claims = { ...payload, iat: now, exp: now + Math.floor(maxAge / 1000) };

      const body = Buffer.concat([
        Buffer.from([FORMAT_DEFLATED_JSON]),
        deflateRawSync(Buffer.from(JSON.stringify(claims), 'utf8'), { level: 9 }),
      ]);

      return new CompactEncrypt(body)
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .encrypt(keys[0]);
    },

    /**
     * Open a sealed value, or return null.
     *
     * Tampered, truncated, expired and foreign cookies all resolve to null: a bad
     * cookie means "not signed in", never a 500. Trying every key is what makes a
     * secret rotation seamless.
     */
    async unseal(token) {
      if (typeof token !== 'string' || token === '') return null;

      for (const key of keys) {
        let plaintext;
        try {
          ({ plaintext } = await compactDecrypt(token, key, {
            keyManagementAlgorithms: ['dir'],
            contentEncryptionAlgorithms: ['A256GCM'],
          }));
        } catch {
          // Wrong key, or tampered. Try the next key.
          continue;
        }

        const claims = parsePlaintext(plaintext);
        if (!claims) return null;

        // compactDecrypt checks the ciphertext, not the claims, so expiry is
        // enforced here.
        if (typeof claims.exp === 'number' && Date.now() >= claims.exp * 1000) return null;

        return claims;
      }

      return null;
    },
  };
}
