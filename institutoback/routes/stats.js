const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const isProd = process.env.NODE_ENV === 'production';

// Pool compatível com Railway (DATABASE_URL) e local (DB_*)
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isProd ? { rejectUnauthorized: false } : false,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'sistema',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || '110336',
    });

// GET - Buscar estatísticas do dashboard
router.get('/', async (req, res) => {
  try {
    // Melhor que string "YYYY-MM-DD" se sua coluna for DATE.
    // Se appointment_date for TIMESTAMP, depois ajustamos.
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(today.getUTCDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const [
      patientsResult,
      appointmentsTodayResult,
      evaluationsPendingResult,
      revenueResult,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM patients'),
      pool.query(
        'SELECT COUNT(*)::int AS count FROM appointments WHERE appointment_date = $1::date',
        [todayStr]
      ),
      pool.query("SELECT COUNT(*)::int AS count FROM evaluations WHERE status = 'scheduled'"),
      pool.query(
        `
        SELECT COALESCE(SUM(amount), 0)::numeric AS total
        FROM financial_transactions
        WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)
        `
      ),
    ]);

    res.json({
      success: true,
      stats: {
        totalPacientes: patientsResult.rows[0]?.count ?? 0,
        agendamentosHoje: appointmentsTodayResult.rows[0]?.count ?? 0,
        avaliacoesPendentes: evaluationsPendingResult.rows[0]?.count ?? 0,
        receitaMensal: Number(revenueResult.rows[0]?.total ?? 0),
      },
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error?.message || error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      // em produção não vaza detalhe; em dev ajuda
      error: isProd ? undefined : (error?.message || String(error)),
    });
  }
});

module.exports = router;
