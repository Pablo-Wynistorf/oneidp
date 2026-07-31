/**
 * @oneidp/express
 *
 * "Sign in with ONEIDP" for Express, with no server-side session store.
 *
 * The session is a sealed HttpOnly cookie and access tokens are verified against
 * ONEIDP's JWKS, so every instance is interchangeable: run one container or a
 * thousand behind a load balancer, and any of them can serve any request.
 *
 * Web app:
 *
 *   import express from 'express';
 *   import { oneidp } from '@oneidp/express';
 *
 *   const app = express();
 *   const auth = oneidp({
 *     issuer: 'https://oneidp.ch',
 *     clientId: process.env.ONEIDP_CLIENT_ID,
 *     clientSecret: process.env.ONEIDP_CLIENT_SECRET,
 *     redirectUri: 'https://app.example.com/auth/callback',
 *     secret: process.env.ONEIDP_COOKIE_SECRET, // same value on every instance
 *   });
 *
 *   app.use(auth);
 *   app.get('/', auth.requireAuth, (req, res) => res.send(`Hi ${req.oneidp.user.name}`));
 *
 * API that only verifies tokens (no cookie, no secret, no state):
 *
 *   import { bearerAuth } from '@oneidp/express';
 *
 *   app.use('/api', bearerAuth({ issuer: 'https://oneidp.ch', clientId: process.env.ONEIDP_CLIENT_ID }));
 *   app.get('/api/me', (req, res) => res.json({ sub: req.oneidp.user.sub }));
 */

export { oneidp } from './middleware.js';
export { bearerAuth } from './bearer.js';
export { OneidpClient, createClient, mapClaimsToUser } from './client.js';
export { defaultEndpoints } from './discovery.js';
export { randomState, randomNonce, randomCodeVerifier, codeChallenge } from './crypto.js';
export {
  OneidpError,
  ConfigurationError,
  DiscoveryError,
  TokenError,
  IdTokenError,
  CallbackError,
  ApiError,
} from './errors.js';

export { oneidp as default } from './middleware.js';
