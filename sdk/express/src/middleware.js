/**
 * The Express integration: routes, request context, and guards.
 *
 * Stateless throughout. The session is a sealed `HttpOnly` cookie and the login
 * in flight is a second, short-lived one, so there is no store to run and no
 * state shared between instances. Scale to as many containers as you like; each
 * one decrypts the cookie locally and verifies tokens against a cached JWKS.
 *
 *   const auth = oneidp({ ... });
 *   app.use(auth);
 *   app.get('/profile', auth.requireAuth, handler);
 *   app.get('/admin', auth.requireRoles('admin'), handler);
 */

import { Router } from 'express';
import { OneidpClient } from './client.js';
import { OneidpContext, SET_SESSION, decodeSession } from './context.js';
import { createBearerGuard } from './bearer.js';
import { CallbackError, ConfigurationError } from './errors.js';
import { createCookieStore } from './store/cookie.js';
import { addPending, takePending } from './store/pending.js';

const DEFAULT_ROUTES = {
  login: '/auth/login',
  logout: '/auth/logout',
  // Defaults to the path of `redirectUri`, so the route and the URI registered
  // with ONEIDP cannot drift apart.
  callback: null,
  // Off by default: an app should not expose profile data it did not ask to.
  me: null,
};

/**
 * Only same-origin paths are accepted as a post-login destination. Anything
 * absolute, protocol-relative or backslash-prefixed is an open redirect.
 */
function safeReturnTo(value, fallback) {
  if (typeof value !== 'string' || value === '') return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}

/** Redirect a browser into the login flow; answer an API caller with 401. */
function wantsRedirect(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (req.xhr) return false;
  return (req.headers.accept ?? '').includes('text/html');
}

/**
 * Lets a guard be used as `auth.requireAuth` or `auth.requireAuth({ ... })`.
 * Three arguments ending in a function is Express calling the middleware;
 * anything else is the caller configuring it.
 */
function flexibleGuard(build) {
  return function guard(...args) {
    if (args.length === 3 && typeof args[2] === 'function' && typeof args[0] === 'object') {
      return build()(...args);
    }
    return build(...args);
  };
}

