/**
 * Endpoint resolution and JWKS caching.
 *
 * Endpoint paths are fixed for every ONEIDP instance (the base URL is the only
 * variable, and it equals the issuer), so the SDK derives them locally and works
 * without a network round trip at startup. Discovery is still fetched once,
 * lazily, to pick up an instance that moved a path, but a failure there is not
 * fatal: the derived defaults take over. That matters because ONEIDP's own docs
 * call out cold starts and API Gateway throttling in front of hosted instances.
 *
 * Two fields in the discovery document are deliberately ignored:
 * `response_types_supported` advertises implicit and hybrid flows, and
 * `token_endpoint_auth_signing_alg_values_supported` suggests private key JWT.
 * Neither is implemented server-side, and trusting them is what makes strict
 * OIDC libraries pick a flow that cannot work.
 */

import { createRemoteJWKSet } from 'jose';
import { DiscoveryError } from './errors.js';

/** Paths every ONEIDP instance serves, relative to the issuer. */
const DEFAULT_PATHS = {
  authorization_endpoint: '/api/oauth/authorize',
  token_endpoint: '/api/oauth/token',
  userinfo_endpoint: '/api/oauth/userinfo',
  end_session_endpoint: '/api/oauth/logout',
  revocation_endpoint: '/api/oauth/revoke',
  jwks_uri: '/.well-known/jwks.json',
  check_token_endpoint: '/api/oauth/check_token',
};

const DISCOVERY_PATH = '/.well-known/openid-configuration';

/** Endpoint URLs implied by an issuer, with no network access. */
export function defaultEndpoints(issuer) {
  return Object.fromEntries(
    Object.entries(DEFAULT_PATHS).map(([name, path]) => [name, `${issuer}${path}`]),
  );
}

export function createProvider({ issuer, endpoints: overrides = {}, discovery = true, fetch: fetchImpl, timeout = 10_000, jwksCacheMaxAge = 10 * 60 * 1000, onWarning }) {
  const derived = defaultEndpoints(issuer);
  let resolved = { ...derived, ...overrides };
  let discoveryAttempt = null;

  const doFetch = fetchImpl ?? globalThis.fetch;

  async function fetchDiscovery() {
    const url = `${issuer}${DISCOVERY_PATH}`;
    const response = await doFetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      throw new DiscoveryError(`Discovery request to ${url} failed`, { status: response.status });
    }

    const metadata = await response.json();

    // A mismatched issuer means tokens will never validate. Loud failure beats a
    // confusing `iss` error on every login.
    if (metadata.issuer && metadata.issuer !== issuer) {
      throw new DiscoveryError(
        `Issuer mismatch: configured ${issuer}, discovery reports ${metadata.issuer}`,
        {
          hint:
            'The ONEIDP `URL` environment variable is the issuer and appears in every token. ' +
            'It must match your `issuer` option exactly, including scheme and with no trailing slash.',
        },
      );
    }

    return metadata;
  }

  /**
   * Resolve endpoints once. Explicit overrides always win; discovery fills the
   * rest; derived paths are the floor.
   */
  function ensureEndpoints() {
    if (discovery === false) return Promise.resolve(resolved);

    discoveryAttempt ??= fetchDiscovery()
      .then((metadata) => {
        const fromDiscovery = Object.fromEntries(
          Object.keys(DEFAULT_PATHS)
            .filter((name) => typeof metadata[name] === 'string')
            .map((name) => [name, metadata[name]]),
        );
        resolved = { ...derived, ...fromDiscovery, ...overrides };
        return resolved;
      })
      .catch((error) => {
        // Never let a discovery hiccup take logins down when the paths are known.
        onWarning?.(
          `Discovery failed (${error.message}). Falling back to the standard ONEIDP endpoint paths.`,
        );
        return resolved;
      });

    return discoveryAttempt;
  }

  // `createRemoteJWKSet` caches keys, refetches on an unknown `kid`, and
  // coalesces concurrent requests. ONEIDP has one static key with a stable
  // `kid`, so in practice this fetches once per process.
  let jwks = null;

  async function getJwks() {
    const { jwks_uri: jwksUri } = await ensureEndpoints();
    jwks ??= createRemoteJWKSet(new URL(jwksUri), {
      timeoutDuration: timeout,
      cacheMaxAge: jwksCacheMaxAge,
    });
    return jwks;
  }

  return {
    issuer,
    /** Resolved endpoint URLs. Awaits the one-time discovery attempt. */
    endpoints: ensureEndpoints,
    /** Endpoint URLs known without awaiting anything. */
    endpointsSync: () => resolved,
    jwks: getJwks,
  };
}
