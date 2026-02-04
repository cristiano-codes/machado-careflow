const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const sequelize = require('../config/database');

// Protege a rota (JWT obrigatório)
router.use(authMiddleware);

// LISTAR PACIENTES (RAILWAY / POSTGRES REAL)
router.get('/', async (req, res) => {
  try {
    const [pacientes] = await sequelize.query(`
      SELECT
        id,
        name AS "nome",
        cpf,
        phone AS "telefone",
        email,
        date_of_birth AS "dataNascimento",
        status
      FROM patients
      ORDER BY created_at DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      total: pacientes.length,
      pacientes
    });
  } catch (error) {
    console.error('Erro ao listar pacientes:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar pacientes'
    });
  }
});

module.exports = router;
