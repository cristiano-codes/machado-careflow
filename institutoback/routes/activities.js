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

// GET - Buscar atividades recentes
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.id,
        a.appointment_date,
        a.created_at,
        p.name as patient_name
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      ORDER BY a.created_at DESC
      LIMIT 5
    `);

    const activities = result.rows.map(activity => ({
      id: activity.id,
      paciente: activity.patient_name || 'Paciente não identificado',
      acao: `Agendamento para ${new Date(activity.appointment_date).toLocaleDateString('pt-BR')}`,
      tempo: new Date(activity.created_at).toLocaleString('pt-BR')
    }));

    res.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('Erro ao buscar atividades:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;