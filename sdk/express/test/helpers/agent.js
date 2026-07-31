/** A minimal browser: keeps cookies, follows redirects, and records the hops. */

export function createAgent() {
  const jar = new Map();

  function cookieHeader() {
    return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  function storeCookies(response) {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === '' || /expires=thu, 01 jan 1970/i.test(raw)) jar.delete(name);
      else jar.set(name, value);
    }
  }

  async function request(url, init = {}, { follow = true, maxHops = 10 } = {}) {
    const hops = [];
    let current = url;

    for (let hop = 0; hop <= maxHops; hop += 1) {
      const cookies = cookieHeader();
      const response = await fetch(current, {
        redirect: 'manual',
        ...init,
        headers: {
          accept: 'text/html',
          ...(init.headers ?? {}),
          ...(cookies ? { cookie: cookies } : {}),
        },
      });

      storeCookies(response);
      hops.push({ url: current, status: response.status, location: response.headers.get('location') });

      const location = response.headers.get('location');
      if (!follow || response.status < 300 || response.status >= 400 || !location) {
        return { response, hops, body: await response.text() };
      }

      current = new URL(location, current).href;
      // Only the first request carries a method or body.
      init = { headers: init.headers };
    }

    throw new Error('Too many redirects');
  }

  return { request, jar };
}
