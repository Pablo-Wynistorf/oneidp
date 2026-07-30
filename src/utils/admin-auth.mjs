import jwt from 'jsonwebtoken';
import { userDB } from '../database/mongodb.mjs';
import redisCache from '../database/redis.mjs';
import { notifyError } from '../notify/notifications.mjs';
import 'dotenv/config';

/**
 * Admin authorisation.
 *
 * Membership is decided by email address against the ADMIN_EMAILS allow-list,
 * which is configuration rather than data: it cannot be granted by anything a
 * user can change about their own account, and there is no self-service path to
 * becoming an admin.
 *
 * This middleware is the only thing standing between a request and the admin
 * API. The /admin route in the SPA merely hides the UI; it is not a control.
 */

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

const DEFAULT_ADMIN_EMAILS = 'admin@onedns.ch';

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS)
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

/** Whether an email address is on the admin allow-list. */
export function isAdminEmail(email) {
  return typeof email === 'string' && ADMIN_EMAILS.has(email.trim().toLowerCase());
}

/** The configured admin addresses, for display in the console. */
export function adminEmails() {
  return [...ADMIN_EMAILS];
}

/**
 * Require a signed-in admin.
 *
 * Always answers with JSON — never a redirect — because every caller is a
 * fetch from the SPA. Sets `req.adminUser` on success.
 */
export async function requireAdmin(req, res, next) {
  const access_token = req.cookies?.access_token;

  if (!access_token || access_token === 'undefined') {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { userId, sid } = jwt.verify(access_token, JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    });

    // A valid signature is not enough: the session must still exist, so that
    // revoking sessions (including by banning) locks an admin out too.
    const session = await redisCache.keys(`psid:${userId}:${sid}`);
    if (session.length === 0) {
      res.clearCookie('access_token');
      return res.status(401).json({ error: 'Session expired' });
    }

    const user = await userDB.findOne({ userId });
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Identical response for "signed in but not an admin" and "not found", so
    // the endpoint does not confirm that an admin console exists.
    if (!isAdminEmail(user.email) || user.banned) {
      return res.status(404).json({ error: 'Not Found' });
    }

    // Only a verified address can be trusted to match the allow-list.
    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Admin access requires a verified email address' });
    }

    req.adminUser = user;
    return next();
  } catch (error) {
    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
}

/* -------------------------------------------------------------------------- */
/* Audit trail                                                                */
/* -------------------------------------------------------------------------- */

const AUDIT_KEY = 'admin:audit';
const AUDIT_LIMIT = 500;

/**
 * Record an admin action.
 *
 * Kept in a capped Redis list: enough to answer "who changed this recently"
 * without introducing a new collection. Never throws — an audit failure must
 * not roll back the action the operator already performed.
 */
export async function recordAdminAction(req, action, details = {}) {
  const entry = {
    action,
    actor: req.adminUser?.email ?? 'unknown',
    actorUserId: req.adminUser?.userId ?? null,
    ip: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
      .split(',')[0]
      .trim(),
    at: new Date().toISOString(),
    ...details,
  };

  try {
    await redisCache.lPush(AUDIT_KEY, JSON.stringify(entry));
    await redisCache.lTrim(AUDIT_KEY, 0, AUDIT_LIMIT - 1);
  } catch (error) {
    console.error('Failed to write admin audit entry:', error);
  }

  return entry;
}

/** Most recent admin actions, newest first. */
export async function readAdminAuditLog(limit = 50) {
  try {
    const raw = await redisCache.lRange(AUDIT_KEY, 0, Math.max(0, limit - 1));
    return raw
      .map((item) => {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    console.error('Failed to read admin audit log:', error);
    return [];
  }
}
