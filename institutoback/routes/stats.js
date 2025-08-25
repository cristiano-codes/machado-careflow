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

// GET - Buscar estatísticas do dashboard
router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Buscar estatísticas
    const patientsResult = await pool.query('SELECT COUNT(*) as count FROM patients');
    const appointmentsTodayResult = await pool.query(
      'SELECT COUNT(*) as count FROM appointments WHERE appointment_date = $1',
      [today]
    );
    const evaluationsPendingResult = await pool.query(
      "SELECT COUNT(*) as count FROM evaluations WHERE status = 'scheduled'"
    );
    const revenueResult = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM financial_transactions WHERE EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)'
    );

    res.json({
      success: true,
      stats: {
        totalPacientes: parseInt(patientsResult.rows[0].count),
        agendamentosHoje: parseInt(appointmentsTodayResult.rows[0].count),
        avaliacoesPendentes: parseInt(evaluationsPendingResult.rows[0].count),
        receitaMensal: parseFloat(revenueResult.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;