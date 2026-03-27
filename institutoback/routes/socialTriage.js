const express = require('express');
const router = express.Router();
const pool = require('../config/pg');
const authMiddleware = require('../middleware/auth');
const { authorizeAny } = require('../middleware/authorize');
const { normalizeJourneyStatus } = require('../services/journeyService');

const TRIAGE_STATUS_VALUES = [
  'novo',
  'sem_contato',
  'tentativa_contato',
  'aguardando_retorno',
  'em_atendimento_social',
  'pre_cadastro_em_andamento',
  'aguardando_documentos',
  'apto_para_agendamento',
  'entrevista_agendada',
  'pausa_operacional',
];
const TRIAGE_PRIORITY_VALUES = ['normal', 'prioritario', 'urgente'];
const TRIAGE_STATUS_SET = new Set(TRIAGE_STATUS_VALUES);
const TRIAGE_PRIORITY_SET = new Set(TRIAGE_PRIORITY_VALUES);

const authorizeSocialTriageView = authorizeAny([['triagem_social', 'view']]);
const authorizeSocialTriageWrite = authorizeAny([
  ['triagem_social', 'edit'],
  ['triagem_social', 'create'],
]);

router.use(authMiddleware);

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeOptionalText(value) {
  const text = normalizeText(value);
  return text.length > 0 ? text : null;
}

function normalizePhoneDigits(value) {
  return normalizeText(value).replace(/\D/g, '');
}

