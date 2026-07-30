import express from 'express';
import { notifyError } from '../../../../notify/notifications.mjs';

import { userDB } from '../../../../database/mongodb.mjs';
import { getSettings } from '../../../../utils/app-settings.mjs';
import { issuePasswordReset, passwordResetBlocker } from '../../../../utils/password-reset.mjs';

const router = express.Router();

router.post('/', async (req, res) => {
  const { email } = req.body;

  try {
    const settings = await getSettings();
    if (!settings.passwordResetEnabled) {
      return res.status(403).json({
        success: false,
        error: 'Password reset is currently disabled. Contact an administrator.',
      });
    }

    const userData = await userDB.findOne({ email, identityProvider: 'local' });

    const blocker = passwordResetBlocker(userData);
    if (blocker === 'notFound') {
      return res.status(404).json({ success: false, error: 'No account with this email' });
    }
    if (blocker === 'unverifiedEmail') {
      return res.status(400).json({ success: false, error: 'Email not verified' });
    }
    if (blocker) {
      // Suspended or non-local accounts get the same wording as a missing one:
      // the public endpoint should not describe why an address is unusable.
      return res.status(404).json({ success: false, error: 'No account with this email' });
    }

    const sent = await issuePasswordReset(userData);
    if (!sent) {
      return res.status(500).json({ error: 'Failed to send password reset email' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

export default router;
