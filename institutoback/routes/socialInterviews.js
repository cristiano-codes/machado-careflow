const express = require('express');
const router = express.Router();
const pool = require('../config/pg');
const authMiddleware = require('../middleware/auth');
const { authorizeAny } = require('../middleware/authorize');
const {
  normalizeUserIdInt,
  transitionPatientStatus,
} = require('../services/journeyService');

router.use(authMiddleware);

const authorizeSocialInterviewsView = authorizeAny([
  ['entrevistas', 'view'],
  ['entrevista_social', 'view'],
  ['social_interviews', 'view'],
]);
const authorizeSocialInterviewsCreate = authorizeAny([
  ['entrevistas', 'create'],
  ['entrevista_social', 'create'],
  ['social_interviews', 'create'],
]);
const authorizeSocialInterviewsEdit = authorizeAny([
  ['entrevistas', 'edit'],
  ['entrevista_social', 'edit'],
  ['social_interviews', 'edit'],
]);

function normalizeText(value) {
  return (value || '').toString().trim();
}

function normalizeOptionalText(value) {
  const text = normalizeText(value);
  return text.length > 0 ? text : null;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;

  const normalized = normalizeText(value).toLowerCase();
  if (['true', '1', 'sim', 'yes', 'y', 't'].includes(normalized)) return true;
  if (['false', '0', 'nao', 'não', 'no', 'n', 'f'].includes(normalized)) return false;
  return fallback;
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...value };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return {};

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...parsed };
      }
    } catch (_error) {
      return {};
    }
  }

  return {};
}

function pickFirstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = normalizeOptionalText(value);
    if (normalized) return normalized;
  }
  return null;
}

function cleanPayloadRecord(record) {
  const cleaned = {};

  for (const [key, value] of Object.entries(record || {})) {
    if (value === undefined) continue;
    cleaned[key] = value;
  }

  return cleaned;
}

function resolveInterviewDraftFlag(payload) {
  if (!payload || typeof payload !== 'object') return true;

  if (typeof payload.is_draft === 'boolean') {
    return payload.is_draft;
  }

  if (typeof payload.draft === 'boolean') {
    return payload.draft;
  }

  const statusToken = normalizeText(
    payload.status_entrevista || payload.interview_status || payload.status
  ).toLowerCase();

  if (['rascunho', 'draft', 'em_rascunho', 'pendente'].includes(statusToken)) {
    return true;
  }

  if (['concluida', 'concluido', 'finalizada', 'finalizado'].includes(statusToken)) {
    return false;
  }

  const parecerSocial = normalizeOptionalText(
    payload.parecer_social || payload.parecerSocial
  );

  return !parecerSocial;
}

function buildInterviewPayload(body, fallbackRow = null) {
  const safeBody = body && typeof body === 'object' ? body : {};
  const fallbackPayload = parseJsonObject(fallbackRow?.payload);
  const nestedPayload = parseJsonObject(safeBody.payload);

  const patientId = normalizeText(
    safeBody.patient_id ??
      nestedPayload.patient_id ??
      fallbackPayload.patient_id ??
      fallbackRow?.patient_id
  );

  const interviewDate = normalizeDate(
    safeBody.interview_date ??
      nestedPayload.interview_date ??
      fallbackPayload.interview_date ??
      fallbackRow?.interview_date
  );

  const assistenteSocial = normalizeOptionalText(
    safeBody.assistente_social ??
      nestedPayload.assistente_social ??
      fallbackPayload.assistente_social ??
      fallbackRow?.assistente_social
  );

  const parecerSocial = normalizeOptionalText(
    safeBody.parecer_social ??
      safeBody.parecerSocial ??
      nestedPayload.parecer_social ??
      nestedPayload.parecerSocial ??
      fallbackPayload.parecer_social ??
      fallbackPayload.parecerSocial ??
      fallbackRow?.parecer_social
  );

  const resultadoTerapeutas = normalizeOptionalText(
    safeBody.resultado_terapeutas ??
      safeBody.resultadoTerapeutas ??
      nestedPayload.resultado_terapeutas ??
      nestedPayload.resultadoTerapeutas ??
      fallbackPayload.resultado_terapeutas ??
      fallbackPayload.resultadoTerapeutas
  );

  const dataResultadoTerapeutas = normalizeDate(
    safeBody.data_resultado_terapeutas ??
      safeBody.dataResultadoTerapeutas ??
      nestedPayload.data_resultado_terapeutas ??
      nestedPayload.dataResultadoTerapeutas ??
      fallbackPayload.data_resultado_terapeutas ??
      fallbackPayload.dataResultadoTerapeutas
  );

  const payload = cleanPayloadRecord({
    ...fallbackPayload,
    ...nestedPayload,
    ...safeBody,
    patient_id: patientId || null,
    interview_date: interviewDate || null,
    assistente_social: assistenteSocial,
    parecer_social: parecerSocial,
    resultado_terapeutas: resultadoTerapeutas,
    data_resultado_terapeutas: dataResultadoTerapeutas,
  });

  delete payload.payload;
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  delete payload.created_by;

  const isDraft = normalizeBoolean(payload.is_draft, resolveInterviewDraftFlag(payload));
  payload.is_draft = isDraft;
  payload.status_entrevista = isDraft ? 'rascunho' : 'concluida';

  return {
    patientId,
    interviewDate,
    assistenteSocial,
    parecerSocial,
    isDraft,
    payload,
  };
}

