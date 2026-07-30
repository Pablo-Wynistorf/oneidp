import { userDB, oAuthClientAppDB } from '../database/mongodb.mjs';
import redisCache from '../database/redis.mjs';
import { getSettings } from './app-settings.mjs';
import { canManageApps } from './permissions.mjs';

/**
 * Application availability.
 *
 * An OIDC client only exists because someone with the app-management capability
 * registered it. Take that capability away — or suspend the account — and the
 * client has no legitimate operator any more, so it stops working: it cannot be
 * used to authorise anyone, and the tokens it already holds stop resolving.
 *
 * Two halves, both required:
 *
 *   1. **Derived, on every request.** `ownerDisabledReason` is evaluated live at
 *      each OIDC endpoint. This is what is enforced. Because it is recomputed
 *      rather than read from a flag, restoring access re-enables the client
 *      immediately and no stored value can drift into leaving a dead client
 *      usable — including when the instance-wide `allowAllUsersManageApps`
 *      switch is what changed.
 *
 *   2. **Mirrored onto the client document.** `syncOwnedApps` writes the same
 *      decision to `disabled` / `disabledAt` / `disabledReason` so the admin
 *      console can show the state and when it changed, and revokes the client's
 *      live OAuth sessions so existing access tokens die with it rather than
 *      lingering until they expire.
 */

/** Shown to relying parties. Deliberately says nothing about the owner. */
export const CLIENT_DISABLED_MESSAGE =
  'This application is currently disabled and cannot be used to sign in.';

export const DISABLED_REASONS = {
  OWNER_ACCESS_REVOKED: 'owner_access_revoked',
  OWNER_SUSPENDED: 'owner_suspended',
  OWNER_MISSING: 'owner_missing',
};

/**
 * Why an owner's applications are switched off, or null when they are live.
 *
 * `canManageApps` is the same resolution the management API uses, so an owner
 * who can no longer edit their applications can no longer run them either.
 */
export function ownerDisabledReason(owner, settings) {
  if (!owner) return DISABLED_REASONS.OWNER_MISSING;
  if (owner.banned) return DISABLED_REASONS.OWNER_SUSPENDED;
  if (!canManageApps(owner, settings)) return DISABLED_REASONS.OWNER_ACCESS_REVOKED;
  return null;
}

/**
 * Why a single application is switched off, or null when it is live.
 *
 * Applications registered before ownership was recorded have no owner to derive
 * from and are left alone; guessing would break live integrations.
 */
export function clientDisabledReason(app, owner, settings) {
  if (!app?.owner) return null;
  return ownerDisabledReason(owner, settings);
}

/** Fields needed to decide availability. Never select credential material. */
const OWNER_FIELDS = 'userId email banned canManageApps';

/** Resolve availability for one client document, loading the owner it needs. */
export async function resolveClientState(app) {
  if (!app?.owner) return { disabled: false, reason: null };

  const [owner, settings] = await Promise.all([
    userDB.findOne({ userId: app.owner }).select(OWNER_FIELDS).lean(),
    getSettings(),
  ]);

  const reason = clientDisabledReason(app, owner, settings);
  return { disabled: Boolean(reason), reason };
}

/**
 * Guard for OIDC endpoints that have just resolved a client.
 *
 * Returns true when a response was sent, so callers can
 * `if (await rejectIfClientDisabled(client, res)) return;`.
 *
 * `unauthorized_client` is the OAuth 2.0 error for a client that exists but is
 * not permitted to make this request. The token endpoint passes `status: 400`
 * to match RFC 6749; the browser-facing endpoints use 403.
 */
export async function rejectIfClientDisabled(app, res, { status = 403 } = {}) {
  const { disabled } = await resolveClientState(app);
  if (!disabled) return false;

  res.status(status).json({
    error: 'unauthorized_client',
    error_description: CLIENT_DISABLED_MESSAGE,
  });
  return true;
}

