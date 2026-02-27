const express = require('express');
const router = express.Router();
const pool = require('../config/pg');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS db,
        inet_server_addr() AS server_ip,
        inet_server_port() AS server_port,
        version() AS version
    `);

    const row = result.rows[0] || {};

    return res.json({
      success: true,
      dbinfo: {
        db: row.db ?? null,
        server_ip: row.server_ip ?? null,
        server_port: row.server_port ?? null,
        version: row.version ?? null,
      },
    });
  } catch (error) {
    console.error('Erro ao obter info de banco:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao obter info de banco',
      debug: {
        error: error?.message || 'Erro desconhecido',
        code: error?.code || null,
      },
    });
  }
});

module.exports = router;
