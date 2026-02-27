const express = require('express');
const router = express.Router();
const pool = require('../config/pg');
const authMiddleware = require('../middleware/auth');
const {
  normalizeUserIdInt,
  transitionPatientStatus,
} = require('../services/journeyService');

const VALID_DECISIONS = new Set(['aprovado', 'encaminhado']);

router.use(authMiddleware);

router.post('/', async (req, res) => {
  const userIdInt = normalizeUserIdInt(req.user?.id);
  if (userIdInt === null) {
    return res.status(400).json({
      success: false,
      message: 'Nao foi possivel identificar o usuario logado (users.id inteiro).',
    });
  }

  const assistidoId = (req.body?.assistido_id || '').toString().trim();
  const decisao = (req.body?.decisao || '').toString().trim().toLowerCase();
  const justificativa = (req.body?.justificativa || '').toString().trim();

  if (!assistidoId) {
    return res.status(400).json({ success: false, message: 'assistido_id e obrigatorio' });
  }

  if (!VALID_DECISIONS.has(decisao)) {
    return res.status(400).json({ success: false, message: 'decisao invalida. Use aprovado ou encaminhado' });
  }

  if (!justificativa) {
    return res.status(400).json({ success: false, message: 'justificativa e obrigatoria' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const patientResult = await client.query(
      `
        SELECT id::text AS id
        FROM public.patients
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [assistidoId]
    );

    if (patientResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Assistido nao encontrado' });
    }

    const decisionResult = await client.query(
      `
        INSERT INTO public.assistido_vaga_decisions (
          assistido_id,
          decisao,
          justificativa,
          decided_by,
          decided_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id, assistido_id, decisao
      `,
      [assistidoId, decisao, justificativa, userIdInt]
    );

    const transition = await transitionPatientStatus({
      patientId: assistidoId,
      newStatus: decisao,
      userIdInt,
      motivoNullable: justificativa,
      client,
    });

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      decisionId: decisionResult.rows[0].id,
      assistido_id: decisionResult.rows[0].assistido_id,
      decisao: decisionResult.rows[0].decisao,
      status_jornada_atual: transition.newStatus,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao registrar decisao de vaga:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao registrar decisao de vaga',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
