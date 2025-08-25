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