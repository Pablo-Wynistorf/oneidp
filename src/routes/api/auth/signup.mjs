import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sendVerificationEmail } from '../../../utils/send-emails.mjs';
import { notifyError, notifyRegister } from '../../../notify/notifications.mjs';

import redisCache from '../../../database/redis.mjs';
import { userDB } from '../../../database/mongodb.mjs';
import { getSettings, isEmailDomainAllowed } from '../../../utils/app-settings.mjs';
import { consumeInvitation, findUsableInvitation } from '../../../utils/invitations.mjs';

const router = express.Router();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

router.post('/', async (req, res) => {
  const { firstName, lastName, username, password, email } = req.body;
  const inviteToken = req.body?.inviteToken;
  const usernameRegex = /^[a-zA-Z0-9-]{3,20}$/;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

  // --- Instance gates -------------------------------------------------------
  //
  // Resolved before any validation so a closed instance reveals nothing about
  // which usernames or addresses are taken.
  let settings;
  let invitation = null;

  try {
    settings = await getSettings();

    if (inviteToken) {
      invitation = await findUsableInvitation(inviteToken);
      if (!invitation) {
        return res.status(410).json({
          success: false,
          error: 'This invitation is no longer valid. Ask for a new one.',
        });
      }
    }

    // An invitation is the sanctioned way in while public signup is closed, so
    // it deliberately bypasses both the registration toggle and the domain
    // allow-list: the operator already vetted this specific address.
    if (!invitation) {
      if (!settings.registrationEnabled) {
        return res.status(403).json({
          success: false,
          error: 'Registrations are currently closed.',
          registrationDisabled: true,
        });
      }

      if (!isEmailDomainAllowed(email, settings.allowedEmailDomains)) {
        return res.status(461).json({
          success: false,
          error: 'That email domain is not permitted on this instance.',
        });
      }
    }

    // An invitation is bound to the address it was sent to.
    if (invitation && String(email || '').trim().toLowerCase() !== invitation.email) {
      return res.status(409).json({
        success: false,
        error: 'This invitation was issued for a different email address.',
      });
    }
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }

  if (!usernameRegex.test(username)) {
    return res.status(460).json({ success: false, error: 'Username must only contain letters, numbers, and dashes and be between 3 and 20 characters' });
  }

  if (!emailRegex.test(email)) {
    return res.status(461).json({ success: false, error: 'Invalid email address' });
  }

  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\[\]{}|;:,.<>?])([A-Za-z\d!@#$%^&*()_+\[\]{}|;:,.<>?]{8,})$/;
  if (typeof password !== 'string' || password.length < 8 || password.length > 10000 || !passwordPattern.test(password)) {
    return res.status(462).json({ success: false, error: 'Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character' });
  }

  try {
    const existingUsername = await userDB.findOne({ username });
    const existingEmail = await userDB.findOne({ email });

    if (existingEmail) {
      return res.status(463).json({ success: false, error: 'Email already used, try login' });
    }

    if (existingUsername) {
      return res.status(464).json({ success: false, error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let userId, existingUserId;
    do {
      userId = Math.floor(Math.random() * 900000000000) + 100000000000;
      existingUserId = await userDB.findOne({ userId });
    } while (existingUserId);

    const timestamp = Math.floor(Date.now() / 1000);

    // An invited address was already proven to belong to this person by the
    // fact they received the emailed link, so there is nothing left to confirm.
    const invited = Boolean(invitation);

    const newUser = new userDB({
      userId,
      username,
      firstName,
      lastName,
      password: hashedPassword,
      email,
      emailVerified: invited,
      mfaEnabled: false,
      banned: false,
      providerRoles: invited && invitation.providerRoles?.length ? invitation.providerRoles : [],
      // Per-user grant only. The instance-wide switch is evaluated live at
      // request time, so it must not be baked into the account here.
      canManageApps: invited ? Boolean(invitation.canManageApps) : false,
      identityProvider: 'local',
    });

    await newUser.save();

    if (invited) {
      // Claim the invitation only once the account exists. The update is
      // conditional on it still being unaccepted, so two concurrent signups
      // from the same link cannot both go through.
      const claimed = await consumeInvitation(invitation.inviteId, String(userId));
      if (!claimed) {
        await userDB.deleteOne({ userId });
        return res.status(410).json({
          success: false,
          error: 'This invitation has already been used.',
        });
      }

      // Sign the new user straight in; there is no verification step to wait on.
      const sid = await generateRandomString(15);
      const device = req.headers['user-agent'] || '';
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'Unknown';
      const platform = device.match(/(Windows|Linux|Macintosh|iPhone|iPad|Android)/i);

      const sessionKey = `psid:${userId}:${sid}`;
      await redisCache.hSet(sessionKey, {
        deviceType: platform ? platform[0] : 'Unknown',
        ipAddr: String(ip).split(',')[0].trim(),
        createdAt: timestamp,
      });
      await redisCache.expire(sessionKey, 14 * 24 * 60 * 60);

      const access_token = jwt.sign({ userId, sid }, JWT_PRIVATE_KEY, {
        algorithm: 'RS256',
        expiresIn: '14d',
      });
      res.cookie('access_token', access_token, {
        maxAge: 14 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
      });

      notifyRegister(username);
      return res.status(200).json({ success: true, emailVerified: true });
    }

    const verifySid = await generateRandomString(15);
    const redisKey = `pev:${userId}:${verifySid}`;

    await redisCache.hSet(redisKey, {
      createdAt: timestamp,
    })

    await redisCache.expire(redisKey, 30 * 60);

    const email_verification_token = jwt.sign(
      { userId, pevSid: verifySid },
      JWT_PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: '30m' }
    );

    // Awaited on purpose: Lambda freezes the container once the response is
    // returned, which would abort the outbound MailRift request mid-flight.
    await sendVerificationEmail(username, email, email_verification_token);
    notifyRegister(username);

    const signup_token = jwt.sign(
      { userId: userId },
      JWT_PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: '29m' }
    );

    res.cookie('signup_token', signup_token, {
      maxAge: 29 * 60 * 1000,
      httpOnly: true,
      path: '/',
    });

    // JSON rather than a redirect: this endpoint is called by fetch from the
    // SPA, which would otherwise follow the 302 and receive index.html.
    return res.status(200).json({ success: true, emailVerified: false, email });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

export default router;
