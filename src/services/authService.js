const bcrypt = require('bcryptjs');
const { getPool } = require('../db/pool');
const { signToken } = require('../utils/jwt');

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

async function login(email, password) {
  const pool = getPool();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1 LIMIT 1',
    [normalizedEmail],
  );

  if (rows.length === 0) {
    const err = new Error('Credenciais inválidas');
    err.status = 401;
    throw err;
  }

  const user = rows[0];

  if (!user.ativo) {
    const err = new Error('Usuário desativado');
    err.status = 403;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('Credenciais inválidas');
    err.status = 401;
    throw err;
  }

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    nome: user.nome,
  };

  const token = signToken(payload);

  return { token, user: mapUser(user) };
}

async function getMe(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, nome, email, role, ativo, created_at FROM users WHERE id = $1 LIMIT 1',
    [userId],
  );

  if (rows.length === 0) {
    const err = new Error('Usuário não encontrado');
    err.status = 404;
    throw err;
  }

  if (!rows[0].ativo) {
    const err = new Error('Usuário desativado');
    err.status = 403;
    throw err;
  }

  return mapUser(rows[0]);
}

module.exports = { login, getMe };
