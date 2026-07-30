import { fileURLToPath } from 'node:url';
import r_routes_api_auth_token_check from './routes/api/auth/token/check.mjs';
import r_routes_api_auth_login from './routes/api/auth/login.mjs';
import r_routes_api_auth_signup from './routes/api/auth/signup.mjs';
import r_routes_api_auth_google from './routes/api/auth/google.mjs';
import r_routes_api_auth_github from './routes/api/auth/github.mjs';
import r_routes_api_auth_logout from './routes/api/auth/logout.mjs';
import r_routes_api_auth_logoutall from './routes/api/auth/logoutall.mjs';
import r_routes_api_auth_passkey from './routes/api/auth/passkey.mjs';
import r_routes_api_auth_passkey_setup from './routes/api/auth/passkey/setup.mjs';
import r_routes_api_auth_passkey_delete from './routes/api/auth/passkey/delete.mjs';
import r_routes_api_auth_mfa_verify from './routes/api/auth/mfa/verify.mjs';
import r_routes_api_auth_mfa_setup from './routes/api/auth/mfa/setup.mjs';
import r_routes_api_auth_mfa_setup_verify from './routes/api/auth/mfa/setup/verify.mjs';
import r_routes_api_auth_mfa_disable from './routes/api/auth/mfa/disable.mjs';
import r_routes_api_auth_user_confirmationlink from './routes/api/auth/user/confirmationlink.mjs';
import r_routes_api_auth_user_exchangeSignupToken from './routes/api/auth/user/exchangeSignupToken.mjs';
import r_routes_api_auth_user_setresettoken from './routes/api/auth/user/setresettoken.mjs';
import r_routes_api_auth_user_changepassword from './routes/api/auth/user/changepassword.mjs';
import r_routes_api_auth_user_resetpassword from './routes/api/auth/user/resetpassword.mjs';
import r_routes_api_auth_user_setpassword from './routes/api/auth/user/setpassword.mjs';
import r_routes_api_auth_user_session from './routes/api/auth/user/session.mjs';
import r_routes_api_oauth_settings_apps_get from './routes/api/oauth/settings/apps/get.mjs';
import r_routes_api_oauth_settings_apps_add from './routes/api/oauth/settings/apps/add.mjs';
import r_routes_api_oauth_settings_apps_delete from './routes/api/oauth/settings/apps/delete.mjs';
import r_routes_api_oauth_settings_apps_edit from './routes/api/oauth/settings/apps/edit.mjs';
import r_routes_api_oauth_settings_roles_get from './routes/api/oauth/settings/roles/get.mjs';
import r_routes_api_oauth_settings_roles_get_users from './routes/api/oauth/settings/roles/get-users.mjs';
import r_routes_api_oauth_settings_roles_add from './routes/api/oauth/settings/roles/add.mjs';
import r_routes_api_oauth_settings_roles_update_remove_user from './routes/api/oauth/settings/roles/update/remove-user.mjs';
import r_routes_api_oauth_settings_roles_update_add_user from './routes/api/oauth/settings/roles/update/add-user.mjs';
import r_routes_api_oauth_settings_roles_update_bulk_update from './routes/api/oauth/settings/roles/update/bulk-update.mjs';
import r_routes_api_oauth_settings_roles_delete from './routes/api/oauth/settings/roles/delete.mjs';
import r_routes_api_oauth_authorize from './routes/api/oauth/authorize.mjs';
import r_routes_api_oauth_consent from './routes/api/oauth/consent.mjs';
import r_routes_api_oauth_user_consents from './routes/api/oauth/user-consents.mjs';
import r_routes_api_oauth_token from './routes/api/oauth/token.mjs';
import r_routes_api_oauth_userinfo from './routes/api/oauth/userinfo.mjs';
import r_routes_api_oauth_users from './routes/api/oauth/users.mjs';
import r_routes_api_oauth_check_token from './routes/api/oauth/check_token.mjs';
import r_routes_api_oauth_logout from './routes/api/oauth/logout.mjs';
import r_routes_api_oauth_revoke from './routes/api/oauth/revoke.mjs';
import r_routes_api_oauth_openid_configuration from './routes/api/oauth/openid-configuration.mjs';
import r_routes_api_oauth_jwks_info from './routes/api/oauth/jwks-info.mjs';
import r_routes_api_health_health from './routes/api/health/health.mjs';
import r_routes_api_health_details from './routes/api/health/details.mjs';
import r_routes_api_admin_overview from './routes/api/admin/overview.mjs';
import r_routes_api_admin_users from './routes/api/admin/users.mjs';
import r_routes_api_admin_apps from './routes/api/admin/apps.mjs';
import r_routes_api_admin_settings from './routes/api/admin/settings.mjs';
import r_routes_api_admin_invitations from './routes/api/admin/invitations.mjs';
import r_routes_api_config from './routes/api/config.mjs';
import r_routes_api_auth_invitation from './routes/api/auth/invitation.mjs';
import { requireAdmin } from './utils/admin-auth.mjs';
import { requireAppManagement } from './utils/permissions.mjs';
import r_utils_gtag from './utils/gtag.mjs';

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import cors from 'cors';

