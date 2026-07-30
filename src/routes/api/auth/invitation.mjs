import express from 'express';
import { notifyError } from '../../../notify/notifications.mjs';
import { findUsableInvitation } from '../../../utils/invitations.mjs';

const router = express.Router();

/**
 * Validate an invitation token so the signup form can pre-fill the address and
 * show that the visitor was invited.
 *
 * Returns only the invited email — never the roles or who sent it. An invalid
 * token gets a flat 404 rather than a reason, so this cannot be used to probe
 * which tokens exist or enumerate invited addresses.
 */
router.get('/', async (req, res) => {
  try {
    const invitation = await findUsableInvitation(req.query.token);

    if (!invitation) {
      return res.status(404).json({ valid: false, error: 'This invitation is not valid' });
    }

    return res.json({
      valid: true,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
    });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

export default router;
