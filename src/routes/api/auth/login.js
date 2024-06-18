const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mailjet = require('node-mailjet');
const { MJ_APIKEY_PUBLIC, MJ_APIKEY_PRIVATE, MJ_SENDER_EMAIL } = process.env;
const { URL } = process.env;
const { notifyError, notifyLogin } = require('../../../notify/notifications');

const { userDB } = require('../../../database/database.js');

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

const router = express.Router();

router.post('/', async (req, res) => {
  const { username_or_email, password, redirectUri } = req.body;
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;

  try {
    let user;

    if (emailRegex.test(username_or_email)) {
      user = await userDB.findOne({ email: username_or_email });
    } else {
      user = await userDB.findOne({ username: username_or_email });
    }

    if (!user) {
      return res.status(462).json({ success: false, error: 'Invalid username or password' });
    }

    const storedPasswordHash = user.password;
    const userId = user.userId;
    const emailVerified = user.emailVerified;
    const username = user.username;
    const email = user.email;
    const mfaEnabled = user.mfaEnabled;
    const sid = user.sid;

    const passwordMatch = await bcrypt.compare(password, storedPasswordHash);

    if (!passwordMatch) {
      return res.status(462).json({ success: false, error: 'Invalid username or password' });
    }

    if (!emailVerified) {
      const email_verification_token = jwt.sign({ userId: userId }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '5m' });

      const new_email_verification_code = Math.floor(100000 + Math.random() * 900000).toString();
      await userDB.updateOne({ userId }, { $set: { verifyCode: new_email_verification_code } });

      res.cookie('email_verification_token', email_verification_token, { maxAge: 5 * 60 * 1000, httpOnly: true, path: '/' });
      sendVerificationEmail(username, email, email_verification_token, new_email_verification_code);
      return res.status(461).json({ success: true, Message: 'Email not verified' });
    } else {
      loginSuccess(userId, username, sid, res, mfaEnabled, redirectUri);
    }
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

// Handle successful login and generate access tokens
async function loginSuccess(userId, username, sid, res, mfaEnabled, redirectUri) {
  if (!sid) {
    const newsid = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');
    const newoAuthSid = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');
    await userDB.updateOne({ userId }, { $set: { sid: newsid, oauthSid: newoAuthSid } });

    if (mfaEnabled === true) {
      const newMfaLoginSecret = [...Array(30)].map(() => Math.random().toString(36)[2]).join('');
      await userDB.updateOne({ userId }, { $set: { mfaLoginSecret: newMfaLoginSecret } });
      const mfa_token = jwt.sign({ userId: userId, mfaLoginSecret: newMfaLoginSecret }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '5m' });
      res.cookie('mfa_token', mfa_token, { maxAge: 5 * 60 * 1000, httpOnly: true, path: '/' });
      if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
        return res.status(463).json({ success: true, message: 'Redirecting to mfa site' });
      }
      return res.status(463).json({ success: true, message: 'Redirecting to mfa site', redirectUri });
    }

    notifyLogin(username);
    const token = jwt.sign({ userId: userId, sid: newsid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
    res.cookie('access_token', token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
    return res.status(200).json({ success: true, redirectUri  });
  }

  if (mfaEnabled === true) {
    const newMfaLoginSecret = [...Array(30)].map(() => Math.random().toString(36)[2]).join('');
    await userDB.updateOne({ userId }, { $set: { mfaLoginSecret: newMfaLoginSecret } });
    const mfa_token = jwt.sign({ userId: userId, mfaLoginSecret: newMfaLoginSecret }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '5m' });
    res.cookie('mfa_token', mfa_token, { maxAge: 5 * 60 * 1000, httpOnly: true, path: '/' });
    if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
      return res.status(463).json({ success: true, message: 'Redirecting to mfa site' });
    }
    return res.status(463).json({ success: true, message: 'Redirecting to mfa site', redirectUri });
  }

  const token = jwt.sign({ userId: userId, sid: sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
  notifyLogin(username);
  res.cookie('access_token', token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });

  return res.status(200).json({ success: true, redirectUri });
}

function sendVerificationEmail(username, email, email_verification_token, new_email_verification_code) {
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
          Subject: "Your Email Verification Code",
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
                                      <p>Your account email needs to get verified before you can use your account. Don't share this code with anyone! Please enter the following code or click on this <a href=${URL}/api/auth/user/confirmationlink/${email_verification_token}/${new_email_verification_code}>Link</a> to verify your email:</p>
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td style="word-break: break-word; font-size: 0px; padding: 10px 25px; padding-top: 20px;" align="center">
                                    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: separate;" align="center" border="0">
                                      <tbody>
                                        <tr>
                                          <td style="border: none; border-radius: 8px; cursor: auto; padding: 15px 105px;" align="center" valign="middle" bgcolor="#5865f2">
                                            <p style="font-size: 30px; font-family: Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif;">${new_email_verification_code}</p>
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

module.exports = router;