const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS, 10) || 10;

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

async function createUser(userData) {
  const { name, email, password } = userData;
  if (!name || !email || !password) {
    throw new Error('Name, email, and password are required');
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    throw new Error('Invalid email format');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const query = `
    INSERT INTO users (name, email, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id, name, email, created_at, updated_at
  `;
  const values = [name, normalizedEmail, passwordHash];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (err) {
    if (err.code === '23505' && err.constraint && err.constraint.includes('users_email_key')) {
      throw new Error('Email already in use.');
    }
    throw err;
  }
}

async function getUserById(userId) {
  if (!userId) {
    throw new Error('User ID is required');
  }
  const query = `
    SELECT id, name, email, created_at, updated_at
    FROM users
    WHERE id = $1
  `;
  const result = await pool.query(query, [userId]);
  return result.rows[0] || null;
}

async function updateUser(userId, updateData) {
  if (!userId) {
    throw new Error('User ID is required');
  }
  const fields = [];
  const values = [];
  let idx = 1;

  if (updateData.name) {
    fields.push(`name = $${idx++}`);
    values.push(updateData.name);
  }
  if (updateData.email) {
    const normalizedEmail = normalizeEmail(updateData.email);
    if (!isValidEmail(normalizedEmail)) {
      throw new Error('Invalid email format');
    }
    fields.push(`email = $${idx++}`);
    values.push(normalizedEmail);
  }
  if (updateData.password) {
    const hash = await bcrypt.hash(updateData.password, SALT_ROUNDS);
    fields.push(`password_hash = $${idx++}`);
    values.push(hash);
  }
  if (fields.length === 0) {
    throw new Error('No fields provided for update');
  }

  values.push(userId);
  const query = `
    UPDATE users
    SET ${fields.join(', ')}, updated_at = now()
    WHERE id = $${idx}
    RETURNING id, name, email, created_at, updated_at
  `;

  try {
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }
    return result.rows[0];
  } catch (err) {
    if (err.code === '23505' && err.constraint && err.constraint.includes('users_email_key')) {
      throw new Error('Email already in use.');
    }
    throw err;
  }
}

async function deleteUser(userId) {
  if (!userId) {
    throw new Error('User ID is required');
  }
  const query = `
    DELETE FROM users
    WHERE id = $1
    RETURNING id
  `;
  const result = await pool.query(query, [userId]);
  if (result.rows.length === 0) {
    throw new Error('User not found');
  }
  return true;
}

async function linkLeagueAccount(userId, leagueData) {
  if (!userId || !leagueData || !leagueData.leagueId) {
    throw new Error('User ID and leagueData.leagueId are required');
  }
  const { leagueId, leagueUserId, leagueName } = leagueData;
  if (!leagueUserId || typeof leagueUserId !== 'string' || !leagueUserId.trim()) {
    throw new Error('leagueData.leagueUserId is required and must be a non-empty string');
  }
  if (!leagueName || typeof leagueName !== 'string' || !leagueName.trim()) {
    throw new Error('leagueData.leagueName is required and must be a non-empty string');
  }

  const query = `
    INSERT INTO league_accounts
      (user_id, league_id, league_user_id, league_name)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, league_id)
    DO UPDATE SET
      league_user_id = EXCLUDED.league_user_id,
      league_name = EXCLUDED.league_name,
      updated_at = now()
    RETURNING id, user_id, league_id, league_user_id, league_name, created_at, updated_at
  `;
  const values = [userId, leagueId, leagueUserId.trim(), leagueName.trim()];
  const result = await pool.query(query, values);
  return result.rows[0];
}

module.exports = {
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  linkLeagueAccount
};