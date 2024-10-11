const redisCache = require('../database/redis.js');

const rateLimiter = (maxRequests, windowMs) => {
    return async (req, res, next) => {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const currentTime = Date.now();
        const route = req.originalUrl;
        const key = `rateLimit:${ip}:${route}`;
        try {
            const data = await redisCache.get(key);

            let rateLimitData;
            if (data) {
                rateLimitData = JSON.parse(data);
            } else {
                rateLimitData = { count: 0, start: currentTime };
            }

            if (currentTime - rateLimitData.start < windowMs) {
                if (rateLimitData.count >= maxRequests) {
                    return res.status(429).json({ message: 'Too many requests from this IP for this route, please try again later.' });
                }
                rateLimitData.count += 1;
            } else {
                rateLimitData = { count: 1, start: currentTime };
            }

            await redisCache.set(key, JSON.stringify(rateLimitData));
            await redisCache.expire(key, windowMs / 1000);

            next(); 
        } catch (err) {
            console.error("Error processing rate limit:", err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    };
};

module.exports = rateLimiter;
