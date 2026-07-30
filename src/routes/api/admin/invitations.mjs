import express from 'express';
import { invitationDB, userDB } from '../../../database/mongodb.mjs';
import { notifyError } from '../../../notify/notifications.mjs';
import { recordAdminAction } from '../../../utils/admin-auth.mjs';
import { sendInviteEmail } from '../../../utils/send-emails.mjs';
import {
  INVITE_TTL_DAYS,
  generateInviteToken,
  hashInviteToken,
  presentInvitation,
} from '../../../utils/invitations.mjs';

const router = express.Router();

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

function randomId(length = 20) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

/** List invitations, newest first. */
router.get('/', async (req, res) => {
  try {
    const status = req.query.status || 'all';
    const invitations = await invitationDB.find({}).sort({ createdAt: -1 }).limit(200);

    let presented = invitations.map(presentInvitation);
    if (status !== 'all') {
      presented = presented.filter((invitation) => invitation.status === status);
    }

    res.json({ invitations: presented });
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/**
 * Invite someone by email.
 *
 * An invitation bypasses the registration toggle by design: closing public
 * signups is exactly when invitations matter. It also implies the operator
 * vouches for the address, so accepting one marks the email verified.
 */
router.post('/', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const providerRoles = Array.isArray(req.body?.providerRoles)
      ? req.body.providerRoles.map((role) => String(role).trim()).filter(Boolean)
      : null;

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }

    const existingUser = await userDB.findOne({ email }).lean();
    if (existingUser) {
      return res.status(409).json({ error: 'An account already exists for that address' });
    }

    // Supersede any earlier pending invitation for the same address so only the
    // newest link works.
    await invitationDB.updateMany(
      { email, acceptedAt: null, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );

    const token = generateInviteToken();
    const inviteId = randomId();

    const invitation = await invitationDB.create({
      inviteId,
      email,
      tokenHash: hashInviteToken(token),
      invitedBy: req.adminUser.email,
      providerRoles: providerRoles ?? [],
      // Off unless the operator explicitly grants it when inviting.
      canManageApps: req.body?.canManageApps === true,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      acceptedAt: null,
      revokedAt: null,
    });

    // Awaited, unlike the other transactional emails: an invitation that was
    // never delivered is dead, so the failure is reported instead of swallowed.
    try {
      await sendInviteEmail(email, token);
    } catch (mailError) {
      await invitationDB.deleteOne({ inviteId });
      notifyError(mailError);
      return res.status(502).json({ error: 'Could not send the invitation email' });
    }

    await recordAdminAction(req, 'invitation.create', {
      email,
      inviteId,
      expiresAt: invitation.expiresAt,
    });

    return res.status(201).json({ invitation: presentInvitation(invitation) });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/**
 * Resend: issues a fresh token and invalidates the previous link.
 *
 * A revoked invitation stays revoked; reviving it here would turn "revoke"
 * into an undoable state. Invite the address again to issue a new one.
 */
router.post('/:inviteId/resend', async (req, res) => {
  try {
    const { inviteId } = req.params;
    const invitation = await invitationDB.findOne({ inviteId });

    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });
    if (invitation.acceptedAt) {
      return res.status(409).json({ error: 'That invitation has already been accepted' });
    }
    if (invitation.revokedAt) {
      return res.status(409).json({
        error: 'That invitation was revoked. Invite the address again to send a new link.',
      });
    }

    const token = generateInviteToken();
    invitation.tokenHash = hashInviteToken(token);
    invitation.expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await invitation.save();

    try {
      await sendInviteEmail(invitation.email, token);
    } catch (mailError) {
      notifyError(mailError);
      return res.status(502).json({ error: 'Could not send the invitation email' });
    }

    await recordAdminAction(req, 'invitation.resend', {
      email: invitation.email,
      inviteId,
    });

    return res.json({ invitation: presentInvitation(invitation) });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/** Revoke a pending invitation. */
router.delete('/:inviteId', async (req, res) => {
  try {
    const { inviteId } = req.params;
    const invitation = await invitationDB.findOne({ inviteId });

    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });
    if (invitation.acceptedAt) {
      return res.status(409).json({ error: 'That invitation has already been accepted' });
    }

    invitation.revokedAt = new Date();
    await invitation.save();

    await recordAdminAction(req, 'invitation.revoke', {
      email: invitation.email,
      inviteId,
    });

    return res.json({ success: true, invitation: presentInvitation(invitation) });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

export default router;
