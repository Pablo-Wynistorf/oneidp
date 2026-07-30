# ONEIDP integration docs

Everything you need to add "Sign in with ONEIDP" to an application.

These files are also served by every ONEIDP instance under `/docs`
(for example <https://oneidp.ch/docs>), so editing the markdown here updates the
rendered documentation.

ONEIDP is an OpenID Connect provider. It implements the **authorization code flow**
(with and without PKCE) and the **refresh token grant**. If your language has an
OIDC client library, point it at the discovery document and you are mostly done.

| Document | What is in it |
| --- | --- |
| [quickstart.md](./quickstart.md) | Register a client and complete a login in ~10 minutes |
| [endpoints.md](./endpoints.md) | Full reference for every OIDC endpoint: parameters, responses, errors |
| [tokens.md](./tokens.md) | Token formats, claims, lifetimes, and how to validate them |
| [client-registration.md](./client-registration.md) | Client types, the management API, roles |
| [notes-and-limitations.md](./notes-and-limitations.md) | Where ONEIDP deviates from the specs. Read this before you debug |

## Base URL

Every path in these docs is relative to the instance you are using. The hosted
instance is:

```
https://oneidp.ch
```

For a self-hosted instance the base URL is whatever you set the `URL`
environment variable to. That value is also the `iss` (issuer) claim in every
token, so it must match exactly, including scheme and no trailing slash.

## Discovery

```
GET https://oneidp.ch/.well-known/openid-configuration
```

```json
{
  "issuer": "https://oneidp.ch",
  "authorization_endpoint": "https://oneidp.ch/api/oauth/authorize",
  "token_endpoint": "https://oneidp.ch/api/oauth/token",
  "userinfo_endpoint": "https://oneidp.ch/api/oauth/userinfo",
  "end_session_endpoint": "https://oneidp.ch/api/oauth/logout",
  "revocation_endpoint": "https://oneidp.ch/api/oauth/revoke",
  "jwks_uri": "https://oneidp.ch/.well-known/jwks.json",
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["openid", "profile", "email", "offline_access"],
  "token_endpoint_auth_methods_supported": [
    "client_secret_post",
    "client_secret_basic",
    "none"
  ],
  "id_token_signing_alg_values_supported": ["RS256"],
  "subject_types_supported": ["public"]
}
```

Both `.well-known` endpoints allow CORS from any origin. The OAuth endpoints do
not: see [notes-and-limitations.md](./notes-and-limitations.md#cors).

## The flow at a glance

```
Your app                      ONEIDP                          User
   |                             |                              |
   | 1. redirect to /authorize   |                              |
   |---------------------------->| not signed in? -> /login --->|
   |                             | no consent yet? -> /consent ->|
   |                             |                              |
   | 2. 302 back to redirect_uri with ?code=...&state=...        |
   |<----------------------------|                              |
   |                             |                              |
   | 3. POST /token (code + client auth [+ code_verifier])       |
   |---------------------------->|                              |
   | 4. access_token, id_token, refresh_token                    |
   |<----------------------------|                              |
   |                             |                              |
   | 5. GET /userinfo (Bearer access_token)                      |
   |---------------------------->|                              |
```

Steps for signing the user in and for the consent screen are handled entirely by
ONEIDP. Your application only needs to build the redirect in step 1 and handle
the callback in steps 2-4.

## Supported at a glance

| Feature | Status |
| --- | --- |
| Authorization code flow | Yes |
| PKCE (`S256`) | Yes. Required for public clients |
| PKCE (`plain`) | No |
| Refresh token grant | Yes, confidential clients only |
| Implicit / hybrid flows | No |
| Client credentials, device code, ROPC | No |
| Dynamic client registration | No |
| Token introspection (RFC 7662) | No. A non-standard `/api/oauth/check_token` exists |
| Token revocation | Partial, see [endpoints.md](./endpoints.md#post-apioauthrevoke) |
| RP-initiated logout | Partial, see [endpoints.md](./endpoints.md#apioauthlogout) |
| Front/back-channel logout | No |
| Multiple redirect URIs per client | No, exactly one |
| Signing algorithms | `RS256` only |
