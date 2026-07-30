import express from 'express';
import {
  userDB,
  oAuthClientAppDB,
  oAuthRolesDB,
  userAppConsentDB,
} from '../../../database/mongodb.mjs';
import redisCache from '../../../database/redis.mjs';
import { notifyError } from '../../../notify/notifications.mjs';
import { adminEmails, readAdminAuditLog } from '../../../utils/admin-auth.mjs';

const router = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;

/** Aggregate counters for the admin dashboard. */
router.get('/', async (req, res) => {
  try {
    const since7d = new Date(Date.now() - 7 * DAY_MS);
    const since30d = new Date(Date.now() - 30 * DAY_MS);

    const [
      totalUsers,
      verifiedUsers,
      bannedUsers,
      mfaUsers,
      passkeyUsers,
      newUsers7d,
      newUsers30d,
      totalApps,
      publicApps,
      totalRoles,
      totalConsents,
      activeConsents7d,
      providerBreakdown,
      auditLog,
    ] = await Promise.all([
      userDB.countDocuments({}),
      userDB.countDocuments({ emailVerified: true }),
      userDB.countDocuments({ banned: true }),
      userDB.countDocuments({ mfaEnabled: true }),
      userDB.countDocuments({ passkeyId: { $nin: [null, ''] } }),
      userDB.countDocuments({ createdAt: { $gte: since7d } }),
      userDB.countDocuments({ createdAt: { $gte: since30d } }),
      oAuthClientAppDB.countDocuments({}),
      oAuthClientAppDB.countDocuments({ isPublicClient: true }),
      oAuthRolesDB.countDocuments({}),
      userAppConsentDB.countDocuments({}),
      userAppConsentDB.countDocuments({ lastAuthAt: { $gte: since7d } }),
      userDB.aggregate([{ $group: { _id: '$identityProvider', count: { $sum: 1 } } }]),
      readAdminAuditLog(10),
    ]);

    // Active sessions are only knowable from Redis. `keys` is acceptable here
    // because this endpoint is admin-only and called rarely.
    let activeSessions = 0;
    try {
      activeSessions = (await redisCache.keys('psid:*')).length;
    } catch {
      activeSessions = -1; // Signals "unavailable" rather than "zero".
    }

    res.json({
      users: {
        total: totalUsers,
        verified: verifiedUsers,
        unverified: totalUsers - verifiedUsers,
        banned: bannedUsers,
        mfaEnabled: mfaUsers,
        passkeyEnabled: passkeyUsers,
        newLast7Days: newUsers7d,
        newLast30Days: newUsers30d,
        byProvider: providerBreakdown.map((entry) => ({
          provider: entry._id || 'local',
          count: entry.count,
        })),
      },
      apps: {
        total: totalApps,
        publicClients: publicApps,
        confidentialClients: totalApps - publicApps,
        roles: totalRoles,
      },
      consents: {
        total: totalConsents,
        activeLast7Days: activeConsents7d,
      },
      sessions: {
        active: activeSessions,
      },
      admins: adminEmails(),
      recentActions: auditLog,
    });
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/** Full audit trail view. */
router.get('/audit', async (req, res) => {
  const limit = Math.min(Number.parseInt(req.query.limit, 10) || 100, 500);
  res.json({ entries: await readAdminAuditLog(limit) });
});

export default router;
