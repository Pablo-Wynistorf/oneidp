const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;
const { notifyError } = require('../../../../notify/notifications');

const { userDB } = require('../../../../database/database.js');

const router = express.Router();

router.post('/', async (req, res) => {
  const { password, password_reset_code } = req.body;
  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&.()/^])([A-Za-z\d@$!%*?&.]{8,})$/;
  const req_cookies = req.headers.cookie;

  if (!req_cookies) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  const cookies = req_cookies.split(';').reduce((cookiesObj, cookie) => {
    const [name, value] = cookie.trim().split('=');
    cookiesObj[name] = value;
    return cookiesObj;
  }, {});

  const password_reset_token = cookies['password_reset_token'];

  try {
    if (!passwordPattern.test(password)) {
      return res.status(462).json({ success: false, error: 'Password doesn\'t meet our requirements' });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(463).json({ success: false, error: 'Password must have at least 8 characters' });
    }

    if (typeof password !== 'string' || password.length > 23) {
      return res.status(464).json({ success: false, error: 'Password must not have more than 23 characters' });
    }

    try {
      const decoded = jwt.verify(password_reset_token, JWT_SECRET);

      const userId = decoded.userId;

      const userReset = await userDB.findOne({ userId: userId, resetCode: password_reset_code });
      if (!userReset) {
        return res.status(460).json({ error: 'Wrong recovery code entered' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newsid = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');

      await userDB.updateOne({ userId }, { $set: { password: hashedPassword, sid: newsid } });
      await userDB.updateOne({ userId }, { $unset: { resetCode: 1 } });

      const access_token = jwt.sign({ userId: userId, sid: newsid }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '48h' });
      res.clearCookie('password_reset_token');
      res.cookie('access_token', access_token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
      res.status(200).json({ success: true });

    } catch (error) {
      return res.status(401).json({ error: 'Invalid password reset token' });
    }
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;