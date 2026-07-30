import express from 'express';
import jwt from 'jsonwebtoken';
import { oAuthClientAppDB, userAppConsentDB } from '../../../database/mongodb.mjs';
import redisCache from '../../../database/redis.mjs';
import { notifyError } from '../../../notify/notifications.mjs';
import { rejectIfClientDisabled } from '../../../utils/client-status.mjs';

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

// Get app info for consent screen
router.get('/app-info', async (req, res) => {
  const { client_id } = req.query;

  if (!client_id) {
    return res.status(400).json({ error: 'client_id is required' });
  }

  try {
    const app = await oAuthClientAppDB.findOne({ clientId: client_id });
    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Do not describe a disabled application to the user: there is nothing they
    // can usefully consent to.
    if (await rejectIfClientDisabled(app, res)) return undefined;

    // redirectUri is returned so the consent screen can verify the redirect_uri
    // it was handed matches the one registered for this client before sending
    // the user there on "deny". Without it the deny path is an open redirect.
    res.json({
      appName: app.oauthAppName,
      clientId: app.clientId,
      redirectUri: app.redirectUri
    });
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Handle consent submission
router.post('/', async (req, res) => {
  const access_token = req.cookies.access_token;
  const { client_id, scope, action } = req.body;

  if (!access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!client_id) {
    return res.status(400).json({ error: 'client_id is required' });
  }

  if (action !== 'approve') {
    return res.status(400).json({ error: 'Invalid action' });
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

    // Get the OAuth app
    const app = await oAuthClientAppDB.findOne({ clientId: client_id });
    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Re-checked on submit as well as on load: consent must not be recorded for
    // an application that went down while the screen was open.
    if (await rejectIfClientDisabled(app, res)) return undefined;

    const scopes = scope ? scope.split(' ') : ['openid'];
    const now = new Date();

    // Check for existing consent
    const existingConsent = await userAppConsentDB.findOne({
      userId,
      clientId: client_id
    });

    if (existingConsent) {
      // Merge scopes and update
      const mergedScopes = [...new Set([...existingConsent.consentedScopes, ...scopes])];
      await userAppConsentDB.updateOne(
        { userId, clientId: client_id },
        {
          $set: {
            consentedScopes: mergedScopes,
            lastAuthAt: now
          }
        }
      );
    } else {
      // Create new consent
      const consentId = await generateRandomString(20);
      await userAppConsentDB.create({
        consentId,
        userId,
        oauthClientAppId: app.oauthClientAppId,
        clientId: client_id,
        consentedScopes: scopes,
        firstAuthAt: now,
        lastAuthAt: now
      });
    }

    res.json({ success: true });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

export default router;
