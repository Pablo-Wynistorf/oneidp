# Quickstart

From nothing to a signed-in user. Uses `https://oneidp.ch` as the instance;
substitute your own base URL if you self-host.

## 1. Register a client

Sign in to ONEIDP and open **`/oidc/apps`** (Dashboard → OIDC → Applications).
Create an application with:

| Field | Value |
| --- | --- |
| Name | `my-app` (letters, digits, `-` and `.`, up to 30 characters) |
| Redirect URI | `https://yourapp.example.com/callback` — exactly one, exact match |
| Access token validity | `3600` (seconds, max 1728000) |
| Public client | Off for a server-side app, on for a browser or native app |

You get a `client_id`, and a `client_secret` for confidential clients. The secret
cannot be rotated, so if it leaks you have to create a new application.

Only accounts with the app management capability see this page. If it is missing,
ask an instance administrator to grant it.

An administrator can also switch self-service registration off instance-wide.

## 2. Which flow do you need?

| Your app | Client type | Flow |
| --- | --- | --- |
| Server-rendered web app, or an SPA with a backend | Confidential | Code flow, secret in the body. PKCE optional but recommended |
| Mobile or desktop app | Public | Code flow + PKCE, no secret |
| Browser-only SPA with no backend | Public | Code flow + PKCE, **but see the [CORS limitation](./notes-and-limitations.md#cors)**: cross-origin calls to `/token` are blocked. You need a small backend |

Refresh tokens require a client secret, so public clients cannot refresh. They
re-run the authorize flow instead, which is silent while the ONEIDP session is
alive.

## 3. Express + openid-client

```bash
npm install express openid-client express-session
```

```js
import express from 'express';
import session from 'express-session';
import * as client from 'openid-client';

const app = express();
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: true },
}));

const REDIRECT_URI = 'https://yourapp.example.com/callback';

// Reads /.well-known/openid-configuration once at startup.
const config = await client.discovery(
  new URL('https://oneidp.ch'),
  process.env.ONEIDP_CLIENT_ID,
  process.env.ONEIDP_CLIENT_SECRET,
);

app.get('/login', async (req, res) => {
  const codeVerifier = client.randomPKCECodeVerifier();

  req.session.oidc = {
    codeVerifier,
    state: client.randomState(),
    nonce: client.randomNonce(),
  };

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email',
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    state: req.session.oidc.state,
    nonce: req.session.oidc.nonce,
  });

  res.redirect(url.href);
});

app.get('/callback', async (req, res) => {
  const pending = req.session.oidc;
  if (!pending) return res.status(400).send('No login in progress');
  delete req.session.oidc;

  const tokens = await client.authorizationCodeGrant(
    config,
    new URL(req.originalUrl, 'https://yourapp.example.com'),
    {
      pkceCodeVerifier: pending.codeVerifier,
      expectedState: pending.state,
      expectedNonce: pending.nonce,
    },
  );

  const claims = tokens.claims();

  // `sub` is the only stable identifier. Everything else can change.
  req.session.user = {
    sub: claims.sub,
    email: claims.email,
    name: claims.name,
    roles: claims.roles ?? [],
  };

  // Keep tokens server-side only.
  req.session.tokens = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };

  res.redirect('/');
});

app.get('/logout', (req, res) => {
  const idToken = req.session.tokens?.idToken;
  req.session.destroy(() => {
    const url = new URL('https://oneidp.ch/api/oauth/logout');
    if (idToken) url.searchParams.set('id_token_hint', idToken);
    url.searchParams.set('post_logout_redirect_uri', 'https://yourapp.example.com/');
    res.redirect(url.href);
  });
});

app.listen(3000);
```

Two adjustments if your library enforces strict OIDC:

- Set `response_type=code` explicitly. The discovery document advertises hybrid
  response types that are not implemented.
- Disable any `auth_time` or `at_hash` requirement. ONEIDP does not issue those
  claims.

More runnable examples live at
[Pablo-Wynistorf/oneidp-client-demo](https://github.com/Pablo-Wynistorf/oneidp-client-demo).

## 4. Or do it with curl

Useful for debugging. First generate a PKCE pair:

```bash
CODE_VERIFIER=$(openssl rand -base64 60 | tr -d '\n=+/' | cut -c1-64)
CODE_CHALLENGE=$(printf '%s' "$CODE_VERIFIER" \
  | openssl dgst -binary -sha256 \
  | openssl base64 \
  | tr '+/' '-_' | tr -d '=\n')
echo "verifier=$CODE_VERIFIER challenge=$CODE_CHALLENGE"
```

Open this in a browser, sign in, approve consent, then copy the `code` from the
address bar of the callback:

```
https://oneidp.ch/api/oauth/authorize?client_id=$CLIENT_ID&redirect_uri=https%3A%2F%2Fyourapp.example.com%2Fcallback&response_type=code&scope=openid%20profile%20email&state=test123&nonce=test456&code_challenge=$CODE_CHALLENGE&code_challenge_method=S256
```

You have 20 seconds. Exchange it:

```bash
curl -X POST https://oneidp.ch/api/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d grant_type=authorization_code \
  -d "code=$CODE" \
  -d "code_verifier=$CODE_VERIFIER" \
  -d redirect_uri=https://yourapp.example.com/callback \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET"
```

Then call userinfo:

```bash
curl https://oneidp.ch/api/oauth/userinfo -H "Authorization: Bearer $ACCESS_TOKEN"
```

## Checklist

- [ ] `redirect_uri` matches the registered value byte for byte, including
      trailing slash and port
- [ ] The same `redirect_uri` is sent to both `/authorize` and `/token`
- [ ] The code is exchanged within 20 seconds
- [ ] `state` is generated per request and verified on the callback
- [ ] `nonce` is generated per request and compared against the ID token
- [ ] ID token validated against the JWKS, with `iss` and `aud` checked
- [ ] Users are keyed on `sub`, not email or username
- [ ] Refresh tokens and client secrets never reach the browser
- [ ] `openid profile` requested if you need `roles`
