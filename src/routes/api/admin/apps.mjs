import express from 'express';
import {
  userDB,
  oAuthClientAppDB,
  oAuthRolesDB,
  userAppConsentDB,
} from '../../../database/mongodb.mjs';
import { notifyError } from '../../../notify/notifications.mjs';
import { recordAdminAction } from '../../../utils/admin-auth.mjs';
import { deleteAppsCascade } from '../../../utils/app-deletion.mjs';
import { getSettings } from '../../../utils/app-settings.mjs';
import { clientDisabledReason } from '../../../utils/client-status.mjs';

const router = express.Router();

const MAX_PAGE_SIZE = 100;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every registered OIDC application, across all owners.
 *
 * `clientSecret` is deliberately omitted. An operator does not need to read
 * another tenant's secret to administer the platform, and withholding it keeps
 * the console from becoming a way to impersonate a client.
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 25, MAX_PAGE_SIZE);
    const search = (req.query.query || '').trim();

    const filter = {};
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { oauthAppName: pattern },
        { clientId: pattern },
        { redirectUri: pattern },
        { oauthClientAppId: search },
      ];
    }

    const [apps, total] = await Promise.all([
      oAuthClientAppDB
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      oAuthClientAppDB.countDocuments(filter),
    ]);

    // Resolve owners and usage counts in one round trip each rather than
    // per-app, so the list stays cheap as the table grows.
    const ownerIds = [...new Set(apps.map((app) => app.owner).filter(Boolean))];
    const clientIds = apps.map((app) => app.clientId);
    const appIds = apps.map((app) => app.oauthClientAppId);

    const [owners, consentCounts, roleCounts, settings] = await Promise.all([
      ownerIds.length
        ? userDB
            .find({ userId: { $in: ownerIds } })
            .select('userId username email banned canManageApps')
            .lean()
        : [],
      clientIds.length
        ? userAppConsentDB.aggregate([
            { $match: { clientId: { $in: clientIds } } },
            { $group: { _id: '$clientId', count: { $sum: 1 } } },
          ])
        : [],
      appIds.length
        ? oAuthRolesDB.aggregate([
            { $match: { oauthClientAppId: { $in: appIds } } },
            { $group: { _id: '$oauthClientAppId', count: { $sum: 1 } } },
          ])
        : [],
      getSettings(),
    ]);

    const ownerById = new Map(owners.map((owner) => [owner.userId, owner]));
    const consentsByClientId = new Map(consentCounts.map((row) => [row._id, row.count]));
    const rolesByAppId = new Map(roleCounts.map((row) => [row._id, row.count]));

    res.json({
      apps: apps.map((app) => {
        // Derived live from the owner, not read from the stored mirror, so the
        // console shows exactly what the OIDC endpoints enforce.
        const disabledReason = clientDisabledReason(app, ownerById.get(app.owner), settings);

        return {
          oauthClientAppId: app.oauthClientAppId,
          oauthAppName: app.oauthAppName,
          clientId: app.clientId,
          redirectUri: app.redirectUri,
          accessTokenValidity: app.accessTokenValidity,
          isPublicClient: Boolean(app.isPublicClient),
          createdAt: app.createdAt,
          disabled: Boolean(disabledReason),
          disabledReason,
          disabledAt: app.disabledAt || null,
          owner: app.owner
            ? {
                userId: app.owner,
                username: ownerById.get(app.owner)?.username ?? null,
                email: ownerById.get(app.owner)?.email ?? null,
                banned: Boolean(ownerById.get(app.owner)?.banned),
              }
            : null,
          consentCount: consentsByClientId.get(app.clientId) ?? 0,
          roleCount: rolesByAppId.get(app.oauthClientAppId) ?? 0,
        };
      }),
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/**
 * Delete an application along with its roles and every user's consent for it.
 * Requires the app name echoed back, since this breaks a live integration.
 */
router.delete('/:oauthClientAppId', async (req, res) => {
  try {
    const { oauthClientAppId } = req.params;
    const app = await oAuthClientAppDB.findOne({ oauthClientAppId }).lean();

    if (!app) return res.status(404).json({ error: 'Application not found' });

    if (req.body?.confirmName !== app.oauthAppName) {
      return res.status(400).json({
        error: 'Confirmation does not match: send the exact application name to delete it',
      });
    }

    const { rolesRemoved, consentsRemoved, sessionsRevoked } = await deleteAppsCascade(app);

    await recordAdminAction(req, 'app.delete', {
      oauthClientAppId,
      appName: app.oauthAppName,
      clientId: app.clientId,
      owner: app.owner ?? null,
      rolesRemoved,
      consentsRemoved,
      sessionsRevoked,
    });

    return res.json({ success: true, rolesRemoved, consentsRemoved, sessionsRevoked });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

export default router;