import 'dotenv/config';

import { connectToDatabase } from './database/mongodb.mjs';

import redisCache from './database/redis.mjs';

import rateLimiter from './utils/rate-limiter.mjs';

const API_PORT = process.env.API_PORT;
const URL = process.env.URL;

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

const app = express();

const corsOptions = {
  origin: [URL]
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

connectToDatabase();

// ---------------------------------------------------------------------------
// Sliding session renewal
//
// The frontend is a static SPA on S3/CloudFront, so this app no longer serves
// or gates any pages; route-level authorisation now lives in the React router
// and each API route keeps verifying the token itself.
//
// Session renewal used to be a side effect of serving a gated page. It is kept
// here as a non-blocking middleware over /api so an active user's 14-day
// session still slides forward. It never rejects a request: authorisation
// remains the responsibility of the individual routes.
// ---------------------------------------------------------------------------

const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;
const RENEW_WHEN_WITHIN_SECONDS = 3 * 24 * 60 * 60;

const renewSessionIfNeeded = async (req, res, next) => {
  const access_token = req.cookies.access_token;
  if (!access_token || access_token === 'undefined') {
    return next();
  }

  try {
    const { userId, sid, exp } = jwt.verify(access_token, JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    });

    const now = Math.floor(Date.now() / 1000);
    if (exp >= now + RENEW_WHEN_WITHIN_SECONDS) {
      return next();
    }

    const oldRedisKey = `psid:${userId}:${sid}`;
    const existing = await redisCache.keys(oldRedisKey);
    // Only rotate a session that is actually still live, otherwise a revoked
    // session would be resurrected here.
    if (existing.length === 0) {
      return next();
    }

    const userAgent = req.headers['user-agent'] || '';
    const platform = userAgent.match(/(Windows|Linux|Macintosh|iPhone|iPad|Android)/i);
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

    const newSid = await generateRandomString(15);

    await redisCache.hSet(`psid:${userId}:${newSid}`, {
      deviceType: platform ? platform[0] : 'Unknown',
      ipAddr: Array.isArray(ip) ? ip[0] : String(ip).split(',')[0].trim(),
      createdAt: now,
    });
    await redisCache.expire(`psid:${userId}:${newSid}`, SESSION_TTL_SECONDS);
    await redisCache.del(oldRedisKey);

    // The new token must carry the new sid: signing the old one would point the
    // cookie at the session key that was just deleted.
    const newAccessToken = jwt.sign({ userId, sid: newSid }, JWT_PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: '14d',
    });

    res.cookie('access_token', newAccessToken, {
      maxAge: SESSION_TTL_SECONDS * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
  } catch (error) {
    // An invalid or expired token is not this middleware's problem; the route
    // that needs authorisation will reject it.
  }

  return next();
};

app.use('/api', renewSessionIfNeeded);

// Authentication Endpoints
app.use('/api/auth/token/check', r_routes_api_auth_token_check); // 60 requests per minute
app.use('/api/auth/login', r_routes_api_auth_login); // 60 requests per minute
app.use('/api/auth/signup', r_routes_api_auth_signup); // 10 requests per minute
app.use('/api/auth/google', r_routes_api_auth_google); // 10 requests per minute
app.use('/api/auth/github', r_routes_api_auth_github); // 10 requests per minute
app.use('/api/auth/logout', r_routes_api_auth_logout); // 10 requests per minute
app.use('/api/auth/logoutall', r_routes_api_auth_logoutall); // 10 requests per minute
app.use('/api/auth/passkey', r_routes_api_auth_passkey); // 10 requests per minute
app.use('/api/auth/passkey/setup', r_routes_api_auth_passkey_setup); // 10 requests per minute
app.use('/api/auth/passkey/delete', r_routes_api_auth_passkey_delete); // 10 requests per minute
app.use('/api/auth/mfa/verify', r_routes_api_auth_mfa_verify); // 10 requests per minute
app.use('/api/auth/mfa/setup', r_routes_api_auth_mfa_setup); // 5 requests per minute
app.use('/api/auth/mfa/setup/verify', r_routes_api_auth_mfa_setup_verify); // 5 requests per minute
app.use('/api/auth/mfa/disable', r_routes_api_auth_mfa_disable); // 5 requests per minute
app.use('/api/auth/user/confirmationlink', r_routes_api_auth_user_confirmationlink); // 5 requests per minute
app.use('/api/auth/user/exchange-signup-token', r_routes_api_auth_user_exchangeSignupToken); // 5 requests per minute
app.use('/api/auth/user/setresettoken', r_routes_api_auth_user_setresettoken); // 5 requests per minute
app.use('/api/auth/user/changepassword', r_routes_api_auth_user_changepassword); // 5 requests per minute
app.use('/api/auth/user/resetpassword', r_routes_api_auth_user_resetpassword); // 1 request per 60 seconds
app.use('/api/auth/user/setpassword', r_routes_api_auth_user_setpassword); // 5 requests per minute
app.use('/api/auth/user/session', r_routes_api_auth_user_session); // 20 requests per minute
// Invitation lookup: rate limited because it is an unauthenticated endpoint
// that takes a token, and should not be usable to grind for valid ones.
app.use('/api/auth/invitation', rateLimiter(20, 60 * 1000), r_routes_api_auth_invitation);

// Public instance configuration (which auth methods the SPA should offer).
app.use('/api/config', r_routes_api_config);

// OAuth Settings Endpoints
//
// Managing OIDC clients and their roles requires the canManageApps capability.
// The guard is applied to the whole prefix so a route added later cannot skip it
// by accident; each route still verifies the token itself as well.
app.use('/api/oauth/settings', requireAppManagement);

app.use('/api/oauth/settings/apps/get', r_routes_api_oauth_settings_apps_get); // 60 requests per minute
app.use('/api/oauth/settings/apps/add', r_routes_api_oauth_settings_apps_add); // 10 requests per minute
app.use('/api/oauth/settings/apps/delete', r_routes_api_oauth_settings_apps_delete); // 10 requests per minute
app.use('/api/oauth/settings/apps/edit', r_routes_api_oauth_settings_apps_edit); // 10 requests per minute
app.use('/api/oauth/settings/roles/get', r_routes_api_oauth_settings_roles_get); // 20 requests per minute
app.use('/api/oauth/settings/roles/get-users', r_routes_api_oauth_settings_roles_get_users); // 10 requests per minute
app.use('/api/oauth/settings/roles/add', r_routes_api_oauth_settings_roles_add); // 10 requests per minute
app.use('/api/oauth/settings/roles/update/remove-user', r_routes_api_oauth_settings_roles_update_remove_user); // 30 requests per minute
app.use('/api/oauth/settings/roles/update/add-user', r_routes_api_oauth_settings_roles_update_add_user); // 30 requests per minute
app.use('/api/oauth/settings/roles/update/bulk-update', r_routes_api_oauth_settings_roles_update_bulk_update); // 10 requests per minute
app.use('/api/oauth/settings/roles/delete', r_routes_api_oauth_settings_roles_delete); // 10 requests per minute

// OAuth Endpoints
app.use('/api/oauth/authorize', r_routes_api_oauth_authorize); // 5 requests per second
app.use('/api/oauth/consent', r_routes_api_oauth_consent); // consent handling
app.use('/api/oauth/user-consents', r_routes_api_oauth_user_consents); // user's consented apps
app.use('/api/oauth/token', r_routes_api_oauth_token); // 5 requests per second
app.use('/api/oauth/userinfo', r_routes_api_oauth_userinfo); // 50 requests per second
app.use('/api/oauth/users', r_routes_api_oauth_users); // 30 requests per minute
app.use('/api/oauth/check_token', r_routes_api_oauth_check_token); // 60 requests per 10 seconds
app.use('/api/oauth/logout', r_routes_api_oauth_logout); // 60 requests per minute
app.use('/api/oauth/revoke', r_routes_api_oauth_revoke); // 60 requests per minute

// OIDC Discovery Endpoints - Allow CORS from all origins
const wellKnownCorsOptions = {
  origin: '*'
};

app.use('/.well-known/openid-configuration', cors(wellKnownCorsOptions), r_routes_api_oauth_openid_configuration); // No limit (public endpoint)
app.use('/.well-known/jwks.json', cors(wellKnownCorsOptions), r_routes_api_oauth_jwks_info); // No limit (public endpoint)

// Admin Endpoints
//
// requireAdmin is applied to the whole /api/admin prefix rather than per route,
// so a new admin route cannot be added without authorisation by accident. The
// rate limit is a brute-force guard on the allow-list check itself.
app.use('/api/admin', rateLimiter(120, 60 * 1000), requireAdmin);
app.use('/api/admin/overview', r_routes_api_admin_overview);
app.use('/api/admin/users', r_routes_api_admin_users);
app.use('/api/admin/apps', r_routes_api_admin_apps);
app.use('/api/admin/settings', r_routes_api_admin_settings);
app.use('/api/admin/invitations', r_routes_api_admin_invitations);

// Health Check Endpoints
app.use('/api/health', r_routes_api_health_health); // No limit (public endpoint)
app.use('/api/health/details', r_routes_api_health_details); // 10 requests per minute

// Google Analytics Endpoint
app.use('/gtag.js', r_utils_gtag);

// Anything else is a frontend route served by CloudFront from S3, so reaching
// this app means the request bypassed the CDN or hit an unknown API path.
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', error_description: `No API route for ${req.originalUrl}` });
});

// Generate a random String
async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

// Start the api (local development only). When running inside AWS Lambda the
// app is imported by lambda.js and wrapped with serverless-http instead.
if (isMainModule) {
  app.listen(API_PORT, () => {
    console.log('ONEIDP started on port', API_PORT);
  });
}

export default app;
