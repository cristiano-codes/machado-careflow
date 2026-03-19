const express = require('express');
const router = express.Router();
const pool = require('../config/pg');
const authMiddleware = require('../middleware/auth');
const { authorizeAny } = require('../middleware/authorize');
const { normalizeUserIdInt, transitionPatientStatus } = require('../services/journeyService');

router.use(authMiddleware);

const authorizeEvaluationsView = authorizeAny([
  ['avaliacoes', 'view'],
  ['avaliacao', 'view'],
  ['evaluations', 'view'],
]);

const authorizeEvaluationsCreate = authorizeAny([
  ['avaliacoes', 'create'],
  ['avaliacao', 'create'],
  ['evaluations', 'create'],
]);

const authorizeEvaluationsEdit = authorizeAny([
  ['avaliacoes', 'edit'],
  ['avaliacao', 'edit'],
  ['evaluations', 'edit'],
]);

const authorizeEvaluationsAdvance = authorizeAny([
  ['avaliacoes', 'edit'],
  ['analise_vagas', 'create'],
  ['analise_vagas', 'edit'],
  ['vagas', 'create'],
  ['vagas', 'edit'],
]);

const TECH_STATUS_TO_DB = Object.freeze({
  agendada: 'scheduled',
  scheduled: 'scheduled',
  pendente: 'scheduled',
  pending: 'scheduled',
  em_andamento: 'in_progress',
  in_progress: 'in_progress',
  andamento: 'in_progress',
  concluida: 'completed',
  concluido: 'completed',
  completed: 'completed',
  finalizada: 'completed',
  finalizado: 'completed',
  cancelada: 'canceled',
  cancelado: 'canceled',
  canceled: 'canceled',
  cancelled: 'canceled',
});

const DB_STATUS_TO_TECH = Object.freeze({
  scheduled: 'agendada',
  pending: 'agendada',
  in_progress: 'em_andamento',
  completed: 'concluida',
  canceled: 'cancelada',
  cancelled: 'cancelada',
  agendada: 'agendada',
  em_andamento: 'em_andamento',
  concluida: 'concluida',
  cancelada: 'cancelada',
});

let journeySchemaCapabilitiesCache = null;

function normalizeText(value) {
  return (value || '').toString().trim();
}

function normalizeOptionalText(value) {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) return normalized.slice(0, 10);
  return null;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;

  const normalized = normalizeText(value).toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'y', 't'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'no', 'n', 'f'].includes(normalized)) return false;
  return fallback;
}

function toDbTechnicalStatus(rawStatus, fallbackDbStatus = 'scheduled') {
  const normalized = normalizeText(rawStatus).toLowerCase();
  if (!normalized) return fallbackDbStatus;
  return TECH_STATUS_TO_DB[normalized] || null;
}

function toTechnicalStatus(rawDbStatus) {
  const normalized = normalizeText(rawDbStatus).toLowerCase();
  if (!normalized) return 'agendada';
  return DB_STATUS_TO_TECH[normalized] || 'agendada';
}

async function resolveJourneySchemaCapabilities(client) {
  if (journeySchemaCapabilitiesCache) return journeySchemaCapabilitiesCache;

  const [patientStatusColumnResult, historyTableResult] = await Promise.all([
    client.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'patients'
          AND column_name = 'status_jornada'
        LIMIT 1
      `
    ),
    client.query(
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'assistido_status_history'
        LIMIT 1
      `
    ),
  ]);

  journeySchemaCapabilitiesCache = {
    hasPatientStatusJornada: patientStatusColumnResult.rows.length > 0,
    hasAssistidoStatusHistory: historyTableResult.rows.length > 0,
  };

  return journeySchemaCapabilitiesCache;
}

async function resolvePatientJourneyProjection(client) {
  const capabilities = await resolveJourneySchemaCapabilities(client);
  return capabilities.hasPatientStatusJornada
    ? 'p.status_jornada AS status_jornada,'
    : 'NULL::text AS status_jornada,';
}

async function isJourneyTransitionAvailable(client) {
  const capabilities = await resolveJourneySchemaCapabilities(client);
  return capabilities.hasPatientStatusJornada && capabilities.hasAssistidoStatusHistory;
}

