const express = require('express');
const router = express.Router();
const pool = require('../config/pg');

// POST - Criar pré-agendamento
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, service_type, preferred_date, preferred_time, notes } = req.body;

    const result = await pool.query(`
      INSERT INTO pre_appointments (
        name, phone, email, service_type, preferred_date, preferred_time, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [name, phone, email, service_type, preferred_date, preferred_time, notes]);

    res.json({
      success: true,
      message: 'Pré-agendamento criado com sucesso',
      id: result.rows[0].id
    });
  } catch (error) {
    console.error('Erro ao criar pré-agendamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// GET - Buscar pré-agendamentos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM pre_appointments 
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      preAppointments: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar pré-agendamentos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
