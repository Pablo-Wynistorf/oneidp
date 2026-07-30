import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import redisCache from '../database/redis.mjs';
import { revokeAllSessions } from './account-status.mjs';
import { sendRecoveryEmail } from './send-emails.mjs';

/**
 * Password recovery issuance, shared by the self-service flow
 * (`POST /api/auth/user/resetpassword`) and the admin console
 * (`POST /api/admin/users/:userId/send-recovery`).
 *
 * Both entry points must mint the same kind of link, otherwise a token issued
 * by one path could be rejected by `setpassword`, so the logic lives here
 * rather than being duplicated per route.
 */

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

/** Matches the JWT lifetime; both are checked when the link is redeemed. */
export const RESET_TOKEN_TTL_SECONDS = 30 * 60;

/**
 * Reasons an account cannot be sent a recovery email, or null when it can.
 *
 * Returned as a code so callers can map it to their own status codes and
 * wording — the public route must not reveal more than "no account", while the
 * admin console can explain exactly what to fix.
 */
export function passwordResetBlocker(user) {
  if (!user) return 'notFound';
  if ((user.identityProvider || 'local') !== 'local') return 'social';
  if (!user.emailVerified) return 'unverifiedEmail';
  if (user.banned) return 'banned';
  return null;
}

/**
 * Revoke the account's sessions, mint a reset token and email the link.
 *
 * Sessions are revoked *first* and deliberately: the `ppr:` handle matches the
 * same `*:${userId}:*` pattern, so revoking afterwards would delete the token
 * that was just issued. It also means a hijacked session cannot outlive a
 * password recovery.
 *
 * Resolves to `true` when the mail provider accepted the message. Awaiting the
 * send matters on Lambda, where returning the response freezes the container and
 * aborts any in-flight request.
 */
export async function issuePasswordReset(user) {
  const { userId, username, email } = user;

  await revokeAllSessions(userId);

  const resetSid = crypto.randomBytes(16).toString('hex');
  const redisKey = `ppr:${userId}:${resetSid}`;

  await redisCache.hSet(redisKey, {
    createdAt: Math.floor(Date.now() / 1000),
  });
  await redisCache.expire(redisKey, RESET_TOKEN_TTL_SECONDS);

  const password_reset_token = jwt.sign({ userId, pprSid: resetSid }, JWT_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: `${RESET_TOKEN_TTL_SECONDS}s`,
  });

  return sendRecoveryEmail(username, email, password_reset_token);
}
