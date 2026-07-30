import express from 'express';
import jwt from 'jsonwebtoken';
import { userDB, oAuthClientAppDB, oAuthRolesDB } from '../../../database/mongodb.mjs';
import redisCache from '../../../database/redis.mjs';
import { notifyError } from '../../../notify/notifications.mjs';
import { rejectIfClientDisabled } from '../../../utils/client-status.mjs';
import { isAdminEmail } from '../../../utils/admin-auth.mjs';
import { canManageApps } from '../../../utils/permissions.mjs';
import { getSettings } from '../../../utils/app-settings.mjs';
import 'dotenv/config';

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

const router = express.Router();

router.all('/', (req, res) => {
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

    const { userId, clientId, sid, osid } = tokenData;

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

      const userData = await userDB.findOne({ userId });
      if (!userData) {
        return res.status(401).json({ success: false, error: 'Error retrieving userdata' });
      }

      // First-party response (the ONEIDP SPA). `isAdmin` is included so the app
      // can show the admin navigation; it is a UI hint only, and every admin
      // endpoint re-checks the allow-list server-side.
      if (!clientId || clientId === 'undefined') {
        return res.status(200).json({
          sub: userId,
          userId,
          username: userData.username,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          providerRoles: userData.providerRoles,
          mfaEnabled: userData.mfaEnabled,
          passkeyEnabled: userData.passkeyId ? true : false,
          isAdmin: isAdminEmail(userData.email) && Boolean(userData.emailVerified),
          canManageApps: canManageApps(userData, await getSettings()),
        });
      }

      // Third-party call. The client is resolved here purely to check it is
      // still live: a disabled application must not be able to read claims with
      // a token it was issued beforehand.
      const oauth_client = await oAuthClientAppDB.findOne({ clientId }).lean();
      if (!oauth_client) {
        return res.status(401).json({ error: 'invalid_token', error_description: 'Unknown client' });
      }
      if (await rejectIfClientDisabled(oauth_client, res)) return undefined;

      const roleData = await oAuthRolesDB.find({
        $or: [
          { oauthClientId: clientId, oauthUserIds: userId },
          { oauthClientId: clientId, oauthUserIds: "*" },
        ],
      }).exec();

      const roleNames = roleData.map((role) => role.oauthRoleName);

      res.status(200).json({
        sub: userId,
        userId,
        firstName: userData.firstName,
        lastName: userData.lastName,
        username: userData.username,
        email: userData.email,
        roles: roleNames,
        mfaEnabled: userData.mfaEnabled,
      });
    } catch (error) {
      notifyError(error);
      return res.status(500).json({ error: 'Something went wrong, try again later' });
    }
  });
});

export default router;