/**
 * Drop every live OAuth session and refresh session belonging to these apps.
 *
 * This is cleanup, not the enforcement: every endpoint that accepts an
 * app-issued access token re-derives the client state, so those tokens are
 * already dead. Clearing the sessions just stops Redis holding state for an
 * application that cannot be used. Authorization codes are left to lapse on
 * their own — they live 20 seconds and the token endpoint refuses to redeem one
 * for a disabled client.
 *
 * The session keyspace cannot be queried by application, so it has to be walked.
 * Three things keep that affordable no matter how many applications an owner has
 * or how many sessions exist:
 *
 *   - SCAN rather than KEYS, so Redis is never blocked for the duration.
 *   - One field read per key, pipelined in batches, rather than a round trip per
 *     key.
 *   - One pass for the whole set of application ids, so switching off 500 apps
 *     costs the same walk as switching off one.
 */
const SCAN_COUNT = 500;
const PIPELINE_BATCH = 250;

async function purgeBatch(keys, wanted) {
  const pipeline = redisCache.multi();
  for (const key of keys) pipeline.hGet(key, 'oauthClientAppId');
  const appIds = await pipeline.exec();

  const doomed = keys.filter((_, index) => {
    const appId = appIds[index];
    return appId && wanted.has(String(appId));
  });

  if (doomed.length === 0) return 0;
  await redisCache.del(doomed);
  return doomed.length;
}

export async function revokeAppSessions(appIds) {
  if (appIds.length === 0) return 0;

  const wanted = new Set(appIds);
  let removed = 0;

  try {
    for (const pattern of ['osid:*', 'orsid:*']) {
      let batch = [];

      for await (const key of redisCache.scanIterator({ MATCH: pattern, COUNT: SCAN_COUNT })) {
        batch.push(key);
        if (batch.length >= PIPELINE_BATCH) {
          removed += await purgeBatch(batch, wanted);
          batch = [];
        }
      }

      if (batch.length > 0) removed += await purgeBatch(batch, wanted);
    }

    return removed;
  } catch (error) {
    // Enforcement does not depend on this, so a failed sweep must not fail the
    // admin action that switched the applications off.
    console.error('Failed to revoke sessions for apps', appIds.length, error);
    return removed;
  }
}

/**
 * Bring the stored availability of everything a user owns back in line with
 * their current capability, and tear down sessions for anything switched off.
 *
 * Call this after any change to what the owner is allowed to do. Idempotent:
 * re-running it on an already-consistent owner writes nothing.
 */
export async function syncOwnedApps(userId, { revokeSessions = true } = {}) {
  const empty = {
    reason: null,
    disabledCount: 0,
    enabledCount: 0,
    sessionsRevoked: 0,
    appIdsNeedingRevocation: [],
  };
  if (!userId) return empty;

  const [apps, owner, settings] = await Promise.all([
    oAuthClientAppDB.find({ owner: userId }).lean(),
    userDB.findOne({ userId }).select(OWNER_FIELDS).lean(),
    getSettings(),
  ]);

  if (apps.length === 0) return empty;

  const reason = ownerDisabledReason(owner, settings);

  // Only touch documents that actually change, so `disabledAt` keeps saying
  // when the application went down rather than when this last ran.
  const toDisable = reason
    ? apps.filter((app) => !app.disabled || app.disabledReason !== reason)
    : [];
  const toEnable = reason ? [] : apps.filter((app) => app.disabled);

  if (toDisable.length > 0) {
    await oAuthClientAppDB.updateMany(
      { oauthClientAppId: { $in: toDisable.map((app) => app.oauthClientAppId) } },
      { $set: { disabled: true, disabledAt: new Date(), disabledReason: reason } },
    );
  }

  if (toEnable.length > 0) {
    await oAuthClientAppDB.updateMany(
      { oauthClientAppId: { $in: toEnable.map((app) => app.oauthClientAppId) } },
      { $set: { disabled: false }, $unset: { disabledAt: '', disabledReason: '' } },
    );
  }

  // Revoke across every owned app, not just the ones that flipped: a client
  // already marked disabled can still have been issued tokens before the mirror
  // caught up. The sweep costs one keyspace walk whatever the list length, so
  // hundreds of applications are no more expensive than one.
  const appIdsNeedingRevocation = toDisable.length > 0
    ? apps.map((app) => app.oauthClientAppId)
    : [];

  // `revokeSessions: false` lets a bulk caller collect ids from many owners and
  // pay for a single walk instead of one per owner.
  const sessionsRevoked = revokeSessions
    ? await revokeAppSessions(appIdsNeedingRevocation)
    : 0;

  return {
    reason,
    disabledCount: toDisable.length,
    enabledCount: toEnable.length,
    sessionsRevoked,
    appIdsNeedingRevocation,
  };
}

