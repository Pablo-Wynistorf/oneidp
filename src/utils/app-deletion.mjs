import { oAuthClientAppDB, oAuthRolesDB, userAppConsentDB } from '../database/mongodb.mjs';
import { revokeAppSessions } from './client-status.mjs';

/**
 * Deleting an application.
 *
 * A client is not just its own document: roles point at it, every user who ever
 * signed in through it holds a consent record naming it, and Redis holds the
 * OAuth sessions it was issued. Remove only the client and those references
 * outlive it — the visible symptom being a stranger's "Authorized applications"
 * list showing "Unknown App", because the consent row is still there and its
 * `clientId` no longer resolves to anything.
 *
 * So deletion is one operation, shared by every path that can delete an
 * application (the owner's own settings page, the admin console, and cascading
 * from a deleted user) rather than reimplemented in each.
 *
 * Consents are matched on `clientId` *or* `oauthClientAppId`. Both are written
 * today, but only one of them is the key each call site happened to use, and a
 * row missing whichever field the caller picked is exactly how an orphan
 * survives. Matching either way makes the cleanup independent of that.
 *
 * Authorization codes (`ac:*`) are deliberately left alone: they live 20 seconds
 * and carry no client id to match on, so they lapse well before anything could
 * redeem one against a client that no longer exists.
 */
export async function deleteAppsCascade(apps) {
  const list = (Array.isArray(apps) ? apps : [apps]).filter(Boolean);

  const empty = { appsRemoved: 0, rolesRemoved: 0, consentsRemoved: 0, sessionsRevoked: 0 };
  if (list.length === 0) return empty;

  const appIds = [...new Set(list.map((app) => app.oauthClientAppId).filter(Boolean))];
  const clientIds = [...new Set(list.map((app) => app.clientId).filter(Boolean))];

  const consentMatches = [];
  if (clientIds.length > 0) consentMatches.push({ clientId: { $in: clientIds } });
  if (appIds.length > 0) consentMatches.push({ oauthClientAppId: { $in: appIds } });

  const [roles, consents] = await Promise.all([
    appIds.length > 0
      ? oAuthRolesDB.deleteMany({ oauthClientAppId: { $in: appIds } })
      : Promise.resolve({ deletedCount: 0 }),
    consentMatches.length > 0
      ? userAppConsentDB.deleteMany({ $or: consentMatches })
      : Promise.resolve({ deletedCount: 0 }),
  ]);

  const removed = appIds.length > 0
    ? await oAuthClientAppDB.deleteMany({ oauthClientAppId: { $in: appIds } })
    : { deletedCount: 0 };

  // One keyspace walk for the whole set, and last: the records are already gone,
  // so a failed sweep leaves stale Redis state rather than a half-deleted app.
  const sessionsRevoked = await revokeAppSessions(appIds);

  return {
    appsRemoved: removed.deletedCount ?? 0,
    rolesRemoved: roles.deletedCount ?? 0,
    consentsRemoved: consents.deletedCount ?? 0,
    sessionsRevoked,
  };
}
