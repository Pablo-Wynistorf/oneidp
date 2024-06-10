const express = require('express');
const jwt = require('jsonwebtoken');
const { userDB, oAuthClientAppDB } = require('../../../database/database.js');
const { JWT_SECRET } = process.env;
const { notifyError } = require('../../../notify/notifications.js');

const router = express.Router();

router.get('/', async (req, res) => {
  const { client_id, redirect_uri, state } = req.query;
  const access_token = req.cookies.access_token;
  try {

    if (!access_token || access_token === 'undefined') {
      return res.redirect(`/login?redirect_uri=${redirect_uri}`);
    }

    if (!client_id || !redirect_uri || client_id === 'undefined' || redirect_uri === 'undefined') {
      return res.status(400).json({ error: 'Invalid Request', error_description: 'No client_id or redirect_uri provided' });
    }

    jwt.verify(access_token, JWT_SECRET, async (error, decoded) => {

      if (error) {
        return res.redirect(`/login?redirect_uri=${redirect_uri}`);
      }

      const { userId, sid } = decoded;
      const user = await userDB.findOne({ userId, sid });

      if (!user) {
        return res.redirect(`/login?redirect_uri=${redirect_uri}`);
      }

      const oauth_client = await oAuthClientAppDB.findOne({ clientId: client_id });

      if (!oauth_client) {
        return res.status(401).json({ error: 'Invalid Request', error_description: 'Invalid client_id provided' });
      }

      const allowed_redirect_uri = oauth_client.redirectUri;

      if (redirect_uri !== allowed_redirect_uri) {
        return res.status(405).json({ error: 'Invalid Request', error_description: 'Provided redirect_uri not allowed' });
      }
      
      let authorizationCode;
      let existingAuthorizationCode;
      do {
        authorizationCode = [...Array(35)].map(() => Math.random().toString(36)[2]).join('');
        existingAuthorizationCode = await userDB.findOne({ oauthAuthorizationCode: authorizationCode });
      } while (existingAuthorizationCode);
      
      await userDB.updateOne({ userId }, { $set: { oauthAuthorizationCode: authorizationCode } });

      if (state || state !== 'undefined') {
        const redirectUri = `${redirect_uri}?code=${authorizationCode}&state=${state}`;
        return res.redirect(redirectUri);
      }
      
      const redirectUri = `${redirect_uri}?code=${authorizationCode}`;
      return res.redirect(redirectUri);
    });
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Server Error', error_description: 'Something went wrong on our site. Please try again later' });
  }
});

module.exports = router;