function toInterviewDto(row) {
  const payload = parseJsonObject(row?.payload);

  const assistenteSocial = pickFirstNonEmptyString(
    row?.assistente_social,
    payload.assistente_social,
    row?.assistente_social_id,
    payload.assistente_social_id
  );

  const parecerSocial = pickFirstNonEmptyString(
    row?.parecer_social,
    payload.parecer_social,
    payload.parecerSocial
  );

  const resultadoTerapeutas = pickFirstNonEmptyString(
    payload.resultado_terapeutas,
    payload.resultadoTerapeutas,
    row?.resultado_terapeutas
  );

  const dataResultadoTerapeutas = normalizeDate(
    payload.data_resultado_terapeutas ??
      payload.dataResultadoTerapeutas ??
      row?.data_resultado_terapeutas
  );

  const isDraft = normalizeBoolean(
    row?.is_draft,
    normalizeBoolean(payload.is_draft, resolveInterviewDraftFlag({ ...payload, parecer_social: parecerSocial }))
  );

  const normalizedPayload = cleanPayloadRecord({
    ...payload,
    patient_id: payload.patient_id || normalizeOptionalText(row?.patient_id),
    interview_date: payload.interview_date || normalizeDate(row?.interview_date),
    assistente_social: payload.assistente_social || assistenteSocial,
    parecer_social:
      payload.parecer_social !== undefined ? payload.parecer_social : parecerSocial,
    resultado_terapeutas:
      payload.resultado_terapeutas !== undefined
        ? payload.resultado_terapeutas
        : resultadoTerapeutas,
    data_resultado_terapeutas:
      payload.data_resultado_terapeutas !== undefined
        ? payload.data_resultado_terapeutas
        : dataResultadoTerapeutas,
    is_draft: isDraft,
    status_entrevista: isDraft ? 'rascunho' : 'concluida',
  });

  return {
    id: normalizeText(row?.id),
    patient_id: normalizeText(row?.patient_id),
    assistente_social: assistenteSocial,
    assistente_social_id: pickFirstNonEmptyString(
      row?.assistente_social_id,
      payload.assistente_social_id
    ),
    interview_date: normalizeDate(row?.interview_date) || normalizedPayload.interview_date || null,
    interview_time: normalizeOptionalText(row?.interview_time || normalizedPayload.interview_time),
    parecer_social: parecerSocial,
    resultado_terapeutas: resultadoTerapeutas,
    data_resultado_terapeutas: dataResultadoTerapeutas,
    is_draft: isDraft,
    payload: normalizedPayload,
    created_by: row?.created_by ?? null,
    created_at: row?.created_at || null,
    updated_at: row?.updated_at || null,
  };
}

function buildTransitionInfo(statusTransition, isDraft) {
  if (isDraft) {
    return {
      attempted: false,
      changed: false,
      reason: 'draft_interview_not_completed',
      previous_status: statusTransition?.previousStatus || null,
      new_status: statusTransition?.newStatus || null,
      regression_prevented: false,
    };
  }

  return {
    attempted: true,
    changed: statusTransition?.changed === true,
    previous_status: statusTransition?.previousStatus || null,
    new_status: statusTransition?.newStatus || 'entrevista_realizada',
    regression_prevented: statusTransition?.regressionPrevented === true,
  };
}

async function maybeTransitionInterviewCompletion({
  client,
  patientId,
  userIdInt,
  isDraft,
}) {
  if (isDraft) {
    return null;
  }

  return transitionPatientStatus({
    patientId,
    newStatus: 'entrevista_realizada',
    userIdInt,
    motivoNullable: 'Entrevista Social concluida',
    client,
    preventRegression: true,
  });
}

