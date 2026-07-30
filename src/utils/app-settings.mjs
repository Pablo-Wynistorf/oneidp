import { appSettingsDB } from '../database/mongodb.mjs';
import redisCache from '../database/redis.mjs';

/**
 * Instance settings, read on hot paths (signup, login, social callbacks).
 *
 * Backed by a single Mongo document and cached in Redis for a few seconds, so
 * toggling a setting takes effect almost immediately without adding a database
 * round trip to every request. A cache or database failure falls back to the
 * defaults rather than failing the request outright.
 */

const CACHE_KEY = 'settings:global';
const CACHE_TTL_SECONDS = 15;

export const DEFAULT_SETTINGS = {
  registrationEnabled: true,
  socialLoginEnabled: true,
  passwordResetEnabled: true,
  appCreationEnabled: true,
  allowAllUsersManageApps: false,
  maintenanceMode: false,
  maintenanceMessage: '',
  allowedEmailDomains: [],
};

/** Fields an admin may change, with their coercion rules. */
const EDITABLE = {
  registrationEnabled: (value) => Boolean(value),
  socialLoginEnabled: (value) => Boolean(value),
  passwordResetEnabled: (value) => Boolean(value),
  appCreationEnabled: (value) => Boolean(value),
  allowAllUsersManageApps: (value) => Boolean(value),
  maintenanceMode: (value) => Boolean(value),
  maintenanceMessage: (value) => String(value ?? '').trim().slice(0, 300),
  allowedEmailDomains: (value) =>
    (Array.isArray(value) ? value : String(value ?? '').split(','))
      .map((domain) => String(domain).trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean)
      .slice(0, 50),
};

function shape(document) {
  return {
    registrationEnabled: document?.registrationEnabled ?? DEFAULT_SETTINGS.registrationEnabled,
    socialLoginEnabled: document?.socialLoginEnabled ?? DEFAULT_SETTINGS.socialLoginEnabled,
    passwordResetEnabled: document?.passwordResetEnabled ?? DEFAULT_SETTINGS.passwordResetEnabled,
    appCreationEnabled: document?.appCreationEnabled ?? DEFAULT_SETTINGS.appCreationEnabled,
    allowAllUsersManageApps:
      document?.allowAllUsersManageApps ?? DEFAULT_SETTINGS.allowAllUsersManageApps,
    maintenanceMode: document?.maintenanceMode ?? DEFAULT_SETTINGS.maintenanceMode,
    maintenanceMessage: document?.maintenanceMessage ?? DEFAULT_SETTINGS.maintenanceMessage,
    allowedEmailDomains: document?.allowedEmailDomains ?? DEFAULT_SETTINGS.allowedEmailDomains,
    updatedAt: document?.updatedAt ?? null,
    updatedBy: document?.updatedBy ?? null,
  };
}

/** Current settings, cached. Never throws. */
export async function getSettings() {
  try {
    const cached = await redisCache.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {
    // Fall through to the database.
  }

  try {
    const document = await appSettingsDB.findOne({ key: 'global' }).lean();
    const settings = shape(document);
    try {
      await redisCache.set(CACHE_KEY, JSON.stringify(settings), { EX: CACHE_TTL_SECONDS });
    } catch {
      // Caching is best-effort.
    }
    return settings;
  } catch (error) {
    console.error('Failed to load app settings, using defaults:', error);
    return shape(null);
  }
}

/** Apply a partial update and invalidate the cache. */
export async function updateSettings(patch, updatedBy) {
  const update = {};

  for (const [field, coerce] of Object.entries(EDITABLE)) {
    if (patch != null && Object.hasOwn(patch, field)) {
      update[field] = coerce(patch[field]);
    }
  }

  if (Object.keys(update).length === 0) {
    return { settings: await getSettings(), changed: [] };
  }

  update.updatedBy = updatedBy ?? null;

  const document = await appSettingsDB
    .findOneAndUpdate({ key: 'global' }, { $set: update }, { new: true, upsert: true })
    .lean();

  try {
    await redisCache.del(CACHE_KEY);
  } catch {
    // A stale cache expires within CACHE_TTL_SECONDS anyway.
  }

  return { settings: shape(document), changed: Object.keys(update).filter((k) => k !== 'updatedBy') };
}

/**
 * Whether an email address is acceptable under the domain allow-list.
 * An empty list means every domain is allowed.
 */
export function isEmailDomainAllowed(email, allowedEmailDomains) {
  if (!Array.isArray(allowedEmailDomains) || allowedEmailDomains.length === 0) return true;
  const domain = String(email || '').split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return allowedEmailDomains.includes(domain);
}
