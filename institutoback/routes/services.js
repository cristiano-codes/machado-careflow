const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sistema',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '110336'
});

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