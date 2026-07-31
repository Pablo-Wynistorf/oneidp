/**
 * Cookie reading and writing, with chunking.
 *
 * No `cookie-parser` and no `res.cookie`: the header is parsed and serialised
 * here so the SDK works on Express 4 and 5 with zero extra dependencies.
 *
 * Browsers cap a cookie at roughly 4 KB including its name and attributes. A
 * sealed session holding an access token, a refresh token and an ID token lands
 * around 3.3 KB, which fits but leaves little room for a user with many roles.
 * Values over the limit are therefore split across `name.0`, `name.1`, ... and
 * rejoined on read, so a large session degrades into an extra cookie instead of
 * a silently truncated one.
 */

/**
 * Ceiling for one cookie's value.
 *
 * The 4 KB browser limit covers the name, the value and the attributes. Ours add
 * up to about 60 characters (`Path`, `Max-Age`, `HttpOnly`, `Secure`,
 * `SameSite`), so 3800 keeps a full session with tokens in a single cookie while
 * still leaving headroom.
 */
const CHUNK_SIZE = 3800;

/** Hard stop, so a runaway value cannot fill the request headers. */
const MAX_CHUNKS = 6;

export function parseCookies(req) {
  // Reuse cookie-parser's output when the application already mounted it.
  if (req.cookies && typeof req.cookies === 'object') return req.cookies;

  const header = req.headers?.cookie;
  if (!header) return {};

  const jar = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;

    const name = part.slice(0, index).trim();
    if (name === '' || name in jar) continue;

    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);

    try {
      jar[name] = decodeURIComponent(value);
    } catch {
      // A cookie we did not write, containing stray percent signs.
      jar[name] = value;
    }
  }

  return jar;
}

export function serializeCookie(name, value, options = {}) {
  const {
    maxAge,
    expires,
    path = '/',
    domain,
    httpOnly = true,
    secure = true,
    sameSite = 'lax',
  } = options;

  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (path) parts.push(`Path=${path}`);
  if (domain) parts.push(`Domain=${domain}`);
  // Math.floor because a fractional Max-Age is invalid.
  if (typeof maxAge === 'number') parts.push(`Max-Age=${Math.floor(maxAge / 1000)}`);
  if (expires) parts.push(`Expires=${expires.toUTCString()}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (sameSite) parts.push(`SameSite=${sameSite[0].toUpperCase()}${sameSite.slice(1)}`);

  return parts.join('; ');
}

function append(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  if (existing === undefined) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }
  res.setHeader('Set-Cookie', Array.isArray(existing) ? [...existing, cookie] : [existing, cookie]);
}

/** Read a value written by `writeCookie`, whether it was chunked or not. */
export function readCookie(req, name) {
  const jar = parseCookies(req);

  if (typeof jar[name] === 'string') return jar[name];

  const chunks = [];
  for (let index = 0; index < MAX_CHUNKS; index += 1) {
    const chunk = jar[`${name}.${index}`];
    if (typeof chunk !== 'string') break;
    chunks.push(chunk);
  }

  return chunks.length > 0 ? chunks.join('') : null;
}

/**
 * Write a value, splitting it if necessary.
 *
 * Chunks left over from a previous, larger value are expired in the same
 * response. Without that, a stale `name.1` would be concatenated onto the new
 * value and every read would fail.
 */
export function writeCookie(req, res, name, value, options = {}) {
  const previous = countChunks(req, name);

  if (value.length <= CHUNK_SIZE) {
    append(res, serializeCookie(name, value, options));
    for (let index = 0; index < previous; index += 1) {
      append(res, serializeCookie(`${name}.${index}`, '', { ...options, maxAge: 0 }));
    }
    return;
  }

  const chunks = [];
  for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
    chunks.push(value.slice(offset, offset + CHUNK_SIZE));
  }

  if (chunks.length > MAX_CHUNKS) {
    throw new Error(
      `Session cookie needs ${chunks.length} chunks, over the limit of ${MAX_CHUNKS}. ` +
        "Reduce what is stored, for example with tokens: 'identity'.",
    );
  }

  chunks.forEach((chunk, index) => {
    append(res, serializeCookie(`${name}.${index}`, chunk, options));
  });

  // Drop the unchunked form, and any chunk beyond what this value needs.
  if (typeof parseCookies(req)[name] === 'string') {
    append(res, serializeCookie(name, '', { ...options, maxAge: 0 }));
  }
  for (let index = chunks.length; index < previous; index += 1) {
    append(res, serializeCookie(`${name}.${index}`, '', { ...options, maxAge: 0 }));
  }
}

export function clearCookie(req, res, name, options = {}) {
  const expire = { ...options, maxAge: 0 };
  const jar = parseCookies(req);

  if (typeof jar[name] === 'string') append(res, serializeCookie(name, '', expire));

  const chunks = countChunks(req, name);
  for (let index = 0; index < chunks; index += 1) {
    append(res, serializeCookie(`${name}.${index}`, '', expire));
  }
}

function countChunks(req, name) {
  const jar = parseCookies(req);
  let count = 0;
  while (count < MAX_CHUNKS && typeof jar[`${name}.${count}`] === 'string') count += 1;
  return count;
}
