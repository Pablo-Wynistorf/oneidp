const { Pool } = require('pg');
require('dotenv').config();

const { POSTGRES_URI } = process.env;

const pool = new Pool({ connectionString: POSTGRES_URI });

async function connectToDatabase() {
  try {
    await pool.query('SELECT 1');
    console.log('Connected to PostgreSQL');
  } catch (err) {
    console.error('PostgreSQL connection error:', err);
    setTimeout(connectToDatabase, 5000);
  }
}

function buildFilter(filter = {}, fieldMap = {}, startIdx = 1) {
  const clauses = [];
  const values = [];
  let idx = startIdx;
  for (const [key, val] of Object.entries(filter)) {
    const column = fieldMap[key] || key;
    if (val && typeof val === 'object') {
      if (Array.isArray(val.$in)) {
        clauses.push(`${column} = ANY($${idx}::text[])`);
        values.push(val.$in);
        idx++;
      } else if (val.$regex) {
        clauses.push(`${column} LIKE $${idx}`);
        values.push(val.$regex.replace('*', '%'));
        idx++;
      }
    } else {
      clauses.push(`${column} = $${idx}`);
      values.push(val);
      idx++;
    }
  }
  return { clause: clauses.length ? clauses.join(' AND ') : '1=1', values, idx };
}

function mapUpdate(update = {}, fieldMap = {}, startIdx = 1) {
  const sets = [];
  const values = [];
  let idx = startIdx;
  if (update.$set) {
    for (const [key, val] of Object.entries(update.$set)) {
      const column = fieldMap[key] || key;
      sets.push(`${column} = $${idx}`);
      values.push(val);
      idx++;
    }
  }
  if (update.$unset) {
    for (const key of Object.keys(update.$unset)) {
      const column = fieldMap[key] || key;
      sets.push(`${column} = NULL`);
    }
  }
  return { sets: sets.join(', '), values, idx };
}

function mapFields(data = {}, fieldMap = {}) {
  const columns = [];
  const values = [];
  const placeholders = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    const column = fieldMap[key] || key;
    columns.push(column);
    values.push(val);
    placeholders.push(`$${idx++}`);
  }
  return { columns, values, placeholders };
}

function createModel(table, fieldMap) {
  return class {
    constructor(data = {}) {
      Object.assign(this, data);
    }

    async save() {
      const { columns, values, placeholders } = mapFields(this, fieldMap);
      const query = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders.join(',')})`;
      await pool.query(query, values);
    }

    static async findOne(filter = {}) {
      const { clause, values } = buildFilter(filter, fieldMap);
      const res = await pool.query(`SELECT * FROM ${table} WHERE ${clause} LIMIT 1`, values);
      return res.rows[0];
    }

    static find(filter = {}) {
      const { clause, values } = buildFilter(filter, fieldMap);
      const baseQuery = async (fields = '*') => {
        const res = await pool.query(`SELECT ${fields} FROM ${table} WHERE ${clause}`, values);
        return res.rows;
      };
      const promise = baseQuery();
      promise.select = (fields) => {
        const cols = fields
          .split(/\s+/)
          .filter(Boolean)
          .map(f => fieldMap[f] || f)
          .join(',');
        return baseQuery(cols);
      };
      return promise;
    }

    static async countDocuments(filter = {}) {
      const { clause, values } = buildFilter(filter, fieldMap);
      const res = await pool.query(`SELECT COUNT(*) FROM ${table} WHERE ${clause}`, values);
      return parseInt(res.rows[0].count, 10);
    }

    static async updateOne(filter = {}, update = {}) {
      const { clause, values, idx } = buildFilter(filter, fieldMap);
      const { sets, values: setVals } = mapUpdate(update, fieldMap, idx);
      await pool.query(`UPDATE ${table} SET ${sets} WHERE ${clause}`, values.concat(setVals));
    }

    static async findOneAndUpdate(filter = {}, update = {}) {
      const { clause, values, idx } = buildFilter(filter, fieldMap);
      const { sets, values: setVals } = mapUpdate(update, fieldMap, idx);
      const res = await pool.query(`UPDATE ${table} SET ${sets} WHERE ${clause} RETURNING *`, values.concat(setVals));
      return res.rows[0];
    }

    static async deleteOne(filter = {}) {
      const { clause, values } = buildFilter(filter, fieldMap);
      await pool.query(`DELETE FROM ${table} WHERE ${clause}`, values);
    }

    static async deleteMany(filter = {}) {
      const { clause, values } = buildFilter(filter, fieldMap);
      await pool.query(`DELETE FROM ${table} WHERE ${clause}`, values);
    }
  };
}

const userFieldMap = {
  userId: 'id',
  firstName: 'first_name',
  lastName: 'last_name',
  username: 'username',
  password: 'password',
  email: 'email',
  identityProvider: 'identity_provider',
  identityProviderUserId: 'identity_provider_user_id',
  passkeyId: 'passkey_id',
  passkeyPublicKey: 'passkey_public_key',
  mfaSecret: 'mfa_secret',
  mfaEnabled: 'mfa_enabled',
  emailVerified: 'email_verified',
  providerRoles: 'provider_roles',
  signCount: 'sign_count',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const oauthClientAppFieldMap = {
  oauthAppName: 'name',
  oauthClientAppId: 'id',
  clientId: 'client_id',
  clientSecret: 'client_secret',
  redirectUri: 'redirect_uri',
  accessTokenValidity: 'access_token_validity',
  isPublicClient: 'is_public_client',
  owner: 'owner_user_id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const oauthRolesFieldMap = {
  oauthRoleId: 'id',
  oauthClientAppId: 'oauth_client_app_id',
  oauthClientId: 'oauth_client_id',
  oauthRoleName: 'name',
  oauthUserIds: 'oauth_user_ids',
  owner: 'owner_user_id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const userDB = createModel('users', userFieldMap);
const oAuthClientAppDB = createModel('oauth_client_apps', oauthClientAppFieldMap);
const oAuthRolesDB = createModel('oauth_roles', oauthRolesFieldMap);

module.exports = {
  connectToDatabase,
  userDB,
  oAuthClientAppDB,
  oAuthRolesDB,
};
