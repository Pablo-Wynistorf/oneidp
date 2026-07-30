/**
 * `redirectUri` handling for the auth pages.
 *
 * The API hands us URLs like
 *   /login?redirectUri=https://idp.example/api/oauth/authorize?client_id=x&scope=openid
 * where the target itself contains an unencoded query string. `URLSearchParams`
 * would truncate that at the first `&`, so we deliberately take the raw
 * substring from `redirectUri=` to the end of the search string — matching the
 * behaviour the previous frontend relied on.
 */

const ABSENT = new Set(['', 'null', 'undefined']);

/** Extract the raw redirect target from a `?search` string, or null. */
export function readRedirectUri(search = window.location.search) {
  if (!search) return null;
  const marker = 'redirectUri=';
  const at = search.indexOf(marker);
  if (at === -1) return null;
  const raw = search.substring(at + marker.length);
  return ABSENT.has(raw) ? null : raw;
}

/** Append the current redirectUri to an internal path, when one is present. */
export function withRedirectUri(path, redirectUri = readRedirectUri()) {
  if (!redirectUri) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}redirectUri=${redirectUri}`;
}

/**
 * Leave the SPA for a post-login destination.
 *
 * The target is usually an absolute URL on our own origin (the OAuth authorize
 * endpoint) or a plain path, so a full navigation is required rather than a
 * client-side route change. Anything pointing at a different origin is
 * rejected and replaced with the fallback, so a crafted `redirectUri` cannot
 * be used to bounce a freshly authenticated user off-site.
 */
export function leaveTo(redirectUri, fallback = '/dashboard') {
  const target = safeInternalTarget(redirectUri) || fallback;
  window.location.assign(target);
}

/** Return `value` if it resolves to a same-origin URL, else null. */
export function safeInternalTarget(value) {
  if (!value || ABSENT.has(value)) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
