# Client registration and management

There is no dynamic client registration (RFC 7591). Clients are created in the
ONEIDP dashboard at **`/oidc/apps`**, or through the management API below.

## The client model

| Field | Type | Notes |
| --- | --- | --- |
| `oauthAppName` | string | Shown on the consent screen. Must match `^[a-zA-Z0-9\-\.]{1,30}$` |
| `oauthClientAppId` | UUID | Internal handle used by the management and role APIs. Treat it as an opaque string. Clients registered before the switch to UUIDs keep their 6-digit ids |
| `clientId` | 64 chars | Public identifier |
| `clientSecret` | 64 chars | Confidential clients only. Returned at creation and by `apps/get`. Cannot be rotated |
| `redirectUri` | string | **Exactly one**, compared with strict equality. Must match `^[a-zA-Z0-9\.:\/_!?-]+$` |
| `accessTokenValidity` | number | Access token lifetime in seconds, 0 to 1728000 (20 days) |
| `isPublicClient` | boolean | Fixed at creation. Cannot be changed later |
| `owner` | userId | The account that created it |

Consequences worth planning for:

- **One redirect URI per client.** Separate environments (local, staging,
  production) need separate clients. There is no wildcard or prefix matching, and
  no query string tolerance.
- **The URI regex rejects `%`, `&`, `=`, `~` and `@`.** A redirect URI cannot
  carry `key=value` query parameters or percent-encoded characters. Keep it to a
  plain path such as `https://yourapp.example.com/callback`.
- **`isPublicClient` is immutable.** Switching a confidential client to public,
  or the reverse, means creating a new client.
- **No secret rotation endpoint.** A leaked secret means a new client.

## Public vs confidential

| | Confidential | Public |
| --- | --- | --- |
| Has `client_secret` | Yes | No |
| Token endpoint auth | `client_secret_post` or `client_secret_basic` | `none` |
| PKCE | Optional, verified when sent | **Required.** Without `code_verifier` the exchange fails with `invalid_grant` |
| Refresh token grant | Yes | No, the grant requires a secret |
| Suitable for | Server-side apps, BFF backends | Mobile and desktop apps |

Browser-only SPAs are the awkward case: they need a public client, but
[CORS blocks cross-origin calls to the token endpoint](./notes-and-limitations.md#cors).
Use a thin backend that holds a confidential client.

## Management API

These endpoints authenticate with the first-party ONEIDP session cookie
(`access_token`), not with client credentials. They are what the dashboard calls,
and they are only usable by accounts with the app management capability. There is
no machine-to-machine path for provisioning clients.

The whole `/api/oauth/settings` prefix requires that capability.

### GET /api/oauth/settings/apps/get

Lists the caller's own applications, including secrets.

```json
{
  "oauthApps": [
    {
      "oauthAppName": "my-app",
      "clientId": "8f2b...c41",
      "clientSecret": "9a7e...b02",
      "isPublicClient": false,
      "redirectUri": "https://yourapp.example.com/callback",
      "oauthClientAppId": "3f1c9a54-8b2e-4d77-9a0f-5c6d2e1b7a48",
      "accessTokenValidity": 3600
    }
  ]
}
```

An account with no applications yet gets `200 { "oauthApps": [] }`, not a 404.

### POST /api/oauth/settings/apps/add

```json
{
  "oauthAppName": "my-app",
  "isPublicClient": false,
  "redirectUri": "https://yourapp.example.com/callback",
  "accessTokenValidity": 3600
}
```

Returns `200` with `clientId`, `oauthClientAppId`, and `clientSecret` for
confidential clients.

### POST /api/oauth/settings/apps/edit

```json
{
  "oauthClientAppId": "3f1c9a54-8b2e-4d77-9a0f-5c6d2e1b7a48",
  "oauthAppName": "my-app",
  "redirectUri": "https://yourapp.example.com/callback",
  "accessTokenValidity": 900
}
```

All four fields are required. `isPublicClient` and `clientSecret` cannot be
changed.

### POST /api/oauth/settings/apps/delete

Body `{ "oauthClientAppId": "3f1c9a54-8b2e-4d77-9a0f-5c6d2e1b7a48" }`.

### Status codes

These routes use non-standard codes:

| Status | Meaning |
| --- | --- |
| `403` | Self-service app creation is disabled instance-wide |
| `460` | Validation failure on name, redirect URI, or token validity |
| `465` | The account does not own the app |
| `401` | Session expired |

## Roles

Roles are per client, so `admin` in one application is unrelated to `admin` in
another. Assigned roles appear as the `roles` claim in the ID token (with
`profile` scope) and in the `/userinfo` response.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/oauth/settings/roles/get` | List roles for an app |
| `POST /api/oauth/settings/roles/add` | Body `{ oauthClientAppId, oauthRoleName }`. Name must match `^[a-zA-Z0-9\-_\. ]{1,40}$` |
| `GET /api/oauth/settings/roles/get-users` | Members of a role |
| `POST /api/oauth/settings/roles/update/add-user` | Add a member |
| `POST /api/oauth/settings/roles/update/remove-user` | Remove a member |
| `POST /api/oauth/settings/roles/update/bulk-update` | Replace the member list |
| `POST /api/oauth/settings/roles/delete` | Delete a role |

Role ids follow the pattern `uri:oneidp:oauth::<oauthClientAppId>:role/<lowercased name>`.
Adding the member `*` grants the role to every user of the instance.

Role additions apply to tokens issued from then on. A user who gains a role keeps
their old claims until their access token expires or they authorize again.

## Consent

Consent is per client and remembered. The user sees the consent screen the first
time your client asks for authorization, and again whenever you request a scope
they have not already approved. Adding a scope to an existing integration
therefore triggers a fresh prompt rather than silently failing.

Users can review and revoke grants at `/oidc/apps/authorized`. Revoking removes
the consent record, so the next `/authorize` prompts again. It does not
invalidate tokens that are already out there.
