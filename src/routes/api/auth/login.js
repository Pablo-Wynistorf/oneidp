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
    const user = await userDB.findOne(
      emailRegex.test(username_or_email) ? { email: username_or_email } : { username: username_or_email }
    );

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(462).json({ success: false, error: 'Invalid username or password' });
    }

    if (!user.emailVerified) {
      return handleUnverifiedEmail(user, res);
    }

    await handleLoginSuccess(user, res, redirectUri);
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

const handleUnverifiedEmail = async (user, res) => {
  const emailVerificationToken = jwt.sign({ userId: user.userId }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '5m' });
  const newEmailVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();

  await userDB.updateOne({ userId: user.userId }, { $set: { verifyCode: newEmailVerificationCode } });

  res.cookie('email_verification_token', emailVerificationToken, { maxAge: 5 * 60 * 1000, httpOnly: true, path: '/' });
  sendVerificationEmail(user.username, user.email, emailVerificationToken, newEmailVerificationCode);
  
  return res.status(461).json({ success: true, message: 'Email not verified' });
};

const handleLoginSuccess = async (user, res, redirectUri) => {
  const { userId, username, sid, mfaEnabled, oauthSid } = user;

  const newsid = sid || generateRandomString(15);
  const newoAuthSid = sid ? oauthSid : generateRandomString(15);

  if (!sid || !oauthSid) {
    await userDB.updateOne(
      { userId },
      { $set: { sid: newsid, oauthSid: newoAuthSid } }
    );
  }

  if (mfaEnabled) {
    return handleMfaEnabled(userId, res, redirectUri);
  }

  notifyLogin(username);
  const access_token = jwt.sign({ userId, sid: newsid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
  res.cookie('access_token', access_token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });

  return res.status(200).json({ success: true, redirectUri });
};


const handleMfaEnabled = async (userId, res, redirectUri) => {
  const newMfaLoginSecret = generateRandomString(30);
  await userDB.updateOne({ userId }, { $set: { mfaLoginSecret: newMfaLoginSecret } });

  const mfaToken = jwt.sign({ userId, mfaLoginSecret: newMfaLoginSecret }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '5m' });
  res.cookie('mfa_token', mfaToken, { maxAge: 5 * 60 * 1000, httpOnly: true, path: '/' });

  const response = { success: true, message: 'Redirecting to MFA site' };
  if (redirectUri) {
    response.redirectUri = redirectUri;
  }

  return res.status(463).json(response);
};

