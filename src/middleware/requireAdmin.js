/**
 * Exige que o usuário autenticado tenha role 'admin'.
 * Deve ser usado após authJwt.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }

  return next();
}

module.exports = { requireAdmin };
