import jwt from 'jsonwebtoken';
import { userDB } from '../database/mongodb.mjs';
import redisCache from '../database/redis.mjs';
import { notifyError } from '../notify/notifications.mjs';
import { getSettings } from './app-settings.mjs';
import { isAdminEmail } from './admin-auth.mjs';
import 'dotenv/config';

/**
 * Per-user capabilities.
 *
 * Most accounts only ever *sign in to* applications. Registering an OIDC client
 * is an operator-ish action — it mints credentials and defines redirect URIs —
 * so it is gated behind an explicit per-user capability rather than being
 * available to everyone who can log in.
 */

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

/**
 * Whether a user may manage their own OIDC applications and roles.
 *
 * Two independent ways to qualify, evaluated live on every request:
 *
 *   1. `allowAllUsersManageApps` — the instance-wide switch. On means everyone.
 *   2. `user.canManageApps` — a per-user grant, used while the switch is off.
 *
 * The two are additive rather than a default that gets copied onto accounts at
 * signup, so flipping the switch takes effect immediately for existing users
 * and flipping it back leaves the individual grants intact.
 *
 * Admins always qualify, so an operator cannot lock themselves out of the
 * application registry.
 */
export function canManageApps(user, settings) {
  if (!user) return false;
  if (isAdminEmail(user.email)) return true;
  if (settings?.allowAllUsersManageApps) return true;
  return user.canManageApps === true;
}

/** Resolve the capability for a user id, loading whatever it needs. */
export async function userCanManageApps(userId) {
  const [user, settings] = await Promise.all([userDB.findOne({ userId }).lean(), getSettings()]);
  return canManageApps(user, settings);
}

/**
 * Gate the OIDC application/role management API.
 *
 * Mounted over the whole `/api/oauth/settings` prefix so a new management route
 * cannot miss the check by omission. Individual routes still verify the token
 * themselves; this runs first and rejects anyone without the capability.
 */
export async function requireAppManagement(req, res, next) {
  const access_token = req.cookies?.access_token;

  if (!access_token || access_token === 'undefined') {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  try {
    const { userId, sid } = jwt.verify(access_token, JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    });

    const session = await redisCache.keys(`psid:${userId}:${sid}`);
    if (session.length === 0) {
      res.clearCookie('access_token');
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const [user, settings] = await Promise.all([
      userDB.findOne({ userId }).lean(),
      getSettings(),
    ]);

    if (!user || user.banned) {
      return res.status(403).json({ success: false, error: 'Not permitted' });
    }

    if (!canManageApps(user, settings)) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not permitted to manage OIDC applications.',
        code: 'app_management_forbidden',
      });
    }

    return next();
  } catch (error) {
    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
}