function normalizeLimit(value, fallback = 30) {
  const parsed = Number.parseInt(normalizeText(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 100);
}

function normalizeOffset(value, fallback = 0) {
  const parsed = Number.parseInt(normalizeText(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, 10000);
}

function normalizeDate(value) {
  const text = normalizeOptionalText(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function normalizeTimestamp(value) {
  const text = normalizeOptionalText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeBoolean(value, fallback = null) {
  if (typeof value === 'boolean') return value;
  const text = normalizeText(value).toLowerCase();
  if (!text) return fallback;
  if (['1', 'true', 'sim', 'yes', 'y'].includes(text)) return true;
  if (['0', 'false', 'nao', 'não', 'no', 'n'].includes(text)) return false;
  return fallback;
}

function normalizeSort(value) {
  const key = normalizeOptionalText(value)?.toLowerCase() || 'oldest';
  if (['oldest', 'newest', 'priority', 'name', 'next_action'].includes(key)) return key;
  return 'oldest';
}

function normalizeTriageStatus(value, { allowNull = false } = {}) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return allowNull ? null : 'novo';
  const key = normalized.toLowerCase().replace(/[\s-]+/g, '_');
  if (TRIAGE_STATUS_SET.has(key)) return key;
  if (key === 'pre_cadastro') return 'pre_cadastro_em_andamento';
  if (key === 'em_contato') return 'em_atendimento_social';
  return allowNull ? null : null;
}

function normalizeTriagePriority(value, { allowNull = false } = {}) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return allowNull ? null : 'normal';
  const key = normalized.toLowerCase().replace(/[\s-]+/g, '_');
  if (TRIAGE_PRIORITY_SET.has(key)) return key;
  if (['alta', 'high', 'priority'].includes(key)) return 'prioritario';
  if (['baixa', 'low'].includes(key)) return 'normal';
  if (['urgent'].includes(key)) return 'urgente';
  return allowNull ? null : null;
}

function resolveActorId(req) {
  const raw = req?.user?.id;
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  return text.length > 0 ? text : null;
}

function resolveActorName(req) {
  return (
    normalizeOptionalText(req?.user?.name) ||
    normalizeOptionalText(req?.user?.username) ||
    normalizeOptionalText(req?.user?.email) ||
    null
  );
}

function getOrderBy(sort) {
  if (sort === 'newest') {
    return 'queue.entry_created_at DESC NULLS LAST, queue.child_name ASC';
  }
  if (sort === 'priority') {
    return `
      CASE
        WHEN queue.triagem_prioridade = 'urgente' THEN 0
        WHEN queue.triagem_prioridade = 'prioritario' THEN 1
        ELSE 2
      END ASC,
      queue.entry_created_at ASC NULLS LAST,
      queue.child_name ASC
    `;
  }
  if (sort === 'name') {
    return 'queue.child_name ASC, queue.entry_created_at ASC NULLS LAST';
  }
  if (sort === 'next_action') {
    return 'queue.triagem_next_action_at ASC NULLS LAST, queue.entry_created_at ASC NULLS LAST';
  }
  return 'queue.entry_created_at ASC NULLS LAST, queue.child_name ASC';
}

function nextSuggestedAction(status) {
  if (!status || status === 'novo' || status === 'sem_contato') return 'Realizar primeiro contato';
  if (status === 'tentativa_contato') return 'Aguardar retorno do contato';
  if (status === 'aguardando_retorno') return 'Cobrar retorno da familia';
  if (status === 'em_atendimento_social') return 'Consolidar dados iniciais';
  if (status === 'pre_cadastro_em_andamento') return 'Continuar pre-cadastro';
  if (status === 'aguardando_documentos') return 'Conferir documentos pendentes';
  if (status === 'apto_para_agendamento') return 'Agendar entrevista';
  if (status === 'entrevista_agendada') return 'Confirmar comparecimento';
  return 'Atualizar triagem';
}

function isSchemaCompatibilityError(error) {
  const code = normalizeOptionalText(error?.code);
  if (!code) return false;
  return ['42P01', '42703', '42883', '42804'].includes(code);
}

async function tableExists(client, qualifiedTableName) {
  const db = client || pool;
  const result = await db.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [qualifiedTableName]);
  return result.rows[0]?.exists === true;
}

async function assertPatientInQueue(client, patientId, { lock = false } = {}) {
  const result = await client.query(
    `
      SELECT id::text AS patient_id, status_jornada
      FROM public.patients
      WHERE id::text = $1
      LIMIT 1
      ${lock ? 'FOR UPDATE' : ''}
    `,
    [patientId]
  );

  if (result.rows.length === 0) {
    return { ok: false, statusCode: 404, message: 'Assistido nao encontrado.' };
  }

  const status = normalizeJourneyStatus(result.rows[0].status_jornada);
  if (status !== 'em_fila_espera') {
    return {
      ok: false,
      statusCode: 409,
      message:
        'Caso fora da fila operacional. O status_jornada atual nao e em_fila_espera.',
    };
  }

  return { ok: true, statusCode: 200, message: null };
}

async function ensureTriageCase(client, patientId, actorId) {
  await client.query(
    `
      INSERT INTO public.social_triage_cases (
        patient_id,
        triagem_status,
        triagem_prioridade,
        created_by,
        updated_by
      )
      VALUES (
        (SELECT p.id FROM public.patients p WHERE p.id::text = $1 LIMIT 1),
        'novo',
        'normal',
        $2,
        $2
      )
      ON CONFLICT (patient_id) DO NOTHING
    `,
    [patientId, actorId]
  );

  const result = await client.query(
    `
      SELECT *
      FROM public.social_triage_cases
      WHERE patient_id::text = $1
      LIMIT 1
      FOR UPDATE
    `,
    [patientId]
  );

  if (result.rows.length === 0) {
    throw new Error('Nao foi possivel preparar o caso de triagem.');
  }
  return result.rows[0];
}

async function insertHistory(client, payload) {
  await client.query(
    `
      INSERT INTO public.social_triage_history (
        triage_case_id,
        patient_id,
        action_type,
        field_name,
        old_value,
        new_value,
        note,
        metadata,
        acted_by,
        acted_at
      )
      VALUES (
        $1::uuid,
        (SELECT p.id FROM public.patients p WHERE p.id::text = $2 LIMIT 1),
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::jsonb,
        $9,
        NOW()
      )
    `,
    [
      payload.triage_case_id,
      payload.patient_id,
      payload.action_type,
      payload.field_name || null,
      payload.old_value === undefined ? null : payload.old_value,
      payload.new_value === undefined ? null : payload.new_value,
      payload.note || null,
      JSON.stringify(payload.metadata || {}),
      payload.acted_by || null,
    ]
  );
}

function toComparable(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function applyChanges(client, options) {
  const { patientId, actorId, actionType, note, metadata, changes } = options;
  const check = await assertPatientInQueue(client, patientId, { lock: true });
  if (!check.ok) {
    const error = new Error(check.message);
    error.statusCode = check.statusCode;
    throw error;
  }

  const triageCase = await ensureTriageCase(client, patientId, actorId);
  const setClauses = ['updated_at = NOW()'];
  const params = [triageCase.id];

  if (normalizeOptionalText(actorId)) {
    params.push(actorId);
    setClauses.push(`updated_by = $${params.length}`);
  }

  const historyEntries = [];
  for (const [field, value] of Object.entries(changes || {})) {
    if (value === undefined) continue;
    if (!Object.prototype.hasOwnProperty.call(triageCase, field)) continue;

    const oldValue = toComparable(triageCase[field]);
    const newValue = toComparable(value);
    if (oldValue === newValue) continue;

    params.push(value);
    setClauses.push(`${field} = $${params.length}`);
    historyEntries.push({ field, oldValue, newValue });
  }

  if (historyEntries.length > 0) {
    await client.query(
      `
        UPDATE public.social_triage_cases
        SET ${setClauses.join(',\n            ')}
        WHERE id = $1
      `,
      params
    );
  }

  if (historyEntries.length === 0 && !normalizeOptionalText(note)) {
    return triageCase;
  }

  if (historyEntries.length > 0) {
    for (const entry of historyEntries) {
      await insertHistory(client, {
        triage_case_id: triageCase.id,
        patient_id: patientId,
        action_type: actionType,
        field_name: entry.field,
        old_value: entry.oldValue,
        new_value: entry.newValue,
        note,
        metadata,
        acted_by: actorId,
      });
    }
  } else {
    await insertHistory(client, {
      triage_case_id: triageCase.id,
      patient_id: patientId,
      action_type: actionType,
      field_name: null,
      old_value: null,
      new_value: null,
      note,
      metadata,
      acted_by: actorId,
    });
  }

  const latest = await client.query(
    `
      SELECT *
      FROM public.social_triage_cases
      WHERE id = $1
      LIMIT 1
    `,
    [triageCase.id]
  );
  return latest.rows[0] || triageCase;
}
router.get('/', authorizeSocialTriageView, async (req, res) => {
  const q = normalizeOptionalText(req.query?.q);
  const childName = normalizeOptionalText(req.query?.child_name);
  const responsibleName = normalizeOptionalText(req.query?.responsible_name);
  const phoneDigits = normalizePhoneDigits(req.query?.phone);
  const neighborhood = normalizeOptionalText(req.query?.neighborhood);
  const triagemResponsavel = normalizeOptionalText(req.query?.triagem_responsavel);
  const triagemStatusRaw = normalizeOptionalText(req.query?.triagem_status);
  const triagemStatus = normalizeTriageStatus(triagemStatusRaw, { allowNull: true });
  const triagemPriorityRaw = normalizeOptionalText(req.query?.triagem_prioridade);
  const triagemPriority = normalizeTriagePriority(triagemPriorityRaw, { allowNull: true });
  const hasReport = normalizeBoolean(req.query?.has_report, null);
  const serviceType = normalizeOptionalText(req.query?.service_type);
  const dateFrom = normalizeDate(req.query?.date_from);
  const dateTo = normalizeDate(req.query?.date_to);
  const interviewScheduled = normalizeBoolean(req.query?.interview_scheduled, null);
  const limit = normalizeLimit(req.query?.limit, 30);
  const offset = normalizeOffset(req.query?.offset, 0);
  const sort = normalizeSort(req.query?.sort);

  if (triagemStatusRaw && !triagemStatus) {
    return res.status(400).json({ success: false, message: 'triagem_status invalido.' });
  }
  if (triagemPriorityRaw && !triagemPriority) {
    return res.status(400).json({ success: false, message: 'triagem_prioridade invalida.' });
  }
  if (req.query?.has_report !== undefined && hasReport === null) {
    return res.status(400).json({ success: false, message: 'has_report invalido.' });
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return res.status(400).json({ success: false, message: 'date_from nao pode ser maior que date_to.' });
  }

  const params = [];
  const whereClauses = [`LOWER(COALESCE(queue.status_jornada, '')) = 'em_fila_espera'`];

  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    whereClauses.push(`(
      queue.child_name ILIKE ${p}
      OR COALESCE(queue.responsible_name, '') ILIKE ${p}
      OR COALESCE(queue.main_phone, '') ILIKE ${p}
      OR COALESCE(queue.service_interest, '') ILIKE ${p}
    )`);
  }
  if (childName) {
    params.push(`%${childName}%`);
    whereClauses.push(`queue.child_name ILIKE $${params.length}`);
  }
  if (responsibleName) {
    params.push(`%${responsibleName}%`);
    whereClauses.push(`COALESCE(queue.responsible_name, '') ILIKE $${params.length}`);
  }
  if (phoneDigits) {
    params.push(`%${phoneDigits}%`);
    whereClauses.push(`regexp_replace(COALESCE(queue.main_phone, ''), '\\D', '', 'g') LIKE $${params.length}`);
  }
  if (neighborhood) {
    params.push(`%${neighborhood}%`);
    const p = `$${params.length}`;
    whereClauses.push(`(
      COALESCE(queue.neighborhood, '') ILIKE ${p}
      OR COALESCE(queue.city, '') ILIKE ${p}
      OR COALESCE(queue.state, '') ILIKE ${p}
    )`);
  }
  if (triagemResponsavel) {
    params.push(`%${triagemResponsavel}%`);
    const p = `$${params.length}`;
    whereClauses.push(`(
      COALESCE(queue.triagem_responsavel_nome, '') ILIKE ${p}
      OR COALESCE(queue.triagem_responsavel_id, '') ILIKE ${p}
    )`);
  }
  if (triagemStatus) {
    params.push(triagemStatus);
    whereClauses.push(`queue.triagem_status = $${params.length}`);
  }
  if (triagemPriority) {
    params.push(triagemPriority);
    whereClauses.push(`queue.triagem_prioridade = $${params.length}`);
  }
  if (hasReport !== null) {
    params.push(hasReport);
    whereClauses.push(`COALESCE(queue.has_report, false) = $${params.length}`);
  }
  if (serviceType) {
    params.push(`%${serviceType}%`);
    whereClauses.push(`COALESCE(queue.service_interest, '') ILIKE $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    whereClauses.push(`DATE(queue.entry_created_at) >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    whereClauses.push(`DATE(queue.entry_created_at) <= $${params.length}::date`);
  }
  if (interviewScheduled !== null) {
    params.push(interviewScheduled);
    whereClauses.push(`queue.entrevista_agendada = $${params.length}`);
  }

  const whereSql = `WHERE ${whereClauses.join('\n      AND ')}`;
  const orderBySql = getOrderBy(sort);

  let hasTriageCaseTable = false;
  try {
    hasTriageCaseTable = await tableExists(null, 'public.social_triage_cases');
  } catch (error) {
    console.warn('[social-triage] Falha ao verificar tabela social_triage_cases:', {
      code: error?.code || null,
      message: error?.message || String(error),
    });
  }

  const triageCaseJoinSql = hasTriageCaseTable
    ? `
      LEFT JOIN LATERAL (
        SELECT
          st.triagem_status,
          st.triagem_prioridade,
          st.triagem_responsavel_id,
          st.triagem_responsavel_nome,
          st.triagem_last_contact_at,
          st.triagem_next_action_at,
          st.triagem_notes_summary,
          st.entrevista_agendada_flag,
          st.linked_appointment_id,
          st.linked_appointment_at
        FROM public.social_triage_cases st
        WHERE st.patient_id::text = p.id::text
        LIMIT 1
      ) st ON true
    `
    : `
      LEFT JOIN LATERAL (
        SELECT
          NULL::text AS triagem_status,
          NULL::text AS triagem_prioridade,
          NULL::text AS triagem_responsavel_id,
          NULL::text AS triagem_responsavel_nome,
          NULL::timestamptz AS triagem_last_contact_at,
          NULL::timestamptz AS triagem_next_action_at,
          NULL::text AS triagem_notes_summary,
          false AS entrevista_agendada_flag,
          NULL::text AS linked_appointment_id,
          NULL::timestamptz AS linked_appointment_at
      ) st ON true
    `;

  const queueCteSql = `
    WITH queue AS (
      SELECT
        p.id::text AS patient_id,
        p.name AS child_name,
        p.date_of_birth,
        DATE_PART('year', AGE(CURRENT_DATE, p.date_of_birth))::int AS age_years,
        p.status_jornada,
        p.neighborhood,
        p.city,
        p.state,
        COALESCE(origin.responsible_name, NULL) AS responsible_name,
        COALESCE(origin.phone, NULLIF(BTRIM(p.phone), ''), NULLIF(BTRIM(p.mobile), '')) AS main_phone,
        COALESCE(origin.source, 'recepcao') AS entry_channel,
        COALESCE(origin.created_at, p.created_at) AS entry_created_at,
        COALESCE(origin.requested_services, origin.service_type) AS service_interest,
        origin.requested_service_ids,
        origin.has_report,
        origin.cid,
        COALESCE(st.triagem_status, CASE WHEN LOWER(COALESCE(p.status, '')) = 'pre_cadastro' THEN 'pre_cadastro_em_andamento' ELSE 'novo' END) AS triagem_status,
        COALESCE(st.triagem_prioridade, 'normal') AS triagem_prioridade,
        st.triagem_responsavel_id,
        COALESCE(st.triagem_responsavel_nome, triage_user.name, triage_user.username, triage_user.email) AS triagem_responsavel_nome,
        st.triagem_last_contact_at,
        st.triagem_next_action_at,
        st.triagem_notes_summary,
        COALESCE(st.entrevista_agendada_flag, false) AS entrevista_agendada_flag,
        COALESCE(st.linked_appointment_id, appt.appointment_id) AS linked_appointment_id,
        COALESCE(st.linked_appointment_at, appt.appointment_at) AS linked_appointment_at,
        appt.appointment_date,
        appt.appointment_time,
        appt.appointment_status,
        appt.appointment_service_name,
        (COALESCE(st.entrevista_agendada_flag, false) OR appt.appointment_id IS NOT NULL) AS entrevista_agendada
      FROM public.patients p
      ${triageCaseJoinSql}
      LEFT JOIN public.users triage_user
        ON triage_user.id::text = st.triagem_responsavel_id
      LEFT JOIN LATERAL (
        SELECT
          pa.id::text AS pre_appointment_id,
          NULLIF(BTRIM(COALESCE(to_jsonb(pa)->>'responsible_name', '')), '') AS responsible_name,
          NULLIF(BTRIM(COALESCE(to_jsonb(pa)->>'phone', '')), '') AS phone,
          NULLIF(BTRIM(COALESCE(to_jsonb(pa)->>'source', '')), '') AS source,
          NULLIF(BTRIM(COALESCE(to_jsonb(pa)->>'service_type', '')), '') AS service_type,
          CASE
            WHEN LOWER(COALESCE(to_jsonb(pa)->>'has_report', '')) IN ('true', 't', '1', 'yes', 'sim') THEN true
            WHEN LOWER(COALESCE(to_jsonb(pa)->>'has_report', '')) IN ('false', 'f', '0', 'no', 'nao', 'não') THEN false
            ELSE false
          END AS has_report,
          NULLIF(BTRIM(COALESCE(to_jsonb(pa)->>'cid', '')), '') AS cid,
          pa.created_at,
          (
            SELECT string_agg(DISTINCT svc.name, ', ' ORDER BY svc.name)
            FROM jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(to_jsonb(pa)->'services') = 'array'
                  THEN to_jsonb(pa)->'services'
                ELSE '[]'::jsonb
              END
            ) sid(service_id)
            JOIN public.services svc ON svc.id::text = sid.service_id
          ) AS requested_services,
          (
            SELECT ARRAY(
              SELECT DISTINCT sid.service_id
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(to_jsonb(pa)->'services') = 'array'
                    THEN to_jsonb(pa)->'services'
                  ELSE '[]'::jsonb
                END
              ) sid(service_id)
            )
          ) AS requested_service_ids
        FROM public.fila_de_espera pa
        WHERE NULLIF(BTRIM(COALESCE(to_jsonb(pa)->>'converted_to_patient_id', '')), '') = p.id::text
        ORDER BY pa.created_at DESC NULLS LAST
        LIMIT 1
      ) origin ON true
      LEFT JOIN LATERAL (
        SELECT
          a.id::text AS appointment_id,
          a.appointment_date,
          to_char(a.appointment_time, 'HH24:MI') AS appointment_time,
          a.status AS appointment_status,
          s.name AS appointment_service_name,
          (a.appointment_date::timestamp + a.appointment_time) AS appointment_at
        FROM public.appointments a
        LEFT JOIN public.services s ON s.id = a.service_id
        WHERE a.patient_id::text = p.id::text
          AND COALESCE(LOWER(a.status), '') NOT IN ('cancelled', 'cancelado', 'cancelada', 'completed', 'concluido', 'concluida')
        ORDER BY a.appointment_date ASC NULLS LAST, a.appointment_time ASC NULLS LAST
        LIMIT 1
      ) appt ON true
    )
  `;

  try {
    const summaryResult = await pool.query(
      `
        ${queueCteSql}
        SELECT
          COUNT(*)::int AS total_em_fila,
          COUNT(*) FILTER (WHERE queue.entry_created_at >= NOW() - INTERVAL '7 days')::int AS novos_casos,
          COUNT(*) FILTER (
            WHERE queue.triagem_status IN ('novo', 'sem_contato')
              OR queue.triagem_last_contact_at IS NULL
          )::int AS sem_contato,
          COUNT(*) FILTER (
            WHERE queue.triagem_status IN (
              'tentativa_contato',
              'aguardando_retorno',
              'em_atendimento_social',
              'pre_cadastro_em_andamento',
              'aguardando_documentos'
            )
          )::int AS em_andamento,
          COUNT(*) FILTER (WHERE queue.triagem_status = 'apto_para_agendamento')::int AS apto_para_agendamento,
          COUNT(*) FILTER (WHERE queue.entrevista_agendada = true)::int AS entrevista_agendada
        FROM queue
        ${whereSql}
      `,
      params
    );

    const listParams = [...params, limit, offset];
    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;
    const listResult = await pool.query(
      `
        ${queueCteSql}
        SELECT queue.*, COUNT(*) OVER()::int AS total_count
        FROM queue
        ${whereSql}
        ORDER BY ${orderBySql}
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
      `,
      listParams
    );

    const total = Number(listResult.rows[0]?.total_count || 0);
    const summaryRow = summaryResult.rows[0] || {};
    return res.json({
      success: true,
      total,
      limit,
      offset,
      sort,
      summary: {
        total_em_fila: Number(summaryRow.total_em_fila || 0),
        novos_casos: Number(summaryRow.novos_casos || 0),
        sem_contato: Number(summaryRow.sem_contato || 0),
        em_andamento: Number(summaryRow.em_andamento || 0),
        apto_para_agendamento: Number(summaryRow.apto_para_agendamento || 0),
        entrevista_agendada: Number(summaryRow.entrevista_agendada || 0),
      },
      items: listResult.rows.map((row) => {
        const status = normalizeTriageStatus(row.triagem_status) || 'novo';
        return {
          patient_id: normalizeOptionalText(row.patient_id),
          child_name: normalizeOptionalText(row.child_name) || '-',
          date_of_birth: row.date_of_birth || null,
          age_years: row.age_years === null ? null : Number(row.age_years),
          responsible_name: normalizeOptionalText(row.responsible_name),
          main_phone: normalizeOptionalText(row.main_phone),
          neighborhood: normalizeOptionalText(row.neighborhood),
          city: normalizeOptionalText(row.city),
          state: normalizeOptionalText(row.state),
          entry_channel: normalizeOptionalText(row.entry_channel),
          entry_created_at: row.entry_created_at || null,
          service_interest: normalizeOptionalText(row.service_interest),
          requested_service_ids: Array.isArray(row.requested_service_ids)
            ? row.requested_service_ids.filter(Boolean)
            : [],
          has_report: row.has_report === true,
          cid: normalizeOptionalText(row.cid),
          status_jornada: normalizeJourneyStatus(row.status_jornada) || 'em_fila_espera',
          triagem_status: status,
          triagem_prioridade: normalizeTriagePriority(row.triagem_prioridade) || 'normal',
          triagem_responsavel_id: normalizeOptionalText(row.triagem_responsavel_id),
          triagem_responsavel_nome: normalizeOptionalText(row.triagem_responsavel_nome),
          triagem_last_contact_at: row.triagem_last_contact_at || null,
          triagem_next_action_at: row.triagem_next_action_at || null,
          triagem_notes_summary: normalizeOptionalText(row.triagem_notes_summary),
          entrevista_agendada: row.entrevista_agendada === true,
          linked_appointment_id: normalizeOptionalText(row.linked_appointment_id),
          linked_appointment_at: row.linked_appointment_at || null,
          appointment_date: row.appointment_date || null,
          appointment_time: normalizeOptionalText(row.appointment_time),
          appointment_status: normalizeOptionalText(row.appointment_status),
          appointment_service_name: normalizeOptionalText(row.appointment_service_name),
          next_suggested_action: nextSuggestedAction(status),
        };
      }),
      metadata: {
        status_official_source: 'patients.status_jornada',
        triage_storage_ready: hasTriageCaseTable,
        compatibility_mode: hasTriageCaseTable ? null : 'without_social_triage_cases_table',
      },
    });
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      console.error('Erro de compatibilidade de schema ao listar triagem social:', {
        code: error?.code || null,
        message: error?.message || null,
        detail: error?.detail || null,
        hint: error?.hint || null,
      });
    } else {
      console.error('Erro ao listar fila da triagem social:', error);
    }
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao listar fila da triagem social.',
    });
  }
});
router.get('/:patientId/history', authorizeSocialTriageView, async (req, res) => {
  const patientId = normalizeOptionalText(req.params?.patientId);
  if (!patientId) {
    return res.status(400).json({ success: false, message: 'patientId e obrigatorio.' });
  }

  const limit = normalizeLimit(req.query?.limit, 50);
  try {
    const hasHistoryTable = await tableExists(null, 'public.social_triage_history');
    if (!hasHistoryTable) {
      return res.json({
        success: true,
        patient_id: patientId,
        total: 0,
        items: [],
        metadata: {
          triage_storage_ready: false,
          compatibility_mode: 'without_social_triage_history_table',
        },
      });
    }

    const result = await pool.query(
      `
        SELECT
          h.id::text AS id,
          h.action_type,
          h.field_name,
          h.old_value,
          h.new_value,
          h.note,
          h.metadata,
          h.acted_by,
          h.acted_at,
          COALESCE(u.name, u.username, u.email) AS acted_by_name
        FROM public.social_triage_history h
        LEFT JOIN public.users u
          ON u.id::text = h.acted_by
        WHERE h.patient_id::text = $1
        ORDER BY h.acted_at DESC, h.id DESC
        LIMIT $2
      `,
      [patientId, limit]
    );

    return res.json({
      success: true,
      patient_id: patientId,
      total: result.rows.length,
      items: result.rows.map((row) => ({
        id: normalizeOptionalText(row.id),
        action_type: normalizeOptionalText(row.action_type),
        field_name: normalizeOptionalText(row.field_name),
        old_value: row.old_value === undefined ? null : row.old_value,
        new_value: row.new_value === undefined ? null : row.new_value,
        note: normalizeOptionalText(row.note),
        metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
        acted_by: normalizeOptionalText(row.acted_by),
        acted_by_name: normalizeOptionalText(row.acted_by_name),
        acted_at: row.acted_at || null,
      })),
    });
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      console.error('Erro de compatibilidade de schema ao listar historico da triagem social:', {
        code: error?.code || null,
        message: error?.message || null,
        detail: error?.detail || null,
        hint: error?.hint || null,
      });
    } else {
      console.error('Erro ao listar historico da triagem social:', error);
    }
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao listar historico da triagem social.',
    });
  }
});

