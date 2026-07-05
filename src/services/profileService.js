const bcrypt = require('bcryptjs');
const { getPool } = require('../db/pool');
const { validateUsername } = require('../utils/username');

const FEEDBACK_TIPOS = new Set(['sugestao', 'bug', 'outro']);

function mapUser(row) {
  return {
    id: row.id,
    nome: row.nome,
    username: row.username,
    email: row.email,
    role: row.role,
    ativo: row.ativo,
    createdAt: row.created_at,
  };
}

function mapFeedback(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userNome: row.user_nome,
    userUsername: row.user_username,
    tipo: row.tipo,
    mensagem: row.mensagem,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function updateProfile(userId, { nome, username }) {
  const pool = getPool();
  const fields = [];
  const values = [];
  let idx = 1;

  if (nome !== undefined) {
    const trimmed = String(nome).trim();
    if (!trimmed) {
      const err = new Error('Nome é obrigatório');
      err.status = 400;
      throw err;
    }
    fields.push(`nome = $${idx++}`);
    values.push(trimmed);
  }

  if (username !== undefined) {
    const normalized = validateUsername(username);
    fields.push(`username = $${idx++}`);
    values.push(normalized);
  }

  if (fields.length === 0) {
    const err = new Error('Nenhum campo para atualizar');
    err.status = 400;
    throw err;
  }

  values.push(userId);

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
      const dup = new Error('Username já está em uso');
      dup.status = 409;
      throw dup;
    }
    throw err;
  }
}

async function checkUsernameAvailable(rawUsername, excludeUserId) {
  let username;
  try {
    username = validateUsername(rawUsername);
  } catch (err) {
    return { available: false, username: null, reason: err.message };
  }

  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT 1 FROM users WHERE username = $1 AND id <> $2 LIMIT 1',
    [username, excludeUserId],
  );

  if (rows.length > 0) {
    return { available: false, username, reason: 'Nome de usuário já está em uso' };
  }

  return { available: true, username, reason: null };
}

async function changePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    const err = new Error('Senha atual e nova senha são obrigatórias');
    err.status = 400;
    throw err;
  }

  if (String(newPassword).length < 6) {
    const err = new Error('Nova senha deve ter pelo menos 6 caracteres');
    err.status = 400;
    throw err;
  }

  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1 LIMIT 1',
    [userId],
  );

  if (rows.length === 0) {
    const err = new Error('Usuário não encontrado');
    err.status = 404;
    throw err;
  }

  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) {
    const err = new Error('Senha atual incorreta');
    err.status = 401;
    throw err;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}

async function createFeedback(userId, { tipo, mensagem }) {
  const normalizedTipo = String(tipo || '').trim().toLowerCase();
  const text = String(mensagem || '').trim();

  if (!FEEDBACK_TIPOS.has(normalizedTipo)) {
    const err = new Error('Tipo inválido');
    err.status = 400;
    throw err;
  }

  if (text.length < 10 || text.length > 2000) {
    const err = new Error('Mensagem deve ter entre 10 e 2000 caracteres');
    err.status = 400;
    throw err;
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO user_feedback (user_id, tipo, mensagem, status)
     VALUES ($1, $2, $3, 'novo')
     RETURNING id, user_id, tipo, mensagem, status, created_at`,
    [userId, normalizedTipo, text],
  );

  return {
    id: rows[0].id,
    tipo: rows[0].tipo,
    mensagem: rows[0].mensagem,
    status: rows[0].status,
    createdAt: rows[0].created_at,
  };
}

async function listFeedback() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT f.id, f.user_id, f.tipo, f.mensagem, f.status, f.created_at,
            u.nome AS user_nome, u.username AS user_username
     FROM user_feedback f
     JOIN users u ON u.id = f.user_id
     ORDER BY f.created_at DESC`,
  );
  return rows.map(mapFeedback);
}

async function markFeedbackRead(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE user_feedback SET status = 'lido'
     WHERE id = $1
     RETURNING id, user_id, tipo, mensagem, status, created_at`,
    [id],
  );

  if (rows.length === 0) {
    const err = new Error('Sugestão não encontrada');
    err.status = 404;
    throw err;
  }

  return {
    id: rows[0].id,
    status: rows[0].status,
    createdAt: rows[0].created_at,
  };
}

module.exports = {
  updateProfile,
  changePassword,
  createFeedback,
  listFeedback,
  markFeedbackRead,
  checkUsernameAvailable,
  mapUser,
};
