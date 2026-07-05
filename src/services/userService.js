const bcrypt = require('bcryptjs');
const { getPool } = require('../db/pool');

function mapUser(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    role: row.role,
    ativo: row.ativo,
    createdAt: row.created_at,
  };
}

async function ensureUserSettings(client, userId) {
  await client.query(
    `INSERT INTO user_settings (user_id, current_month, saldo_conta)
     VALUES ($1, to_char(NOW(), 'YYYY-MM'), 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

async function createUser({ nome, email, password, role = 'user' }) {
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

    const insert = await client.query(
      `INSERT INTO users (nome, email, password_hash, role, ativo)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, nome, email, role, ativo, created_at`,
      [nome.trim(), normalizedEmail, passwordHash, normalizedRole],
    );

    await ensureUserSettings(client, insert.rows[0].id);
    await client.query('COMMIT');

    return mapUser(insert.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const dup = new Error('Email já cadastrado');
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
    `SELECT id, nome, email, role, ativo, created_at
     FROM users
     ORDER BY created_at DESC`,
  );
  return rows.map(mapUser);
}

async function updateUser(id, { ativo, nome, role }) {
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

  const { rows } = await pool.query(
    `UPDATE users SET ${fields.join(', ')}
     WHERE id = $${idx}
     RETURNING id, nome, email, role, ativo, created_at`,
    values,
  );

  if (rows.length === 0) {
    const err = new Error('Usuário não encontrado');
    err.status = 404;
    throw err;
  }

  return mapUser(rows[0]);
}

module.exports = { createUser, listUsers, updateUser };