export function oneidp(options = {}) {
  const {
    secret,
    cookie = {},
    routes: routeOptions = {},
    defaultReturnTo = '/',
    postLogoutRedirectUri = null,
    refreshSkew = 60_000,
    refreshUserinfo = false,
    fetchUserinfoOnLogin = false,
    revokeOnLogout = true,
    endSessionOnLogout = true,
    onLogin = null,
    onError = null,
    client: providedClient,
    onWarning = (message) => console.warn(`[oneidp] ${message}`),
    ...clientOptions
  } = options;

  const client = providedClient ?? new OneidpClient({ ...clientOptions, onWarning });

  if (!client.redirectUri) {
    throw new ConfigurationError('`redirectUri` is required to mount the ONEIDP middleware', {
      hint: 'For an API that only verifies access tokens, use `bearerAuth()` instead: it needs neither a redirect URI nor a secret.',
    });
  }

  const store = createCookieStore({ secret, cookie, redirectUri: client.redirectUri });

  const routes = { ...DEFAULT_ROUTES, ...routeOptions };
  routes.callback ??= new URL(client.redirectUri).pathname;

  const runtime = { client, store, routes, refreshSkew, refreshUserinfo, safeReturnTo, onWarning };

  const router = Router();

  /* --------------------------------------------------------------- context */

  router.use(async (req, res, next) => {
    try {
      // One decrypt per request. No I/O, no shared state.
      const state = decodeSession(await store.loadSession(req));

      const context = new OneidpContext(req, res, runtime, state);
      req.oneidp = context;
      // Templates can read `user` without every route passing it through.
      res.locals.oneidp = context;
      res.locals.user = state?.user ?? null;

      next();
    } catch (error) {
      next(error);
    }
  });

  /* ----------------------------------------------------------------- login */

  router.get(routes.login, async (req, res, next) => {
    try {
      const pending = client.createAuthorizationState();
      const returnTo = safeReturnTo(req.query.returnTo, defaultReturnTo);

      // The verifier must not reach the browser in readable form; the transaction
      // cookie is sealed, so it cannot be read or altered.
      const tx = addPending(await store.loadTx(req), pending.state, {
        nonce: pending.nonce,
        codeVerifier: pending.codeVerifier,
        returnTo,
      });
      await store.saveTx(req, res, tx);

      res.redirect(await client.buildAuthorizationUrl(pending));
    } catch (error) {
      next(error);
    }
  });

  /* -------------------------------------------------------------- callback */

  router.get(routes.callback, async (req, res, next) => {
    try {
      const { code, state, error: oauthError, error_description: oauthDescription } = req.query;

      // ONEIDP renders authorize errors as JSON in the browser rather than
      // redirecting them here, so this branch is effectively unreachable. Handled
      // because the spec says it should be, and a proxy may add it.
      if (oauthError) {
        throw new CallbackError(oauthDescription || String(oauthError), {
          code: String(oauthError).toLowerCase().replace(/\s+/g, '_'),
          status: 400,
        });
      }

      if (!code) {
        throw new CallbackError('Callback did not include an authorization code', {
          code: 'invalid_request',
          status: 400,
          hint:
            'ONEIDP does not redirect authorize errors back to the client. A user who hits a ' +
            'misconfiguration, a banned account, or maintenance mode stays on an IdP page instead.',
        });
      }

      if (!state) {
        throw new CallbackError('Callback did not include state', { code: 'invalid_request', status: 400 });
      }

      // `state` is the lookup key, so an unknown value simply finds nothing.
      const [pending, remainingTx] = takePending(await store.loadTx(req), String(state));

      if (!pending) {
        await store.clearTx(req, res);
        throw new CallbackError('No matching login in progress for this state', {
          code: 'state_mismatch',
          status: 400,
          hint:
            'The login was started in a different browser, already completed, or sat for more than ' +
            '10 minutes. If it happens on every attempt, check the cookie survives the redirect: ' +
            "SameSite=Strict will not, and `secure: true` needs https.",
        });
      }

      const result = await client.exchangeCode(code, {
        codeVerifier: pending.codeVerifier,
        nonce: pending.nonce,
      });

      const user = fetchUserinfoOnLogin ? await client.userinfo(result.accessToken) : result.user;

      // A fresh sealed cookie replaces whatever was there, so there is no session
      // to fixate: an attacker-planted cookie is simply overwritten.
      await req.oneidp[SET_SESSION]({
        user,
        tokens: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          idToken: result.idToken,
          expiresAt: result.expiresAt,
        },
        authenticatedAt: Date.now(),
      });

      // Retire the transaction cookie, keeping any other tab's login alive.
      if (remainingTx) await store.saveTx(req, res, remainingTx);
      else await store.clearTx(req, res);

      if (onLogin) {
        const handled = await onLogin(req, res, { user, tokens: result });
        if (handled === false || res.headersSent) return;
      }

      res.redirect(safeReturnTo(pending.returnTo, defaultReturnTo));
    } catch (error) {
      if (onError) {
        await onError(error, req, res, next);
        if (res.headersSent) return;
      }
      next(error);
    }
  });

  /* ---------------------------------------------------------------- logout */

  router.get(routes.logout, async (req, res, next) => {
    try {
      const tokens = req.oneidp.tokens;
      const idToken = tokens?.idToken ?? null;
      const accessToken = tokens?.accessToken ?? null;

      // Best effort: the endpoint reports success before validating anything, and
      // it cannot touch the refresh token.
      if (revokeOnLogout && accessToken && client.isConfidential) {
        await client.revoke(accessToken).catch(() => false);
      }

      // Clear locally first. The IdP's teardown is partial and asynchronous, so it
      // is never what actually signs the user out of this app.
      await req.oneidp.destroy();
      await store.clearTx(req, res);

      if (!endSessionOnLogout) {
        res.redirect(safeReturnTo(postLogoutRedirectUri ?? defaultReturnTo, '/'));
        return;
      }

      res.redirect(
        await client.buildLogoutUrl({
          idToken,
          postLogoutRedirectUri: postLogoutRedirectUri ?? undefined,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  /* -------------------------------------------------------------------- me */

  if (routes.me) {
    router.get(routes.me, (req, res) => {
      if (!req.oneidp.isAuthenticated) {
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }
      const { raw, ...user } = req.oneidp.user;
      res.json(user);
    });
  }

  /* ---------------------------------------------------------------- guards */

  const requireAuth = flexibleGuard((guardOptions = {}) => {
    const { returnTo: useReturnTo = true } = guardOptions;

    return (req, res, next) => {
      if (req.oneidp?.isAuthenticated) {
        next();
        return;
      }

      if (!wantsRedirect(req)) {
        res.status(401).json({ error: 'unauthenticated', login_url: routes.login });
        return;
      }

      res.redirect(req.oneidp.loginUrl(useReturnTo ? req.originalUrl : null));
    };
  });

  const requireRoles = (...args) => {
    const last = args.at(-1);
    const config = last && typeof last === 'object' && !Array.isArray(last) ? args.pop() : {};
    const roles = args.flat().filter(Boolean);
    const { mode = 'any', onDenied = null } = config;

    if (roles.length === 0) {
      throw new ConfigurationError('requireRoles() needs at least one role name');
    }

    // Roles only reach the token when `profile` is granted. Without it this guard
    // would deny everyone, which is safe but baffling.
    if (!client.scope.split(' ').includes('profile')) {
      throw new ConfigurationError(
        'requireRoles() needs the `profile` scope: ONEIDP only includes the `roles` claim when it is granted',
        { hint: "Set scope: 'openid profile email' (the default) on the middleware." },
      );
    }

    return (req, res, next) => {
      if (!req.oneidp?.isAuthenticated) {
        requireAuth()(req, res, next);
        return;
      }

      const permitted = mode === 'all' ? req.oneidp.hasAllRoles(roles) : req.oneidp.hasRole(roles);
      if (permitted) {
        next();
        return;
      }

      if (onDenied) {
        onDenied(req, res, next);
        return;
      }

      // Fail closed. A missing claim counts as no roles, never as a pass.
      res.status(403).json({ error: 'forbidden', required_roles: roles, mode });
    };
  };

  const bearerAuth = flexibleGuard((guardOptions = {}) => createBearerGuard(runtime, guardOptions));

  return Object.assign(router, {
    client,
    routes,
    requireAuth,
    requireRoles,
    bearerAuth,
    /** Context for a request handled outside this router. */
    context: (req, res) => new OneidpContext(req, res, runtime),
  });
}
