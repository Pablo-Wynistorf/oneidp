import serverless from 'serverless-http';

import app from './express.mjs';
import { connectToDatabase } from './database/mongodb.mjs';
import { connectRedis } from './database/redis.mjs';

// Content types that must be returned to API Gateway / CloudFront as binary
// (base64 encoded). Everything else is treated as text/UTF-8.
const binaryTypes = [
  'image/*',
  'font/*',
  'application/octet-stream',
  'application/pdf',
  'application/zip',
  'application/x-font-ttf',
  'application/vnd.ms-fontobject',
];

const serverlessHandler = serverless(app, { binary: binaryTypes });

export const handler = async (event, context) => {
  // Keep the Node.js event loop / DB + Redis sockets alive between invocations
  // so warm containers reuse the existing connections.
  context.callbackWaitsForEmptyEventLoop = false;

  // Make sure the backing stores are reachable before handling the request.
  // Failures are logged; the Express routes handle their own error responses.
  try {
    await connectToDatabase();
  } catch (err) {
    console.error('MongoDB not available at invocation time:', err.message);
  }

  try {
    await connectRedis();
  } catch (err) {
    console.error('Redis not available at invocation time:', err.message);
  }

  return serverlessHandler(event, context);
};
