/**
 * Access token verification for APIs.
 *
 * Completely stateless: no cookie, no secret, no store, no session. A request
 * arrives with `Authorization: Bearer <jwt>`, the signature is checked against
 * ONEIDP's JWKS (fetched once and cached in the process), and `iss`, `aud` and
 * `exp` are verified locally. Every container does this independently, so this
 * scales as wide as you like.
 *
 * The one thing local verification cannot see is revocation. ONEIDP revokes by
 * ending the server-side session, which leaves the JWT signature valid until it
 * expires. `verifySession: true` adds a call to the IdP to close that window;
 * short `accessTokenValidity` (5 to 15 minutes) narrows it without the round
 * trip.
 */

import { OneidpClient, mapClaimsToUser } from './client.js';
import { ATTACH_BEARER, OneidpContext } from './context.js';
import { OneidpError } from './errors.js';

export function createBearerGuard(runtime, guardOptions = {}) {
  const { verifySession = false, loadUserinfo = false, audience, required = true } = guardOptions;
  const { client } = runtime;

  return async function bearerGuard(req, res, next) {
    const header = req.headers.authorization ?? '';
    const token = /^bearer /i.test(header) ? header.slice(7).trim() : null;

    if (!token) {
      // `required: false` lets one route serve both authenticated and anonymous
      // callers.
      if (!required) {
        req.oneidp ??= new OneidpContext(req, res, runtime);
        next();
        return;
      }

      res
        .status(401)
        .set('www-authenticate', 'Bearer realm="oneidp", error="invalid_request"')
        .json({ error: 'invalid_request', error_description: 'No bearer token provided' });
      return;
    }

    try {
      const payload = await client.validateAccessToken(token, { verifySession, audience });

      // ONEIDP access tokens carry identity only: no profile claims, no `scope`.
      // Roles and profile need a userinfo call, which also checks the live session.
      const user = loadUserinfo ? await client.userinfo(token) : mapClaimsToUser({ sub: payload.sub });

      req.oneidp ??= new OneidpContext(req, res, runtime);
      req.oneidp[ATTACH_BEARER](token, payload, user);

      next();
    } catch (error) {
      if (error instanceof OneidpError && error.status === 401) {
        res
          .status(401)
          .set('www-authenticate', `Bearer realm="oneidp", error="${error.code}"`)
          .json({ error: error.code, error_description: error.message });
        return;
      }
      next(error);
    }
  };
}

/**
 * A standalone guard for a service that only verifies tokens.
 *
 * Needs an issuer and a client id, nothing else: no `redirectUri`, no `secret`,
 * no cookies.
 *
 *   app.use('/api', bearerAuth({ issuer: 'https://oneidp.ch', clientId: process.env.ONEIDP_CLIENT_ID }));
 *   app.get('/api/me', (req, res) => res.json({ sub: req.oneidp.user.sub }));
 */
export function bearerAuth(options = {}) {
  const {
    verifySession,
    loadUserinfo,
    audience,
    required,
    client: providedClient,
    refreshSkew = 60_000,
    ...clientOptions
  } = options;

  const client = providedClient ?? new OneidpClient(clientOptions);

  const runtime = {
    client,
    store: null,
    routes: null,
    refreshSkew,
    safeReturnTo: () => null,
  };

  return createBearerGuard(runtime, { verifySession, loadUserinfo, audience, required });
}
