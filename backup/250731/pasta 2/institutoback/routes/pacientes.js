const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

// Middleware de autenticação
router.use(authMiddleware);

// Listar pacientes
router.get('/', (req, res) => {
  res.json({
    message: 'Lista de pacientes',
    pacientes: [
      {
        id: 1,
        nome: 'Maria Santos',
        cpf: '123.456.789-00',
        telefone: '(11) 99999-9999',
        email: 'maria@email.com',
        dataNascimento: '1980-05-15',
        status: 'Ativo'
      }
    ]
  });
});

// Buscar paciente por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  res.json({
    message: `Dados do paciente ${id}`,
    paciente: {
      id: parseInt(id),
      nome: 'Maria Santos',
      cpf: '123.456.789-00',
      telefone: '(11) 99999-9999',
      email: 'maria@email.com',
      dataNascimento: '1980-05-15',
      status: 'Ativo'
    }
  });
});

// Criar novo paciente
router.post('/', (req, res) => {
  const dadosPaciente = req.body;
  res.status(201).json({
    message: 'Paciente criado com sucesso',
    paciente: {
      id: Date.now(),
      ...dadosPaciente
    }
  });
});

module.exports = router;