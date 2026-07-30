import mongoose from 'mongoose';
import 'dotenv/config';

const { MONGODB_URI } = process.env;

// Cache the connection promise so it can be reused across Lambda invocations
// that share the same execution environment (avoids opening a new connection
// on every request / cold start reuse).
let connectionPromise = null;

function connectToDatabase() {
  // Already connected.
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  // Connection attempt already in flight.
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose.connect(MONGODB_URI, {
    tlsInsecure: true,
    serverSelectionTimeoutMS: 5000,
  })
    .then(() => {
      console.log('Connected to MongoDB');
      return mongoose.connection;
    })
    .catch(err => {
      console.error('MongoDB connection error:', err);
      // Reset so the next invocation can retry.
      connectionPromise = null;
      throw err;
    });

  return connectionPromise;
}


const db = mongoose.connection;

db.on('error', err => {
  console.error('MongoDB connection error:', err);
  connectionPromise = null;
});

db.on('disconnected', () => {
  console.log('MongoDB disconnected.');
  connectionPromise = null;
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
  // Per-user grant for managing OIDC applications and roles. Additive: it lets
  // an individual through while the instance-wide switch is off. Turning the
  // instance-wide switch on allows everyone regardless of this field.
  canManageApps: { type: Boolean, default: false },
  // Moderation state, managed from the admin console. A banned user cannot
  // start a new session and has every existing session revoked at ban time.
  banned: { type: Boolean, default: false },
  bannedAt: Date,
  bannedReason: String,
  bannedBy: String,
}, {
  timestamps: true
});

// Admin user search filters on these, and login looks users up by both.
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ userId: 1 });

const oAuthClientSchema = new Schema({
  oauthAppName: String,
  oauthClientAppId: String,
  clientId: String,
  clientSecret: String,
  redirectUri: String,
  accessTokenValidity: Number,
  isPublicClient: Boolean,
  owner: String,
  // Availability, derived from the owner rather than set by hand: an
  // application is switched off when its owner loses the app-management
  // capability or is suspended, and switched back on when they regain it.
  //
  // These fields are the stored view of that decision, kept for the admin
  // console and for `disabledAt` history. They are not what the OIDC endpoints
  // trust — those re-derive the state live, see utils/client-status.mjs — so a
  // stale mirror can never leave a dead application usable.
  disabled: { type: Boolean, default: false },
  disabledAt: Date,
  disabledReason: String,
}, {
  timestamps: true
});

// Every OIDC flow resolves a client by `clientId`, and the owner lookups added
// for availability checks filter on `owner`.
oAuthClientSchema.index({ clientId: 1 });
oAuthClientSchema.index({ owner: 1 });

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

const userAppConsentSchema = new Schema({
  consentId: String,
  userId: String,
  oauthClientAppId: String,
  clientId: String,
  consentedScopes: [String],
  firstAuthAt: Date,
  lastAuthAt: Date,
}, {
  timestamps: true
});

/**
 * Instance-wide settings, editable from the admin console.
 *
 * A single document identified by `key: 'global'`. Kept in the database rather
 * than in environment variables so an operator can close registrations without
 * a redeploy.
 */
const appSettingsSchema = new Schema({
  key: { type: String, default: 'global', unique: true },
  registrationEnabled: { type: Boolean, default: true },
  socialLoginEnabled: { type: Boolean, default: true },
  passwordResetEnabled: { type: Boolean, default: true },
  appCreationEnabled: { type: Boolean, default: true },
  // Live, instance-wide switch: when on, every signed-in user may manage OIDC
  // applications. When off (the default) only users with an explicit per-user
  // grant can. Most people only ever sign in to apps, they do not run them.
  allowAllUsersManageApps: { type: Boolean, default: false },
  maintenanceMode: { type: Boolean, default: false },
  maintenanceMessage: { type: String, default: '' },
  // Empty means any domain is accepted.
  allowedEmailDomains: { type: [String], default: [] },
  updatedBy: String,
}, {
  timestamps: true
});

/**
 * Admin invitations.
 *
 * Only the SHA-256 hash of the token is stored, so a database leak does not
 * hand out usable invitation links.
 */
const invitationSchema = new Schema({
  inviteId: { type: String, unique: true },
  email: String,
  tokenHash: String,
  invitedBy: String,
  providerRoles: { type: [String], default: [] },
  // Capability granted to the account when the invitation is accepted.
  canManageApps: { type: Boolean, default: false },
  expiresAt: Date,
  acceptedAt: Date,
  acceptedUserId: String,
  revokedAt: Date,
}, {
  timestamps: true
});

invitationSchema.index({ email: 1 });
invitationSchema.index({ tokenHash: 1 });

const userDB = mongoose.model('users', userSchema);
const oAuthClientAppDB = mongoose.model('oauthClientApps', oAuthClientSchema);
const oAuthRolesDB = mongoose.model('oauthRoles', oAuthRolesSchema);
const userAppConsentDB = mongoose.model('userAppConsents', userAppConsentSchema);
const appSettingsDB = mongoose.model('appSettings', appSettingsSchema);
const invitationDB = mongoose.model('invitations', invitationSchema);

export {
  connectToDatabase,
  userDB,
  oAuthClientAppDB,
  oAuthRolesDB,
  userAppConsentDB,
  appSettingsDB,
  invitationDB,
};
