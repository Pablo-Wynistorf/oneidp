# Tokens, claims, and validation

Every token ONEIDP issues is a JWT signed with `RS256` using the instance's
single RSA keypair. The `kid` in the header matches the one key published at
`/.well-known/jwks.json`.

## Lifetimes

| Token | Lifetime | Notes |
| --- | --- | --- |
| Authorization code | 20 seconds | Single use. Deleted on first exchange, and also deleted when the `redirect_uri` check fails |
| Access token | Per client, `accessTokenValidity` seconds | Set at registration, 0 to 1,728,000 (20 days) |
| ID token | 48 hours | Fixed, independent of the access token |
| Refresh token | 20 days | No rotation, no sliding window |
| ONEIDP browser session | 14 days | Slides forward when the user is active |

The ID token outliving the access token is deliberate but easy to trip over: do
not use the ID token's `exp` to decide when to refresh. Use `expires_in` from the
token response.

## ID token

```json
{
  "iss": "https://oneidp.ch",
  "sub": "482913",
  "aud": "8f2b...c41",
  "iat": 1751279400,
  "exp": 1751452200,
  "nonce": "n-0S6_WzA2Mj",
  "osid": "k8fj3nd0slq2mzx",

  "username": "ada",
  "name": "Ada Lovelace",
  "given_name": "Ada",
  "family_name": "Lovelace",
  "roles": ["admin", "billing"],
  "mfaEnabled": true,

  "email": "ada@example.com"
}
```

| Claim | Present when | Notes |
| --- | --- | --- |
| `iss` | Always | Equals the instance `URL` |
| `sub` | Always | Stable internal user id. The only safe primary key for a user |
| `aud` | Always | Your `client_id` |
| `iat`, `exp` | Always | Seconds since epoch |
| `nonce` | You sent one, on the code exchange | Absent from refreshed ID tokens |
| `osid` | Always | ONEIDP session id. Pass the whole ID token as `id_token_hint` to log out |
| `username`, `name`, `given_name`, `family_name`, `roles`, `mfaEnabled` | `profile` in scope | `name` is `firstName + " " + lastName` |
| `email` | `email` in scope | There is no `email_verified` claim. Users cannot sign in before verifying their email, so a present `email` has been verified |

Not issued: `at_hash`, `auth_time`, `azp`, `acr`, `amr`, `c_hash`,
`email_verified`, `updated_at`, `picture`. If your library requires `auth_time`
or `at_hash`, relax that check.

`sub` is a numeric string. Usernames and email addresses can change, so key your
user records on `sub` and treat everything else as mutable display data.

## Access token

```json
{
  "userId": "482913",
  "osid": "k8fj3nd0slq2mzx",
  "clientId": "8f2b...c41",
  "iss": "https://oneidp.ch",
  "sub": "482913",
  "aud": "8f2b...c41",
  "iat": 1751279400,
  "exp": 1751283000
}
```

The access token is a readable JWT, so an API can verify it locally against the
JWKS and trust `sub`, `iss`, `aud`, and `exp`. It carries no `scope` claim.

There is one caveat: **revocation is session based, not token based**. Ending a
session (via `/api/oauth/revoke` or `/api/oauth/logout`) leaves the JWT
signature valid until it expires. Local validation alone will keep accepting it.
For anything sensitive, or when access tokens are configured with a long
lifetime, add a call to [`/api/oauth/check_token`](./endpoints.md#post-apioauthcheck_token)
or `/api/oauth/userinfo`, both of which check the live session. Short
`accessTokenValidity` values (5 to 15 minutes) keep the exposure window small.

## Refresh token

```json
{
  "userId": "482913",
  "orsid": "p2mx9fj3nd0slq8",
  "clientId": "8f2b...c41",
  "iss": "https://oneidp.ch",
  "sub": "482913",
  "aud": "8f2b...c41",
  "iat": 1751279400,
  "exp": 1753008600
}
```

Store it server-side and treat it as a password-grade secret. It is a bearer
credential for a whole 20 days, cannot be rotated, and cannot be revoked through
the API. Never send it to a browser or a mobile client, and never forward it to a
resource server.

## Validating an ID token

Standard OIDC validation applies:

1. Fetch and cache the JWKS from `/.well-known/jwks.json`.
2. Verify the signature with the key whose `kid` matches the token header.
   Restrict the accepted algorithm to `RS256`.
3. `iss` equals the issuer exactly, including scheme and no trailing slash.
4. `aud` equals your `client_id`.
5. `exp` is in the future.
6. `nonce` matches the one you generated for this authorization request.

With a library, all of that is one call:

```js
import * as client from 'openid-client';

const config = await client.discovery(
  new URL('https://oneidp.ch'),
  process.env.ONEIDP_CLIENT_ID,
  process.env.ONEIDP_CLIENT_SECRET,
);

const tokens = await client.authorizationCodeGrant(config, currentUrl, {
  pkceCodeVerifier: codeVerifier,
  expectedNonce: nonce,
  expectedState: state,
});

const claims = tokens.claims(); // signature, iss, aud, exp, nonce all checked
```

Verifying by hand, for example with `jose`:

```js
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://oneidp.ch/.well-known/jwks.json'));

const { payload } = await jwtVerify(idToken, JWKS, {
  algorithms: ['RS256'],
  issuer: 'https://oneidp.ch',
  audience: process.env.ONEIDP_CLIENT_ID,
});

if (payload.nonce !== expectedNonce) throw new Error('nonce mismatch');
```

## Roles and authorization

`roles` in the ID token and `roles` from `/userinfo` list the roles defined for
your client that the user belongs to. They are plain strings such as `admin`.
Roles are per client, so two applications can both define `admin` without
colliding. Create and assign them from the ONEIDP dashboard or the management API
described in [client-registration.md](./client-registration.md#roles).

Because `roles` only appear when `profile` is granted, request `openid profile`
if your authorization logic depends on them, and fall back to no roles rather
than failing open when the claim is missing.
