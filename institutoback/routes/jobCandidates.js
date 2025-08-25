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

// GET - Buscar candidatos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        jc.*,
        p.name as patient_name,
        p.email as patient_email,
        p.phone as patient_phone,
        jv.title as vacancy_title,
        jv.company as vacancy_company
      FROM job_candidates jc
      LEFT JOIN patients p ON jc.patient_id = p.id
      LEFT JOIN job_vacancies jv ON jc.vacancy_id = jv.id
      ORDER BY jc.applied_at DESC
    `);

    const candidates = result.rows.map(candidate => ({
      id: candidate.id,
      nome: candidate.patient_name || 'Nome não disponível',
      email: candidate.patient_email || 'Email não disponível',
      telefone: candidate.patient_phone || 'Telefone não disponível',
      vaga: `${candidate.vacancy_title} - ${candidate.vacancy_company}`,
      status: candidate.status,
      pontuacao: candidate.score || 0,
      dataAplicacao: new Date(candidate.applied_at).toLocaleDateString('pt-BR')
    }));

    res.json({
      success: true,
      candidates
    });
  } catch (error) {
    console.error('Erro ao buscar candidatos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;