const generateRandomString = length => [...Array(length)].map(() => Math.random().toString(36)[2]).join('');

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
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en"><head><meta charset="UTF-8"><meta content="width=device-width, initial-scale=1" name="viewport"><meta name="x-apple-disable-message-reformatting"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta content="telephone=no" name="format-detection"><title>New Message</title> <!--[if (mso 16)]><style type="text/css">     a {text-decoration: none;}     </style><![endif]--> <!--[if gte mso 9]><style>sup { font-size: 100% !important; }</style><![endif]--> <!--[if gte mso 9]><xml> <o:OfficeDocumentSettings> <o:AllowPNG></o:AllowPNG> <o:PixelsPerInch>96</o:PixelsPerInch> </o:OfficeDocumentSettings> </xml>
<![endif]--><style type="text/css">.rollover:hover .rollover-first { max-height:0px!important; display:none!important; } .rollover:hover .rollover-second { max-height:none!important; display:block!important; } .rollover span { font-size:0px; } u + .body img ~ div div { display:none; } #outlook a { padding:0; } span.MsoHyperlink,span.MsoHyperlinkFollowed { color:inherit; mso-style-priority:99; } a.es-button { mso-style-priority:100!important; text-decoration:none!important; } a[x-apple-data-detectors] { color:inherit!important; text-decoration:none!important; font-size:inherit!important; font-family:inherit!important; font-weight:inherit!important; line-height:inherit!important; } .es-desk-hidden { display:none; float:left; overflow:hidden; width:0; max-height:0; line-height:0; mso-hide:all; } .es-button-border:hover > a.es-button { color:#ffffff!important; }
@media only screen and (max-width:600px) {.es-m-p0r { padding-right:0px!important } .es-m-p0l { padding-left:0px!important } .es-m-p55b { padding-bottom:55px!important } *[class="gmail-fix"] { display:none!important } p, a { line-height:150%!important } h1, h1 a { line-height:120%!important } h2, h2 a { line-height:120%!important } h3, h3 a { line-height:120%!important } h4, h4 a { line-height:120%!important } h5, h5 a { line-height:120%!important } h6, h6 a { line-height:120%!important } h1 { font-size:36px!important; text-align:left } h2 { font-size:26px!important; text-align:left } h3 { font-size:20px!important; text-align:left } h4 { font-size:24px!important; text-align:left } h5 { font-size:20px!important; text-align:left } h6 { font-size:16px!important; text-align:left } .es-header-body h1 a, .es-content-body h1 a, .es-footer-body h1 a { font-size:36px!important }
.es-header-body h2 a, .es-content-body h2 a, .es-footer-body h2 a { font-size:26px!important } .es-header-body h3 a, .es-content-body h3 a, .es-footer-body h3 a { font-size:20px!important } .es-header-body h4 a, .es-content-body h4 a, .es-footer-body h4 a { font-size:24px!important } .es-header-body h5 a, .es-content-body h5 a, .es-footer-body h5 a { font-size:20px!important } .es-header-body h6 a, .es-content-body h6 a, .es-footer-body h6 a { font-size:16px!important } .es-menu td a { font-size:12px!important } .es-header-body p, .es-header-body a { font-size:14px!important } .es-content-body p, .es-content-body a { font-size:16px!important } .es-footer-body p, .es-footer-body a { font-size:14px!important } .es-infoblock p, .es-infoblock a { font-size:12px!important } .es-m-txt-c, .es-m-txt-c h1, .es-m-txt-c h2, .es-m-txt-c h3, .es-m-txt-c h4, .es-m-txt-c h5, .es-m-txt-c h6 { text-align:center!important }
.es-m-txt-r, .es-m-txt-r h1, .es-m-txt-r h2, .es-m-txt-r h3, .es-m-txt-r h4, .es-m-txt-r h5, .es-m-txt-r h6 { text-align:right!important } .es-m-txt-j, .es-m-txt-j h1, .es-m-txt-j h2, .es-m-txt-j h3, .es-m-txt-j h4, .es-m-txt-j h5, .es-m-txt-j h6 { text-align:justify!important } .es-m-txt-l, .es-m-txt-l h1, .es-m-txt-l h2, .es-m-txt-l h3, .es-m-txt-l h4, .es-m-txt-l h5, .es-m-txt-l h6 { text-align:left!important } .es-m-txt-r img, .es-m-txt-c img, .es-m-txt-l img { display:inline!important } .es-m-txt-r .rollover:hover .rollover-second, .es-m-txt-c .rollover:hover .rollover-second, .es-m-txt-l .rollover:hover .rollover-second { display:inline!important } .es-m-txt-r .rollover span, .es-m-txt-c .rollover span, .es-m-txt-l .rollover span { line-height:0!important; font-size:0!important } .es-spacer { display:inline-table } a.es-button, button.es-button { font-size:20px!important; line-height:120%!important }
a.es-button, button.es-button, .es-button-border { display:inline-block!important } .es-m-fw, .es-m-fw.es-fw, .es-m-fw .es-button { display:block!important } .es-m-il, .es-m-il .es-button, .es-social, .es-social td, .es-menu { display:inline-block!important } .es-adaptive table, .es-left, .es-right { width:100%!important } .es-content table, .es-header table, .es-footer table, .es-content, .es-footer, .es-header { width:100%!important; max-width:600px!important } .adapt-img { width:100%!important; height:auto!important } .es-mobile-hidden, .es-hidden { display:none!important } .es-desk-hidden { width:auto!important; overflow:visible!important; float:none!important; max-height:inherit!important; line-height:inherit!important } tr.es-desk-hidden { display:table-row!important } table.es-desk-hidden { display:table!important } td.es-desk-menu-hidden { display:table-cell!important } .es-menu td { width:1%!important }
table.es-table-not-adapt, .esd-block-html table { width:auto!important } .es-social td { padding-bottom:10px } .h-auto { height:auto!important } .img-7899 { width:103px!important; height:auto!important } }@media screen and (max-width:384px) {.mail-message-content { width:414px!important } }</style>
</head> <body class="body" style="width:100%;height:100%;padding:0;Margin:0"><div dir="ltr" class="es-wrapper-color" lang="en" style="background-color:#FAFAFA"> <!--[if gte mso 9]><v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t"> <v:fill type="tile" color="#fafafa"></v:fill> </v:background><![endif]--><table class="es-wrapper" width="100%" cellspacing="0" cellpadding="0" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;padding:0;Margin:0;width:100%;height:100%;background-repeat:repeat;background-position:center top;background-color:#FAFAFA"><tr><td valign="top" style="padding:0;Margin:0"><table cellpadding="0" cellspacing="0" class="es-content" align="center" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;width:100%;table-layout:fixed !important"><tr>
<table cellpadding="0" cellspacing="0" class="es-header" align="center" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;width:100%;table-layout:fixed !important;background-color:transparent;background-repeat:repeat;background-position:center top"><tr><td align="center" bgcolor="#1e2431" style="padding:0;Margin:0;background-color:#1e2431"><table bgcolor="#ffffff" class="es-header-body" align="center" cellpadding="0" cellspacing="0" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:transparent;width:600px"><tr><td align="left" style="Margin:0;padding-top:10px;padding-right:20px;padding-bottom:10px;padding-left:20px"><table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px"><tr>
<td class="es-m-p0r" valign="top" align="center" style="padding:0;Margin:0;width:560px"><table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px"><tr><td align="center" style="padding:0;Margin:0;padding-bottom:20px;font-size:0px"><img src="https://fhdpsnf.stripocdn.email/content/guids/CABINET_3bf445647bf148ea2b1fc360e57786d8004e1fceac3a148a9c74ee199cf09947/images/loginapp.png" alt="Logo" style="display:block;font-size:12px;border:0;outline:none;text-decoration:none" title="Logo" class="img-7899" width="105" height="105"></td> </tr><tr><td align="left" style="padding:0;Margin:0"><h1 class=" es-m-txt-c" style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:46px;font-style:normal;font-weight:bold;line-height:55px;color:#e0e8f2" align="center">ONEIDP</h1>
</td></tr></table></td></tr></table></td></tr></table></td></tr></table> <table cellpadding="0" cellspacing="0" class="es-content" align="center" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;width:100%;table-layout:fixed !important"><tr><td align="center" bgcolor="#1e2431" style="padding:0;Margin:0;background-color:#1e2431"><table bgcolor="#ffffff" class="es-content-body" align="center" cellpadding="0" cellspacing="0" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:#FFFFFF;width:600px"><tr><td align="left" bgcolor="#232b3a" style="Margin:0;padding-right:20px;padding-left:20px;padding-top:30px;padding-bottom:30px;background-color:#232b3a"><table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px"><tr>
<td align="center" valign="top" style="padding:0;Margin:0;width:560px"><table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px"><tr><td align="center" style="padding:0;Margin:0;padding-top:10px;padding-bottom:10px;font-size:0px"><img src="https://fhdpsnf.stripocdn.email/content/guids/CABINET_67e080d830d87c17802bd9b4fe1c0912/images/55191618237638326.png" alt="" style="display:block;font-size:14px;border:0;outline:none;text-decoration:none" width="100" height="72"></td> </tr><tr><td align="center" class="es-m-txt-c" style="padding:0;Margin:0;padding-bottom:10px"><h1 style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:46px;font-style:normal;font-weight:bold;line-height:46px;color:#e0e8f2">Confirm Your Email</h1></td></tr><tr>
<td align="left" style="padding:0;Margin:0"><h3 align="center" style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:24px;color:#e0e8f2" class=" es-m-txt-c">Hey ${username}</h3></td></tr> <tr><td align="center" class="es-m-p0r es-m-p0l" style="Margin:0;padding-top:5px;padding-right:40px;padding-bottom:5px;padding-left:40px"><p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#e0e8f2;font-size:14px">You’ve received this message because your email address has been registered with our site. Please click the button below to verify your email address and confirm that you are the owner of this account.</p></td></tr> <tr>
<td align="center" style="padding:0;Margin:0;padding-top:10px;padding-bottom:10px"><span class="es-button-border" style="border-style:solid;border-color:#2CB543;background:#1744e2;border-width:0px;display:inline-block;border-radius:6px;width:auto"><a href="${URL}/api/auth/user/confirmationlink/${email_verification_token}/${new_email_verification_code}" class="es-button" target="_blank" style="mso-style-priority:100 !important;text-decoration:none !important;mso-line-height-rule:exactly;color:#FFFFFF;font-size:20px;padding:10px 30px 10px 30px;display:inline-block;background:#1744e2;border-radius:6px;font-family:arial, 'helvetica neue', helvetica, sans-serif;font-weight:normal;font-style:normal;line-height:24px;width:auto;text-align:center;letter-spacing:0;mso-padding-alt:0;mso-border-alt:10px solid #1744e2;padding-left:30px;padding-right:30px">Confirm your account</a></span></td></tr> <tr>
<td align="center" style="padding:20px;Margin:0;font-size:0"><table border="0" width="100%" height="100%" cellpadding="0" cellspacing="0" class="es-spacer" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px"><tr><td style="padding:0;Margin:0;border-bottom:1px solid #cccccc;background:none;height:1px;width:100%;margin:0px"></td></tr></table></td></tr><tr><td align="left" style="padding:0;Margin:0"><h3 align="center" style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:24px;color:#e0e8f2" class=" es-m-txt-c">Or enter the following code:</h3></td></tr> <tr>
<td align="center" style="padding:0;Margin:0;padding-top:10px;padding-bottom:10px"><span class="es-button-border" style="border-style:solid;border-color:#2CB543;background:#1744e2;border-width:0px;display:inline-block;border-radius:6px;width:auto"><a href="" class="es-button" target="_blank" style="mso-style-priority:100 !important;text-decoration:none !important;mso-line-height-rule:exactly;color:#FFFFFF;font-size:20px;padding:10px 30px 10px 30px;display:inline-block;background:#1744e2;border-radius:6px;font-family:arial, 'helvetica neue', helvetica, sans-serif;font-weight:normal;font-style:normal;line-height:24px;width:auto;text-align:center;letter-spacing:0;mso-padding-alt:0;mso-border-alt:10px solid #1744e2;padding-left:30px;padding-right:30px">${new_email_verification_code}</a></span></td></tr> <tr>
<td align="center" style="padding:0;Margin:0;padding-top:10px;padding-bottom:5px"><p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#e0e8f2;font-size:14px">If you did not register with us, please disregard this email.</p></td></tr><tr><td align="center" class="es-m-p0r es-m-p0l" style="Margin:0;padding-top:5px;padding-right:40px;padding-bottom:5px;padding-left:40px"><p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#e0e8f2;font-size:14px">Once confirmed, this email will be uniquely associated with your account.</p></td></tr></table></td></tr></table></td></tr> <tr>
<td class="es-m-p55b" align="left" bgcolor="#1e2431" style="Margin:0;padding-right:20px;padding-left:20px;padding-top:20px;padding-bottom:60px;background-color:#1e2431"><table cellpadding="0" cellspacing="0" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px"><tr><td align="left" style="padding:0;Margin:0;width:560px"><table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px"><tr><td align="center" style="padding:0;Margin:0;display:none"></td></tr></table></td></tr></table></td></tr></table></td></tr></table>
<table cellpadding="0" cellspacing="0" class="es-footer" align="center" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;width:100%;table-layout:fixed !important;background-color:transparent;background-repeat:repeat;background-position:center top"><tr><td align="center" style="padding:0;Margin:0"><table class="es-footer-body" align="center" cellpadding="0" cellspacing="0" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:transparent;width:640px" role="none"><tr><td align="left" style="Margin:0;padding-right:20px;padding-left:20px;padding-bottom:20px;padding-top:20px"><table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px"><tr>
<td align="left" style="padding:0;Margin:0;width:600px"><table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px"><tr><td style="padding:0;Margin:0"><table cellpadding="0" cellspacing="0" width="100%" class="es-menu" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px"><tr class="links"><td align="center" valign="top" width="100.00%" style="Margin:0;border:0;padding-top:5px;padding-bottom:5px;padding-right:5px;padding-left:5px"><a target="_blank" href="${URL}" style="mso-line-height-rule:exactly;text-decoration:none;font-family:arial, 'helvetica neue', helvetica, sans-serif;display:block;color:#999999;font-size:12px">SENT BY ONEIDP</a> </td></tr></table></td></tr></table></td></tr></table></td></tr></table></td></tr></table></td></tr></table></div></body>
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