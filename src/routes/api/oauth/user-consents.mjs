import express from 'express';
import jwt from 'jsonwebtoken';
import { oAuthClientAppDB, userAppConsentDB } from '../../../database/mongodb.mjs';
import redisCache from '../../../database/redis.mjs';
import { notifyError } from '../../../notify/notifications.mjs';

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

// Get all apps the user has consented to
router.get('/', async (req, res) => {
  const access_token = req.cookies.access_token;

  if (!access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
    const { userId, sid } = decoded;

    // Verify session
    const redisKey = `psid:${userId}:${sid}`;
    const session = await redisCache.keys(redisKey);

    if (session.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }

    // Get all consents for this user
    const consents = await userAppConsentDB.find({ userId }).lean();

    if (consents.length === 0) {
      return res.json({ apps: [] });
    }

    // Get app details for each consent
    const clientIds = consents.map(c => c.clientId);
    const apps = await oAuthClientAppDB.find({ clientId: { $in: clientIds } }).lean();
    const appByClientId = new Map(apps.map(app => [app.clientId, app]));

    // A consent whose client no longer exists is dead weight: there is nothing
    // left to grant access to, and showing it as "Unknown App" only invites the
    // user to revoke something that is already gone. Deletion cascades consents
    // now, so this is for rows orphaned before that — clear them on sight rather
    // than leaving the account page to explain them.
    const live = consents.filter(consent => appByClientId.has(consent.clientId));
    const orphaned = consents.filter(consent => !appByClientId.has(consent.clientId));

    if (orphaned.length > 0) {
      try {
        await userAppConsentDB.deleteMany({ _id: { $in: orphaned.map(c => c._id) } });
      } catch (cleanupError) {
        // Reading the list must not fail because the tidy-up did.
        notifyError(cleanupError);
      }
    }

    // Map consents with app info
    const result = live.map(consent => {
      const app = appByClientId.get(consent.clientId);
      return {
        appName: app.oauthAppName,
        clientId: consent.clientId,
        redirectUri: app.redirectUri,
        consentedScopes: consent.consentedScopes,
        firstAuthAt: consent.firstAuthAt,
        lastAuthAt: consent.lastAuthAt
      };
    });

    res.json({ apps: result });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Revoke consent for an app
router.delete('/:clientId', async (req, res) => {
  const access_token = req.cookies.access_token;
  const { clientId } = req.params;

  if (!access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
    const { userId, sid } = decoded;

    // Verify session
    const redisKey = `psid:${userId}:${sid}`;
    const session = await redisCache.keys(redisKey);

    if (session.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }

    // Delete the consent
    const result = await userAppConsentDB.deleteOne({ userId, clientId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Consent not found' });
    }

    res.json({ success: true, message: 'App access revoked' });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

export default router;
