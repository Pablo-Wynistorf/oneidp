/**
 * Error types.
 *
 * ONEIDP returns three different error shapes depending on the endpoint:
 *
 *   { error: 'invalid_grant', error_description: '...' }   // token, revoke, logout
 *   { error: 'Invalid Request', error_description: '...' }  // authorize, some scope checks
 *   { success: false, error: 'Access Token is invalid' }    // userinfo, check_token
 *
 * and it uses 401 where the specs call for 400. Everything here funnels those
 * into one `OneidpError` with a normalised snake_case `code`, so callers can
 * branch on `err.code` without caring which endpoint produced it.
 */

/** Base class. Catch this to catch anything the SDK throws deliberately. */
export class OneidpError extends Error {
  constructor(message, { code = 'oneidp_error', status, hint, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'OneidpError';
    this.code = code;
    if (status !== undefined) this.status = status;
    if (hint) this.hint = hint;
  }

  /** Message plus the hint, for logs. */
  toString() {
    return this.hint ? `${this.name}: ${this.message} (${this.hint})` : `${this.name}: ${this.message}`;
  }
}

/** Bad SDK options. Always thrown at setup time, never per request. */
export class ConfigurationError extends OneidpError {
  constructor(message, options = {}) {
    super(message, { code: 'configuration_error', ...options });
    this.name = 'ConfigurationError';
  }
}

/** Discovery document or JWKS could not be loaded. */
export class DiscoveryError extends OneidpError {
  constructor(message, options = {}) {
    super(message, { code: 'discovery_error', ...options });
    this.name = 'DiscoveryError';
  }
}

/** The token endpoint refused the request. `code` is the OAuth error code. */
export class TokenError extends OneidpError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'TokenError';
  }
}

/** An ID token failed signature, issuer, audience, expiry or nonce checks. */
export class IdTokenError extends OneidpError {
  constructor(message, options = {}) {
    super(message, { code: 'invalid_id_token', ...options });
    this.name = 'IdTokenError';
  }
}

/** The callback request itself was wrong: no code, unknown state, stale login. */
export class CallbackError extends OneidpError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'CallbackError';
  }
}

/** userinfo, check_token or revoke failed. */
export class ApiError extends OneidpError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ApiError';
  }
}

/**
 * `Invalid Request` -> `invalid_request`, so a caller can switch on `err.code`
 * without special-casing ONEIDP's mixed conventions.
 */
function normaliseCode(raw, fallback) {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Extra context for the failures that are easy to misdiagnose. Each one maps to
 * a documented ONEIDP behaviour rather than a generic OAuth mistake, which is
 * exactly where time gets lost debugging.
 */
const HINTS = [
  {
    when: (code, description) => code === 'invalid_grant' && /expired authorization code/i.test(description),
    hint:
      'ONEIDP authorization codes live for 20 seconds and are single use. A slow callback, a retry, ' +
      'or a debugger breakpoint will exceed that. Also check the code is not being exchanged twice.',
  },
  {
    when: (code, description) => code === 'invalid_request' && /redirect_uri/i.test(description),
    hint:
      'The redirect_uri sent to /token must be byte-for-byte identical to the one sent to /authorize ' +
      'and to the single URI registered for the client. The code has now been consumed, so restart the flow.',
  },
  {
    when: (code, description) => code === 'invalid_grant' && /must use PKCE/i.test(description),
    hint: 'Public clients must send code_verifier. Leave `pkce` enabled, or register a confidential client.',
  },
  {
    when: (code) => code === 'unauthorized_client',
    hint:
      'ONEIDP disables a client when its owner loses the app management capability or is suspended. ' +
      'An instance administrator has to restore the owner account.',
  },
  {
    when: (code, description) => code === 'invalid_client' && /client_secret is required/i.test(description),
    hint: 'This client is registered as confidential, so `clientSecret` is required.',
  },
  {
    when: (code) => code === 'invalid_client',
    hint:
      'clientId/clientSecret pair not recognised. Secrets cannot be rotated in ONEIDP, so confirm the ' +
      'values against the dashboard rather than assuming a stale secret.',
  },
  {
    when: (code, description) => code === 'invalid_grant' && /refresh token/i.test(description),
    hint:
      'Refresh tokens last 20 days and are not rotated, but the server-side session behind one can be ' +
      'gone. Send the user through the login flow again.',
  },
];

function hintFor(code, description) {
  const text = description ?? '';
  return HINTS.find((entry) => entry.when(code, text))?.hint;
}

/**
 * Build an error from a non-2xx ONEIDP response body.
 *
 * @param {Response} response
 * @param {unknown} body Parsed JSON body, or a string when parsing failed.
 * @param {{ fallbackCode?: string, ErrorClass?: typeof OneidpError, context?: string }} [options]
 */
export function errorFromResponse(response, body, options = {}) {
  const { fallbackCode = 'oneidp_error', ErrorClass = OneidpError, context } = options;

  const payload = body && typeof body === 'object' ? body : {};
  const code = normaliseCode(payload.error, fallbackCode);
  const description =
    payload.error_description ??
    payload.description ??
    // userinfo/check_token put the human message in `error` alongside success:false.
    (typeof payload.error === 'string' && payload.error.includes(' ') ? payload.error : undefined) ??
    (typeof body === 'string' && body.trim() !== '' ? body.trim().slice(0, 200) : undefined) ??
    `HTTP ${response.status}`;

  const message = context ? `${context}: ${description}` : description;

  return new ErrorClass(message, {
    code,
    status: response.status,
    hint: hintFor(code, description),
  });
}
