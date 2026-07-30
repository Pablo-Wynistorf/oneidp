/**
 * Thin fetch wrapper around the ONEIDP API.
 *
 * The SPA is served from S3/CloudFront and the API is exposed through the same
 * CloudFront distribution under /api, so requests stay same-origin and the
 * httpOnly `access_token` cookie is sent automatically.
 *
 * Several API routes answer an expired session with `res.redirect('/login')`
 * rather than a 401. `fetch` follows that redirect transparently and hands us
 * the SPA's index.html, which would otherwise surface as a confusing JSON parse
 * error. `detectSessionLoss` catches that case (the response reports
 * `redirected` with a non-API final URL) and turns it back into a proper
 * unauthenticated signal.
 *
 * An HTML body *without* a redirect is a different animal: it means something
 * between us and Express (a CDN error page, a misrouted path) swallowed the
 * real response. That is never treated as session loss, because doing so signs
 * a perfectly valid session out.
 */

/** Raised when the API reports a non-2xx status. Carries `status` and `body`. */
export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Raised when the session is gone.
 *
 * Callers do not have to act on this: every occurrence also notifies the
 * `onSessionLoss` subscribers, and `SessionProvider` uses that to flip the app
 * to anonymous so the route guards redirect to /login. Catch it only to skip
 * the inline error state you would otherwise render on the way out.
 */
export class SessionExpiredError extends ApiError {
  constructor() {
    super('Session expired', { status: 401 });
    this.name = 'SessionExpiredError';
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const sessionLossListeners = new Set();

/**
 * Subscribe to session loss. Called once per failed request, so listeners must
 * be idempotent.
 *
 * @param {() => void} listener
 * @returns {() => void} Unsubscribe.
 */
export function onSessionLoss(listener) {
  sessionLossListeners.add(listener);
  return () => {
    sessionLossListeners.delete(listener);
  };
}

function reportSessionLoss() {
  for (const listener of [...sessionLossListeners]) {
    try {
      listener();
    } catch (error) {
      console.error('Session loss listener failed', error);
    }
  }
}

function detectSessionLoss(response) {
  // Redirected away from /api/* means an auth guard sent us to a page route.
  if (response.redirected && !new URL(response.url).pathname.startsWith('/api/')) {
    return true;
  }
  return response.status === 401;
}

function isHtml(response) {
  return (response.headers.get('content-type') || '').includes('text/html');
}

async function readBody(response) {
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  const text = await response.text();
  return text || null;
}

/**
 * Perform an API request.
 *
 * @param {string} path Absolute API path, e.g. `/api/auth/login`.
 * @param {object} [options]
 * @param {string} [options.method='GET']
 * @param {unknown} [options.body] Serialised as JSON when present.
 * @param {number[]} [options.expect] Extra non-2xx statuses to return instead
 *   of throwing. Used for the API's semantic 460-464 codes.
 * @returns {Promise<{ status: number, ok: boolean, data: unknown }>}
 */
export async function request(path, { method = 'GET', body, expect = [], signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : JSON_HEADERS,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Network request failed');
  }

  if (detectSessionLoss(response)) {
    reportSessionLoss();
    throw new SessionExpiredError();
  }

  // HTML from a JSON endpoint that was not redirected: an edge/proxy error page
  // stood in for the API. Surface it as a request failure so the page shows an
  // error, instead of mistaking it for an expired session and signing out.
  if (isHtml(response)) {
    throw new ApiError('The API returned an unexpected response', {
      status: response.status,
    });
  }

  const data = await readBody(response);

  if (!response.ok && !expect.includes(response.status)) {
    const message =
      (data && typeof data === 'object' && (data.error || data.message)) ||
      (typeof data === 'string' && data) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, { status: response.status, body: data });
  }

  return { status: response.status, ok: response.ok, data };
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  del: (path, body, options) => request(path, { ...options, method: 'DELETE', body }),
};
