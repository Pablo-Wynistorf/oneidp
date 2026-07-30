import express from 'express';
import bcrypt from 'bcryptjs';
import {
  userDB,
  oAuthClientAppDB,
  oAuthRolesDB,
  userAppConsentDB,
} from '../../../database/mongodb.mjs';
import redisCache from '../../../database/redis.mjs';
import { notifyError } from '../../../notify/notifications.mjs';
import { isAdminEmail, recordAdminAction } from '../../../utils/admin-auth.mjs';
import { revokeAllSessions } from '../../../utils/account-status.mjs';
import { getSettings } from '../../../utils/app-settings.mjs';
import { issuePasswordReset, passwordResetBlocker } from '../../../utils/password-reset.mjs';
import { canManageApps } from '../../../utils/permissions.mjs';
import { ownerDisabledReason, syncOwnedApps } from '../../../utils/client-status.mjs';

const router = express.Router();

const MAX_PAGE_SIZE = 100;

/**
 * Shape a user document for the admin console.
 *
 * Credential material (password hash, MFA secret, passkey public key) is never
 * included — an admin has no legitimate use for it, and not sending it means it
 * cannot leak through the console.
 */
function presentUser(user, settings) {
  return {
    userId: user.userId,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    identityProvider: user.identityProvider || 'local',
    emailVerified: Boolean(user.emailVerified),
    mfaEnabled: Boolean(user.mfaEnabled),
    passkeyEnabled: Boolean(user.passkeyId),
    providerRoles: Array.isArray(user.providerRoles) ? user.providerRoles : [],
    // `canManageApps` is this user's individual grant; `effectiveCanManageApps`
    // is what is actually enforced, which also accounts for the instance-wide
    // switch and admin status.
    canManageApps: user.canManageApps === true,
    effectiveCanManageApps: canManageApps(user, settings),
    // Lets the console explain why access is granted when no per-user grant is set.
    appsAllowedForEveryone: Boolean(settings?.allowAllUsersManageApps),
    // Why a recovery email cannot be sent, or null when it can. Mirrors exactly
    // what `POST /:userId/send-recovery` enforces, so the console can disable the
    // button and say why instead of surfacing an error after the fact.
    passwordRecoveryBlocker: settings?.passwordResetEnabled === false
      ? 'disabled'
      : passwordResetBlocker(user),
    banned: Boolean(user.banned),
    bannedAt: user.bannedAt || null,
    bannedReason: user.bannedReason || null,
    bannedBy: user.bannedBy || null,
    isAdmin: isAdminEmail(user.email),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** Escape a user-supplied string for safe use inside a RegExp. */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* -------------------------------------------------------------------------- */
/* List                                                                      */
/* -------------------------------------------------------------------------- */

router.get('/', async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 25, MAX_PAGE_SIZE);
    const search = (req.query.query || '').trim();
    const status = req.query.status || 'all';

    const filter = {};

    if (search) {
      // Anchored, escaped pattern: a user-supplied string never becomes an
      // unbounded or malicious expression.
      const pattern = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { email: pattern },
        { username: pattern },
        { firstName: pattern },
        { lastName: pattern },
        { userId: search },
      ];
    }

    if (status === 'banned') filter.banned = true;
    if (status === 'active') filter.banned = { $ne: true };
    if (status === 'unverified') filter.emailVerified = { $ne: true };
    if (status === 'mfa') filter.mfaEnabled = true;

    const [users, total, settings] = await Promise.all([
      userDB
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      userDB.countDocuments(filter),
      getSettings(),
    ]);

    res.json({
      users: users.map((user) => presentUser(user, settings)),
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

/* -------------------------------------------------------------------------- */
/* Create                                                                    */
/* -------------------------------------------------------------------------- */

const USERNAME_REGEX = /^[a-zA-Z0-9-]{3,20}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
const PASSWORD_REGEX =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\[\]{}|;:,.<>?])([A-Za-z\d!@#$%^&*()_+\[\]{}|;:,.<>?]{8,})$/;

/**
 * Create an account directly, bypassing public signup.
 *
 * Intended for operator-provisioned accounts. The registration toggle does not
 * apply — an admin creating a user is an explicit act, not public signup — but
 * the same username/email/password rules do, so admin-made accounts are not
 * weaker than self-service ones.
 *
 * `emailVerified` defaults to true because the operator is asserting the
 * address; set it false to make the user confirm by email instead.
 */
router.post('/', async (req, res) => {
  try {
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const username = String(req.body?.username || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password;
    const emailVerified = req.body?.emailVerified !== false;

    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({
        error: 'Username must be 3-20 characters and contain only letters, numbers and dashes',
      });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (typeof password !== 'string' || password.length > 10000 || !PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        error:
          'Password must be at least 8 characters with an uppercase and lowercase letter, a digit and a symbol',
      });
    }

    const [existingEmail, existingUsername] = await Promise.all([
      userDB.findOne({ email }).lean(),
      userDB.findOne({ username }).lean(),
    ]);
    if (existingEmail) return res.status(409).json({ error: 'Email already in use' });
    if (existingUsername) return res.status(409).json({ error: 'Username already taken' });

    const settings = await getSettings();
    const providerRoles = Array.isArray(req.body?.providerRoles)
      ? req.body.providerRoles.map((role) => String(role).trim()).filter(Boolean)
      : [];

    let userId;
    let clash;
    do {
      userId = Math.floor(Math.random() * 900000000000) + 100000000000;
      clash = await userDB.findOne({ userId }).lean();
    } while (clash);

    const created = await userDB.create({
      userId,
      username,
      firstName,
      lastName,
      email,
      password: await bcrypt.hash(password, 10),
      emailVerified,
      mfaEnabled: false,
      banned: false,
      providerRoles,
      canManageApps: req.body?.canManageApps === true,
      identityProvider: 'local',
    });

    await recordAdminAction(req, 'user.create', {
      targetUserId: String(userId),
      targetEmail: email,
      username,
      emailVerified,
      canManageApps: created.canManageApps,
    });

    return res.status(201).json({ user: presentUser(created, settings) });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/* -------------------------------------------------------------------------- */
/* Detail                                                                    */
/* -------------------------------------------------------------------------- */

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [user, settings] = await Promise.all([
      userDB.findOne({ userId }).lean(),
      getSettings(),
    ]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [ownedApps, consents, roles] = await Promise.all([
      oAuthClientAppDB.find({ owner: userId }).sort({ createdAt: -1 }).lean(),
      userAppConsentDB.find({ userId }).sort({ lastAuthAt: -1 }).lean(),
      oAuthRolesDB.find({ oauthUserIds: userId }).lean(),
    ]);

    // Resolve app names for the consent list so the UI is not showing bare ids.
    const consentClientIds = consents.map((consent) => consent.clientId);
    const consentApps = consentClientIds.length
      ? await oAuthClientAppDB
          .find({ clientId: { $in: consentClientIds } })
          .select('clientId oauthAppName redirectUri')
          .lean()
      : [];
    const appNameByClientId = new Map(
      consentApps.map((app) => [app.clientId, app]),
    );

    // Every application this user owns shares one answer, since availability is
    // decided by the owner.
    const ownedAppsDisabledReason = ownerDisabledReason(user, settings);

    let sessions = [];
    try {
      const keys = await redisCache.keys(`psid:${userId}:*`);
      sessions = await Promise.all(
        keys.map(async (key) => {
          const data = await redisCache.hGetAll(key);
          const ttl = await redisCache.ttl(key);
          return {
            sessionId: key.split(':').pop(),
            deviceType: data.deviceType || 'Unknown',
            ipAddr: data.ipAddr || 'Unknown',
            createdAt: data.createdAt ? Number(data.createdAt) : null,
            expiresInSeconds: ttl,
          };
        }),
      );
      sessions.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    } catch {
      sessions = [];
    }

    res.json({
      user: presentUser(user, settings),
      sessions,
      ownedApps: ownedApps.map((app) => ({
        oauthClientAppId: app.oauthClientAppId,
        oauthAppName: app.oauthAppName,
        clientId: app.clientId,
        redirectUri: app.redirectUri,
        isPublicClient: Boolean(app.isPublicClient),
        accessTokenValidity: app.accessTokenValidity,
        createdAt: app.createdAt,
        // Derived from this user rather than read from the mirror, so the
        // console always agrees with what the OIDC endpoints enforce.
        disabled: Boolean(ownedAppsDisabledReason),
        disabledReason: ownedAppsDisabledReason,
        disabledAt: app.disabledAt || null,
      })),
      consents: consents.map((consent) => ({
        consentId: consent.consentId,
        clientId: consent.clientId,
        appName: appNameByClientId.get(consent.clientId)?.oauthAppName || consent.clientId,
        redirectUri: appNameByClientId.get(consent.clientId)?.redirectUri || null,
        consentedScopes: consent.consentedScopes || [],
        firstAuthAt: consent.firstAuthAt,
        lastAuthAt: consent.lastAuthAt,
      })),
      roles: roles.map((role) => ({
        oauthRoleId: role.oauthRoleId,
        oauthRoleName: role.oauthRoleName,
        oauthClientAppId: role.oauthClientAppId,
      })),
    });
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/* -------------------------------------------------------------------------- */
/* Moderation actions                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Load the target and refuse actions that would lock out the operator or
 * another admin. Returns null once a response has been sent.
 */
async function loadMutableTarget(req, res, { allowSelf = false } = {}) {
  const { userId } = req.params;
  const user = await userDB.findOne({ userId });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }

  if (!allowSelf && user.userId === req.adminUser.userId) {
    res.status(409).json({ error: 'You cannot perform this action on your own account' });
    return null;
  }

  if (!allowSelf && isAdminEmail(user.email)) {
    res.status(409).json({ error: 'Administrator accounts cannot be modified from the console' });
    return null;
  }

  return user;
}

router.post('/:userId/ban', async (req, res) => {
  try {
    const user = await loadMutableTarget(req, res);
    if (!user) return undefined;

    if (user.banned) {
      return res.status(409).json({ error: 'This account is already suspended' });
    }

    const reason = String(req.body?.reason || '').trim().slice(0, 500);

    user.banned = true;
    user.bannedAt = new Date();
    user.bannedReason = reason || 'No reason provided';
    user.bannedBy = req.adminUser.email;
    await user.save();

    // Revoke immediately: API routes authorise against the Redis session, so
    // without this the ban would not bite until the token expired.
    const revoked = await revokeAllSessions(user.userId);

    // A suspended account cannot manage applications, so the applications it
    // owns go down with it. Unbanning brings back the ones it is still entitled
    // to run.
    const apps = await syncOwnedApps(user.userId);

    await recordAdminAction(req, 'user.ban', {
      targetUserId: user.userId,
      targetEmail: user.email,
      reason: user.bannedReason,
      sessionsRevoked: revoked,
      appsDisabled: apps.disabledCount,
    });

    return res.json({
      success: true,
      user: presentUser(user, await getSettings()),
      sessionsRevoked: revoked,
      appsDisabled: apps.disabledCount,
    });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

router.post('/:userId/unban', async (req, res) => {
  try {
    const user = await loadMutableTarget(req, res);
    if (!user) return undefined;

    if (!user.banned) {
      return res.status(409).json({ error: 'This account is not suspended' });
    }

    user.banned = false;
    user.bannedAt = undefined;
    user.bannedReason = undefined;
    user.bannedBy = undefined;
    await user.save();

    // Re-enable owned applications, but only if the account still qualifies to
    // manage them: lifting a ban does not hand back a revoked capability.
    const apps = await syncOwnedApps(user.userId);

    await recordAdminAction(req, 'user.unban', {
      targetUserId: user.userId,
      targetEmail: user.email,
      appsEnabled: apps.enabledCount,
    });

    return res.json({
      success: true,
      user: presentUser(user, await getSettings()),
      appsEnabled: apps.enabledCount,
    });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/**
 * Grant or remove this user's individual permissions.
 *
 * `canManageApps` is an additive grant used while the instance-wide switch is
 * off. Removing it takes the user's applications down with it: they are switched
 * to a disabled state, their live OAuth sessions are revoked, and every OIDC
 * endpoint refuses to serve them, so nobody can authorise through one of these
 * apps while its operator has no access to it. Nothing is deleted — granting the
 * capability back re-enables the same applications with their credentials
 * intact.
 */
router.patch('/:userId/permissions', async (req, res) => {
  try {
    const user = await loadMutableTarget(req, res);
    if (!user) return undefined;

    if (typeof req.body?.canManageApps !== 'boolean') {
      return res.status(400).json({ error: 'canManageApps must be true or false' });
    }

    user.canManageApps = req.body.canManageApps;
    await user.save();

    const settings = await getSettings();
    const apps = await syncOwnedApps(user.userId);

    await recordAdminAction(req, 'user.setPermissions', {
      targetUserId: user.userId,
      targetEmail: user.email,
      canManageApps: user.canManageApps,
      effective: canManageApps(user, settings),
      appsDisabled: apps.disabledCount,
      appsEnabled: apps.enabledCount,
      appSessionsRevoked: apps.sessionsRevoked,
    });

    return res.json({
      success: true,
      user: presentUser(user, settings),
      appsDisabled: apps.disabledCount,
      appsEnabled: apps.enabledCount,
      appSessionsRevoked: apps.sessionsRevoked,
    });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/** Force sign-out everywhere without banning. */
router.post('/:userId/revoke-sessions', async (req, res) => {
  try {
    const user = await loadMutableTarget(req, res, { allowSelf: true });
    if (!user) return undefined;

    const revoked = await revokeAllSessions(user.userId);

    await recordAdminAction(req, 'user.revokeSessions', {
      targetUserId: user.userId,
      targetEmail: user.email,
      sessionsRevoked: revoked,
    });

    return res.json({ success: true, sessionsRevoked: revoked });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/** Clear a lost second factor so the user can sign in and re-enrol. */
router.post('/:userId/reset-mfa', async (req, res) => {
  try {
    const user = await loadMutableTarget(req, res);
    if (!user) return undefined;

    user.mfaEnabled = false;
    user.mfaSecret = undefined;
    await user.save();

    await recordAdminAction(req, 'user.resetMfa', {
      targetUserId: user.userId,
      targetEmail: user.email,
    });

    return res.json({ success: true, user: presentUser(user, await getSettings()) });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/** Remove a lost passkey. */
router.post('/:userId/reset-passkey', async (req, res) => {
  try {
    const user = await loadMutableTarget(req, res);
    if (!user) return undefined;

    user.passkeyId = undefined;
    user.passkeyPublicKey = undefined;
    user.signCount = 0;
    await user.save();

    await recordAdminAction(req, 'user.resetPasskey', {
      targetUserId: user.userId,
      targetEmail: user.email,
    });

    return res.json({ success: true, user: presentUser(user, await getSettings()) });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/**
 * Email a password recovery link on the user's behalf.
 *
 * Gated on the same `passwordResetEnabled` switch as the self-service flow: if
 * an operator has turned recovery off, the console must not be a way around it.
 * The link is identical to a self-requested one, which means it also signs the
 * user out everywhere — the reset handle and their sessions share a keyspace, so
 * issuing one necessarily clears the other.
 */
router.post('/:userId/send-recovery', async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.passwordResetEnabled) {
      return res.status(403).json({
        error: 'Self-service password recovery is disabled for this instance',
      });
    }

    const user = await loadMutableTarget(req, res);
    if (!user) return undefined;

    // Unlike the public route, each reason is spelled out: the operator is
    // already authorised to see the account, and needs to know what to fix.
    const blocker = passwordResetBlocker(user);
    if (blocker === 'social') {
      return res.status(409).json({
        error: `This account signs in with ${user.identityProvider} and has no password to reset`,
      });
    }
    if (blocker === 'unverifiedEmail') {
      return res.status(409).json({
        error: 'Verify the email address first, otherwise the link cannot be delivered safely',
      });
    }
    if (blocker === 'banned') {
      return res.status(409).json({ error: 'Restore the account before sending a recovery email' });
    }

    // Awaited, like invitations: a recovery email the operator believes was sent
    // but never was is worse than a visible failure.
    const sent = await issuePasswordReset(user);
    if (!sent) {
      return res.status(502).json({ error: 'Could not send the password recovery email' });
    }

    await recordAdminAction(req, 'user.sendRecovery', {
      targetUserId: user.userId,
      targetEmail: user.email,
    });

    return res.json({ success: true, user: presentUser(user, settings) });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/** Manually confirm an address when email delivery has failed. */
router.post('/:userId/verify-email', async (req, res) => {
  try {
    const user = await loadMutableTarget(req, res);
    if (!user) return undefined;

    if (user.emailVerified) {
      return res.status(409).json({ error: 'This address is already verified' });
    }

    user.emailVerified = true;
    await user.save();

    await recordAdminAction(req, 'user.verifyEmail', {
      targetUserId: user.userId,
      targetEmail: user.email,
    });

    return res.json({ success: true, user: presentUser(user, await getSettings()) });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/**
 * Permanently delete a user and everything owned by them.
 *
 * Irreversible, so it requires the account's exact username echoed back in the
 * request body as a confirmation token.
 */
router.delete('/:userId', async (req, res) => {
  try {
    const user = await loadMutableTarget(req, res);
    if (!user) return undefined;

    if (req.body?.confirmUsername !== user.username) {
      return res.status(400).json({
        error: 'Confirmation does not match: send the exact username to delete this account',
      });
    }

    const ownedApps = await oAuthClientAppDB.find({ owner: user.userId }).lean();
    const ownedAppIds = ownedApps.map((app) => app.oauthClientAppId);

    await revokeAllSessions(user.userId);

    const [consentsRemoved, rolesRemoved] = await Promise.all([
      userAppConsentDB.deleteMany({ userId: user.userId }),
      ownedAppIds.length
        ? oAuthRolesDB.deleteMany({ oauthClientAppId: { $in: ownedAppIds } })
        : Promise.resolve({ deletedCount: 0 }),
    ]);

    // Also drop this user's membership from roles belonging to other owners.
    await oAuthRolesDB.updateMany(
      { oauthUserIds: user.userId },
      { $pull: { oauthUserIds: user.userId } },
    );

    if (ownedAppIds.length) {
      await Promise.all([
        oAuthClientAppDB.deleteMany({ oauthClientAppId: { $in: ownedAppIds } }),
        userAppConsentDB.deleteMany({ oauthClientAppId: { $in: ownedAppIds } }),
      ]);
    }

    await userDB.deleteOne({ userId: user.userId });

    await recordAdminAction(req, 'user.delete', {
      targetUserId: user.userId,
      targetEmail: user.email,
      appsRemoved: ownedAppIds.length,
      consentsRemoved: consentsRemoved.deletedCount ?? 0,
      rolesRemoved: rolesRemoved.deletedCount ?? 0,
    });

    return res.json({
      success: true,
      appsRemoved: ownedAppIds.length,
      consentsRemoved: consentsRemoved.deletedCount ?? 0,
    });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/** Revoke one application's consent on the user's behalf. */
router.delete('/:userId/consents/:clientId', async (req, res) => {
  try {
    const { userId, clientId } = req.params;
    const user = await userDB.findOne({ userId }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = await userAppConsentDB.deleteOne({ userId, clientId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Consent not found' });
    }

    await recordAdminAction(req, 'user.revokeConsent', {
      targetUserId: userId,
      targetEmail: user.email,
      clientId,
    });

    return res.json({ success: true });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

export default router;
