/**
 * WebAuthn relying-party configuration.
 *
 * The RP ID must be the site's bare hostname (no scheme, port or path). It is
 * derived from the public `URL` the app is already given so registration and
 * authentication can never drift apart. `DOMAIN` remains supported as an
 * explicit override for setups where the RP ID is a parent domain of the host.
 */

const HOSTNAME_ONLY = /^[a-z0-9.-]+$/i;

function normalizeHost(value) {
  const host = String(value || '')
    .trim()
    .replace(/^[a-z]+:\/\//i, '') // strip scheme
    .replace(/\/.*$/, '') // strip path
    .split(':')[0] // strip port
    .toLowerCase();

  return HOSTNAME_ONLY.test(host) ? host : '';
}

/**
 * Resolve the relying-party ID. Falls back to `localhost` so local development
 * without a configured URL still works.
 */
export function getRpID() {
  return normalizeHost(process.env.DOMAIN) || normalizeHost(process.env.URL) || 'localhost';
}

export default getRpID;
