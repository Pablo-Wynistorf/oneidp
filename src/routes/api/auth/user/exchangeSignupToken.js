const express = require('express');
const jwt = require('jsonwebtoken');

const redisCache = require('../../../../database/redis.js');
const { userDB } = require('../../../../database/mongodb.js');

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

const router = express.Router();

router.post('/', async (req, res) => {
    const signupToken = req.cookies.signup_token;

    jwt.verify(signupToken, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, decoded) => {
        if (error) {
            return res.status(400).json({ success: false, error: 'Invalid token' });
        }

        const { userId} = decoded;

        try {
            const user = await userDB.findOne({ userId });

            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            if (!user.emailVerified) {
                return res.status(401).json({ success: false, error: 'Email not yet verified' });
            }

            const sid = await generateRandomString(15);
            const device = req.headers['user-agent'] || '';
            const platformMatch = device.match(/(Windows|Linux|Macintosh|iPhone|iPad|Android)/i);
            const platform = platformMatch ? platformMatch[0] : 'Unknown';
            const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'Unknown';

            const timestamp = Math.floor(Date.now() / 1000);
            const redisKey = `psid:${userId}:${sid}`;

            await redisCache.hSet(redisKey, {
                deviceType: platform,
                ipAddr: ip,
                createdAt: timestamp,
            });

            await redisCache.expire(redisKey, 48 * 60 * 60);

            const access_token = jwt.sign({ userId, sid }, JWT_PRIVATE_KEY, {
                algorithm: 'RS256',
                expiresIn: '48h',
            });

            res.clearCookie('signup_token', { path: '/' });
            res.cookie('access_token', access_token, {
                maxAge: 48 * 60 * 60 * 1000,
                httpOnly: true,
                path: '/',
            });

            return res.status(200).json({ success: true });

        } catch (err) {
            console.error('MongoDB error:', err);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });
});

async function generateRandomString(length) {
    return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

module.exports = router;
