const mongoose = require('mongoose');
require('dotenv').config();

const { MONGODB_URI } = process.env;

function connectToDatabase() {
  mongoose.connect(MONGODB_URI, {
    tlsInsecure: true,
    serverSelectionTimeoutMS: 5000,
  })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
      console.error('MongoDB connection error:', err);
      setTimeout(connectToDatabase, 5000);
    });
}


const db = mongoose.connection;

db.on('error', err => {
  console.error('MongoDB connection error:', err);
  setTimeout(connectToDatabase, 5000);
});

db.on('disconnected', () => {
  console.log('MongoDB disconnected. Reconnecting...');
  setTimeout(connectToDatabase, 5000);
});

const { Schema } = mongoose;

const userSchema = new Schema({
  userId: String,
  firstName: String,
  lastName: String,
  username: String,
  password: String,
  email: String,
  identityProvider: String,
  identityProviderUserId: String,
  passkeyId: String,
  passkeyPublicKey: String,
  mfaSecret: String,
  mfaEnabled: Boolean,
  emailVerified: Boolean,
  providerRoles: Array,
  signCount: Number,
}, {
  timestamps: true
});

const oAuthClientSchema = new Schema({
  oauthAppName: String,
  oauthClientAppId: String,
  clientId: String,
  clientSecret: String,
  redirectUri: String,
  accessTokenValidity: Number,
  isPublicClient: Boolean,
  owner: String,
}, {
  timestamps: true
});

const oAuthRolesSchema = new Schema({
  oauthRoleId: String,
  oauthClientAppId: String,
  oauthClientId: String,
  oauthRoleName: String,
  oauthUserIds: Array,
  owner: String,
}, {
  timestamps: true
});

const userDB = mongoose.model('users', userSchema);
const oAuthClientAppDB = mongoose.model('oauthClientApps', oAuthClientSchema);
const oAuthRolesDB = mongoose.model('oauthRoles', oAuthRolesSchema);

module.exports = {
  connectToDatabase,
  userDB,
  oAuthClientAppDB,
  oAuthRolesDB,
};
