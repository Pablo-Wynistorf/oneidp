const redis = require('redis');
require('dotenv').config();

const { REDIS_URI } = process.env;

let redisCache;

async function connectToRedis() {
  try {
    redisCache = redis.createClient({ url: REDIS_URI });
    redisCache.on('error', err => {
      console.error('Redis connection error:', err);
      setTimeout(connectToRedis, 5000);
    });

    redisCache.on('end', () => {
      console.log('Redis disconnected. Reconnecting...');
      setTimeout(connectToRedis, 5000);
    });

    await redisCache.connect();
    console.log('Connected to Redis');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    setTimeout(connectToRedis, 5000);
  }
}

module.exports = {
  redisCache,
  connectToRedis
};
