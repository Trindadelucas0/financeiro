const { getPool } = require('../db/pool');

/**
 * Exige que o usuário autenticado tenha role 'admin'.
 * Deve ser usado após authJwt.
 * Valida o papel no banco para não confiar só no JWT.
 */
async function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT role, ativo FROM users WHERE id = $1 LIMIT 1',
      [req.user.id],
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    if (!rows[0].ativo) {
      return res.status(403).json({ error: 'Usuário desativado' });
    }

    if (rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }

    req.user.role = rows[0].role;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAdmin };
