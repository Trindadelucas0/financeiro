const { verifyToken } = require('../utils/jwt');

/**
 * Middleware de autenticação JWT via header Authorization Bearer.
 * Valida o token e anexa req.user para rotas protegidas.
 */
function authJwt(req, res, next) {
  // 1. Lê o header Authorization enviado pelo cliente (ex.: "Bearer eyJhbG...")
  const authHeader = req.headers.authorization;

  // 2. Se o header não existir, o cliente não está autenticado
  if (!authHeader) {
    return res.status(401).json({ error: 'Token de autenticação ausente' });
  }

  // 3. Divide o header em duas partes: esquema ("Bearer") e o token em si
  const parts = authHeader.split(' ');

  // 4. O formato correto é exatamente duas partes: "Bearer" + token
  if (parts.length !== 2) {
    return res.status(401).json({ error: 'Formato de Authorization inválido' });
  }

  // 5. Extrai o esquema (primeira parte) e normaliza para comparação
  const [scheme, token] = parts;

  // 6. Só aceitamos o esquema Bearer (padrão para APIs REST com JWT)
  if (scheme !== 'Bearer') {
    return res.status(401).json({ error: 'Esquema de autenticação deve ser Bearer' });
  }

  // 7. Token vazio após "Bearer " também é inválido
  if (!token || token.trim() === '') {
    return res.status(401).json({ error: 'Token vazio' });
  }

  try {
    // 8. Verifica assinatura e expiração do JWT com o segredo do servidor
    const decoded = verifyToken(token);

    // 9. Garante que o payload contém os campos mínimos esperados
    if (!decoded.id || !decoded.email || !decoded.role) {
      return res.status(401).json({ error: 'Token com payload incompleto' });
    }

    // 10. Anexa o usuário decodificado na requisição para controllers/services
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      nome: decoded.nome || '',
    };

    // 11. Segue para o próximo middleware ou controller
    return next();
  } catch (err) {
    // 12. Token expirado, assinatura inválida ou malformado → 401
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
}

module.exports = { authJwt };
