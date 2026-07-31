/**
 * Type-level smoke test. Not shipped, not executed: `npm run typecheck`
 * compiles it so a broken declaration file fails CI instead of reaching users.
 */

import express from 'express';
import {
  ApiError,
  bearerAuth,
  CallbackError,
  ConfigurationError,
  DiscoveryError,
  IdTokenError,
  OneidpClient,
  OneidpError,
  TokenError,
  codeChallenge,
  createClient,
  defaultEndpoints,
  mapClaimsToUser,
  oneidp,
  randomCodeVerifier,
  randomNonce,
  randomState,
  type OneidpUser,
} from '../../types/index.js';

const app = express();

const auth = oneidp({
  issuer: 'https://oneidp.ch',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://app.example.com/auth/callback',
  secret: 'a-secret-that-is-at-least-32-characters',
  cookie: { name: 'oneidp', maxAge: 43_200_000, sameSite: 'lax' },
  scope: ['openid', 'profile', 'email'],
  routes: { login: '/auth/login', me: '/auth/me' },
  refreshSkew: 30_000,
  onLogin: async (_req, _res, { user }) => {
    const sub: string = user.sub;
    return sub.length > 0;
  },
  onError: (error) => {
    if (error instanceof OneidpError) {
      const code: string = error.code;
      const hint: string | undefined = error.hint;
      void code;
      void hint;
    }
  },
});

app.use(auth);

// Guards, with and without options.
app.get('/a', auth.requireAuth, (_req, res) => res.end());
app.get('/b', auth.requireAuth({ returnTo: false }), (_req, res) => res.end());
app.get('/c', auth.requireRoles('admin'), (_req, res) => res.end());
app.get('/d', auth.requireRoles('admin', 'billing', { mode: 'all' }), (_req, res) => res.end());
app.get('/e', auth.bearerAuth, (_req, res) => res.end());
app.get('/f', auth.bearerAuth({ verifySession: true, loadUserinfo: true }), (_req, res) => res.end());

// Standalone guard: no secret, no cookie, no redirect URI.
app.use('/api', bearerAuth({ issuer: 'https://oneidp.ch', clientId: 'client-id', verifySession: true }));

// Request context.
app.get('/me', auth.requireAuth, async (req, res) => {
  const authed: boolean = req.oneidp.isAuthenticated;
  const method: 'session' | 'bearer' | null = req.oneidp.authMethod;
  const user: OneidpUser | null = req.oneidp.user;
  const token: string | null = await req.oneidp.getAccessToken();
  const live: boolean = await req.oneidp.isSessionActive();
  const roles: boolean = req.oneidp.hasRole('admin', ['billing']);
  const all: boolean = req.oneidp.hasAllRoles(['admin']);
  const loginUrl: string | null = req.oneidp.loginUrl('/back');
  await req.oneidp.destroy();

  res.json({ authed, method, user, token, live, roles, all, loginUrl });
});

// Client used on its own.
async function standalone(): Promise<void> {
  const client: OneidpClient = createClient({
    issuer: 'https://oneidp.ch',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://app.example.com/auth/callback',
  });

  const pending = client.createAuthorizationState();
  const url: string = await client.buildAuthorizationUrl(pending);

  const tokens = await client.exchangeCode('code', {
    codeVerifier: pending.codeVerifier,
    nonce: pending.nonce,
  });

  const user: OneidpUser = tokens.user;
  const refreshed = await client.refresh(tokens.refreshToken ?? '');
  const profile: OneidpUser = await client.userinfo(tokens.accessToken);
  const live: boolean = await client.checkToken(tokens.accessToken);
  const revoked: boolean = await client.revoke(tokens.accessToken);
  const logout: string = await client.buildLogoutUrl({ idToken: tokens.idToken });
  const endpoints = await client.endpoints();

  await client.validateIdToken(tokens.idToken ?? '', { nonce: pending.nonce });
  await client.validateAccessToken(tokens.accessToken, { verifySession: true });

  void [url, user, refreshed, profile, live, revoked, logout, endpoints.token_endpoint];
}

// Standalone helpers and error classes.
void [
  defaultEndpoints('https://oneidp.ch').jwks_uri,
  mapClaimsToUser({ sub: '1' }).sub,
  codeChallenge(randomCodeVerifier()),
  randomState(),
  randomNonce(),
  standalone,
  ConfigurationError,
  DiscoveryError,
  TokenError,
  IdTokenError,
  CallbackError,
  ApiError,
];
