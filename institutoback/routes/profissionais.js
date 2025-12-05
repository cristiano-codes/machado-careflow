const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sistema',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '110336'
});

// Criar novo profissional (cria usuário + vínculo)
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      name,
      email,
      phone,
      username,
      role = 'Fisioterapeuta',
      specialty,
      crp,
      status = 'active',
    } = req.body || {};

    if (!name || !email || !username) {
      return res.status(400).json({ success: false, message: 'Nome, e-mail e username são obrigatórios' });
    }

    await client.query('BEGIN');

    const dup = await client.query(
      'SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1',
      [username, email]
    );
    if (dup.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Username ou e-mail já existe' });
    }

    const hashedPassword = await bcrypt.hash('123456', 10);

    const userResult = await client.query(
      `INSERT INTO users (username, email, name, phone, role, status, first_access, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, username, email, name, role, status`,
      [username, email.toLowerCase(), name, phone || null, role, 'ativo', true, hashedPassword]
    );
    const user = userResult.rows[0];

    const profResult = await client.query(
      `INSERT INTO professionals (user_id, crp, specialty, phone, email, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [user.id, crp || null, specialty || null, phone || null, email.toLowerCase(), status]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      professional: {
        ...profResult.rows[0],
        user_name: user.name,
        user_email: user.email,
        user_role: user.role,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar profissional:', error);
    res.status(500).json({ success: false, message: 'Erro ao criar profissional' });
  } finally {
    client.release();
  }
});

// Lista profissionais + dados do usuário vinculado e carga do dia
router.get('/', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];

  try {
    const query = `
      WITH agenda_hoje AS (
        SELECT professional_id, COUNT(*)::int AS total
        FROM appointments
        WHERE appointment_date = $1
        GROUP BY professional_id
      )
      SELECT
        p.*,
        u.name AS user_name,
        u.email AS user_email,
        u.role AS user_role,
        COALESCE(a.total, 0) AS agenda_hoje
      FROM professionals p
      LEFT JOIN public.users u ON u.id = p.user_id
      LEFT JOIN agenda_hoje a ON a.professional_id = p.id
      ORDER BY u.name NULLS LAST, p.created_at DESC;
    `;

    const result = await pool.query(query, [date]);

    res.json({
      success: true,
      professionals: result.rows
    });
  } catch (error) {
    console.error('Erro ao listar profissionais:', error);
    res.status(500).json({ success: false, message: 'Erro ao listar profissionais' });
  }
});

// Agenda do profissional em um dia
router.get('/:id/agenda', async (req, res) => {
  const { id } = req.params;
  const date = req.query.date || new Date().toISOString().split('T')[0];

  try {
    const query = `
      SELECT
        a.id,
        a.professional_id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.notes,
        pa.id AS patient_id,
        pa.name AS patient_name,
        s.id AS service_id,
        s.name AS service_name
      FROM appointments a
      JOIN patients pa ON pa.id = a.patient_id
      LEFT JOIN services s ON s.id = a.service_id
      WHERE a.professional_id = $1
        AND a.appointment_date = $2
      ORDER BY a.appointment_time ASC;
    `;

    const result = await pool.query(query, [id, date]);

    res.json({
      success: true,
      agenda: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar agenda do profissional:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar agenda' });
  }
});

// Estatísticas gerais dos profissionais
router.get('/stats/resumo', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];

  try {
    const totals = await pool.query(`
      SELECT status, COUNT(*)::int AS count
      FROM professionals
      GROUP BY status
    `);

    const agendaHoje = await pool.query(
      'SELECT COUNT(*)::int AS count FROM appointments WHERE appointment_date = $1',
      [date]
    );

    res.json({
      success: true,
      stats: {
        total: totals.rows.reduce((acc, row) => acc + row.count, 0),
        porStatus: totals.rows,
        agendaHoje: agendaHoje.rows[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas de profissionais:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar estatísticas' });
  }
});

module.exports = router;
