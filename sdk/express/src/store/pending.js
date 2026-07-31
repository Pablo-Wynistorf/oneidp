/**
 * Logins in flight, keyed by `state`.
 *
 * Keyed rather than a single slot so two tabs starting a login at the same time
 * do not invalidate each other. Capped and time-limited, because this rides in a
 * cookie: unbounded growth would mean unbounded request headers.
 *
 * Pure functions over a plain object, so both stores share the behaviour.
 */

const MAX_PENDING = 3;
const TTL = 10 * 60 * 1000;

export function addPending(tx, state, entry) {
  const pending = { ...(tx?.pending ?? {}) };
  const now = Date.now();

  for (const [key, value] of Object.entries(pending)) {
    if (!value?.createdAt || now - value.createdAt > TTL) delete pending[key];
  }

  const keys = Object.keys(pending);
  if (keys.length >= MAX_PENDING) {
    const oldest = keys.reduce((a, b) =>
      (pending[a]?.createdAt ?? 0) <= (pending[b]?.createdAt ?? 0) ? a : b,
    );
    delete pending[oldest];
  }

  pending[state] = { ...entry, createdAt: now };
  return { pending };
}

/**
 * Look up and consume one attempt.
 *
 * Single use, like the authorization code it pairs with, so a replayed callback
 * finds nothing. Returns `[entry, remainingTx]`.
 */
export function takePending(tx, state) {
  const pending = { ...(tx?.pending ?? {}) };
  const entry = pending[state];

  if (!entry) return [null, tx];

  delete pending[state];

  const remaining = Object.keys(pending).length > 0 ? { pending } : null;
  if (Date.now() - (entry.createdAt ?? 0) > TTL) return [null, remaining];

  return [entry, remaining];
}