function toEvaluationDto(row) {
  const dbStatus = normalizeText(row?.status).toLowerCase();
  return {
    id: normalizeText(row?.id),
    patient_id: normalizeText(row?.patient_id),
    patient_name: normalizeOptionalText(row?.patient_name),
    status_jornada: normalizeOptionalText(row?.status_jornada),
    professional_id: normalizeOptionalText(row?.professional_id),
    professional_name: normalizeOptionalText(row?.professional_name),
    type: normalizeText(row?.type),
    start_date: normalizeDate(row?.start_date),
    end_date: normalizeDate(row?.end_date),
    status: toTechnicalStatus(dbStatus),
    status_db: dbStatus || 'scheduled',
    result: normalizeOptionalText(row?.result),
    report: normalizeOptionalText(row?.report),
    notes: normalizeOptionalText(row?.notes),
    is_stage_consolidation: row?.is_stage_consolidation === true,
    checklist_ready_for_vaga: row?.checklist_ready_for_vaga === true,
    sent_to_vaga_at: row?.sent_to_vaga_at || null,
    devolutiva_date: normalizeDate(row?.devolutiva_date),
    created_at: row?.created_at || null,
    updated_at: row?.updated_at || null,
  };
}

function buildStatusTransitionPayload({
  transitionResult = null,
  attempted = false,
  targetStatus = null,
  reason = null,
}) {
  return {
    attempted,
    changed: transitionResult?.changed === true,
    previous_status: transitionResult?.previousStatus || null,
    new_status: transitionResult?.newStatus || targetStatus || null,
    regression_prevented: transitionResult?.regressionPrevented === true,
    reason: reason || null,
  };
}

function resolveEvaluationPayload(body, existingRow = null) {
  const source = body && typeof body === 'object' ? body : {};
  const existing = existingRow || {};

  const patientId = normalizeText(source.patient_id ?? existing.patient_id);
  const isStageConsolidation = normalizeBoolean(
    source.is_stage_consolidation ?? existing.is_stage_consolidation,
    false
  );

  const professionalId = normalizeOptionalText(
    source.professional_id ?? existing.professional_id
  );

  const type = normalizeOptionalText(
    source.type ??
      existing.type ??
      (isStageConsolidation ? 'Consolidacao multiprofissional' : null)
  );

  const startDate = normalizeDate(
    source.start_date ?? source.data_inicio ?? existing.start_date
  );
  const endDate = normalizeDate(source.end_date ?? source.data_conclusao ?? existing.end_date);
  const devolutivaDate = normalizeDate(
    source.devolutiva_date ?? source.data_devolutiva ?? existing.devolutiva_date
  );

  const dbStatus = toDbTechnicalStatus(source.status ?? existing.status ?? 'scheduled');
  if (!dbStatus) {
    return {
      ok: false,
      message: 'status tecnico invalido. Use agendada/em_andamento/concluida/cancelada.',
    };
  }

  const checklistReadyForVaga = normalizeBoolean(
    source.checklist_ready_for_vaga ?? existing.checklist_ready_for_vaga,
    false
  );

  const result = normalizeOptionalText(source.result ?? existing.result);
  const report = normalizeOptionalText(source.report ?? existing.report);
  const notes = normalizeOptionalText(source.notes ?? existing.notes);

  if (!patientId) {
    return { ok: false, message: 'patient_id e obrigatorio' };
  }

  if (!type) {
    return { ok: false, message: 'type e obrigatorio' };
  }

  if (!startDate) {
    return { ok: false, message: 'start_date invalida. Use YYYY-MM-DD' };
  }

  if (!isStageConsolidation && !professionalId) {
    return {
      ok: false,
      message: 'professional_id e obrigatorio para avaliacao tecnica individual.',
    };
  }

  return {
    ok: true,
    payload: {
      patient_id: patientId,
      professional_id: professionalId,
      type,
      start_date: startDate,
      end_date: endDate,
      status: dbStatus,
      result,
      report,
      notes,
      is_stage_consolidation: isStageConsolidation,
      checklist_ready_for_vaga: checklistReadyForVaga,
      devolutiva_date: devolutivaDate,
    },
  };
}

