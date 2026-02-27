const express = require('express');
const router = express.Router();
const pool = require('../config/pg');

function isTruthy(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  return ['1', 'true', 'sim', 'yes', 'y'].includes(normalized);
}

// GET - Buscar serviços
router.get('/', async (req, res) => {
  const activeOnly = isTruthy(req.query?.active);

  try {
    if (activeOnly) {
      const result = await pool.query(`
        SELECT id, name
        FROM services
        WHERE active = true
        ORDER BY name
      `);

      return res.json({
        success: true,
        services: result.rows,
      });
    }

    const result = await pool.query('SELECT * FROM services WHERE active = true ORDER BY name');

    return res.json({
      success: true,
      services: result.rows,
    });
  } catch (error) {
    console.error('Erro ao buscar serviços:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

module.exports = router;
