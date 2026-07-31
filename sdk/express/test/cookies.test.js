/** The sealed cookie layer: attributes, tampering, expiry, rotation, chunking. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConfigurationError } from '../src/index.js';
import { parseCookies, readCookie, serializeCookie, writeCookie } from '../src/cookies.js';
import { createSealer } from '../src/seal.js';
import { createCookieStore } from '../src/store/cookie.js';
import { addPending, takePending } from '../src/store/pending.js';

const SECRET = 'a-test-secret-that-is-long-enough-x';

/** Minimal req/res doubles: only the cookie plumbing is exercised. */
function fakeReq(cookieHeader) {
  return { headers: cookieHeader ? { cookie: cookieHeader } : {} };
}

function fakeRes() {
  const headers = {};
  return {
    headersSent: false,
    setHeader: (name, value) => {
      headers[name] = value;
    },
    getHeader: (name) => headers[name],
    get cookies() {
      const raw = headers['Set-Cookie'];
      if (raw === undefined) return [];
      return Array.isArray(raw) ? raw : [raw];
    },
  };
}

/** Turn Set-Cookie headers back into a Cookie request header, like a browser. */
function jarFrom(res) {
  return res.cookies
    .map((cookie) => cookie.split(';')[0])
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

describe('cookie serialisation', () => {
  it('is HttpOnly, Secure, SameSite=Lax and path-scoped by default', () => {
    const cookie = serializeCookie('oneidp', 'value');

    assert.match(cookie, /^oneidp=value/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
  });

  it('encodes values so a cookie cannot be split by its own contents', () => {
    const cookie = serializeCookie('oneidp', 'a; Domain=evil.example.com');
    assert.doesNotMatch(cookie, /Domain=evil/);
    assert.match(cookie, /a%3B%20Domain%3Devil\.example\.com/);
  });

  it('writes Max-Age in seconds', () => {
    assert.match(serializeCookie('a', 'b', { maxAge: 90_000 }), /Max-Age=90/);
  });

  it('parses a request cookie header', () => {
    const jar = parseCookies(fakeReq('a=1; b=hello%20world; c='));
    assert.equal(jar.a, '1');
    assert.equal(jar.b, 'hello world');
    assert.equal(jar.c, '');
  });

  it('prefers cookie-parser output when the app mounted it', () => {
    assert.deepEqual(parseCookies({ cookies: { a: 'from-parser' }, headers: { cookie: 'a=raw' } }), {
      a: 'from-parser',
    });
  });
});

describe('sealing', () => {
  it('round-trips a payload', async () => {
    const sealer = createSealer({ secret: SECRET, purpose: 'session' });
    const sealed = await sealer.seal({ hello: 'world' }, { maxAge: 60_000 });

    // Opaque to the browser.
    assert.doesNotMatch(sealed, /world/);
    assert.equal((await sealer.unseal(sealed)).hello, 'world');
  });

  it('rejects a tampered value instead of trusting it', async () => {
    const sealer = createSealer({ secret: SECRET, purpose: 'session' });
    const sealed = await sealer.seal({ sub: 'ada' }, { maxAge: 60_000 });

    const parts = sealed.split('.');
    // Flip a byte of the ciphertext. AES-GCM authentication must catch it.
    parts[3] = parts[3].slice(0, -4) + (parts[3].endsWith('AAAA') ? 'BBBB' : 'AAAA');

    assert.equal(await sealer.unseal(parts.join('.')), null);
  });

  it('rejects an expired value even if the browser kept sending it', async () => {
    const sealer = createSealer({ secret: SECRET, purpose: 'session' });
    // Negative lifetime: already expired when written.
    const sealed = await sealer.seal({ sub: 'ada' }, { maxAge: -10_000 });

    assert.equal(await sealer.unseal(sealed), null);
  });

  it('will not open a value sealed for another purpose', async () => {
    const session = createSealer({ secret: SECRET, purpose: 'session' });
    const transaction = createSealer({ secret: SECRET, purpose: 'transaction' });

    const sealed = await transaction.seal({ codeVerifier: 'secret' }, { maxAge: 60_000 });

    // Separate HKDF info means separate keys, so a transaction cookie cannot be
    // replayed as a session.
    assert.equal(await session.unseal(sealed), null);
  });

  it('opens values written under an older secret, for rotation', async () => {
    const old = createSealer({ secret: 'the-previous-secret-value-long-enough', purpose: 'session' });
    const sealed = await old.seal({ sub: 'ada' }, { maxAge: 60_000 });

    // Deploy with [new, old]: existing sessions keep working.
    const rotating = createSealer({
      secret: [SECRET, 'the-previous-secret-value-long-enough'],
      purpose: 'session',
    });
    assert.equal((await rotating.unseal(sealed)).sub, 'ada');

    // New cookies use the new secret, which the old key cannot open.
    const fresh = await rotating.seal({ sub: 'ada' }, { maxAge: 60_000 });
    assert.equal(await old.unseal(fresh), null);
  });

  it('rejects rubbish without throwing', async () => {
    const sealer = createSealer({ secret: SECRET, purpose: 'session' });
    for (const value of ['', 'not-a-jwe', 'a.b.c.d.e', null, undefined]) {
      assert.equal(await sealer.unseal(value), null);
    }
  });

  it('insists on a secret long enough to matter', () => {
    assert.throws(() => createSealer({ secret: undefined, purpose: 'session' }), ConfigurationError);
    assert.throws(() => createSealer({ secret: 'short', purpose: 'session' }), ConfigurationError);
  });
});

describe('chunking', () => {
  it('splits a large value and rejoins it', () => {
    const req = fakeReq();
    const res = fakeRes();
    const big = 'x'.repeat(9000);

    writeCookie(req, res, 'oneidp', big, {});

    assert.equal(res.cookies.length, 3);
    assert.ok(res.cookies.every((cookie) => /^oneidp\.\d=/.test(cookie)));

    assert.equal(readCookie(fakeReq(jarFrom(res)), 'oneidp'), big);
  });

  it('keeps a normal session in a single cookie', () => {
    const req = fakeReq();
    const res = fakeRes();

    // A full session with three tokens seals to roughly this size.
    writeCookie(req, res, 'oneidp', 'x'.repeat(3600), {});

    assert.equal(res.cookies.length, 1);
    assert.match(res.cookies[0], /^oneidp=/);
  });

  it('expires leftover chunks when a value shrinks', () => {
    // The browser is holding a chunked value; the new one fits in one cookie.
    const req = fakeReq('oneidp.0=aaa; oneidp.1=bbb; oneidp.2=ccc');
    const res = fakeRes();

    writeCookie(req, res, 'oneidp', 'small', {});

    const cleared = res.cookies.filter((cookie) => /Max-Age=0/.test(cookie));
    assert.equal(cleared.length, 3, 'every stale chunk must be expired');
    // Otherwise a stale chunk would be concatenated onto the new value.
    assert.equal(readCookie(fakeReq(jarFrom(res)), 'oneidp'), 'small');
  });

  it('refuses a value too large for any browser', () => {
    assert.throws(() => writeCookie(fakeReq(), fakeRes(), 'oneidp', 'x'.repeat(40_000), {}), /over the limit/);
  });
});

describe('the cookie store', () => {
  const store = createCookieStore({ secret: SECRET, redirectUri: 'https://app.example.com/auth/callback' });

  it('round-trips a session through a browser', async () => {
    const res = fakeRes();
    await store.saveSession(fakeReq(), res, { u: { sub: '482913' } });

    const loaded = await store.loadSession(fakeReq(jarFrom(res)));
    assert.equal(loaded.u.sub, '482913');
  });

  it('marks the session cookie HttpOnly and Secure', async () => {
    const res = fakeRes();
    await store.saveSession(fakeReq(), res, { u: { sub: '1' } });

    assert.match(res.cookies[0], /HttpOnly/);
    assert.match(res.cookies[0], /Secure/);
  });

  it('drops Secure for http on localhost, so development works', async () => {
    const local = createCookieStore({ secret: SECRET, redirectUri: 'http://localhost:3000/auth/callback' });
    const res = fakeRes();
    await local.saveSession(fakeReq(), res, { u: { sub: '1' } });

    assert.doesNotMatch(res.cookies[0], /Secure/);
  });

  it('refuses SameSite=Strict, which would break every login', () => {
    assert.throws(
      () =>
        createCookieStore({
          secret: SECRET,
          cookie: { sameSite: 'strict' },
          redirectUri: 'https://app.example.com/auth/callback',
        }),
      /sameSite/,
    );
  });

  it('clears the session on logout', async () => {
    const res = fakeRes();
    await store.saveSession(fakeReq(), res, { u: { sub: '1' } });
    const jar = jarFrom(res);

    const clearing = fakeRes();
    await store.clearSession(fakeReq(jar), clearing);

    assert.match(clearing.cookies[0], /Max-Age=0/);
    assert.equal(await store.loadSession(fakeReq(jarFrom(clearing))), null);
  });

  it('keeps the session and transaction cookies apart', async () => {
    const res = fakeRes();
    await store.saveTx(fakeReq(), res, { pending: {} });

    assert.match(res.cookies[0], /^oneidp_tx=/);
    // A transaction cookie must not be readable as a session.
    assert.equal(await store.loadSession(fakeReq(jarFrom(res))), null);
  });
});

describe('pending logins', () => {
  it('supports several tabs at once and consumes each attempt', () => {
    let tx = addPending(null, 'state-a', { nonce: 'n-a', returnTo: '/a' });
    tx = addPending(tx, 'state-b', { nonce: 'n-b', returnTo: '/b' });

    const [entryB, remaining] = takePending(tx, 'state-b');
    assert.equal(entryB.returnTo, '/b');

    // The other tab's login survives...
    const [entryA] = takePending(remaining, 'state-a');
    assert.equal(entryA.returnTo, '/a');

    // ...and a replayed callback finds nothing.
    assert.equal(takePending(remaining, 'state-b')[0], null);
  });

  it('caps how many logins can be in flight', () => {
    let tx = null;
    for (const state of ['a', 'b', 'c', 'd', 'e']) {
      tx = addPending(tx, state, { nonce: state });
    }

    assert.equal(Object.keys(tx.pending).length, 3);
    // The oldest were evicted, so the cookie cannot grow without bound.
    assert.equal(takePending(tx, 'a')[0], null);
    assert.ok(takePending(tx, 'e')[0]);
  });

  it('ignores an attempt that sat around too long', () => {
    const tx = { pending: { stale: { nonce: 'n', createdAt: Date.now() - 20 * 60 * 1000 } } };
    assert.equal(takePending(tx, 'stale')[0], null);
  });
});
