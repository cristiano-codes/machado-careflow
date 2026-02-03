const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');

// helpers
async function tableExists(tableName) {
  const [rows] = await sequelize.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = :table
    ) AS exists
    `,
    { replacements: { table: tableName } }
  );
  return !!rows?.[0]?.exists;
}

async function safeCount(tableName, whereSql = '', replacements = {}) {
  try {
    const exists = await tableExists(tableName);
    if (!exists) return 0;

    const sql = `SELECT COUNT(*)::int AS count FROM "${tableName}" ${whereSql}`;
    const [rows] = await sequelize.query(sql, { replacements });
    return rows?.[0]?.count ?? 0;
  } catch (err) {
    console.error(`[stats] erro no COUNT em ${tableName}:`, err.message);
    return 0;
  }
}

async function safeSum(tableName, sumColumn, whereSql = '', replacements = {}) {
  try {
    const exists = await tableExists(tableName);
    if (!exists) return 0;

    const sql = `
      SELECT COALESCE(SUM("${sumColumn}"), 0)::numeric AS total
      FROM "${tableName}"
      ${whereSql}
    `;
    const [rows] = await sequelize.query(sql, { replacements });
    return Number(rows?.[0]?.total ?? 0);
  } catch (err) {
    console.error(`[stats] erro no SUM em ${tableName}.${sumColumn}:`, err.message);
    return 0;
  }
}

// GET - Buscar estatísticas do dashboard
router.get('/', async (req, res) => {
  try {
    // Ajuste os nomes abaixo se suas tabelas tiverem outros nomes no banco
    const TABLES = {
      patients: 'patients',
      appointments: 'appointments',
      evaluations: 'evaluations',
      financial: 'financial_transactions',
    };

    const totalPacientes = await safeCount(TABLES.patients);

    // Mais robusto que comparar string: pega "hoje" via CURRENT_DATE
    const agendamentosHoje = await safeCount(
      TABLES.appointments,
      `WHERE DATE("appointment_date") = CURRENT_DATE`
    );

    const avaliacoesPendentes = await safeCount(
      TABLES.evaluations,
      `WHERE "status" = :status`,
      { status: 'scheduled' }
    );

    const receitaMensal = await safeSum(
      TABLES.financial,
      'amount',
      `WHERE DATE_TRUNC('month', "created_at") = DATE_TRUNC('month', CURRENT_DATE)`
    );

    return res.json({
      success: true,
      stats: {
        totalPacientes,
        agendamentosHoje,
        avaliacoesPendentes,
        receitaMensal,
      },
    });
  } catch (error) {
    console.error('[stats] Erro ao buscar estatísticas:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

module.exports = router;
