/**
 * A complete ONEIDP web app, with no session store.
 *
 *   npm install express @oneidp/express
 *
 * Configure it with a .env file next to this one:
 *
 *   cp example/.env.example example/.env   # then fill in the values
 *   node example/server.mjs
 *
 * Or pass the variables inline, which override the file:
 *
 *   ONEIDP_CLIENT_ID=... ONEIDP_CLIENT_SECRET=... \
 *   ONEIDP_COOKIE_SECRET="$(openssl rand -base64 32)" \
 *   node example/server.mjs
 *
 * Register the client at /oidc/apps with redirect URI
 * http://localhost:3000/auth/callback and the public client switch off.
 *
 * Run as many copies of this as you like: the only thing replicas must share is
 * ONEIDP_COOKIE_SECRET.
 */

import { existsSync } from 'node:fs';

import express from 'express';
import { bearerAuth, oneidp } from '@oneidp/express';

// Load example/.env when it exists.
//
// `process.loadEnvFile` is built into Node, so the example needs no `dotenv`
// dependency. The path is resolved relative to this file rather than the working
// directory, so `node example/server.mjs` and `node server.mjs` both work.
// Variables already in the environment win over the file, which is what you want
// in a container.
const envFile = new URL('.env', import.meta.url);

if (existsSync(envFile)) {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envFile);
  } else {
    console.warn(
      'Reading .env needs Node 20.12 or newer. Either upgrade, or run:\n' +
        '  node --env-file=example/.env example/server.mjs',
    );
  }
}

const {
  ONEIDP_ISSUER = 'https://oneidp.ch',
  ONEIDP_CLIENT_ID,
  ONEIDP_CLIENT_SECRET,
  ONEIDP_COOKIE_SECRET,
  BASE_URL = 'http://localhost:3000',
  PORT = 3000,
} = process.env;

if (!ONEIDP_CLIENT_ID || !ONEIDP_COOKIE_SECRET) {
  console.error('Set ONEIDP_CLIENT_ID and ONEIDP_COOKIE_SECRET');
  process.exit(1);
}

const app = express();

// Behind a proxy or load balancer, so req.protocol and the client IP are right.
if (BASE_URL.startsWith('https://')) app.set('trust proxy', 1);

const auth = oneidp({
  issuer: ONEIDP_ISSUER,
  clientId: ONEIDP_CLIENT_ID,
  clientSecret: ONEIDP_CLIENT_SECRET,
  redirectUri: `${BASE_URL}/auth/callback`,
  postLogoutRedirectUri: BASE_URL,
  scope: 'openid profile email',

  // Seals the session cookie. Identical on every instance, and rotatable by
  // passing an array: [newSecret, oldSecret].
  secret: ONEIDP_COOKIE_SECRET,

  // `secure` is inferred from redirectUri, so localhost works over http.
  cookie: { name: 'oneidp', maxAge: 12 * 60 * 60 * 1000 },
});

app.use(auth);

app.get('/', (req, res) => {
  const { isAuthenticated, user } = req.oneidp;

  res.type('html').send(
    isAuthenticated
      ? `<h1>Hello ${escapeHtml(user.name ?? user.username ?? user.sub)}</h1>
         <p>${escapeHtml(user.email ?? '')}</p>
         <p>Roles: ${user.roles.map(escapeHtml).join(', ') || 'none'}</p>
         <p><a href="/profile">Profile</a> · <a href="/admin">Admin</a> · <a href="/auth/logout">Sign out</a></p>`
      : '<h1>ONEIDP demo</h1><p><a href="/auth/login">Sign in with ONEIDP</a></p>',
  );
});

// Anonymous visitors are sent through the login flow and land back here.
app.get('/profile', auth.requireAuth, (req, res) => {
  res.json(req.oneidp.user);
});

// Roles are per client and only present when `profile` is granted.
app.get('/admin', auth.requireRoles('admin'), (req, res) => {
  res.type('html').send('<h1>Admin</h1><p><a href="/">Back</a></p>');
});

// Calling another service as the user. getAccessToken() refreshes when the token
// is close to expiry, so call it before writing the response.
app.get('/downstream', auth.requireAuth, async (req, res, next) => {
  try {
    const accessToken = await req.oneidp.getAccessToken();
    if (!accessToken) {
      res.redirect(req.oneidp.loginUrl('/downstream'));
      return;
    }

    const response = await fetch('https://api.example.com/things', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    res.status(response.status).json(await response.json());
  } catch (error) {
    next(error);
  }
});

// An API protected by an access token rather than a cookie. Needs no secret and
// no state, so this is what a service-to-service endpoint should use.
app.use('/api', bearerAuth({ issuer: ONEIDP_ISSUER, clientId: ONEIDP_CLIENT_ID }));
app.get('/api/me', (req, res) => res.json({ sub: req.oneidp.user.sub }));

app.use((error, req, res, _next) => {
  console.error(error);
  const status = error.status && error.status < 500 ? 400 : 500;
  res
    .status(status)
    .type('html')
    .send(
      `<h1>Sign-in failed</h1><p>${escapeHtml(error.message)}</p>` +
        (error.hint ? `<p>${escapeHtml(error.hint)}</p>` : '') +
        '<p><a href="/auth/login">Try again</a></p>',
    );
});

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
}

app.listen(PORT, () => console.log(`Listening on ${BASE_URL}`));