async function fetchEvaluationById(client, evaluationId, { forUpdate = false } = {}) {
  if (forUpdate) {
    await client.query(
      `
        SELECT id
        FROM public.evaluations
        WHERE id::text = $1
        LIMIT 1
        FOR UPDATE
      `,
      [evaluationId]
    );
  }

  const patientJourneyProjection = await resolvePatientJourneyProjection(client);
  const result = await client.query(
    `
      SELECT
        e.id::text AS id,
        e.patient_id::text AS patient_id,
        p.name AS patient_name,
        ${patientJourneyProjection}
        e.professional_id::text AS professional_id,
        COALESCE(
          u.name,
          to_jsonb(prf)->>'funcao',
          to_jsonb(prf)->>'specialty',
          to_jsonb(prf)->>'email'
        ) AS professional_name,
        e.type,
        e.start_date,
        e.end_date,
        e.status,
        e.result,
        e.report,
        e.notes,
        e.is_stage_consolidation,
        e.checklist_ready_for_vaga,
        e.sent_to_vaga_at,
        e.devolutiva_date,
        e.created_at,
        e.updated_at
      FROM public.evaluations e
      JOIN public.patients p
        ON p.id = e.patient_id
      LEFT JOIN public.professionals prf
        ON prf.id = e.professional_id
      LEFT JOIN public.users u
        ON COALESCE(to_jsonb(prf)->>'user_id_int', to_jsonb(prf)->>'user_id') = u.id::text
      WHERE e.id::text = $1
      LIMIT 1
    `,
    [evaluationId]
  );

  return result.rows[0] || null;
}

async function ensurePatientExists(client, patientId) {
  const result = await client.query(
    `
      SELECT id::text AS id
      FROM public.patients
      WHERE id::text = $1
      LIMIT 1
    `,
    [patientId]
  );
  return result.rows.length > 0;
}

async function maybeTransitionToEmAvaliacao({
  client,
  patientId,
  userIdInt,
  dbStatus,
}) {
  const shouldAttempt = ['in_progress', 'completed'].includes(dbStatus);
  if (!shouldAttempt) {
    return buildStatusTransitionPayload({
      attempted: false,
      targetStatus: 'em_avaliacao',
      reason: 'technical_status_does_not_trigger_journey',
    });
  }

  const journeyTransitionAvailable = await isJourneyTransitionAvailable(client);
  if (!journeyTransitionAvailable) {
    return buildStatusTransitionPayload({
      attempted: false,
      targetStatus: 'em_avaliacao',
      reason: 'journey_schema_unavailable',
    });
  }

  if (userIdInt === null) {
    return buildStatusTransitionPayload({
      attempted: false,
      targetStatus: 'em_avaliacao',
      reason: 'user_id_not_compatible_with_journey_history',
    });
  }

  const transitionResult = await transitionPatientStatus({
    patientId,
    newStatus: 'em_avaliacao',
    userIdInt,
    motivoNullable: 'Etapa de avaliacao multidisciplinar iniciada',
    client,
    preventRegression: true,
  });

  return buildStatusTransitionPayload({
    attempted: true,
    transitionResult,
    targetStatus: 'em_avaliacao',
  });
}

async function maybeTransitionToAnaliseVaga({
  client,
  patientId,
  userIdInt,
  motivoNullable,
}) {
  const journeyTransitionAvailable = await isJourneyTransitionAvailable(client);
  if (!journeyTransitionAvailable) {
    return buildStatusTransitionPayload({
      attempted: false,
      targetStatus: 'em_analise_vaga',
      reason: 'journey_schema_unavailable',
    });
  }

  if (userIdInt === null) {
    return buildStatusTransitionPayload({
      attempted: false,
      targetStatus: 'em_analise_vaga',
      reason: 'user_id_not_compatible_with_journey_history',
    });
  }

  const transitionResult = await transitionPatientStatus({
    patientId,
    newStatus: 'em_analise_vaga',
    userIdInt,
    motivoNullable,
    client,
    preventRegression: true,
  });

  return buildStatusTransitionPayload({
    attempted: true,
    transitionResult,
    targetStatus: 'em_analise_vaga',
  });
}