router.get('/', authorizeSocialInterviewsView, async (req, res) => {
  const patientId = normalizeText(req.query?.patient_id);

  if (!patientId) {
    return res.status(400).json({
      success: false,
      message: 'patient_id e obrigatorio',
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT *
        FROM public.social_interviews
        WHERE patient_id = $1
        ORDER BY interview_date DESC NULLS LAST, created_at DESC
      `,
      [patientId]
    );

    const interviews = result.rows.map(toInterviewDto);

    return res.json({
      success: true,
      total: interviews.length,
      interviews,
    });
  } catch (error) {
    console.error('Erro ao listar entrevistas sociais:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar entrevistas sociais',
    });
  }
});

router.post('/', authorizeSocialInterviewsCreate, async (req, res) => {
  const userIdInt = normalizeUserIdInt(req.user?.id);
  if (userIdInt === null) {
    return res.status(400).json({
      success: false,
      message: 'Nao foi possivel identificar o usuario logado (users.id deve ser inteiro positivo ou UUID).',
    });
  }

  const normalized = buildInterviewPayload(req.body);

  if (!normalized.patientId) {
    return res.status(400).json({ success: false, message: 'patient_id e obrigatorio' });
  }

  if (!normalized.interviewDate) {
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
        RETURNING *
      `,
      [
        normalized.patientId,
        normalized.interviewDate,
        normalized.assistenteSocial,
        JSON.stringify(normalized.payload),
        userIdInt,
      ]
    );

    const transitionResult = await maybeTransitionInterviewCompletion({
      client,
      patientId: normalized.patientId,
      userIdInt,
      isDraft: normalized.isDraft,
    });

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: normalized.isDraft
        ? 'Entrevista social salva como rascunho.'
        : 'Entrevista social concluida com sucesso.',
      interview: toInterviewDto(insertResult.rows[0]),
      status_transition: buildTransitionInfo(transitionResult, normalized.isDraft),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar entrevista social:', error);

    if (error?.code === 'INVALID_JOURNEY_TRANSITION' || error?.code === 'JOURNEY_STATUS_MISSING') {
      return res.status(error.statusCode || 409).json({
        success: false,
        code: error.code,
        message: error.message,
        current_status: error.currentStatus || null,
        target_status: error.nextStatus || null,
        allowed_statuses: Array.isArray(error.allowedStatuses) ? error.allowedStatuses : [],
      });
    }

    if (error?.code === 'INVALID_JOURNEY_STATUS' || error?.code === 'INVALID_PATIENT_ID' || error?.code === 'INVALID_USER_ID') {
      return res.status(400).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao criar entrevista social',
    });
  } finally {
    client.release();
  }
});

router.put('/:id', authorizeSocialInterviewsEdit, async (req, res) => {
  const userIdInt = normalizeUserIdInt(req.user?.id);
  if (userIdInt === null) {
    return res.status(400).json({
      success: false,
      message: 'Nao foi possivel identificar o usuario logado (users.id deve ser inteiro positivo ou UUID).',
    });
  }

  const interviewId = normalizeText(req.params?.id);
  if (!interviewId) {
    return res.status(400).json({ success: false, message: 'id da entrevista e obrigatorio' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `
        SELECT *
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
    const normalized = buildInterviewPayload(req.body, current);

    if (!normalized.patientId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'patient_id e obrigatorio' });
    }

    if (!normalized.interviewDate) {
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
        RETURNING *
      `,
      [
        normalized.patientId,
        normalized.interviewDate,
        normalized.assistenteSocial,
        JSON.stringify(normalized.payload),
        interviewId,
      ]
    );

    const transitionResult = await maybeTransitionInterviewCompletion({
      client,
      patientId: normalized.patientId,
      userIdInt,
      isDraft: normalized.isDraft,
    });

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: normalized.isDraft
        ? 'Rascunho da entrevista social atualizado.'
        : 'Entrevista social atualizada e concluida.',
      interview: toInterviewDto(updateResult.rows[0]),
      status_transition: buildTransitionInfo(transitionResult, normalized.isDraft),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar entrevista social:', error);

    if (error?.code === 'INVALID_JOURNEY_TRANSITION' || error?.code === 'JOURNEY_STATUS_MISSING') {
      return res.status(error.statusCode || 409).json({
        success: false,
        code: error.code,
        message: error.message,
        current_status: error.currentStatus || null,
        target_status: error.nextStatus || null,
        allowed_statuses: Array.isArray(error.allowedStatuses) ? error.allowedStatuses : [],
      });
    }

    if (error?.code === 'INVALID_JOURNEY_STATUS' || error?.code === 'INVALID_PATIENT_ID' || error?.code === 'INVALID_USER_ID') {
      return res.status(400).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao atualizar entrevista social',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
