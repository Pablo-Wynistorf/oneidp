import express from 'express';
import { notifyError } from '../../../notify/notifications.mjs';
import { recordAdminAction } from '../../../utils/admin-auth.mjs';
import { getSettings, updateSettings } from '../../../utils/app-settings.mjs';
import { syncAllOwnedApps } from '../../../utils/client-status.mjs';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    res.json({ settings: await getSettings() });
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

/**
 * Partial update. Only recognised fields are applied, so an unexpected body
 * cannot introduce arbitrary settings.
 */
router.patch('/', async (req, res) => {
  try {
    const { settings, changed } = await updateSettings(req.body, req.adminUser.email);

    // `allowAllUsersManageApps` decides app management for every owner without a
    // per-user grant, so moving it switches their applications off or back on.
    // Enforcement is derived live either way; this brings the stored state the
    // console reads in line and tears down sessions for anything now disabled.
    const apps = changed.includes('allowAllUsersManageApps')
      ? await syncAllOwnedApps()
      : null;

    if (changed.length > 0) {
      await recordAdminAction(req, 'settings.update', {
        changed,
        // Record the resulting values of the toggles that were touched, so the
        // audit trail says what the instance was switched to.
        values: Object.fromEntries(changed.map((field) => [field, settings[field]])),
        ...(apps && {
          appsDisabled: apps.disabledCount,
          appsEnabled: apps.enabledCount,
          appSessionsRevoked: apps.sessionsRevoked,
        }),
      });
    }

    res.json({
      settings,
      changed,
      ...(apps && { appsDisabled: apps.disabledCount, appsEnabled: apps.enabledCount }),
    });
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

export default router;
