// C:\projeto\machado-careflow\institutoback\middleware\auth.js

const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticação do sistema Instituto Machado-CareFlow
 * ---------------------------------------------------------------
 * - Se DISABLE_AUTH=true → ignora autenticação e injeta usuário admin
 * - Caso contrário → valida o token normalmente via JWT
 */
const authMiddleware = (req, res, next) => {
  // 🔓 Bypass total de autenticação no modo desenvolvimento
  if (process.env.DISABLE_AUTH === 'true') {
    req.user = {
      id: 'd1aa940b-2c48-4d29-bdfa-9b4ec08fe409',
      email: 'admin@admin.com',
      name: 'Administrador',
      role: 'admin',
    };
    return next();
  }

  // 🔒 Validação normal com JWT
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token de acesso não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Erro na verificação JWT:', error.message);
    return res.status(401).json({ message: 'Token inválido ou expirado' });
  }
};

module.exports = authMiddleware;
