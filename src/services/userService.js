const bcrypt = require('bcryptjs');
const { getPool } = require('../db/pool');
const { validateUsername, usernameFromEmail, ensureUniqueUsername } = require('../utils/username');
const { mapUser } = require('./profileService');
const subscriptionService = require('./subscriptionService');
const { TRIAL_PLAN } = require('../config/plan');

async function ensureUserSettings(client, userId) {
  await client.query(
    `INSERT INTO user_settings (user_id, current_month, saldo_conta)
     VALUES ($1, to_char(NOW(), 'YYYY-MM'), 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

async function createUser({ nome, email, password, role = 'user', username }) {
  const pool = getPool();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedRole = role === 'admin' ? 'admin' : 'user';

  if (!nome || !normalizedEmail || !password) {
    const err = new Error('nome, email e password são obrigatórios');
    err.status = 400;
    throw err;
  }

  if (password.length < 6) {
    const err = new Error('Senha deve ter pelo menos 6 caracteres');
    err.status = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let finalUsername;
    if (username) {
      finalUsername = validateUsername(username);
    } else {
      finalUsername = await ensureUniqueUsername(client, usernameFromEmail(normalizedEmail));
    }

    const insert = await client.query(
      `INSERT INTO users (nome, username, email, password_hash, role, ativo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, nome, username, email, role, ativo, created_at`,
      [nome.trim(), finalUsername, normalizedEmail, passwordHash, normalizedRole],
    );

    await ensureUserSettings(client, insert.rows[0].id);
    await client.query('COMMIT');

    return mapUser(insert.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const msg = err.constraint && String(err.constraint).includes('username')
        ? 'Username já cadastrado'
        : 'Email já cadastrado';
      const dup = new Error(msg);
      dup.status = 409;
      throw dup;
    }
    throw err;
  } finally {
    client.release();
  }
}

async function createUserWithTrial({ nome, email, password, username }) {
  const pool = getPool();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const trimmedNome = String(nome || '').trim();

  if (!trimmedNome || !normalizedEmail || !password) {
    const err = new Error('nome, email e password são obrigatórios');
    err.status = 400;
    throw err;
  }

  if (password.length < 6) {
    const err = new Error('Senha deve ter pelo menos 6 caracteres');
    err.status = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let finalUsername;
    if (username) {
      finalUsername = validateUsername(username);
    } else {
      finalUsername = await ensureUniqueUsername(client, usernameFromEmail(normalizedEmail));
    }

    const insert = await client.query(
      `INSERT INTO users (nome, username, email, password_hash, role, ativo, billing_source)
       VALUES ($1, $2, $3, $4, 'user', TRUE, 'site')
       RETURNING id, nome, username, email, role, ativo, created_at,
                 plan, subscription_status, subscription_current_period_end, access_grant_type`,
      [trimmedNome, finalUsername, normalizedEmail, passwordHash],
    );

    const userRow = insert.rows[0];
    await ensureUserSettings(client, userRow.id);
    await client.query('COMMIT');

    await subscriptionService.grantProAccess(userRow.id, TRIAL_PLAN.accessDays, {
      accessGrantType: 'trial',
    });

    const { rows } = await pool.query(
      `SELECT id, nome, username, email, role, ativo, created_at,
              plan, subscription_status, subscription_current_period_end, access_grant_type
       FROM users WHERE id = $1 LIMIT 1`,
      [userRow.id],
    );

    const refreshed = rows[0];
    return {
      user: mapUser(refreshed),
      subscription: subscriptionService.mapSubscription(refreshed),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const msg = err.constraint && String(err.constraint).includes('username')
        ? 'Username já cadastrado'
        : 'Email já cadastrado';
      const dup = new Error(msg);
      dup.status = 409;
      throw dup;
    }
    throw err;
  } finally {
    client.release();
  }
}

async function listUsers() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, nome, username, email, role, ativo, created_at
     FROM users
     ORDER BY created_at DESC`,
  );
  return rows.map(mapUser);
}

async function updateUser(id, { ativo, nome, role, username }) {
  const pool = getPool();
  const fields = [];
  const values = [];
  let idx = 1;

  if (typeof ativo === 'boolean') {
    fields.push(`ativo = $${idx++}`);
    values.push(ativo);
  }

  if (nome !== undefined) {
    fields.push(`nome = $${idx++}`);
    values.push(String(nome).trim());
  }

  if (username !== undefined) {
    fields.push(`username = $${idx++}`);
    values.push(validateUsername(username));
  }

  if (role !== undefined) {
    const normalizedRole = role === 'admin' ? 'admin' : 'user';
    fields.push(`role = $${idx++}`);
    values.push(normalizedRole);
  }

  if (fields.length === 0) {
    const err = new Error('Nenhum campo para atualizar');
    err.status = 400;
    throw err;
  }

  values.push(id);

  try {
    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id, nome, username, email, role, ativo, created_at`,
      values,
    );

    if (rows.length === 0) {
      const err = new Error('Usuário não encontrado');
      err.status = 404;
      throw err;
    }

    return mapUser(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      const dup = new Error('Username já cadastrado');
      dup.status = 409;
      throw dup;
    }
    throw err;
  }
}

async function createUserFromPurchase({ nome, email, password }) {
  const pool = getPool();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!nome || !normalizedEmail || !password) {
    const err = new Error('nome, email e password são obrigatórios');
    err.status = 400;
    throw err;
  }

  if (password.length < 6) {
    const err = new Error('Senha deve ter pelo menos 6 caracteres');
    err.status = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const finalUsername = await ensureUniqueUsername(client, usernameFromEmail(normalizedEmail));

    const insert = await client.query(
      `INSERT INTO users (nome, username, email, password_hash, role, ativo, must_change_password)
       VALUES ($1, $2, $3, $4, 'user', TRUE, TRUE)
       RETURNING id, nome, username, email, role, ativo, must_change_password, created_at`,
      [nome.trim(), finalUsername, normalizedEmail, passwordHash],
    );

    await ensureUserSettings(client, insert.rows[0].id);
    await client.query('COMMIT');

    return mapUser(insert.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const msg = err.constraint && String(err.constraint).includes('username')
        ? 'Username já cadastrado'
        : 'Email já cadastrado';
      const dup = new Error(msg);
      dup.status = 409;
      throw dup;
    }
    throw err;
  } finally {
    client.release();
  }
}

async function getUserByEmail(email) {
  const pool = getPool();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const { rows } = await pool.query(
    `SELECT id, nome, username, email, role, ativo, must_change_password, created_at
     FROM users WHERE email = $1 LIMIT 1`,
    [normalizedEmail],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

module.exports = {
  createUser,
  createUserWithTrial,
  createUserFromPurchase,
  getUserByEmail,
  listUsers,
  updateUser,
};
