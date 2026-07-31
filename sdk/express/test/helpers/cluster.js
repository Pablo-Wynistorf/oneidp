/**
 * A cluster of independent app instances behind a round-robin load balancer.
 *
 * Each instance is its own Express app with its own `oneidp()` middleware and its
 * own JWKS cache, sharing nothing but configuration: exactly what you get from N
 * replicas of one container image. The balancer forwards every request to the
 * next instance, so no two hops in a flow are ever served by the same one.
 *
 * That is the worst realistic case for authentication: login on replica 1,
 * callback on replica 2, the next page on replica 3.
 */

import http from 'node:http';
import express from 'express';

import { oneidp } from '../../src/index.js';

/** Reserve a port by opening and immediately closing a listener. */
async function reservePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/**
 * @param {object} options
 * @param {number} options.instances how many replicas to run
 * @param {(index: number) => object} options.config oneidp() options per replica
 * @param {(app: import('express').Express, auth: any, index: number) => void} options.routes
 */
export async function startCluster({ instances = 3, config, routes }) {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const backends = [];

  for (let index = 0; index < instances; index += 1) {
    const app = express();
    const auth = oneidp(config(index, baseUrl));

    // Proves which replica handled the request.
    app.use((req, res, next) => {
      res.set('x-served-by', `replica-${index}`);
      next();
    });

    app.use(auth);
    routes(app, auth, index);

    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, _next) => {
      res.status(error.status ?? 500).json({ code: error.code, message: error.message });
    });

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    backends.push({ server, port: server.address().port, index });
  }

  let next = 0;
  const servedBy = [];

  // The load balancer. Deliberately dumb: strict round robin, no stickiness, no
  // affinity. If anything in the SDK depended on instance-local state, this is
  // what would break it.
  const balancer = http.createServer((clientReq, clientRes) => {
    const target = backends[next % backends.length];
    next += 1;
    servedBy.push(target.index);

    const proxy = http.request(
      {
        host: '127.0.0.1',
        port: target.port,
        method: clientReq.method,
        path: clientReq.url,
        headers: { ...clientReq.headers, host: `127.0.0.1:${port}` },
      },
      (upstream) => {
        clientRes.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(clientRes);
      },
    );

    proxy.on('error', (error) => {
      clientRes.writeHead(502, { 'content-type': 'application/json' });
      clientRes.end(JSON.stringify({ error: 'bad_gateway', message: error.message }));
    });

    clientReq.pipe(proxy);
  });

  await new Promise((resolve) => balancer.listen(port, '127.0.0.1', resolve));

  return {
    baseUrl,
    instances: backends.length,
    /** Replica index for each request the balancer has forwarded, in order. */
    servedBy,
    resetLog: () => servedBy.splice(0, servedBy.length),
    async close() {
      await new Promise((resolve) => balancer.close(resolve));
      for (const { server } of backends) {
        await new Promise((resolve) => server.close(resolve));
      }
    },
  };
}
