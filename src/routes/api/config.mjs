import express from 'express';
import { getSettings } from '../../utils/app-settings.mjs';

const router = express.Router();

/**
 * Public instance configuration.
 *
 * Lets the SPA hide signup and social buttons that the server would reject
 * anyway. Only the flags that affect what a visitor can see are exposed —
 * never the email allow-list, which would leak how the
 * instance is provisioned.
 */
router.get('/', async (req, res) => {
  try {
    const settings = await getSettings();

    // Short client cache: these change rarely, and the value is not per-user.
    res.set('Cache-Control', 'public, max-age=30');

    res.json({
      registrationEnabled: settings.registrationEnabled,
      socialLoginEnabled: settings.socialLoginEnabled,
      passwordResetEnabled: settings.passwordResetEnabled,
      maintenanceMode: settings.maintenanceMode,
      maintenanceMessage: settings.maintenanceMode ? settings.maintenanceMessage : '',
    });
  } catch {
    // Never fail the app shell over this: fall back to the permissive defaults.
    res.json({
      registrationEnabled: true,
      socialLoginEnabled: true,
      passwordResetEnabled: true,
      maintenanceMode: false,
      maintenanceMessage: '',
    });
  }
});

export default router;
