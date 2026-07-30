import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { notifyError } from '../../../../notify/notifications.mjs';

import { userDB } from '../../../../database/mongodb.mjs';
import redisCache from '../../../../database/redis.mjs';

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  const { password } = req.body;

  const password_reset_token = req.cookies.password_reset_token;

  if (!password_reset_token) {
    return res.status(461).json({ success: false, error: 'Reset Token not found' });
  }

  try {

    const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\[\]{}|;:,.<>?])([A-Za-z\d!@#$%^&*()_+\[\]{}|;:,.<>?]{8,})$/;
    if (typeof password !== 'string' || password.length < 8 || password.length > 10000 || !passwordPattern.test(password)) {
      return res.status(460).json({ success: false, error: 'Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character' });
    }

    jwt.verify(password_reset_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, decoded) => {
      if (error) {
        res.clearCookie('password_reset_token');
        return res.status(461).json({ success: false, error: 'Reset token invalid' });
      }

      const userId = decoded.userId;
      const pprSid = decoded.pprSid;

      const providerPasswordResetRedisKey = `ppr:${userId}:${pprSid}`;
      const session = await redisCache.keys(providerPasswordResetRedisKey);
  
      if (session.length === 0) {
        res.clearCookie('password_reset_token');
        return res.status(461).json({ success: false, error: 'Reset token invalid' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // Burn the handle before the write so a replayed request cannot set a
      // second password with the same link.
      await redisCache.del(providerPasswordResetRedisKey);

      await userDB.updateOne({ userId }, { $set: { password: hashedPassword } });

      // No session is issued here on purpose. Whoever opened the emailed link
      // has proven control of the mailbox, not knowledge of the new password, so
      // they are sent to the login form to use it. Any stale access_token cookie
      // in this browser is cleared too, otherwise the SPA would treat the
      // visitor as signed in against a session that no longer exists.
      res.clearCookie('password_reset_token');
      res.clearCookie('access_token', { path: '/' });
      res.status(200).json({ success: true });
    });

  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

export default router;