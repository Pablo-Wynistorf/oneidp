import express from 'express';
import jwt from 'jsonwebtoken';
import { oAuthClientAppDB } from '../../../database/mongodb.mjs';
import redisCache from '../../../database/redis.mjs';
import { notifyError } from '../../../notify/notifications.mjs';
import { rejectIfClientDisabled } from '../../../utils/client-status.mjs';
import 'dotenv/config';

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
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

  try {
    jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, decoded) => {
      if (error) {
        return res.status(401).json({ success: false, description: 'Access Token invalid' });
      }

      const { userId, osid, clientId } = decoded;

      try {
        const redisKey = `osid:${userId}:${osid}`;
        const session = await redisCache.keys(redisKey);
    
        if (session.length === 0) {
          res.clearCookie('access_token');
          return res.status(401).json({ success: false, error: 'Access Token is invalid' });
        }

        // A token belonging to a disabled application is not valid, even while
        // its session has not been cleared yet.
        if (clientId && clientId !== 'undefined') {
          const oauth_client = await oAuthClientAppDB.findOne({ clientId }).lean();
          if (!oauth_client) {
            return res.status(401).json({ success: false, error: 'Access Token is invalid' });
          }
          if (await rejectIfClientDisabled(oauth_client, res)) return undefined;
        }

        res.status(200).json({ success: true, description: 'Access Token is valid' });
      } catch (error) {
        notifyError(error);
        return res.status(500).json({ error: 'Something went wrong, try again later' });
      }
    });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

export default router;
