import express from 'express';
import jwt from 'jsonwebtoken';

import { oAuthRolesDB, oAuthClientAppDB } from '../../../../../database/mongodb.mjs';
import redisCache from '../../../../../database/redis.mjs';

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  const access_token = req.cookies.access_token
  const oauthClientAppId = req.body.oauthClientAppId;

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, decoded) => {
    if (error) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const userId = decoded.userId;
    const sid = decoded.sid;

    const redisKey = `psid:${userId}:${sid}`;
    const session = await redisCache.keys(redisKey);

    if (session.length === 0) {
      res.clearCookie('access_token');
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const oauthApps = await oAuthClientAppDB.find({ owner: userId });

    if (!Array.isArray(oauthApps)) {
      return res.status(400).json({ error: 'Invalid format for oauthApps' });
    }

    // Two modes. With an app id, the roles of that one application. Without
    // one, every role the caller owns across all of their applications, so the
    // console can show the full picture instead of making the user pick an
    // application before seeing anything.
    let scopedApps;

    if (oauthClientAppId) {
      // No apps at all is covered by the ownership check, which is the more
      // accurate answer for a caller asking about an app that is not theirs.
      const userApp = oauthApps.find(app => app.oauthClientAppId === oauthClientAppId);
      if (!userApp) {
        return res.status(465).json({ error: 'User does not have access to this app' });
      }
      scopedApps = [userApp];
    } else {
      scopedApps = oauthApps;
    }

    const appIds = scopedApps.map(app => app.oauthClientAppId);

    // Match on the stored field instead of pattern-matching the role id. The
    // old regex interpolated the app id unescaped and unanchored, which breaks
    // on UUID hyphens and could over-match.
    const oauthRolesData = appIds.length
      ? await oAuthRolesDB.find({ oauthClientAppId: { $in: appIds } })
      : [];

    // Roles carry their application's name so the client does not need a second
    // lookup to label them.
    const appById = new Map(scopedApps.map(app => [app.oauthClientAppId, app]));

    // An app without roles yet is a normal state, so return an empty list
    // rather than a 404 the client has to special-case.
    const organizedData = (oauthRolesData ?? []).map(role => {
      const app = appById.get(role.oauthClientAppId);
      return {
        oauthRoleId: role.oauthRoleId,
        oauthClientAppId: role.oauthClientAppId,
        oauthRoleName: role.oauthRoleName,
        oauthUserIds: role.oauthUserIds,
        oauthAppName: app?.oauthAppName,
        clientId: app?.clientId,
      };
    });

    res.json({ oauthRoles: organizedData });
  });
});

export default router;
