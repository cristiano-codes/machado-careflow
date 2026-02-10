const express = require('express');
const router = express.Router();
const pool = require('../config/pg');
const bcrypt = require('bcryptjs');

const CONTRACT_TYPES = ['CLT', 'PJ', 'Voluntário', 'Estágio', 'Temporário'];
const SCALE_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex'];
const DEFAULT_WEEK_SCALE = { seg: true, ter: true, qua: true, qui: true, sex: true };

function normalizeStatus(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return null;

  if (['ativo', 'active', 'plantao', 'onboarding'].includes(raw)) return 'ATIVO';
  if (['inativo', 'inactive', 'afastado'].includes(raw)) return 'INATIVO';
  return null;
}

function normalizeContractType(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return null;
  return CONTRACT_TYPES.find((item) => item.toLowerCase() === raw) || null;
}

function isValidDateValue(value) {
  if (!value) return true;
  const text = value.toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function normalizeWeeklyScale(value) {
  if (value === undefined || value === null || value === '') {
    return { ...DEFAULT_WEEK_SCALE };
  }

  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const normalized = { ...DEFAULT_WEEK_SCALE };
  for (const key of SCALE_KEYS) {
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== 'boolean') {
        return null;
      }
      normalized[key] = raw[key];
    }
  }

  return normalized;
}

function parsePositiveInteger(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function validateProfessionalPayload(payload, options = {}) {
  const requireUserIdentity = options.requireUserIdentity ?? false;

  const name = (payload?.name || '').toString().trim();
  const email = (payload?.email || '').toString().trim().toLowerCase();
  const username = (payload?.username || '').toString().trim();
  const role = (payload?.role || 'Usuário').toString().trim() || 'Usuário';
  const phone = (payload?.phone || '').toString().trim() || null;
  const crp = (payload?.crp || '').toString().trim() || null;
  const specialty = (payload?.specialty || '').toString().trim() || null;
  const funcao = (payload?.funcao || '').toString().trim();
  const tipoContrato = normalizeContractType(payload?.tipo_contrato);
  const status = normalizeStatus(payload?.status || 'ATIVO');
  const weeklyScale = normalizeWeeklyScale(payload?.escala_semanal);
  const weeklyHours = parsePositiveInteger(payload?.horas_semanais);
  const birthDate = payload?.data_nascimento ? payload.data_nascimento.toString().trim() : null;

  if (!name) {
    return { ok: false, message: 'Nome é obrigatório' };
  }

  if (!funcao) {
    return { ok: false, message: 'Função é obrigatória' };
  }

  if (!tipoContrato) {
    return {
      ok: false,
      message: `tipo_contrato obrigatório. Valores aceitos: ${CONTRACT_TYPES.join(', ')}`,
    };
  }

  if (payload?.horas_semanais !== undefined && payload?.horas_semanais !== null && payload?.horas_semanais !== '' && weeklyHours === null) {
    return { ok: false, message: 'horas_semanais deve ser um inteiro positivo' };
  }

  if (birthDate && !isValidDateValue(birthDate)) {
    return { ok: false, message: 'data_nascimento inválida. Use o formato YYYY-MM-DD' };
  }

  if (!weeklyScale) {
    return {
      ok: false,
      message: 'escala_semanal inválida. Use objeto com seg, ter, qua, qui e sex booleanos',
    };
  }

  if (!status) {
    return { ok: false, message: 'status inválido. Use ATIVO ou INATIVO' };
  }

  if (requireUserIdentity && (!email || !username)) {
    return { ok: false, message: 'E-mail e username são obrigatórios' };
  }

  return {
    ok: true,
    data: {
      name,
      email: email || null,
      username: username || null,
      role,
      phone,
      crp,
      specialty,
      funcao,
      tipo_contrato: tipoContrato,
      status,
      escala_semanal: weeklyScale,
      horas_semanais: weeklyHours,
      data_nascimento: birthDate,
    },
  };
}

// Criar novo profissional (cria usuário + vínculo)
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const validation = validateProfessionalPayload(req.body, { requireUserIdentity: true });
    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const payload = validation.data;
    await client.query('BEGIN');

    const dup = await client.query(
      'SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1',
      [payload.username, payload.email]
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
      [payload.username, payload.email, payload.name, payload.phone, payload.role, 'ativo', true, hashedPassword]
    );
    const user = userResult.rows[0];

    const profResult = await client.query(
      `INSERT INTO professionals (
         user_id, crp, specialty, phone, email, status,
         funcao, horas_semanais, data_nascimento, tipo_contrato, escala_semanal
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       RETURNING *`,
      [
        user.id,
        payload.crp,
        payload.specialty,
        payload.phone,
        payload.email,
        payload.status,
        payload.funcao,
        payload.horas_semanais,
        payload.data_nascimento,
        payload.tipo_contrato,
        JSON.stringify(payload.escala_semanal),
      ]
    );

    await client.query('COMMIT');

    return res.json({
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
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao criar profissional' });
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
      professionals: Array.isArray(result.rows) ? result.rows : []
    });
  } catch (error) {
    console.error('Erro ao listar profissionais:', error);
    res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao listar profissionais',
      professionals: []
    });
  }
});

