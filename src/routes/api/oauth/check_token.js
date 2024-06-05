const express = require('express');
const jwt = require('jsonwebtoken');
const { userDB } = require('../../../database/database.js');
const { JWT_SECRET } = process.env;

const router = express.Router();

router.post('/', async (req, res) => {
  let access_token;

  const authorizationHeader = req.headers['authorization'];
  if (authorizationHeader && authorizationHeader.startsWith('Bearer ')) {
    access_token = authorizationHeader.split(' ')[1];
  }

  if (!access_token) {
    const req_cookies = req.headers.cookie;

    if (!req_cookies) {
      return res.status(400).json({ success: false, error: 'Access Token not found' });
    }

    const cookies = req_cookies.split(';').reduce((cookiesObj, cookie) => {
      const [name, value] = cookie.trim().split('=');
      cookiesObj[name] = value;
      return cookiesObj;
    }, {});

    access_token = cookies['access_token'];
  }

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not provided' });
  }

  try {
    const decoded = jwt.verify(access_token, JWT_SECRET);
    const { userId, oauthSid } = decoded;

    const userData = await userDB.findOne({ userId, oauthSid });
    if (!userData) {
      return res.status(401).json({ success: false, description: 'Access Token is invalid' });
    }

    res.status(200).json({ success: true, description: 'Access Token is valid' });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;
