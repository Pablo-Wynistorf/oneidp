import crypto from 'node:crypto';
import { invitationDB } from '../database/mongodb.mjs';

/**
 * Invitation tokens.
 *
 * The raw token only ever exists in the email that is sent; the database holds
 * a SHA-256 hash. That way a database leak cannot be turned into a set of
 * working invitation links, and the token is compared in constant time.
 */

export const INVITE_TTL_DAYS = 7;

export function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashInviteToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Present an invitation for the admin console, without the token. */
export function presentInvitation(invitation) {
  const expired = invitation.expiresAt && invitation.expiresAt.getTime() < Date.now();
  let status = 'pending';
  if (invitation.acceptedAt) status = 'accepted';
  else if (invitation.revokedAt) status = 'revoked';
  else if (expired) status = 'expired';

  return {
    inviteId: invitation.inviteId,
    email: invitation.email,
    invitedBy: invitation.invitedBy,
    providerRoles: invitation.providerRoles ?? [],
    canManageApps: Boolean(invitation.canManageApps),
    status,
    expiresAt: invitation.expiresAt ?? null,
    acceptedAt: invitation.acceptedAt ?? null,
    acceptedUserId: invitation.acceptedUserId ?? null,
    revokedAt: invitation.revokedAt ?? null,
    createdAt: invitation.createdAt,
  };
}

/**
 * Look up a usable invitation by raw token.
 * Returns null when the token is unknown, already used, revoked or expired.
 */
export async function findUsableInvitation(token) {
  if (!token || typeof token !== 'string') return null;

  const invitation = await invitationDB.findOne({ tokenHash: hashInviteToken(token) });
  if (!invitation) return null;
  if (invitation.acceptedAt || invitation.revokedAt) return null;
  if (invitation.expiresAt && invitation.expiresAt.getTime() < Date.now()) return null;

  return invitation;
}

/**
 * Mark an invitation as accepted.
 *
 * The filter re-checks that it is still unaccepted so two concurrent signups
 * with the same link cannot both succeed.
 */
export async function consumeInvitation(inviteId, userId) {
  const result = await invitationDB.updateOne(
    { inviteId, acceptedAt: null, revokedAt: null },
    { $set: { acceptedAt: new Date(), acceptedUserId: userId } },
  );
  return result.modifiedCount === 1;
}