// Atualizar profissional (dados principais)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const existingResult = await client.query(
      `SELECT
         p.*,
         u.id AS linked_user_id,
         u.name AS user_name,
         u.email AS user_email,
         u.username AS user_username,
         u.role AS user_role
       FROM professionals p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profissional não encontrado' });
    }

    const existing = existingResult.rows[0];
    const mergedPayload = {
      ...req.body,
      name: req.body?.name ?? existing.user_name,
      email: req.body?.email ?? existing.user_email ?? existing.email,
      username: req.body?.username ?? existing.user_username,
      role: req.body?.role ?? existing.user_role ?? 'Usuário',
      phone: req.body?.phone ?? existing.phone,
      crp: req.body?.crp ?? existing.crp,
      specialty: req.body?.specialty ?? existing.specialty,
      funcao: req.body?.funcao ?? existing.funcao ?? existing.specialty,
      horas_semanais: req.body?.horas_semanais ?? existing.horas_semanais,
      data_nascimento: req.body?.data_nascimento ?? existing.data_nascimento,
      tipo_contrato: req.body?.tipo_contrato ?? existing.tipo_contrato,
      escala_semanal: req.body?.escala_semanal ?? existing.escala_semanal,
      status: req.body?.status ?? existing.status,
    };

    const validation = validateProfessionalPayload(mergedPayload, {
      requireUserIdentity: Boolean(existing.linked_user_id),
    });

    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const payload = validation.data;

    await client.query('BEGIN');

    if (existing.linked_user_id) {
      const duplicateIdentity = await client.query(
        `SELECT 1
         FROM users
         WHERE id <> $1
           AND (LOWER(username) = LOWER($2) OR LOWER(email) = LOWER($3))
         LIMIT 1`,
        [existing.linked_user_id, payload.username, payload.email]
      );

      if (duplicateIdentity.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Username ou e-mail já existe' });
      }

      await client.query(
        `UPDATE users
         SET name = $1,
             email = $2,
             username = $3,
             phone = $4,
             role = $5,
             updated_at = NOW()
         WHERE id = $6`,
        [payload.name, payload.email, payload.username, payload.phone, payload.role, existing.linked_user_id]
      );
    }

    const updatedProfessional = await client.query(
      `UPDATE professionals
       SET crp = $1,
           specialty = $2,
           phone = $3,
           email = $4,
           status = $5,
           funcao = $6,
           horas_semanais = $7,
           data_nascimento = $8,
           tipo_contrato = $9,
           escala_semanal = $10::jsonb,
           updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        payload.crp,
        payload.specialty,
        payload.phone,
        payload.email,
        payload.status,
        payload.funcao,
        payload.horas_semanais,
        payload.data_nascimento,
        payload.tipo_contrato,
        JSON.stringify(payload.escala_semanal),
        id,
      ]
    );

    const updatedUserResult = existing.linked_user_id
      ? await client.query(
          'SELECT id, name, email, role FROM users WHERE id = $1',
          [existing.linked_user_id]
        )
      : { rows: [] };

    const updatedUser = updatedUserResult.rows[0] || null;

    await client.query('COMMIT');

    return res.json({
      success: true,
      professional: {
        ...updatedProfessional.rows[0],
        user_name: updatedUser?.name ?? existing.user_name,
        user_email: updatedUser?.email ?? existing.user_email,
        user_role: updatedUser?.role ?? existing.user_role,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar profissional:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao atualizar profissional' });
  } finally {
    client.release();
  }
});

// Atualizar somente status (soft disable)
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const status = normalizeStatus(req.body?.status);

  if (!status) {
    return res.status(400).json({ success: false, message: 'status inválido. Use ATIVO ou INATIVO' });
  }

  try {
    const result = await pool.query(
      `UPDATE professionals
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profissional não encontrado' });
    }

    return res.json({ success: true, professional: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar status do profissional:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao atualizar status' });
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
