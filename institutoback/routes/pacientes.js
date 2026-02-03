const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const sequelize = require('../config/database');

// Protege a rota
router.use(authMiddleware);

// LISTAR PACIENTES (REAL)
router.get('/', async (req, res) => {
  try {
    const [pacientes] = await sequelize.query(`
      SELECT id, nome, cpf, telefone, email, data_nascimento AS "dataNascimento", status
      FROM pacientes
      ORDER BY id DESC
      LIMIT 100
    `);

    res.json({
      message: 'Lista de pacientes',
      total: pacientes.length,
      pacientes
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao listar pacientes' });
  }
});

module.exports = router;
