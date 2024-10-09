const express = require('express');
const jwt = require('jsonwebtoken');
const mailjet = require('node-mailjet');
const { MJ_APIKEY_PUBLIC, MJ_APIKEY_PRIVATE, MJ_SENDER_EMAIL } = process.env;
const { URL } = process.env;
const { notifyError } = require('../../../../notify/notifications.js');


const { userDB } = require('../../../../database/mongodb.js');
const redisCache = require('../../../../database/redis.js');

const router = express.Router();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

router.post('/', async (req, res) => {
  const { email } = req.body;

  try {
    const userData = await userDB.findOne({ email, identityProvider: 'local' });
    if (!userData) {
      return res.status(404).json({ success: false, error: 'No account with this email' });
    }

    const userId = userData.userId;
    const username = userData.username;
    const password_reset_token = jwt.sign({ userId }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
    const password_reset_code = Math.floor(100000 + Math.random() * 900000).toString();

    await userDB.updateOne({ userId }, { $set: { resetCode: password_reset_code } });
    await endUserSessions(userId);

    try {
      sendRecoveryEmail(username, email, password_reset_token, password_reset_code, res);
      res.cookie('password_reset_token', password_reset_token, { maxAge: 1 * 60 * 60 * 1000, httpOnly: true, path: '/' });
      return res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to send password reset email' });
    }
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;


async function endUserSessions(userId) {
  const redisKeyPattern = `*:${userId}:*`;
  
  try {
      const sessions = await redisCache.keys(redisKeyPattern);
      
      if (sessions.length > 0) {
          await redisCache.del(sessions);
      } else {
      }
  } catch (error) {
      console.error('Error removing sessions:', error);
  }
};



// Send the password recovery email
function sendRecoveryEmail(username, email, password_reset_token, password_reset_code, res) {
  const mailjetConnect = mailjet.apiConnect(MJ_APIKEY_PUBLIC, MJ_APIKEY_PRIVATE);
  const request = mailjetConnect
    .post('send', { version: 'v3.1' })
    .request({
      Messages: [
        {
          From: {
            Email: MJ_SENDER_EMAIL
          },
          To: [
            {
              Email: email
            }
          ],
          Subject: "Your account recovery code",
          HtmlPart: `
          <!doctype html>
          <html>
          <head>
            <title></title>
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
            <style type="text/css">
              body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
              p { display: block; margin: 13px 0; }
            </style>
          </head>
          <body style="background: #F9F9F9;">
            <div style="background-color: #F9F9F9;">
              <div style="margin: 0px auto; max-width: 640px; background: transparent;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="font-size: 0px; width: 100%; background: transparent;" align="center" border="0">
                  <tbody>
                    <tr>
                      <td style="text-align: center; vertical-align: top; direction: ltr; font-size: 0px; padding: 40px 0px;">
                        <div aria-labelledby="mj-column-per-100" class="mj-column-per-100" style="vertical-align: top; display: inline-block; direction: ltr; font-size: 13px; text-align: left; width: 100%;">
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                            <tbody>
                              <tr>
                                <td style="word-break: break-word; font-size: 0px; padding: 0px;" align="center">
                                  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border-spacing: 0px;" align="center" border="0">
                                    <tbody>
                                      <tr>
                                        <td style="width: 138px;"></td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style="max-width: 640px; margin: 0 auto; box-shadow: 0px 1px 5px rgba(0, 0, 0, 0.1); border-radius: 8px; overflow: hidden;">
                <div style="margin: 0px auto; max-width: 640px; background: #ffffff;">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="font-size: 0px; width: 100%; background: #ffffff;" align="center" border="0">
                    <tbody>
                      <tr>
                        <td style="text-align: center; vertical-align: top; direction: ltr; font-size: 0px; padding: 40px 50px;">
                          <div aria-labelledby="mj-column-per-100" class="mj-column-per-100" style="vertical-align: top; display: inline-block; direction: ltr; font-size: 13px; text-align: left; width: 100%;">
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                              <tbody>
                                <tr>
                                  <td style="word-break: break-word; font-size: 0px; padding: 0px;" align="left">
                                    <div style="cursor: auto; color: #737F8D; font-family: Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif; font-size: 16px; line-height: 24px; text-align: left;">
                                      <h2 style="font-family: Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif; font-weight: 500; font-size: 20px; color: #4F545C; letter-spacing: 0.27px;">Hey ${username},</h2>
                                      <p>You requested to reset your password. Please enter the following code or click on this <a href=${URL}/api/auth/user/setresettokens/${password_reset_token}/${password_reset_code}>Link</a> to reset your password:</p>
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td style="word-break: break-word; font-size: 0px; padding: 10px 25px; padding-top: 20px;" align="center">
                                    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: separate;" align="center" border="0">
                                      <tbody>
                                        <tr>
                                          <td style="border: none; border-radius: 8px; cursor: auto; padding: 15px 105px;" align="center" valign="middle" bgcolor="#5865f2">
                                            <p style="font-size: 30px; font-family: Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif;">${password_reset_code}</p>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div style="margin: 0px auto; max-width: 640px; background: transparent;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="font-size: 0px; width: 100%; background: transparent;" align="center" border="0">
                  <tbody>
                    <tr>
                      <td style="text-align: center; vertical-align: top; direction: ltr; font-size: 0px; padding: 20px 0px;">
                        <div aria-labelledby="mj-column-per-100" class="mj-column-per-100" style="vertical-align: top; display: inline-block; direction: ltr; font-size: 13px; text-align: left; width: 100%;">
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                            <tbody>
                              <tr>
                                <td style="word-break: break-word; font-size: 0px; padding: 0px;" align="center">
                                  <div style="cursor: auto; color: #99AAB5; font-family: Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif; font-size: 12px; line-height: 24px; text-align: center;">
                                    Sent by Onedns
                                  </div>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </body>
          </html>
          `
        }
      ]
    });
  request.then(() => {
  }).catch((error) => {
    notifyError(error);
  });
}