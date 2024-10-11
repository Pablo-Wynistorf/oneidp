const redisCache = require('../database/redis.js');
const crypto = require('crypto');

const rateLimiter = (maxRequests, windowMs) => {
    return async (req, res, next) => {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const route = req.originalUrl;
        const hash = crypto.createHash('md5').update(`${ip}:${route}`).digest('hex').substring(0, 6);
        const key = `r:${hash}`;

        try {
            const currentCount = await redisCache.incr(key);

            if (currentCount === 1) {
                await redisCache.expire(key, windowMs / 1000);
            }

            if (currentCount > maxRequests) {
                return res.status(429).json({ message: 'Too many requests from this IP for this route, please try again later.' });
            }

            next(); 
        } catch (err) {
            console.error("Error processing rate limit:", err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    };
};

module.exports = rateLimiter;
