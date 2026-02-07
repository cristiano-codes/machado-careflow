const express = require('express');
const router = express.Router();
const pool = require('../config/pg');

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
