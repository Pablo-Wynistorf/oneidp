import redis from 'redis';
import 'dotenv/config';

const { REDIS_URI } = process.env;

// Create Redis client
const redisCache = redis.createClient({ url: REDIS_URI });

// Redis error handling
redisCache.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// Handle disconnection
redisCache.on('end', () => {
  console.log('Redis disconnected.');
});

// Cache the connect promise so the connection is reused across Lambda
// invocations that share the same execution environment.
let redisConnectPromise = null;

async function connectRedis() {
  if (redisCache.isOpen) {
    return redisCache;
  }

  if (!redisConnectPromise) {
    redisConnectPromise = redisCache.connect()
      .then(() => {
        console.log('Connected to Redis');
        return redisCache;
      })
      .catch((err) => {
        console.error('Failed to connect to Redis:', err);
        redisConnectPromise = null;
        throw err;
      });
  }

  return redisConnectPromise;
}

// Kick off a connection on module load (works for both local dev and the
// Lambda cold start). Errors are swallowed here; connectRedis() can be awaited
// by callers that need to guarantee the connection is ready.
connectRedis().catch(() => {});

export default redisCache;
export { connectRedis };