router.get('/', authorizeEvaluationsView, async (req, res) => {
  const patientId = normalizeText(req.query?.patient_id);
  const professionalId = normalizeText(req.query?.professional_id);
  const rawStatus = normalizeText(req.query?.status).toLowerCase();
  const typeFilter = normalizeText(req.query?.type);
  const dateFrom = normalizeDate(req.query?.date_from);
  const dateTo = normalizeDate(req.query?.date_to);
  const includeConsolidation = normalizeBoolean(req.query?.include_consolidation, true);

  const values = [];
  const conditions = [];

  if (patientId) {
    values.push(patientId);
    conditions.push(`e.patient_id::text = $${values.length}`);
  }

  if (professionalId) {
    values.push(professionalId);
    conditions.push(`e.professional_id::text = $${values.length}`);
  }

  if (rawStatus) {
    const dbStatus = toDbTechnicalStatus(rawStatus);
    if (!dbStatus) {
      return res.status(400).json({
        success: false,
        message: 'status invalido para filtro',
      });
    }
    values.push(dbStatus);
    conditions.push(`LOWER(COALESCE(e.status, 'scheduled')) = $${values.length}`);
  }

  if (typeFilter) {
    values.push(`%${typeFilter.toLowerCase()}%`);
    conditions.push(`LOWER(COALESCE(e.type, '')) LIKE $${values.length}`);
  }

  if (dateFrom) {
    values.push(dateFrom);
    conditions.push(`e.start_date >= $${values.length}`);
  }

  if (dateTo) {
    values.push(dateTo);
    conditions.push(`e.start_date <= $${values.length}`);
  }

  if (!includeConsolidation) {
    conditions.push(`COALESCE(e.is_stage_consolidation, false) = false`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const client = await pool.connect();
  try {
    const patientJourneyProjection = await resolvePatientJourneyProjection(client);
    const result = await client.query(
      `
        SELECT
          e.id::text AS id,
          e.patient_id::text AS patient_id,
          p.name AS patient_name,
          ${patientJourneyProjection}
          e.professional_id::text AS professional_id,
          COALESCE(
            u.name,
            to_jsonb(prf)->>'funcao',
            to_jsonb(prf)->>'specialty',
            to_jsonb(prf)->>'email'
          ) AS professional_name,
          e.type,
          e.start_date,
          e.end_date,
          e.status,
          e.result,
          e.report,
          e.notes,
          e.is_stage_consolidation,
          e.checklist_ready_for_vaga,
          e.sent_to_vaga_at,
          e.devolutiva_date,
          e.created_at,
          e.updated_at
        FROM public.evaluations e
        JOIN public.patients p
          ON p.id = e.patient_id
        LEFT JOIN public.professionals prf
          ON prf.id = e.professional_id
        LEFT JOIN public.users u
          ON COALESCE(to_jsonb(prf)->>'user_id_int', to_jsonb(prf)->>'user_id') = u.id::text
        ${whereClause}
        ORDER BY e.start_date DESC NULLS LAST, e.created_at DESC
      `,
      values
    );

    const evaluations = result.rows.map(toEvaluationDto);
    return res.json({
      success: true,
      total: evaluations.length,
      evaluations,
    });
  } catch (error) {
    console.error('Erro ao listar avaliacoes:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao listar avaliacoes',
    });
  } finally {
    client.release();
  }
});

router.get('/:id', authorizeEvaluationsView, async (req, res) => {
  const evaluationId = normalizeText(req.params?.id);
  if (!evaluationId) {
    return res.status(400).json({ success: false, message: 'id da avaliacao e obrigatorio' });
  }

  const client = await pool.connect();
  try {
    const row = await fetchEvaluationById(client, evaluationId);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Avaliacao nao encontrada' });
    }

    return res.json({
      success: true,
      evaluation: toEvaluationDto(row),
    });
  } catch (error) {
    console.error('Erro ao carregar avaliacao:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao carregar avaliacao',
    });
  } finally {
    client.release();
  }
});

