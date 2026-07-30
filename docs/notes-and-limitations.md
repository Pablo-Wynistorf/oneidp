# Notes and limitations

Where ONEIDP behaves differently from what an OIDC or OAuth 2.0 client library
expects. Worth reading before you spend an afternoon debugging.

## CORS

Every OAuth endpoint is served with `Access-Control-Allow-Origin` set to the
IdP's own origin only. `/token`, `/userinfo`, `/revoke` and `/check_token` are
therefore **not callable from a browser on another origin**. Only
`/.well-known/openid-configuration` and `/.well-known/jwks.json` allow `*`.

A browser-only SPA cannot complete the code exchange, even as a properly
configured public client with PKCE. Put a small backend in front of it that holds
a confidential client and keeps tokens server-side. Native and mobile apps are
unaffected, since they are not subject to CORS.

## Authorization endpoint

- **`response_type` is not read.** The endpoint always runs the authorization
  code flow. The discovery document advertises `token`, `id_token`, and the
  hybrid combinations; none of them work. Send `response_type=code`.
- **Errors are not redirected back to your app.** Invalid parameters produce a
  JSON error page in the browser instead of `redirect_uri?error=...`. Your
  callback handler will never receive an OAuth error from this endpoint, so a
  user hitting a misconfiguration is left on an ONEIDP JSON page.
- **Non-standard error shapes.** `error` values are `Invalid Request` and
  `Server Error` rather than `invalid_request` / `server_error`, and the status
  codes are unusual: `401` for an unknown `client_id`, `405` for a redirect URI
  mismatch.
- **`prompt`, `max_age`, `login_hint` and `response_mode` are ignored.** There is
  no way to force re-authentication, and no `prompt=none` for a silent check.
  Navigating to `/authorize` while a session exists is already silent.
- **20 second code lifetime.** Tighter than the 10 minutes RFC 6749 suggests.
  Slow callbacks, a user on a bad connection, or a debugger breakpoint will blow
  through it and produce `invalid_grant`.

## Token endpoint

- **`client_secret_basic` only works on the `authorization_code` grant**, and
  only when `client_secret` is absent from the body. The refresh grant reads the
  secret from the body only. Configure your library for `client_secret_post` and
  it will work on both.
- **Refreshed ID tokens lose their user claims.** The refresh grant does not
  recover the original scope, so it falls back to `openid` and the resulting ID
  token contains only `iss`, `sub`, `aud`, `iat`, `exp` and `osid`. No `nonce`
  either. Cache the claims from the first exchange, or call `/userinfo` after
  refreshing.
- **No refresh token rotation.** The refresh grant returns no new
  `refresh_token`, and the original stays valid for its full 20 days. Reuse
  detection is not possible.
- **No `scope` in the token response.** You cannot tell from the response which
  scopes were actually granted.
- **A refresh token is always issued** on the code grant, whether or not you
  requested `offline_access`. That scope currently has no effect.
- **`401` for client and grant errors** instead of `400`, and no
  `WWW-Authenticate` header.

## Userinfo

- **Non-standard claim names.** `firstName`, `lastName`, `userId` instead of
  `given_name`, `family_name`. Generic clients that map userinfo onto a profile
  object will come back mostly empty apart from `sub` and `email`.
- **Scope is not enforced.** Email and name fields are returned even for a bare
  `openid` grant. Do not infer consent from the response.
- **Accepts any HTTP method.** Harmless, but a `DELETE` will happily return the
  profile.

## Revocation and logout

- **`/api/oauth/revoke` always returns `200 { "success": true }`**, before it has
  checked anything. A bad token or a wrong secret is indistinguishable from
  success.
- **Refresh tokens cannot be revoked.** Revocation only removes the access
  token's session. A leaked refresh token keeps working for up to 20 days, and
  there is no API to kill it. Ask the user to remove the app from
  `/oidc/apps/authorized` if you need to cut access off.
- **`/api/oauth/logout` does not validate `post_logout_redirect_uri`** against
  the client, and redirects before checking `id_token_hint`. Never build a link
  to it from untrusted input.
- **Logout does not end the ONEIDP session.** Only the OAuth session tied to that
  ID token ends. The user's IdP browser session survives, so the next
  `/authorize` signs them straight back in. Clear your own session first and do
  not rely on this endpoint for a full sign-out.
- **No front-channel or back-channel logout.** If ONEIDP ends a session, your
  application is not notified.

## Not implemented

Dynamic client registration (RFC 7591), token introspection (RFC 7662), pushed
authorization requests, JAR / JARM, DPoP, mutual TLS client auth, private key JWT
client auth, the device authorization grant, the client credentials grant, and
resource indicators (RFC 8707).

`/api/oauth/check_token` covers the introspection use case for access tokens, but
returns only a boolean and no claims.

## Keys and algorithms

`RS256` only, one static keypair per instance, no rotation and no second key
during a changeover. Rotating means replacing `JWT_PRIVATE_KEY` /
`JWT_PUBLIC_KEY` and invalidating every token and session at once. Cache the
JWKS, but honour cache headers so a rotation is picked up.

## Rate limiting

The OAuth endpoints are not rate limited in the application. Only
`/api/auth/invitation` and `/api/admin` are. Hosted deployments sit behind API
Gateway throttling. Do not treat the IdP as an infinite resource: cache the
discovery document and JWKS, and avoid calling `/userinfo` on every request.

## Operational states to expect

An instance can be put into maintenance mode, which locks non-admin users out of
login with `503`. Registration, social login, password reset, and self-service app
creation can each be switched off instance-wide. Users can also be banned, which
revokes their sessions immediately. In all of these cases your `/authorize`
redirect lands the user on an ONEIDP page rather than returning to your callback,
so handle the case where a login simply never comes back.

## Session behaviour worth knowing

- ONEIDP browser sessions last 14 days and slide forward while the user is
  active.
- MFA (TOTP) and passkeys are handled entirely inside the IdP login flow. There
  is no `acr` or `amr` claim, so you cannot tell from a token how the user
  authenticated. The `mfaEnabled` claim tells you whether the account has TOTP
  configured, not whether it was used for this login.
- Access tokens are tied to a server-side session record whose TTL equals
  `accessTokenValidity`. Local JWT validation stays valid after the session is
  gone; see [tokens.md](./tokens.md#access-token).
