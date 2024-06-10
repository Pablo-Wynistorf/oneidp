const express = require('express');
const jwt = require('jsonwebtoken');
const { userDB, oAuthClientAppDB, oAuthRolesDB } = require('../../../database/database.js');
const { JWT_SECRET } = process.env;
const { notifyError } = require('../../../notify/notifications.js');

const router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.post('/', async (req, res) => {
  const { code, client_id, client_secret, refresh_token } = req.body;

  const oauthAuthorizationCode = code;
  const clientId = client_id;
  const clientSecret = client_secret;
  try {
    let oauth_client;
    let oauth_user;
    let userId;
    let oauthSid;
    let refresh_token_clientId;

    if (refresh_token) {
      let decodedRefreshToken;
      try {
        decodedRefreshToken = jwt.verify(refresh_token, JWT_SECRET);
      } catch (error) {
        return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid refresh token provided' });
      }

      userId = decodedRefreshToken.userId;
      oauthSid = decodedRefreshToken.oauthSid;
      refresh_token_clientId = decodedRefreshToken.clientId;

      oauth_client = await oAuthClientAppDB.findOne({ clientId: refresh_token_clientId, clientSecret });

      if (!oauth_client) {
        return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid client_id or invalid refresh_token provided' });
      }

      oauth_user = await userDB.findOne({ userId, oauthSid });

      if (!oauth_user) {
        return res.status(401).json({ error: 'Unauthorized', error_description: 'User not found or session has expired' });
      }

      const username = oauth_user.username;
      const email = oauth_user.email;
      const mfaEnabled = oauth_user.mfaEnabled;
      const accessTokenValidity = oauth_client.accessTokenValidity;

      const roleData = await oAuthRolesDB.find({
        $or: [
          { oauthClientId: refresh_token_clientId, oauthUserIds: userId },
          { oauthClientId: refresh_token_clientId, oauthUserIds: "*" },
        ],
      }).exec();

      const roleNames = roleData.map(role => role.oauthRoleName);

      const oauth_access_token = jwt.sign({ userId, oauthSid, clientId: refresh_token_clientId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: accessTokenValidity });
      const oauth_id_token = jwt.sign({ userId, username, email, roles: roleNames, mfaEnabled }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '48h' });
      const oauth_refresh_token = jwt.sign({ userId, oauthSid, clientId: refresh_token_clientId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '20d' });

      return res.json({ access_token: oauth_access_token, id_token: oauth_id_token, refresh_token: oauth_refresh_token, expiresIn: accessTokenValidity });

    } else if (oauthAuthorizationCode) {
      if (!clientId || !clientSecret || clientId === 'undefined' || clientSecret === 'undefined') {
        return res.status(400).json({ error: 'Invalid Request', error_description: 'No client_id or client_secret provided' });
      }

      oauth_client = await oAuthClientAppDB.findOne({ clientId, clientSecret });

      if (!oauth_client) {
        return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid client_id or client_secret provided' });
      }

      oauth_user = await userDB.findOneAndUpdate({ oauthAuthorizationCode }, { $unset: { oauthAuthorizationCode: 1 } });

      if (!oauth_user) {
        return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid authorization code provided' });
      }

      userId = oauth_user.userId;
      oauthSid = oauth_user.oauthSid;
    } else {
      return res.status(400).json({ error: 'Invalid Grant', error_description: 'Only authorization_code and refresh_token grant types are supported' });
    }

    const username = oauth_user.username;
    const email = oauth_user.email;
    const mfaEnabled = oauth_user.mfaEnabled;
    const accessTokenValidity = oauth_client.accessTokenValidity;

    const roleData = await oAuthRolesDB.find({
      $or: [
        { oauthClientId: clientId, oauthUserIds: userId },
        { oauthClientId: clientId, oauthUserIds: "*" },
      ],
    }).exec();

    const roleNames = roleData.map(role => role.oauthRoleName);

    const oauth_access_token = jwt.sign({ userId, oauthSid, clientId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: accessTokenValidity });
    const oauth_id_token = jwt.sign({ userId, username, email, roles: roleNames, mfaEnabled }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '48h' });
    const oauth_refresh_token = jwt.sign({ userId, oauthSid, clientId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '20d' });

    return res.json({ access_token: oauth_access_token, id_token: oauth_id_token, refresh_token: oauth_refresh_token, expiresIn: accessTokenValidity });

  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Server Error', error_description: 'Something went wrong on our site. Please try again later' });
  }
});

module.exports = router;
