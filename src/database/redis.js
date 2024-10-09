const redis = require('redis');
require('dotenv').config();

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

// Connect to Redis
(async () => {
  try {
    await redisCache.connect();
    console.log('Connected to Redis');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
  }
})();

module.exports = redisCache;
