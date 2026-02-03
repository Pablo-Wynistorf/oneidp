const express = require('express');
const jwt = require('jsonwebtoken');
const { oAuthClientAppDB, userAppConsentDB } = require('../../../database/mongodb.js');
const redisCache = require('../../../database/redis.js');
const { notifyError } = require('../../../notify/notifications.js');

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

    // Map consents with app info
    const result = consents.map(consent => {
      const app = apps.find(a => a.clientId === consent.clientId);
      return {
        appName: app ? app.oauthAppName : 'Unknown App',
        clientId: consent.clientId,
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

module.exports = router;