router.post('/', authorizeEvaluationsCreate, async (req, res) => {
  const resolvedPayload = resolveEvaluationPayload(req.body);
  if (!resolvedPayload.ok) {
    return res.status(400).json({ success: false, message: resolvedPayload.message });
  }

  const payload = resolvedPayload.payload;
  const userIdInt = normalizeUserIdInt(req.user?.id);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const patientExists = await ensurePatientExists(client, payload.patient_id);
    if (!patientExists) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Assistido nao encontrado' });
    }

    const insertResult = await client.query(
      `
        INSERT INTO public.evaluations (
          patient_id,
          professional_id,
          type,
          start_date,
          end_date,
          status,
          result,
          report,
          notes,
          is_stage_consolidation,
          checklist_ready_for_vaga,
          devolutiva_date
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )
        RETURNING id::text AS id
      `,
      [
        payload.patient_id,
        payload.professional_id,
        payload.type,
        payload.start_date,
        payload.end_date,
        payload.status,
        payload.result,
        payload.report,
        payload.notes,
        payload.is_stage_consolidation,
        payload.checklist_ready_for_vaga,
        payload.devolutiva_date,
      ]
    );

    const transitionInfo = await maybeTransitionToEmAvaliacao({
      client,
      patientId: payload.patient_id,
      userIdInt,
      dbStatus: payload.status,
    });

    const created = await fetchEvaluationById(client, insertResult.rows[0].id, { forUpdate: false });
    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: payload.is_stage_consolidation
        ? 'Consolidacao multiprofissional registrada com sucesso.'
        : 'Avaliacao tecnica registrada com sucesso.',
      evaluation: toEvaluationDto(created),
      status_transition: transitionInfo,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar avaliacao:', error);

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
      message: error?.message || 'Erro ao criar avaliacao',
    });
  } finally {
    client.release();
  }
});

router.put('/:id', authorizeEvaluationsEdit, async (req, res) => {
  const evaluationId = normalizeText(req.params?.id);
  if (!evaluationId) {
    return res.status(400).json({ success: false, message: 'id da avaliacao e obrigatorio' });
  }

  const userIdInt = normalizeUserIdInt(req.user?.id);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await fetchEvaluationById(client, evaluationId, { forUpdate: true });
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Avaliacao nao encontrada' });
    }

    const resolvedPayload = resolveEvaluationPayload(req.body, existing);
    if (!resolvedPayload.ok) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: resolvedPayload.message });
    }

    const payload = resolvedPayload.payload;

    const patientExists = await ensurePatientExists(client, payload.patient_id);
    if (!patientExists) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Assistido nao encontrado' });
    }

    await client.query(
      `
        UPDATE public.evaluations
        SET patient_id = $1,
            professional_id = $2,
            type = $3,
            start_date = $4,
            end_date = $5,
            status = $6,
            result = $7,
            report = $8,
            notes = $9,
            is_stage_consolidation = $10,
            checklist_ready_for_vaga = $11,
            devolutiva_date = $12,
            updated_at = NOW()
        WHERE id::text = $13
      `,
      [
        payload.patient_id,
        payload.professional_id,
        payload.type,
        payload.start_date,
        payload.end_date,
        payload.status,
        payload.result,
        payload.report,
        payload.notes,
        payload.is_stage_consolidation,
        payload.checklist_ready_for_vaga,
        payload.devolutiva_date,
        evaluationId,
      ]
    );

    const transitionInfo = await maybeTransitionToEmAvaliacao({
      client,
      patientId: payload.patient_id,
      userIdInt,
      dbStatus: payload.status,
    });

    const updated = await fetchEvaluationById(client, evaluationId, { forUpdate: false });
    await client.query('COMMIT');

    return res.json({
      success: true,
      message: payload.is_stage_consolidation
        ? 'Consolidacao multiprofissional atualizada com sucesso.'
        : 'Avaliacao tecnica atualizada com sucesso.',
      evaluation: toEvaluationDto(updated),
      status_transition: transitionInfo,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar avaliacao:', error);

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
      message: error?.message || 'Erro ao atualizar avaliacao',
    });
  } finally {
    client.release();
  }
});

