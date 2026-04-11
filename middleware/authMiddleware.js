const jwt = require('jsonwebtoken');

/**
 * Middleware que valida o JWT em rotas protegidas.
 * Uso: router.get('/rota', authMiddleware, handler)
 *
 * Espera o header:  Authorization: Bearer <token>
 * Se válido, adiciona req.user = { id, email, perfil, nome }
 */
module.exports = function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error:   'token_ausente',
      message: 'Token de autenticação não fornecido.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, perfil, nome, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error:   'token_expirado',
        message: 'Sessão expirada. Faça login novamente.',
      });
    }
    return res.status(401).json({
      error:   'token_invalido',
      message: 'Token inválido.',
    });
  }
};
