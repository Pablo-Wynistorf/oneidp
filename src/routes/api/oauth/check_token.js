const express = require('express');
const jwt = require('jsonwebtoken');
const { userDB } = require('../../../database/database.js');
const { notifyError } = require('../../../notify/notifications.js');
require('dotenv').config();

const router = express.Router();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
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

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not provided' });
  }

  try {
    let decoded;
    try {
      decoded = jwt.verify(access_token, JWT_PRIVATE_KEY);
    } catch (error) {
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

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
