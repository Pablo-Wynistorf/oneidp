# Endpoint reference

All paths are relative to the instance base URL (`https://oneidp.ch` on the
hosted instance).

- [GET /.well-known/openid-configuration](#get-well-knownopenid-configuration)
- [GET /.well-known/jwks.json](#get-well-knownjwksjson)
- [GET /api/oauth/authorize](#get-apioauthauthorize)
- [POST /api/oauth/token](#post-apioauthtoken)
- [/api/oauth/userinfo](#apioauthuserinfo)
- [POST /api/oauth/revoke](#post-apioauthrevoke)
- [/api/oauth/logout](#apioauthlogout)
- [POST /api/oauth/check_token](#post-apioauthcheck_token)
- [GET /api/oauth/users/search](#get-apioauthuserssearch)
- [End-user consent management](#end-user-consent-management)

---

## GET /.well-known/openid-configuration

Provider metadata. No parameters, no authentication, CORS open to `*`.

Returns `200` with the metadata document shown in the [README](./README.md#discovery).

Two fields are worth ignoring: `response_types_supported` advertises the
implicit and hybrid combinations, and `token_endpoint_auth_signing_alg_values_supported`
suggests private key JWT client auth. Neither is implemented. Only
`response_type=code` works. Some strict client libraries pick a hybrid flow when
they see those values, so configure `response_type` explicitly.

## GET /.well-known/jwks.json

The public signing keys, for verifying ID tokens and access tokens. No
parameters, no authentication, CORS open to `*`.

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "ZmE4...",
      "n": "sXch...",
      "e": "AQAB"
    }
  ]
}
```

There is exactly one key. It is derived from the instance's static RSA keypair,
so the `kid` is stable and there is no rotation. Caching is still recommended.

| Status | Body | Meaning |
| --- | --- | --- |
| `200` | `{ "keys": [ ... ] }` | Success |
| `500` | `{ "error": "JWKS not available" }` | The key failed to load, or the request hit a cold start before initialisation finished. Retry |

---

## GET /api/oauth/authorize

Starts the flow. This is a **browser navigation**, not an API call. Redirect the
user's browser here, or open it in a system browser for a native app. Never fetch
it with XHR.

### Query parameters

| Parameter | Required | Notes |
| --- | --- | --- |
| `client_id` | Yes | From client registration |
| `redirect_uri` | Yes | Must match the client's single registered URI **byte for byte** |
| `scope` | No | Space separated. Defaults to `openid`. Allowed: `openid`, `profile`, `email`, `offline_access` |
| `state` | Recommended | Echoed back on the redirect. Use it for CSRF protection |
| `nonce` | Recommended | Copied into the `nonce` claim of the ID token |
| `code_challenge` | For public clients | Base64url of `SHA-256(code_verifier)` |
| `code_challenge_method` | With `code_challenge` | Must be `S256` |
| `response_type` | Ignored | Not read by the server. Send `code` anyway for library compatibility |

`prompt`, `max_age`, `login_hint`, `ui_locales`, `response_mode`, `display` and
`acr_values` are not implemented and are silently ignored.

### What the user sees

1. **No active ONEIDP session** — `302` to `/login?redirectUri=<the original authorize URL>`.
   After signing in (password, TOTP, passkey, Google, or GitHub) the user is sent
   back to `/api/oauth/authorize` automatically.
2. **No consent yet, or newly requested scopes** — `302` to `/consent?...`. The
   consent screen records the grant and then re-enters the authorize endpoint.
   Consent is remembered per client, so this only appears once unless you ask for
   a scope the user has not already approved.
3. **Session and consent both present** — an authorization code is issued
   immediately.

### Success response

```
302 Found
Location: https://yourapp.example.com/callback?code=<32 chars>&state=<state>
```

`state` is appended only if you sent one. The code is single use and expires
**20 seconds** after issuance, so exchange it right away.

### Error responses

Errors are returned as JSON in the browser. They are **not** redirected back to
your `redirect_uri` as `?error=...`, which is what the OAuth spec calls for. Your
callback handler will never see an error from this endpoint.

| Status | `error` | `error_description` |
| --- | --- | --- |
| `400` | `Invalid Request` | `No client_id provided` |
| `400` | `Invalid Request` | `No redirect_uri provided` |
| `400` | `Invalid Request` | `Invalid scope(s) provided: <list>` |
| `401` | `Invalid Request` | `Invalid client_id provided` |
| `405` | `Invalid Request` | `Provided redirect_uri not allowed` |
| `500` | `Server Error` | `Something went wrong on our site. Please try again later` |

### Example

```
https://oneidp.ch/api/oauth/authorize
  ?client_id=8f2b...c41
  &redirect_uri=https%3A%2F%2Fyourapp.example.com%2Fcallback
  &response_type=code
  &scope=openid%20profile%20email
  &state=xyzABC123
  &nonce=n-0S6_WzA2Mj
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
```

---

## POST /api/oauth/token

Exchanges an authorization code for tokens, or refreshes an access token.

Accepts both `application/x-www-form-urlencoded` (the spec's content type, and
what every library sends) and `application/json`.

### Client authentication

| Method | How |
| --- | --- |
| `client_secret_post` | `client_id` and `client_secret` in the body |
| `client_secret_basic` | `Authorization: Basic base64(client_id:client_secret)`. Only honoured on the `authorization_code` grant, and only when `client_secret` is absent from the body |
| `none` | Public clients: `client_id` in the body, no secret, PKCE required |

### grant_type=authorization_code

| Parameter | Required | Notes |
| --- | --- | --- |
| `grant_type` | Yes | `authorization_code` |
| `code` | Yes | From the authorize redirect |
| `redirect_uri` | Yes | Must equal the value used in the authorize request |
| `client_id` | Yes | Unless supplied via Basic auth |
| `client_secret` | Confidential clients | Unless supplied via Basic auth |
| `code_verifier` | Public clients | The original PKCE verifier. Optional for confidential clients, verified if sent |

```bash
curl -X POST https://oneidp.ch/api/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d grant_type=authorization_code \
  -d code=k3j4h5g6f7d8s9a0q1w2e3r4t5y6u7i8 \
  -d redirect_uri=https://yourapp.example.com/callback \
  -d client_id=8f2b...c41 \
  -d client_secret=9a7e...b02
```

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsIn...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "id_token": "eyJhbGciOiJSUzI1NiIsIn...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIsIn..."
}
```

`expires_in` is the client's configured `accessTokenValidity` in seconds. There
is no `scope` field in the response. A `refresh_token` is always issued on this
grant, whether or not you asked for `offline_access`.

### grant_type=refresh_token

| Parameter | Required | Notes |
| --- | --- | --- |
| `grant_type` | Yes | `refresh_token` |
| `refresh_token` | Yes | From an earlier code exchange |
| `client_id` | Yes | Read from the token itself, but send it anyway |
| `client_secret` | Yes | **Required.** Public clients cannot refresh |

```bash
curl -X POST https://oneidp.ch/api/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d grant_type=refresh_token \
  -d refresh_token=eyJhbGciOiJSUzI1NiIsIn... \
  -d client_id=8f2b...c41 \
  -d client_secret=9a7e...b02
```

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsIn...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "id_token": "eyJhbGciOiJSUzI1NiIsIn..."
}
```

No new refresh token is returned. There is no rotation: the original refresh
token stays valid for its full 20 days. Two behaviours to plan around:

- The refreshed **ID token carries only the base claims** (`iss`, `sub`, `aud`,
  `iat`, `exp`, `osid`). `profile` and `email` claims are dropped, and `nonce` is
  absent. Treat the ID token from the first exchange as the source of user
  attributes, or call `/userinfo` after refreshing.
- Basic auth is not parsed on this grant. Send the secret in the body.

### Error responses

All errors are JSON. Most use standard OAuth error codes.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `unsupported_grant_type` | `grant_type` is anything other than the two supported values |
| `400` | `invalid_request` | `client_id` missing |
| `400` | `invalid_request` | `redirect_uri` missing or different from the authorize request. The code is consumed |
| `400` | `invalid_request` | `code_challenge_method` was not `S256` |
| `400` | `Invalid Request` | Invalid scope stored on the code. Note the non-standard code |
| `401` | `invalid_client` | Wrong `client_id`/`client_secret` pair, or no public client with that id |
| `401` | `invalid_client` | `client_secret is required for confidential clients` |
| `401` | `invalid_grant` | `Invalid or expired authorization code` (20 s TTL, single use) |
| `401` | `invalid_grant` | `Code verifier does not match code challenge` |
| `401` | `invalid_grant` | `Public clients must use PKCE` |
| `401` | `invalid_grant` | `Invalid refresh token provided` |
| `401` | `invalid_grant` | `Refresh Token is invalid or expired` (server-side session gone) |
| `401` | `invalid_grant` | `User not found` |
| `500` | `server_error` | Unexpected failure |

Note that `invalid_client` and `invalid_grant` come back as `401` rather than
`400`, and without a `WWW-Authenticate` header.

---

## /api/oauth/userinfo

Claims about the signed-in user. Accepts **any** HTTP method; use `GET`.

### Request

```bash
curl https://oneidp.ch/api/oauth/userinfo \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsIn...'
```

The token is read from the `Authorization: Bearer` header, falling back to the
`access_token` cookie. Every call checks the server-side session, so a revoked or
logged-out token fails here even while its JWT signature is still valid.

### Response `200`

```json
{
  "sub": "482913",
  "userId": "482913",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada",
  "email": "ada@example.com",
  "roles": ["admin", "billing"],
  "mfaEnabled": true
}
```

`sub` and `userId` hold the same value. The other names are ONEIDP specific
rather than the standard `given_name` / `family_name` / `preferred_username`, so
generic OIDC clients will not map them automatically. Content type is
`application/json`; signed or encrypted userinfo responses are not supported.

The response **ignores the granted scope**: `email` and the name fields come back
even for a plain `openid` grant. Do not treat the presence of a field as proof of
consent.

`roles` are the roles defined for *your* client that the user is a member of,
including roles assigned to all users. See
[client-registration.md](./client-registration.md#roles).

### Errors

| Status | Body |
| --- | --- |
| `400` | `{ "success": false, "error": "Access Token not provided" }` |
| `401` | `{ "success": false, "error": "Access Token is invalid" }` (bad signature, expired, or session ended) |
| `401` | `{ "success": false, "error": "Error retrieving userdata" }` |
| `500` | `{ "error": "Something went wrong, try again later" }` |

---

## POST /api/oauth/revoke

Ends the session behind an access token.

| Parameter | Required | Notes |
| --- | --- | --- |
| `token` | Yes | The access token to revoke |
| `client_secret` | Yes | In the body, or as the password half of `Authorization: Basic` |

```bash
curl -X POST https://oneidp.ch/api/oauth/revoke \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d token=eyJhbGciOiJSUzI1NiIsIn... \
  -d client_secret=9a7e...b02
```

`token_type_hint` is not supported.

### Response

```
200 { "success": true }
```

The endpoint returns `200` before it has finished validating, so **the response
tells you nothing about whether revocation succeeded**. An invalid token, a wrong
secret, and a successful revocation all look identical. Verify with
[`/api/oauth/check_token`](#post-apioauthcheck_token) if you need certainty.

Only the access token's session is deleted. **Refresh tokens are not revoked
here**, and there is no way to revoke one through the API. A refresh token
therefore keeps minting new access tokens for up to 20 days. If you need to cut
off a user completely, have them revoke the app from their ONEIDP account under
*Authorized apps* (`DELETE /api/oauth/user-consents/:clientId`), which removes
the consent record.

---

## /api/oauth/logout

RP-initiated logout (`end_session_endpoint`). Accepts any HTTP method; navigate
the browser here.

| Parameter | Required | Notes |
| --- | --- | --- |
| `id_token_hint` | Yes | An ID token previously issued to this client |
| `post_logout_redirect_uri` | Yes in practice | Where to send the user afterwards |

```
https://oneidp.ch/api/oauth/logout
  ?id_token_hint=eyJhbGciOiJSUzI1NiIsIn...
  &post_logout_redirect_uri=https%3A%2F%2Fyourapp.example.com%2F
```

`client_id` and `state` are not supported.

### Behaviour

`400 { "error": "invalid_request", "error_description": "Token not provided" }`
if `id_token_hint` is missing. Otherwise the user is redirected to
`post_logout_redirect_uri` immediately, and the session teardown happens
asynchronously. Consequences:

- `post_logout_redirect_uri` is **not validated** against the registered client.
  Do not build links to this endpoint from untrusted input.
- The redirect happens even if the `id_token_hint` is invalid.
- Only the OAuth session tied to that ID token's `osid` is ended. The user's
  ONEIDP browser session survives, so a fresh `/authorize` will sign them
  straight back in without a password prompt. Refresh tokens survive as well.

Clear your own application session first, and treat this endpoint as a
best-effort extra.

---

## POST /api/oauth/check_token

Non-standard, and not advertised in the discovery document. Tells you whether an
access token is still live, which the signature alone cannot: sessions can be
ended server-side before the JWT expires.

```bash
curl -X POST https://oneidp.ch/api/oauth/check_token \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsIn...'
```

| Status | Body |
| --- | --- |
| `200` | `{ "success": true, "description": "Access Token is valid" }` |
| `400` | `{ "success": false, "error": "Access Token not provided" }` |
| `401` | `{ "success": false, "description": "Access Token invalid" }` |
| `401` | `{ "success": false, "error": "Access Token is invalid" }` when the session has ended |

No client authentication and no claims in the response. It is not RFC 7662
introspection: if you need claims, call `/userinfo`.

---

## GET /api/oauth/users/search

Looks up usernames, so an application can build a user picker. Authenticated with
either an OAuth access token or a first-party session cookie.

| Parameter | Required | Notes |
| --- | --- | --- |
| `query` | Yes | Case-insensitive regex match against `username` and `userId` |
| `oauthClientAppId` | Recommended | Restricts results to users who have consented to that app |

```bash
curl 'https://oneidp.ch/api/oauth/users/search?query=ad&oauthClientAppId=3f1c9a54-8b2e-4d77-9a0f-5c6d2e1b7a48' \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsIn...'
```

```json
{ "success": true, "userName": ["ada", "adam"] }
```

Without `oauthClientAppId` the search covers **every user on the instance**, not
just your app's users. Always scope it.

---

## End-user consent management

These endpoints back the ONEIDP account UI. They authenticate with the
first-party `access_token` cookie, not with your client credentials, so they are
only relevant if you are building against the ONEIDP frontend.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/oauth/consent/app-info?client_id=` | `{ appName, clientId, redirectUri }` for the consent screen |
| `POST /api/oauth/consent` | Body `{ client_id, scope, action: "approve" }`. Records the grant. Does not issue a code: the SPA re-enters `/authorize` afterwards |
| `GET /api/oauth/user-consents` | `{ apps: [{ appName, clientId, redirectUri, consentedScopes, firstAuthAt, lastAuthAt }] }` |
| `DELETE /api/oauth/user-consents/:clientId` | Revokes a grant. The user must consent again on the next authorize |
