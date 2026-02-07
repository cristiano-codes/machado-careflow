const express = require('express');
const router = express.Router();
const pool = require('../config/pg');

// GET - Buscar vagas de emprego
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM job_vacancies 
      WHERE status = 'active'
      ORDER BY created_at DESC
    `);

    const vacancies = result.rows.map(vacancy => ({
      id: vacancy.id,
      titulo: vacancy.title,
      empresa: vacancy.company,
      descricao: vacancy.description,
      requisitos: vacancy.requirements || [],
      salario: vacancy.salary_range || 'A combinar',
      tipo: vacancy.type,
      nivel: vacancy.level,
      status: vacancy.status
    }));

    res.json({
      success: true,
      vacancies
    });
  } catch (error) {
    console.error('Erro ao buscar vagas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
