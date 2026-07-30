import redisCache from '../database/redis.mjs';

/**
 * Account moderation helpers.
 *
 * Ban enforcement has two halves, and both are required:
 *
 *   1. Every login path refuses to mint a session for a banned account.
 *   2. Banning revokes the account's existing sessions immediately, so an
 *      already signed-in user is locked out without waiting for their 14-day
 *      token to expire.
 *
 * Without (2) a ban would not take effect until the current token expired,
 * because API routes authorise against the Redis session rather than re-reading
 * the user document on every request.
 */

/** Generic message returned to a banned user. Deliberately reason-free. */
export const BANNED_MESSAGE = 'This account has been suspended.';

export function isBanned(user) {
  return Boolean(user?.banned);
}

/**
 * Delete every Redis key scoped to a user: primary sessions (`psid`), OAuth
 * sessions (`osid`), and the short-lived MFA / email-verification / password
 * reset handles. Matches the pattern used by `logoutall`.
 */
export async function revokeAllSessions(userId) {
  if (!userId) return 0;
  try {
    const keys = await redisCache.keys(`*:${userId}:*`);
    if (keys.length === 0) return 0;
    await redisCache.del(keys);
    return keys.length;
  } catch (error) {
    console.error('Failed to revoke sessions for', userId, error);
    throw error;
  }
}

/**
 * Guard for JSON login endpoints.
 *
 * Returns true when the request was answered, so callers can `if
 * (rejectIfBanned(user, res)) return;`. 403 is used rather than 401 because the
 * credentials were valid; the account itself is not permitted.
 */
export function rejectIfBanned(user, res) {
  if (!isBanned(user)) return false;
  res.status(403).json({ success: false, error: BANNED_MESSAGE, banned: true });
  return true;
}
