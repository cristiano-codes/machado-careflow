const express = require('express');
const router = express.Router();
const pool = require('../config/pg');

// GET - Buscar serviços ativos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services WHERE active = true ORDER BY name');

    res.json({
      success: true,
      services: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar serviços:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
