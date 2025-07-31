const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { Pool } = require('pg');

// Configuração do banco
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'instituto_lauir',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS
});

// Middleware de autenticação para todas as rotas de usuários
router.use(authMiddleware);

// Middleware para verificar se é admin
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'Coordenador Geral') {
    return res.status(403).json({ message: 'Acesso negado. Apenas administradores.' });
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

module.exports = router;