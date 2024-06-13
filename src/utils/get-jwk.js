const jose = require('node-jose');
const dotenv = require('dotenv');

dotenv.config();

let JWK_PUBLIC_KEY = null;

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

async function initializeJWK() {
  try {
    const key = await jose.JWK.asKey(JWT_PUBLIC_KEY, 'pem');
    JWK_PUBLIC_KEY = key.toJSON();
  } catch (err) {
    console.error('Error initializing JWK_PUBLIC_KEY:', err);
  }
}

initializeJWK();

module.exports = {
  getJWKPublicKey: () => JWK_PUBLIC_KEY
};