router.post('/:patientId/agenda/start', authorizeSocialTriageWrite, async (req, res) => {
  const patientId = normalizeOptionalText(req.params?.patientId);
  if (!patientId) {
    return res.status(400).json({ success: false, message: 'patientId e obrigatorio.' });
  }

  const actorId = resolveActorId(req);
  const actorName = resolveActorName(req);
  const note =
    normalizeOptionalText(req.body?.note) ||
    'Fluxo de agendamento iniciado a partir da Triagem Social.';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await applyChanges(client, {
      patientId,
      actorId,
      actionType: 'iniciar_agendamento_entrevista',
      note,
      metadata: { endpoint: 'POST /social-triage/:patientId/agenda/start', actorName },
      changes: {},
    });
    await client.query('COMMIT');

    return res.json({
      success: true,
      triage_case: updated,
      agenda_route_hint: `/agenda?patient_id=${encodeURIComponent(patientId)}&entry=triagem_social`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Erro ao iniciar agendamento pela triagem social:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao iniciar agendamento.',
    });
  } finally {
    client.release();
  }
});

router.patch('/:patientId', authorizeSocialTriageWrite, async (req, res) => {
  const patientId = normalizeOptionalText(req.params?.patientId);
  if (!patientId) {
    return res.status(400).json({ success: false, message: 'patientId e obrigatorio.' });
  }

  const actionType = normalizeOptionalText(req.body?.action_type) || 'atualizacao_triagem';
  const note = normalizeOptionalText(req.body?.note);
  const triagemStatusRaw = req.body?.triagem_status;
  const triagemPriorityRaw = req.body?.triagem_prioridade;
  const triagemStatus =
    triagemStatusRaw === undefined
      ? undefined
      : normalizeTriageStatus(triagemStatusRaw, { allowNull: true });
  const triagemPriority =
    triagemPriorityRaw === undefined
      ? undefined
      : normalizeTriagePriority(triagemPriorityRaw, { allowNull: true });
  const triagemLastContactAtRaw = req.body?.triagem_last_contact_at;
  const triagemLastContactAt =
    triagemLastContactAtRaw === undefined
      ? undefined
      : triagemLastContactAtRaw === null
        ? null
        : normalizeTimestamp(triagemLastContactAtRaw);
  const triagemNextActionAtRaw = req.body?.triagem_next_action_at;
  const triagemNextActionAt =
    triagemNextActionAtRaw === undefined
      ? undefined
      : triagemNextActionAtRaw === null
        ? null
        : normalizeTimestamp(triagemNextActionAtRaw);
  const linkedAppointmentAtRaw = req.body?.linked_appointment_at;
  const linkedAppointmentAt =
    linkedAppointmentAtRaw === undefined
      ? undefined
      : linkedAppointmentAtRaw === null
        ? null
        : normalizeTimestamp(linkedAppointmentAtRaw);

  if (triagemStatusRaw !== undefined && !triagemStatus) {
    return res.status(400).json({ success: false, message: 'triagem_status invalido.' });
  }
  if (triagemPriorityRaw !== undefined && !triagemPriority) {
    return res.status(400).json({ success: false, message: 'triagem_prioridade invalida.' });
  }
  if (triagemLastContactAtRaw !== undefined && triagemLastContactAtRaw !== null && !triagemLastContactAt) {
    return res.status(400).json({ success: false, message: 'triagem_last_contact_at invalido.' });
  }
  if (triagemNextActionAtRaw !== undefined && triagemNextActionAtRaw !== null && !triagemNextActionAt) {
    return res.status(400).json({ success: false, message: 'triagem_next_action_at invalido.' });
  }
  if (linkedAppointmentAtRaw !== undefined && linkedAppointmentAtRaw !== null && !linkedAppointmentAt) {
    return res.status(400).json({ success: false, message: 'linked_appointment_at invalido.' });
  }

  const changes = {
    triagem_status: triagemStatus,
    triagem_prioridade: triagemPriority,
    triagem_responsavel_id:
      req.body?.triagem_responsavel_id === undefined
        ? undefined
        : normalizeOptionalText(req.body?.triagem_responsavel_id),
    triagem_responsavel_nome:
      req.body?.triagem_responsavel_nome === undefined
        ? undefined
        : normalizeOptionalText(req.body?.triagem_responsavel_nome),
    triagem_last_contact_at: triagemLastContactAt,
    triagem_next_action_at: triagemNextActionAt,
    triagem_notes_summary:
      req.body?.triagem_notes_summary === undefined
        ? undefined
        : normalizeOptionalText(req.body?.triagem_notes_summary),
    entrevista_agendada_flag:
      req.body?.entrevista_agendada_flag === undefined
        ? undefined
        : req.body?.entrevista_agendada_flag === null
          ? null
          : normalizeBoolean(req.body?.entrevista_agendada_flag, null),
    linked_appointment_id:
      req.body?.linked_appointment_id === undefined
        ? undefined
        : normalizeOptionalText(req.body?.linked_appointment_id),
    linked_appointment_at: linkedAppointmentAt,
  };

  const hasChange = Object.values(changes).some((value) => value !== undefined) || Boolean(note);
  if (!hasChange) {
    return res.status(400).json({
      success: false,
      message: 'Informe ao menos um campo de triagem para atualizar.',
    });
  }

  if (changes.entrevista_agendada_flag === null) {
    delete changes.entrevista_agendada_flag;
  }

  const actorId = resolveActorId(req);
  const actorName = resolveActorName(req);
  const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await applyChanges(client, {
      patientId,
      actorId,
      actionType,
      note,
      metadata: { ...metadata, actorName, endpoint: 'PATCH /social-triage/:patientId' },
      changes,
    });
    await client.query('COMMIT');

    return res.json({
      success: true,
      triage_case: updated,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Erro ao atualizar triagem social:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao atualizar triagem social.',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
