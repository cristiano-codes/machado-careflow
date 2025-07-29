const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

// Middleware de autenticação para todas as rotas de usuários
router.use(authMiddleware);

// Listar usuários
router.get('/', (req, res) => {
  res.json({
    message: 'Lista de usuários',
    users: [
      {
        id: 1,
        name: 'Dr. João Silva',
        email: 'joao.silva@institutolauir.com.br',
        role: 'Coordenador Geral'
      }
    ]
  });
});

// Buscar usuário por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  res.json({
    message: `Dados do usuário ${id}`,
    user: {
      id: parseInt(id),
      name: 'Dr. João Silva',
      email: 'joao.silva@institutolauir.com.br',
      role: 'Coordenador Geral'
    }
  });
});

module.exports = router;