/**
 * Resync every owner at once.
 *
 * Used when the instance-wide `allowAllUsersManageApps` switch moves, which
 * changes the answer for every owner without a per-user grant at the same time.
 *
 * Deliberately not a loop over `syncOwnedApps`: owners fall into a handful of
 * groups (live, or disabled for one of a few reasons), so the whole resync is a
 * fixed number of bulk updates plus a single Redis walk, rather than work
 * proportional to the number of owners or the applications they own.
 */
export async function syncAllOwnedApps() {
  const ownerIds = (await oAuthClientAppDB.distinct('owner')).filter(Boolean);

  const empty = { ownersChecked: 0, disabledCount: 0, enabledCount: 0, sessionsRevoked: 0 };
  if (ownerIds.length === 0) return empty;

  const [owners, settings] = await Promise.all([
    userDB.find({ userId: { $in: ownerIds } }).select(OWNER_FIELDS).lean(),
    getSettings(),
  ]);
  const ownerById = new Map(owners.map((owner) => [owner.userId, owner]));

  // Group owners by the reason their applications are down, or by "live".
  const liveOwnerIds = [];
  const ownerIdsByReason = new Map();

  for (const ownerId of ownerIds) {
    const reason = ownerDisabledReason(ownerById.get(ownerId), settings);
    if (!reason) {
      liveOwnerIds.push(ownerId);
      continue;
    }
    if (!ownerIdsByReason.has(reason)) ownerIdsByReason.set(reason, []);
    ownerIdsByReason.get(reason).push(ownerId);
  }

  const now = new Date();
  let disabledCount = 0;
  const disabledOwnerIds = [];

  for (const [reason, ids] of ownerIdsByReason) {
    const result = await oAuthClientAppDB.updateMany(
      {
        owner: { $in: ids },
        // Same rule as the single-owner path: only touch what actually changes,
        // so `disabledAt` keeps saying when the application went down.
        $or: [{ disabled: { $ne: true } }, { disabledReason: { $ne: reason } }],
      },
      { $set: { disabled: true, disabledAt: now, disabledReason: reason } },
    );

    if ((result.modifiedCount ?? 0) > 0) {
      disabledCount += result.modifiedCount;
      disabledOwnerIds.push(...ids);
    }
  }

  const enabled = liveOwnerIds.length
    ? await oAuthClientAppDB.updateMany(
        { owner: { $in: liveOwnerIds }, disabled: true },
        { $set: { disabled: false }, $unset: { disabledAt: '', disabledReason: '' } },
      )
    : { modifiedCount: 0 };

  // One walk for every application switched off in this resync.
  let sessionsRevoked = 0;
  if (disabledOwnerIds.length > 0) {
    const affected = await oAuthClientAppDB
      .find({ owner: { $in: disabledOwnerIds } })
      .select('oauthClientAppId')
      .lean();
    sessionsRevoked = await revokeAppSessions(affected.map((app) => app.oauthClientAppId));
  }

  return {
    ownersChecked: ownerIds.length,
    disabledCount,
    enabledCount: enabled.modifiedCount ?? 0,
    sessionsRevoked,
  };
}
