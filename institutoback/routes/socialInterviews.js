const express = require('express');
const router = express.Router();
const pool = require('../config/pg');
const authMiddleware = require('../middleware/auth');
const {
  normalizeUserIdInt,
  transitionPatientStatus,
} = require('../services/journeyService');

router.use(authMiddleware);

function normalizeDate(value) {
  const text = (value || '').toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function toInterviewDto(row) {
  const payload =
    row && row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? row.payload
      : {};

  return {
    ...payload,
    id: row.id,
    patient_id: row.patient_id,
    interview_date: row.interview_date,
    assistente_social: row.assistente_social,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get('/', async (req, res) => {
  const patientId = (req.query?.patient_id || '').toString().trim();

  if (!patientId) {
    return res.status(400).json({
      success: false,
      message: 'patient_id e obrigatorio',
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          patient_id,
          interview_date,
          assistente_social,
          payload,
          created_by,
          created_at,
          updated_at
        FROM public.social_interviews
        WHERE patient_id = $1
        ORDER BY interview_date DESC, created_at DESC
      `,
      [patientId]
    );

    return res.json(result.rows.map(toInterviewDto));
  } catch (error) {
    console.error('Erro ao listar entrevistas sociais:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar entrevistas sociais',
    });
  }
});

router.post('/', async (req, res) => {
  const userIdInt = normalizeUserIdInt(req.user?.id);
  if (userIdInt === null) {
    return res.status(400).json({
      success: false,
      message: 'Nao foi possivel identificar o usuario logado (users.id inteiro).',
    });
  }

  const patientId = (req.body?.patient_id || '').toString().trim();
  const interviewDate = normalizeDate(req.body?.interview_date);
  const assistenteSocial = (req.body?.assistente_social || '').toString().trim() || null;
  const payload = req.body && typeof req.body === 'object' ? req.body : {};

  if (!patientId) {
    return res.status(400).json({ success: false, message: 'patient_id e obrigatorio' });
  }

  if (!interviewDate) {
    return res.status(400).json({ success: false, message: 'interview_date invalida' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertResult = await client.query(
      `
        INSERT INTO public.social_interviews (
          patient_id,
          interview_date,
          assistente_social,
          payload,
          created_by
        )
        VALUES ($1, $2, $3, $4::jsonb, $5)
        RETURNING
          id,
          patient_id,
          interview_date,
          assistente_social,
          payload,
          created_by,
          created_at,
          updated_at
      `,
      [patientId, interviewDate, assistenteSocial, JSON.stringify(payload), userIdInt]
    );

    await transitionPatientStatus({
      patientId,
      newStatus: 'entrevista_realizada',
      userIdInt,
      motivoNullable: 'Entrevista Social salva',
      client,
    });

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      interview: toInterviewDto(insertResult.rows[0]),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar entrevista social:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao criar entrevista social',
    });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const userIdInt = normalizeUserIdInt(req.user?.id);
  if (userIdInt === null) {
    return res.status(400).json({
      success: false,
      message: 'Nao foi possivel identificar o usuario logado (users.id inteiro).',
    });
  }

  const interviewId = (req.params?.id || '').toString().trim();
  if (!interviewId) {
    return res.status(400).json({ success: false, message: 'id da entrevista e obrigatorio' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `
        SELECT id, patient_id, interview_date, assistente_social
        FROM public.social_interviews
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [interviewId]
    );

    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Entrevista social nao encontrada' });
    }

    const current = currentResult.rows[0];
    const patientId = (req.body?.patient_id || current.patient_id || '').toString().trim();
    const interviewDate = normalizeDate(req.body?.interview_date || current.interview_date);
    const assistenteSocial =
      (req.body?.assistente_social || current.assistente_social || '').toString().trim() || null;
    const payload = req.body && typeof req.body === 'object' ? req.body : {};

    if (!patientId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'patient_id e obrigatorio' });
    }

    if (!interviewDate) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'interview_date invalida' });
    }

    const updateResult = await client.query(
      `
        UPDATE public.social_interviews
        SET patient_id = $1,
            interview_date = $2,
            assistente_social = $3,
            payload = $4::jsonb,
            updated_at = NOW()
        WHERE id = $5
        RETURNING
          id,
          patient_id,
          interview_date,
          assistente_social,
          payload,
          created_by,
          created_at,
          updated_at
      `,
      [patientId, interviewDate, assistenteSocial, JSON.stringify(payload), interviewId]
    );

    await transitionPatientStatus({
      patientId,
      newStatus: 'entrevista_realizada',
      userIdInt,
      motivoNullable: 'Entrevista Social salva',
      client,
    });

    await client.query('COMMIT');

    return res.json({
      success: true,
      interview: toInterviewDto(updateResult.rows[0]),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar entrevista social:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao atualizar entrevista social',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
