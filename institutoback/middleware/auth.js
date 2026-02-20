// C:/projeto/machado-careflow/institutoback/middleware/auth.js

const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticação do sistema AcolherFlow (IDSLM)
 * - Sempre valida JWT; não existe mais bypass por variável de ambiente.
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token de acesso n?o fornecido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');

    // Garante estrutura consistente no request para checagem de permiss?es
    req.user = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
      name: decoded.name,
      role: decoded.role,
      professional_id: decoded.professional_id || null,
      can_view_all_professionals: decoded.can_view_all_professionals === true,
      permissions: Array.isArray(decoded.permissions)
        ? decoded.permissions
            .map((p) => (typeof p === 'string' ? p.trim().toLowerCase() : ''))
            .filter(Boolean)
        : [],
    };

    return next();
  } catch (error) {
    console.error('Erro na verifica??o JWT:', error.message);
    return res.status(401).json({ message: 'Token inv?lido ou expirado' });
  }
};

module.exports = authMiddleware;
