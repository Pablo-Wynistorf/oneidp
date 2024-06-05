const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { JWT_SECRET } = process.env;
const mailjet = require('node-mailjet');
const { MJ_APIKEY_PUBLIC, MJ_APIKEY_PRIVATE, MJ_SENDER_EMAIL } = process.env;
const { URL } = process.env;
const { notifyError, notifyRegister } = require('../../../../notify/notifications');


const { userDB } = require('../../../../database/database.js');

const authRegisterLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: 'Too many requests. Please try again later.',
});

const router = express.Router();

router.post('/', authRegisterLimiter, async (req, res) => {
  const { username, password, email } = req.body;
  const usernameRegex = /^[a-zA-Z0-9-]{3,20}$/;
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&.()/^])([A-Za-z\d@$!%*?&.]{8,})$/;

  if (!usernameRegex.test(username)) {
    return res.status(462).json({ success: false, error: 'Username must only contain letters, numbers, and dashes and be between 3 and 20 characters' });
  }

  if (!emailRegex.test(email)) {
    return res.status(466).json({ success: false, error: 'Invalid email address' });
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 300 || !passwordPattern.test(password)) {
    return res.status(465).json({ success: false, error: 'Password must be between 8 and 300 characters and contain at least one uppercase letter, one lowercase letter, one digit, and one special character' });
  }

  try {
    let existingUsername = await userDB.findOne({ username });
    let existingEmail = await userDB.findOne({ email });

    if (existingEmail) {
      return res.status(460).json({ success: false, error: 'Email already used, try login' });
    }

    if (existingUsername) {
      return res.status(461).json({ success: false, error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let userId;
    let existingUserId;

    do {
      userId = Math.floor(Math.random() * 900000000000) + 100000000000;
      existingUserId = await userDB.findOne({ userId });
    } while (existingUserId);

    const email_verification_token = jwt.sign({ userId: userId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
    const email_verification_code = Math.floor(100000 + Math.random() * 900000).toString();

    const newUser = new userDB({
      userId: userId,
      username: username,
      password: hashedPassword,
      email: email,
      verifyCode: email_verification_code,
      mfaEnabled: false,
      providerRoles: ['standardUser', 'oauthUser'],
    });

    await newUser.save();

    sendVerificationEmail(username, email, email_verification_token, email_verification_code);

    res.cookie('email_verification_token', email_verification_token, { maxAge: 5 * 60 * 1000, httpOnly: true, path: '/' });
    res.status(200).json({ success: true });
    return notifyRegister(username);
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;


// Send the email verification email
function sendVerificationEmail(username, email, email_verification_token, new_email_verification_code, res) {
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
                                      <p>Your account email needs to get verified before you can use your account. Don't share this code with anyone! Please enter the following code or click on this <a href=${URL}/api/sso/confirmationlink/${email_verification_token}/${new_email_verification_code}>Link</a> to verify your email:</p>
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