/**
 * Random values and PKCE.
 *
 * Everything is base64url, which matters for more than PKCE: ONEIDP's authorize
 * endpoint interpolates `state` straight into the redirect Location without
 * encoding it, so a state containing `&` or `=` would corrupt the callback URL.
 * base64url is URL-safe by construction, so the problem cannot arise.
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const base64url = (buffer) => buffer.toString('base64url');

/** 32 random bytes, base64url encoded. */
export function randomToken(bytes = 32) {
  return base64url(randomBytes(bytes));
}

/** CSRF value tying a callback back to the request that started it. */
export const randomState = () => randomToken(32);

/** Replay guard copied into the ID token's `nonce` claim. */
export const randomNonce = () => randomToken(32);

/**
 * PKCE verifier. 32 bytes encodes to 43 characters, the RFC 7636 minimum, and
 * well under the 128 character maximum.
 */
export const randomCodeVerifier = () => randomToken(32);

/** `S256` challenge. ONEIDP rejects `plain`. */
export function codeChallenge(verifier) {
  return base64url(createHash('sha256').update(verifier).digest());
}

/** Constant-time string compare, for `state`. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
