const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const pool = require('../config/pg');

// Middleware de autenticação para todas as rotas de usuários
router.use(authMiddleware);

// Middleware para verificar se é admin
const adminMiddleware = (req, res, next) => {
  const role = (req.user?.role || '').toString().trim().toLowerCase();
  const allowedRoles = ['coordenador geral', 'administrador', 'admin', 'gestao', 'gestão', 'gestor'];

  const hasPermissionFromRole = allowedRoles.includes(role);

  const hasPermissionFromScope = Array.isArray(req.user?.permissions)
    ? req.user.permissions
        .map((permission) =>
          typeof permission === 'string' ? permission.trim().toLowerCase() : ''
        )
        .some((permission) =>
          ['admin:all', 'admin', 'manage:users', 'users:manage'].includes(permission)
        )
    : false;

  if (!hasPermissionFromRole && !hasPermissionFromScope) {
    return res
      .status(403)
      .json({ message: 'Acesso negado. Apenas administradores.' });
  }

  next();
};

// Listar todos os usuários (apenas admin)
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, email, name, phone, role, status, created_at
      FROM users
      ORDER BY created_at DESC
    `);

    res.json({
      message: 'Lista de usuários',
      users: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Listar usuários pendentes de aprovação (apenas admin)
router.get('/pending', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, email, name, phone, created_at
      FROM users
      WHERE status = 'pendente'
      ORDER BY created_at DESC
    `);

    res.json({
      message: 'Usuários pendentes de aprovação',
      users: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar usuários pendentes:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Aprovar usuário (apenas admin)
router.patch('/:id/approve', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2 RETURNING username, name',
      ['ativo', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({
      message: `Usuário ${result.rows[0].name} aprovado com sucesso!`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao aprovar usuário:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Rejeitar usuário (apenas admin)
router.patch('/:id/reject', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2 RETURNING username, name',
      ['rejeitado', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({
      message: `Usuário ${result.rows[0].name} rejeitado.`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao rejeitar usuário:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Bloquear usuário (apenas admin)
router.patch('/:id/block', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2 RETURNING username, name',
      ['bloqueado', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({
      message: `Usuário ${result.rows[0].name} bloqueado.`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao bloquear usuário:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Buscar usuário por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT id, username, email, name, phone, role, status, created_at FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({
      message: `Dados do usuário ${id}`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Redefinir senha de um usuário (apenas admin/gestão; admin só por admin)
router.post('/:id/reset-password', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ message: 'Senha inválida. Mínimo 6 caracteres.' });
    }

    const targetUser = await pool.query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const requesterRole = (req.user?.role || '').toString().trim().toLowerCase();
    const targetRole = (targetUser.rows[0].role || '').toString().trim().toLowerCase();

    // Apenas outro admin pode resetar senha de admin
    if (targetRole === 'admin' && requesterRole !== 'admin') {
      return res.status(403).json({ message: 'Apenas administrador pode redefinir senha de outro administrador' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      'UPDATE users SET password = $1, first_access = true, updated_at = NOW() WHERE id = $2',
      [hashedPassword, id]
    );

    return res.json({ message: 'Senha redefinida com sucesso' });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

module.exports = router;
