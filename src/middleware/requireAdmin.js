const { getPool } = require('../db/pool');
const { canManagePlatform } = require('../config/adminAccess');

/**
 * Exige admin da plataforma (role admin + e-mail do ADMIN_EMAIL no .env).
 * Deve ser usado após authJwt.
 */
async function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT role, email, ativo FROM users WHERE id = $1 LIMIT 1',
      [req.user.id],
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    if (!rows[0].ativo) {
      return res.status(403).json({ error: 'Usuário desativado' });
    }

    if (!canManagePlatform({ role: rows[0].role, email: rows[0].email })) {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }

    req.user.role = rows[0].role;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAdmin };
