import express from 'express';
import jwt from 'jsonwebtoken';

import { userDB, oAuthRolesDB, oAuthClientAppDB} from '../../../../../database/mongodb.mjs';
import redisCache from '../../../../../database/redis.mjs';

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY || ''}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  const accessToken = req.cookies.access_token;
  const oauthClientAppId = req.body.oauthClientAppId;
  const oauthRoleId = req.body.oauthRoleId;

  if (!accessToken) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  try {
    const decoded = jwt.verify(accessToken, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
    const { userId, sid } = decoded;

    const redisKey = `psid:${userId}:${sid}`;
    const session = await redisCache.keys(redisKey);

    if (session.length === 0) {
      res.clearCookie('access_token');
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const oauthApps = await oAuthClientAppDB.find({ owner: userId });

    if (!Array.isArray(oauthApps)) {
      return res.status(400).json({ error: 'Invalid format for oauthClientAppIds' });
    }

    if (oauthApps.length === 0) {
      return res.status(404).json({ error: 'No OAuth apps found for this user' });
    }

    const userApp = oauthApps.find(app => app.oauthClientAppId === oauthClientAppId);
    if (!userApp) {
      return res.status(465).json({ error: 'User does not have access to this app' });
    }

    const oauthRolesData = await oAuthRolesDB.findOne({ oauthRoleId });
    if (!oauthRolesData) {
      return res.status(404).json({ error: 'No OAuth roles found for this app' });
    }

    const rawUserIds = oauthRolesData.oauthUserIds;
    const oauthUserIds = Array.isArray(rawUserIds) ? rawUserIds : rawUserIds ? [rawUserIds] : [];

    // A role assigned to '*' covers every user, so there is no member list to
    // resolve.
    if (oauthUserIds.includes('*')) {
      return res.json({
        everyone: true,
        members: [],
        oauthUserIds: ['*'],
        oauthUserNames: ['*'],
      });
    }

    // One query for the whole list rather than a findOne per member.
    const users = await userDB
      .find({ userId: { $in: oauthUserIds } })
      .select('userId username email')
      .lean();
    const userById = new Map(users.map((user) => [user.userId, user]));

    // Membership order is preserved, and an id with no account left behind is
    // still listed so it can be removed.
    const members = oauthUserIds.map((memberId) => {
      const user = userById.get(memberId);
      return {
        userId: memberId,
        username: user?.username ?? `${memberId}_unknown_user`,
        email: user?.email ?? null,
        missing: !user,
      };
    });

    res.json({
      everyone: false,
      members,
      oauthUserIds,
      // Retained for callers written against the original response.
      oauthUserNames: members.map((member) => member.username),
    });
  } catch (error) {
    console.error(error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
