import express from 'express';
import jwt from 'jsonwebtoken';
import { userDB, userAppConsentDB, oAuthClientAppDB } from '../../../database/mongodb.mjs';
import redisCache from '../../../database/redis.mjs';
import { notifyError } from '../../../notify/notifications.mjs';
import { rejectIfClientDisabled } from '../../../utils/client-status.mjs';
import 'dotenv/config';

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

const router = express.Router();

/** Escape a user-supplied string for safe use inside a RegExp. */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Enough to pick someone out of a search box without shipping the directory.
const SEARCH_LIMIT = 25;

/**
 * Fields a role editor needs to tell two accounts apart. Deliberately narrow:
 * this endpoint is reachable by any signed-in user and by client credentials.
 */
const SEARCH_FIELDS = 'userId username email';

function presentUser(user) {
  return {
    userId: user.userId,
    username: user.username,
    email: user.email,
  };
}

router.get('/search', async (req, res) => {
  let access_token;

  const authorizationHeader = req.headers['authorization'];
  if (authorizationHeader && authorizationHeader.startsWith('Bearer ')) {
    access_token = authorizationHeader.split(' ')[1];
  }

  if (!access_token) {
    access_token = req.cookies.access_token;
    if (!access_token) {
      return res.status(400).json({ success: false, error: 'Access Token not provided' });
    }
  }

  jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, tokenData) => {
    if (error) {
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const { userId, sid, osid } = tokenData;

    try {
      let redisKey;
      if (sid) {
        redisKey = `psid:${userId}:${sid}`;
      } else if (osid) {
        redisKey = `osid:${userId}:${osid}`;
      }

      const session = await redisCache.keys(redisKey);
      if (session.length === 0) {
        res.clearCookie('access_token');
        return res.status(401).json({ success: false, error: 'Access Token is invalid' });
      }

      const { query, oauthClientAppId } = req.query;
      if (!query || query.trim() === "") {
        return res.status(400).json({ success: false, error: 'Search query not provided' });
      }

      // Escaped before it reaches Mongo: a raw user-supplied pattern here was
      // both a denial-of-service surface and broke on ordinary characters like
      // '.' and '+' in email addresses.
      const pattern = new RegExp(escapeRegex(query.trim()), 'i');
      const matchAnyIdentifier = [
        { username: pattern },
        { email: pattern },
        { userId: pattern },
      ];

      // If oauthClientAppId is provided, filter users by those who have consented to the app
      if (oauthClientAppId) {
        // Get the clientId for this app
        const oauthApp = await oAuthClientAppDB.findOne({ oauthClientAppId });
        if (!oauthApp) {
          return res.status(404).json({ success: false, error: 'OAuth app not found' });
        }

        // A disabled application does not get to enumerate its users.
        if (await rejectIfClientDisabled(oauthApp, res)) return undefined;

        // Get all users who have consented to this app
        const consents = await userAppConsentDB.find({ clientId: oauthApp.clientId }).lean();
        const consentedUserIds = consents.map(c => c.userId);

        if (consentedUserIds.length === 0) {
          return res.status(200).json({ success: true, users: [], userName: [] });
        }

        // Search only among consented users
        const users = await userDB
          .find({ userId: { $in: consentedUserIds }, $or: matchAnyIdentifier })
          .select(SEARCH_FIELDS)
          .limit(SEARCH_LIMIT)
          .lean();

        return res.status(200).json({
          success: true,
          users: users.map(presentUser),
          // Retained for callers written against the original response.
          userName: users.map(user => user.username),
        });
      }

      // Default behavior: search all users (for backward compatibility)
      const users = await userDB
        .find({ $or: matchAnyIdentifier })
        .select(SEARCH_FIELDS)
        .limit(SEARCH_LIMIT)
        .lean();

      res.status(200).json({
        success: true,
        users: users.map(presentUser),
        userName: users.map(user => user.username),
      });

    } catch (error) {
      notifyError(error);
      return res.status(500).json({ success: false, error: 'Something went wrong, try again later' });
    }
  });
});

export default router;