router.post('/:id/complete', authorizeEvaluationsEdit, async (req, res) => {
  const evaluationId = normalizeText(req.params?.id);
  if (!evaluationId) {
    return res.status(400).json({ success: false, message: 'id da avaliacao e obrigatorio' });
  }

  const userIdInt = normalizeUserIdInt(req.user?.id);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await fetchEvaluationById(client, evaluationId, { forUpdate: true });
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Avaliacao nao encontrada' });
    }

    const endDate = normalizeDate(req.body?.end_date) || new Date().toISOString().slice(0, 10);
    const result = normalizeOptionalText(req.body?.result ?? existing.result);
    const report = normalizeOptionalText(req.body?.report ?? existing.report);
    const notes = normalizeOptionalText(req.body?.notes ?? existing.notes);
    const checklistReadyForVaga = normalizeBoolean(
      req.body?.checklist_ready_for_vaga ?? existing.checklist_ready_for_vaga,
      existing.checklist_ready_for_vaga === true
    );
    const devolutivaDate = normalizeDate(req.body?.devolutiva_date ?? existing.devolutiva_date);

    await client.query(
      `
        UPDATE public.evaluations
        SET status = 'completed',
            end_date = $1,
            result = $2,
            report = $3,
            notes = $4,
            checklist_ready_for_vaga = $5,
            devolutiva_date = $6,
            updated_at = NOW()
        WHERE id::text = $7
      `,
      [endDate, result, report, notes, checklistReadyForVaga, devolutivaDate, evaluationId]
    );

    const transitionInfo = await maybeTransitionToEmAvaliacao({
      client,
      patientId: existing.patient_id,
      userIdInt,
      dbStatus: 'completed',
    });

    const updated = await fetchEvaluationById(client, evaluationId, { forUpdate: false });
    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Avaliacao concluida com sucesso.',
      evaluation: toEvaluationDto(updated),
      status_transition: transitionInfo,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao concluir avaliacao:', error);

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
      message: error?.message || 'Erro ao concluir avaliacao',
    });
  } finally {
    client.release();
  }
});

router.post('/:id/send-to-vaga', authorizeEvaluationsAdvance, async (req, res) => {
  const evaluationId = normalizeText(req.params?.id);
  if (!evaluationId) {
    return res.status(400).json({ success: false, message: 'id da avaliacao e obrigatorio' });
  }

  const userIdInt = normalizeUserIdInt(req.user?.id);

  const justificativa =
    normalizeOptionalText(req.body?.justificativa) ||
    'Etapa de avaliacao multiprofissional consolidada e pronta para analise de vaga';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const targetEvaluation = await fetchEvaluationById(client, evaluationId, { forUpdate: true });
    if (!targetEvaluation) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Avaliacao nao encontrada' });
    }

    const patientId = targetEvaluation.patient_id;
    const completedIndividualsResult = await client.query(
      `
        SELECT COUNT(*)::int AS total
        FROM public.evaluations
        WHERE patient_id::text = $1
          AND COALESCE(is_stage_consolidation, false) = false
          AND LOWER(COALESCE(status, '')) IN ('completed', 'concluida')
      `,
      [patientId]
    );

    const completedIndividuals = Number(completedIndividualsResult.rows[0]?.total || 0);
    if (completedIndividuals <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Nao e possivel enviar para analise de vaga sem avaliacao tecnica concluida.',
      });
    }

    const consolidationResult = await client.query(
      `
        SELECT id::text AS id
        FROM public.evaluations
        WHERE patient_id::text = $1
          AND COALESCE(is_stage_consolidation, false) = true
          AND COALESCE(checklist_ready_for_vaga, false) = true
          AND LOWER(COALESCE(status, '')) IN ('completed', 'concluida')
        ORDER BY end_date DESC NULLS LAST, updated_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [patientId]
    );

    if (consolidationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message:
          'Checklist de consolidacao multiprofissional nao concluido para envio a analise de vaga.',
      });
    }

    const consolidationId = consolidationResult.rows[0].id;
    await client.query(
      `
        UPDATE public.evaluations
        SET sent_to_vaga_at = NOW(),
            updated_at = NOW()
        WHERE id::text = $1
      `,
      [consolidationId]
    );

    const transitionInfo = await maybeTransitionToAnaliseVaga({
      client,
      patientId,
      userIdInt,
      motivoNullable: justificativa,
    });

    const updatedConsolidation = await fetchEvaluationById(client, consolidationId, {
      forUpdate: false,
    });

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Assistido enviado para analise de vaga com sucesso.',
      evaluation: toEvaluationDto(updatedConsolidation),
      status_transition: transitionInfo,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao enviar avaliacao para analise de vaga:', error);

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
      message: error?.message || 'Erro ao enviar para analise de vaga',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
