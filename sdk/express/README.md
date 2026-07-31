# @oneidp/express

Sign users in with [ONEIDP](https://oneidp.ch) from an Express app.

**No session store.** The session is a sealed `HttpOnly` cookie and access tokens
are verified against ONEIDP's JWKS, so every instance of your app is
interchangeable. Run one container or a thousand behind a load balancer with no
sticky sessions, no Redis, and nothing shared but configuration.

```bash
npm install @oneidp/express
```

Node 20 or newer. Express 4.18 or 5. `jose` is the only dependency.

---

## Contents

- [Cheat sheet](#cheat-sheet)
- [Web app in 20 lines](#web-app-in-20-lines)
- [API in 3 lines](#api-in-3-lines)
- [How it works](#how-it-works)
- [Scaling across containers](#scaling-across-containers)
- [`req.oneidp`](#reqoneidp)
- [Guards](#guards)
- [Options](#options)
- [Recipes](#recipes)
- [Errors](#errors)
- [Using the client on its own](#using-the-client-on-its-own)
- [Troubleshooting](#troubleshooting)
- [ONEIDP quirks](#what-the-sdk-does-about-oneidps-quirks)
- [Security notes](#security-notes)

---

## Cheat sheet

| I want to... | Do this |
| --- | --- |
| Add login to a web app | `app.use(oneidp({ issuer, clientId, clientSecret, redirectUri, secret }))` |
| Require a signed-in user | `app.get('/x', auth.requireAuth, handler)` |
| Require a role | `app.get('/x', auth.requireRoles('admin'), handler)` |
| Read the current user | `req.oneidp.user` (`null` when anonymous) |
| Check a role in code | `req.oneidp.hasRole('admin')` |
| Call another API as the user | `const t = await req.oneidp.getAccessToken()` |
| Protect an API with a token | `app.use('/api', bearerAuth({ issuer, clientId }))` |
| Catch revoked tokens on an API | `bearerAuth({ issuer, clientId, verifySession: true })` |
| Create a local user row on first login | `oneidp({ ..., onLogin })` |
| Sign out | link to `/auth/logout` |
| Expose the profile as JSON | `oneidp({ ..., routes: { me: '/auth/me' } })` |
| Rotate the cookie secret | `secret: [newSecret, oldSecret]` |
| Do the flow by hand | `new OneidpClient({ ... })` |

Routes mounted by `app.use(auth)`:

| Route | Purpose |
| --- | --- |
| `GET /auth/login` | Starts the flow. Accepts `?returnTo=/local/path` |
| `GET /auth/callback` | Completes it. Path comes from `redirectUri` |
| `GET /auth/logout` | Clears the cookie, then visits the IdP's end-session endpoint |

---

## Web app in 20 lines

Register a client at `/oidc/apps` with redirect URI
`https://yourapp.example.com/auth/callback` and the public client switch **off**.

```js
import express from 'express';
import { oneidp } from '@oneidp/express';

const app = express();

const auth = oneidp({
  issuer: 'https://oneidp.ch',
  clientId: process.env.ONEIDP_CLIENT_ID,
  clientSecret: process.env.ONEIDP_CLIENT_SECRET,
  redirectUri: 'https://yourapp.example.com/auth/callback',
  // Seals the cookies. `openssl rand -base64 32`. Same value on every instance.
  secret: process.env.ONEIDP_COOKIE_SECRET,
});

app.use(auth);

app.get('/', (req, res) => {
  res.send(req.oneidp.isAuthenticated ? `Hi ${req.oneidp.user.name}` : '<a href="/auth/login">Sign in</a>');
});

app.get('/profile', auth.requireAuth, (req, res) => res.json(req.oneidp.user));
app.get('/admin', auth.requireRoles('admin'), (req, res) => res.send('Admin'));

app.listen(3000);
```

A runnable version is [`example/server.mjs`](./example/server.mjs).

## API in 3 lines

For a service that only accepts access tokens. No cookies, no secret, no state:

```js
import { bearerAuth } from '@oneidp/express';

app.use('/api', bearerAuth({ issuer: 'https://oneidp.ch', clientId: process.env.ONEIDP_CLIENT_ID }));
app.get('/api/me', (req, res) => res.json({ sub: req.oneidp.user.sub }));
```

---

## How it works

Two cookies, both `HttpOnly` and both sealed with `A256GCM` authenticated
encryption. The browser can neither read them nor alter them undetected.

| Cookie | Holds | Lives |
| --- | --- | --- |
| `oneidp` | Profile, access token, refresh token, ID token | 12 hours by default |
| `oneidp_tx` | One login in flight: `state`, `nonce`, PKCE verifier, `returnTo` | 10 minutes |

```
1. GET /auth/login
   → seals {state, nonce, code_verifier} into oneidp_tx
   → 302 to ONEIDP /authorize with PKCE S256

2. user signs in at ONEIDP (password, TOTP, passkey, Google, GitHub)

3. GET /auth/callback?code=...&state=...
   → opens oneidp_tx, matches state, consumes the entry
   → POST /token, validates the ID token against the JWKS (iss, aud, exp, nonce)
   → seals profile + tokens into the oneidp cookie
   → 302 to returnTo

4. every later request
   → one local decrypt of the oneidp cookie, no network, no store
   → req.oneidp.user is populated
```

The key for each cookie is derived from your `secret` with HKDF-SHA256 using a
different `info` per purpose, so a transaction cookie can never be replayed as a
session. Expiry is inside the sealed payload as well as on the cookie, so an
expired cookie is rejected server-side even if the browser keeps sending it.

## Scaling across containers

**Yes, you can run 100 replicas with no session affinity, and a user can hit a
different container on every request of the login flow.** That is the design, and
it is covered by tests: [`test/cluster.test.js`](./test/cluster.test.js) runs five
independent instances behind a strict round-robin balancer and asserts that login
starts on one replica, the callback lands on another, and the session is then read
by replicas that never saw either.

What every replica must share:

| Setting | Why |
| --- | --- |
| `secret` | Derives the cookie key. A replica with a different secret cannot open the cookie |
| `clientId`, `clientSecret` | Same registered client |
| `redirectUri` | ONEIDP allows exactly one, so it must be the public address (your load balancer or ingress), never a pod address |
| `issuer` | Must equal the `iss` claim exactly |

What is **not** shared, and does not need to be: sessions, PKCE verifiers,
tokens, JWKS cache. Each process caches the JWKS itself, which is one HTTP
request per process for a key that never rotates.

Deployment notes:

- Put all replicas behind one hostname and register that hostname's
  `/auth/callback`. Separate environments need separate ONEIDP clients, since a
  client has exactly one redirect URI.
- Inject `secret` from the same source for all replicas (a Kubernetes `Secret`, a
  parameter store). If one replica gets a stale value, users landing on it are
  treated as signed out rather than erroring, and they will be signed in again on
  the next request that lands elsewhere. Tested in
  [`test/cluster.test.js`](./test/cluster.test.js).
- Set `app.set('trust proxy', 1)` behind a TLS-terminating proxy.
- Rotate the secret without signing anyone out: deploy `secret: [new, old]`,
  wait longer than `cookie.maxAge`, then drop `old`.

The one thing you give up by having no store: you cannot force-sign-out a
specific user before their cookie expires. If you need that, keep
`cookie.maxAge` short, or check with the IdP on sensitive routes using
`req.oneidp.isSessionActive()`.

---

## `req.oneidp`

Present on every request once `app.use(auth)` has run, and on `res.locals.oneidp`
with the profile on `res.locals.user` for templates.

| Member | Type | Description |
| --- | --- | --- |
| `isAuthenticated` | `boolean` | |
| `authMethod` | `'session' \| 'bearer' \| null` | How this request authenticated |
| `user` | `OneidpUser \| null` | Normalised profile |
| `claims` | `object \| null` | ID token claims, or access token claims in bearer mode |
| `tokens` | `object \| null` | `accessToken`, `idToken`, `expiresAt`, `isExpired`. Never the refresh token |
| `tokenPayload` | `object \| null` | Verified access token claims, bearer mode only |
| `hasRole(...roles)` | `boolean` | True if the user holds **any** of them |
| `hasAllRoles(...roles)` | `boolean` | True if the user holds **all** of them |
| `getAccessToken()` | `Promise<string \| null>` | Refreshes when near expiry. `null` when a fresh login is needed |
| `userinfo({ cache })` | `Promise<OneidpUser \| null>` | Re-reads the profile from the IdP |
| `isSessionActive()` | `Promise<boolean>` | Whether the session is still live at the IdP |
| `loginUrl(returnTo?)` | `string \| null` | URL of the login route |
| `logoutUrl()` | `string \| null` | URL of the logout route |
| `destroy()` | `Promise<void>` | Clears the cookie without contacting the IdP |

`user` maps ONEIDP's claim names onto stable ones, keeping the originals on
`user.raw`:

```js
{
  sub: '482913',            // the only safe primary key: everything else changes
  username: 'ada',
  name: 'Ada Lovelace',
  givenName: 'Ada',         // ONEIDP sends given_name / firstName
  familyName: 'Lovelace',
  email: 'ada@example.com',
  roles: ['admin'],         // needs the `profile` scope
  mfaEnabled: true,         // TOTP is configured, not that it was used to log in
  raw: { /* original claims */ }
}
```

---

## Guards

Every guard works with or without parentheses:

```js
app.get('/account', auth.requireAuth, handler);
app.get('/account', auth.requireAuth({ returnTo: false }), handler);
```

### `requireAuth`

Redirects a browser into the login flow and remembers where it was going.
Answers API callers with `401 {"error":"unauthenticated","login_url":"/auth/login"}`.
A request counts as an API call when it is not a GET/HEAD, when `X-Requested-With`
is set, or when `Accept` does not include `text/html`.

| Option | Default | Description |
| --- | --- | --- |
| `returnTo` | `true` | Return to the current URL after login. Only same-origin paths are accepted |

### `requireRoles`

Fails closed with `403 {"error":"forbidden","required_roles":[...],"mode":"any"}`.
Roles are per client, so `admin` in your app is unrelated to `admin` elsewhere.
Anonymous callers are handed to `requireAuth` first.

```js
auth.requireRoles('admin');                              // holds admin
auth.requireRoles('billing', 'finance');                 // holds either
auth.requireRoles('admin', 'billing', { mode: 'all' });  // holds both
auth.requireRoles('admin', { onDenied: (req, res) => res.redirect('/no-access') });
```

Throws at startup if the `profile` scope is missing, because ONEIDP only sends the
`roles` claim when `profile` is granted and the guard would otherwise deny
everyone.

### `bearerAuth`

Verifies `Authorization: Bearer`. Available standalone (`bearerAuth({ ... })`, no
secret or redirect URI needed) or off the router (`auth.bearerAuth`) when one app
serves both browsers and services.

| Option | Default | Description |
| --- | --- | --- |
| `verifySession` | `false` | Also confirm the session is live at the IdP. One extra round trip |
| `loadUserinfo` | `false` | Fetch the profile; access tokens carry only `sub` |
| `audience` | `clientId` | Expected `aud` |
| `required` | `true` | Set `false` to allow anonymous callers through |

Local verification checks the signature, `iss`, `aud` and `exp`. It cannot see
revocation: ONEIDP revokes by ending the server-side session, which leaves the JWT
valid until it expires. Use `verifySession: true` on sensitive routes, or keep
`accessTokenValidity` at 5 to 15 minutes.

---

## Options

```js
oneidp({
  // --- client (required) ---
  issuer: 'https://oneidp.ch',   // also the `iss` claim. No trailing slash
  clientId,
  clientSecret,                   // omit for a public client (which cannot refresh)
  redirectUri,                    // must match the registered URI byte for byte
  secret,                         // seals the cookies. >= 32 chars, or [new, old]

  // --- client (optional) ---
  scope: 'openid profile email',  // openid, profile, email, offline_access
  pkce: true,                     // S256. Required for public clients
  clockTolerance: 5,              // seconds of leeway on exp/iat
  timeout: 10_000,                // ms per request to the IdP
  discovery: true,                // lazy, cached, non-fatal if it fails
  endpoints: {},                  // override individual endpoint URLs
  fetch: globalThis.fetch,
  onWarning: (message) => {},

  // --- cookies ---
  cookie: {
    name: 'oneidp',               // transaction cookie is `${name}_tx`
    path: '/',
    domain: undefined,
    sameSite: 'lax',              // 'strict' is rejected: it breaks the callback
    secure: true,                 // inferred false for http://localhost
    maxAge: 12 * 60 * 60 * 1000,  // session lifetime
    txMaxAge: 10 * 60 * 1000,     // how long a login may sit unfinished
  },

  // --- routes ---
  routes: { login: '/auth/login', logout: '/auth/logout', callback: null, me: null },
  defaultReturnTo: '/',
  postLogoutRedirectUri: null,

  // --- tokens ---
  refreshSkew: 60_000,            // refresh this long before expiry
  refreshUserinfo: false,         // re-read the profile after refreshing
  fetchUserinfoOnLogin: false,    // use userinfo instead of ID token claims

  // --- logout ---
  revokeOnLogout: true,           // best-effort token revocation
  endSessionOnLogout: true,       // redirect via the IdP end-session endpoint

  // --- hooks ---
  onLogin: (req, res, { user, tokens }) => {},  // return false to own the redirect
  onError: (error, req, res, next) => {},
});
```

`routes.callback` defaults to the path of `redirectUri`, so the mounted route and
the registered URI cannot drift apart. `routes.me` is off by default; set it to a
path to expose the profile as JSON.

---

## Recipes

### Create a local user row on first login

```js
oneidp({
  // ...
  onLogin: async (req, res, { user }) => {
    // Key on `sub`. Usernames and emails change; `sub` does not.
    await db.users.upsert({ oneidpSub: user.sub, email: user.email, name: user.name });
  },
});
```

Return `false`, or write a response yourself, to take over the redirect.

### Call another service as the signed-in user

```js
app.get('/things', auth.requireAuth, async (req, res, next) => {
  try {
    // Refreshes if the token is within `refreshSkew` of expiry. Call it before
    // writing the response so the rotated cookie can still be set.
    const accessToken = await req.oneidp.getAccessToken();
    if (!accessToken) return res.redirect(req.oneidp.loginUrl('/things'));

    const upstream = await fetch('https://api.example.com/things', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    res.status(upstream.status).json(await upstream.json());
  } catch (error) {
    next(error);
  }
});
```

### One app serving browsers and services

```js
const auth = oneidp({ issuer, clientId, clientSecret, redirectUri, secret });
app.use(auth);

app.get('/dashboard', auth.requireAuth, handler);              // cookie session
app.get('/api/things', auth.bearerAuth, handler);              // access token
```

### A route that works signed in or out

```js
app.get('/api/feed', auth.bearerAuth({ required: false }), (req, res) => {
  res.json(req.oneidp.isAuthenticated ? personalised(req.oneidp.user) : publicFeed());
});
```

### Your own login page

```js
app.get('/signin', (req, res) => {
  res.send(`<a href="${req.oneidp.loginUrl('/dashboard')}">Continue with ONEIDP</a>`);
});
```

### Sensitive route that must catch revocation

```js
app.post('/transfer', auth.requireAuth, async (req, res) => {
  if (!(await req.oneidp.isSessionActive())) {
    await req.oneidp.destroy();
    return res.status(401).json({ error: 'session_ended' });
  }
  // ...
});
```

### Roles that change while the user is signed in

ONEIDP puts roles in the token at issue time, so a role granted afterwards is not
visible until the token is reissued. Re-read them when it matters:

```js
const fresh = await req.oneidp.userinfo();   // hits the IdP, updates the cookie
if (fresh.roles.includes('admin')) { /* ... */ }
```

Or set `refreshUserinfo: true` to re-read on every token refresh.

### Rotate the cookie secret with no downtime

```js
// Deploy 1: accept both, write with the new one.
secret: [process.env.SECRET_NEW, process.env.SECRET_OLD]
// Deploy 2, after longer than cookie.maxAge: drop the old one.
secret: process.env.SECRET_NEW
```

### Log out without leaving your app

```js
oneidp({ ..., endSessionOnLogout: false, postLogoutRedirectUri: '/' });
```

The local cookie is always cleared first, so your app is signed out either way.

---

## Errors

Everything deliberate is an `OneidpError` subclass with a normalised snake_case
`code`, and a `hint` on the failures that are easy to misdiagnose.

```js
import { OneidpError } from '@oneidp/express';

app.use((error, req, res, next) => {
  if (error instanceof OneidpError) {
    console.error(error.code, error.message, error.hint);
    return res.status(400).send('Sign-in failed');
  }
  next(error);
});
```

| Class | `code` examples | Raised when |
| --- | --- | --- |
| `ConfigurationError` | `configuration_error` | Bad options. Always at startup, never per request |
| `DiscoveryError` | `discovery_error` | Discovery or JWKS unreachable, or an issuer mismatch |
| `TokenError` | `invalid_grant`, `invalid_client` | The token endpoint refused the request |
| `IdTokenError` | `invalid_id_token`, `nonce_mismatch` | An ID token failed validation |
| `CallbackError` | `invalid_request`, `state_mismatch` | The callback itself was wrong |
| `ApiError` | `invalid_token`, `userinfo_failed` | userinfo, check_token or revoke failed |

ONEIDP mixes `Invalid Request` with `invalid_request` and answers `401` where the
specs say `400`; both are normalised, so branch on `error.code`.

---

## Using the client on its own

`OneidpClient` is the protocol layer with no Express dependency: for scripts,
background jobs, or driving the flow yourself.

```js
import { OneidpClient } from '@oneidp/express';

const client = new OneidpClient({ issuer, clientId, clientSecret, redirectUri });

const pending = client.createAuthorizationState();        // state, nonce, verifier
const url = await client.buildAuthorizationUrl(pending);  // send the browser here

// Within 20 seconds of the callback:
const tokens = await client.exchangeCode(code, {
  codeVerifier: pending.codeVerifier,
  nonce: pending.nonce,
});

tokens.user;                                  // normalised profile
await client.userinfo(tokens.accessToken);    // live profile, checks the session
await client.checkToken(tokens.accessToken);  // boolean liveness
await client.refresh(tokens.refreshToken);    // confidential clients only
await client.revoke(tokens.accessToken);      // ends that access token's session
await client.validateAccessToken(token, { verifySession: true });
await client.buildLogoutUrl({ idToken: tokens.idToken });
```

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `state_mismatch` on every login | Cookie not surviving the redirect | `cookie.sameSite` must be `lax`, and `secure: true` needs https. Behind a proxy, `app.set('trust proxy', 1)` |
| `state_mismatch` occasionally | The login sat longer than `txMaxAge`, or was replayed | Expected. Send the user to `/auth/login` again |
| `invalid_grant`: expired code | ONEIDP codes live 20 seconds | Do not add slow work before the callback returns; check the clock on the host |
| `invalid_request` about `redirect_uri` | The value differs from the registered one | Must match byte for byte, including scheme, port and trailing slash |
| `unauthorized_client` | ONEIDP disabled the client because its owner lost app-management rights or was suspended | An instance administrator must restore the owner |
| Users signed out at random | Replicas disagree on `secret`, or it changes on restart | Inject one fixed value into every replica |
| `requireRoles` denies everyone | `roles` claim missing | Request `openid profile`. The guard throws at startup if `profile` is absent |
| Roles are stale | Roles are baked in at token issue time | `await req.oneidp.userinfo()`, or `refreshUserinfo: true` |
| `getAccessToken()` returns null | Token expired and cannot be refreshed (public client or no refresh token) | Redirect to `req.oneidp.loginUrl()` |
| Warning about refreshing after the response started | `getAccessToken()` was called after writing output | Call it before sending the response |
| Session cookie split in two | Payload over 3800 bytes, usually many roles | Harmless. It rejoins automatically |
| Logout does not prompt on the next login | ONEIDP's own browser session survives for up to 14 days | Expected. See [notes-and-limitations](../../docs/notes-and-limitations.md) |
| A user hits an ONEIDP JSON error page and never comes back | Authorize errors are not redirected to your callback | Nothing to fix in your app; check the client configuration |
| `CallbackError: User denied the authorization request` | The user clicked Deny on the consent screen | Expected. Handle `error.code === 'access_denied'` as a cancel, as shown above |

---

## What the SDK does about ONEIDP's quirks

Drawn from [notes-and-limitations.md](../../docs/notes-and-limitations.md).
Handled for you:

- **Codes live 20 seconds.** Exchanged inline on the callback, and an expired code
  produces an error that says so.
- **Refreshed ID tokens lose their claims.** The refresh grant falls back to
  `openid`, dropping profile, email and `nonce`. The stored profile stays
  authoritative; `refreshUserinfo: true` re-reads it instead.
- **Refresh tokens are not rotated.** No new token comes back, so the original is
  carried forward for its full 20 days.
- **Expiry** is driven by `expires_in`, never the ID token's `exp`, which is a
  fixed 48 hours and outlives the access token.
- **`at_hash` and `auth_time` are not issued**, so they are not required.
- **Discovery advertises flows that do not exist.** Hybrid response types and
  private key JWT auth are ignored; `response_type=code` is always sent.
- **`client_secret_basic` only works on one grant**, so the secret always goes in
  the body, which works on both.
- **`state` is interpolated into the redirect unencoded**, so all generated values
  are base64url and URL-safe by construction.
- **Concurrent refreshes** are coalesced into one request per token.
- **Endpoint paths** are derived from the issuer, so a discovery outage or cold
  start does not stop logins.
- **Registration constraints** are checked at startup: a `redirectUri` with a
  query string, or characters ONEIDP's regex rejects, fails immediately.

Still worth knowing, because no SDK can fix them:

- **Authorize errors mostly never reach your callback.** ONEIDP renders them as
  JSON in the browser instead of redirecting with `?error=`, so a user who hits a
  misconfiguration, maintenance mode, or a banned account is left on an IdP page.
  The one exception is declining the consent screen, which does redirect back with
  `error=access_denied`. Treat that as a normal outcome, not a failure:

  ```js
  app.use((error, req, res, next) => {
    if (error.code === 'access_denied') return res.redirect('/');  // user cancelled
    next(error);
  });
  ```
- **Logout is partial.** Only the OAuth session tied to that ID token ends; the
  ONEIDP browser session survives up to 14 days, so the next login is silent. The
  local cookie is always cleared first, so your app is signed out regardless.
- **Refresh tokens cannot be revoked.** `revoke` ends only the access token's
  session, and the endpoint returns `200` before validating anything. A leaked
  refresh token works for 20 days; the user must remove the app under *Authorized
  apps* to cut it off.
- **One redirect URI per client.** No wildcards. Local, staging and production
  each need their own client.
- **A browser-only SPA cannot complete the flow**, because the token endpoint only
  allows CORS from the IdP's origin. Put this SDK in a small backend.
- **`userinfo` ignores scope**, returning email and name even for a bare `openid`
  grant, so presence of a field is not proof of consent.
- **Roles need `profile`.**

---

## Security notes

- Tokens never reach the browser in readable form. Both cookies are `HttpOnly`
  (not configurable) and sealed with `A256GCM`, so they cannot be read from
  JavaScript or altered undetected.
- `secure` is on unless `redirectUri` is `http://localhost`, and `sameSite` is
  `lax`. `strict` is rejected because it breaks the callback navigation.
- The refresh token is a 20-day bearer credential that ONEIDP cannot revoke. It
  stays inside the sealed cookie and is never exposed through `req.oneidp.tokens`.
- An unreadable, tampered or expired cookie means "not signed in", never a 500.
- Login always writes a fresh sealed cookie, so there is no session to fixate.
- `returnTo` accepts same-origin paths only, so it cannot be used as an open
  redirect.
- `postLogoutRedirectUri` is **not** validated by ONEIDP. Never build it from user
  input.
- Secrets are at least 32 characters, and `[new, old]` allows rotation without
  signing anyone out.

## Tests

```bash
npm test            # the flow, the cluster, cookies, refresh, the client
npm run typecheck   # the declaration file against a smoke file
npm run verify      # everything, plus the packed tarball installed clean
```

The suite runs against a fake ONEIDP that signs real RS256 tokens and reproduces
the quirks above: 20 second codes, claim-stripped refresh tokens, session-based
revocation, and unencoded `state`.

## Releasing

CI runs the tests on Node 20, 22 and 24, against Express 4 and 5, typechecks the
declarations, and installs the packed tarball on every change to `sdk/express/**`.

```bash
cd sdk/express
npm version patch          # or minor / major
cd ../..
git commit -am "express sdk $(node -p "require('./sdk/express/package.json').version")"
git push
git tag "sdk-express-v$(node -p "require('./sdk/express/package.json').version")"
git push origin --tags
```

The release workflow refuses to publish if the tag and `package.json` disagree,
publishes with [provenance](https://docs.npmjs.com/generating-provenance-statements),
and opens a GitHub release with the tarball attached. `workflow_dispatch` does the
same as a dry run. A version already on npm is a no-op rather than a failure.

Authentication is either npm trusted publishing (preferred: configure it against
this repository and `.github/workflows/sdk-express-release.yml`, no secret to
store) or an `NPM_TOKEN` repository secret, used automatically when present.

## Licence

MIT
