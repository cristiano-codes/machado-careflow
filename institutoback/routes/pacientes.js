const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { authorizeAny } = require('../middleware/authorize');
const pool = require('../config/pg');
const {
  VALID_JOURNEY_STATUSES,
  normalizeJourneyStatus,
  normalizeUserIdInt,
  transitionPatientStatus,
  createInitialStatusHistory,
} = require('../services/journeyService');

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const authorizeVagaEligibilityLookup = authorizeAny([
  ['analise_vagas', 'view'],
  ['vagas', 'view'],
  ['avaliacoes', 'view'],
]);

router.use(authMiddleware);

function normalizeCpf(value) {
  const digits = (value || '').toString().replace(/\D/g, '');
  return digits || null;
}

function normalizeDate(value) {
  const text = (value || '').toString().trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function normalizeDigits(value) {
  return (value || '').toString().replace(/\D/g, '');
}

function normalizeBooleanQuery(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'y', 't'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'não', 'no', 'n', 'f'].includes(normalized)) return false;
  return null;
}

function normalizeInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) return null;
  const text = value.toString().trim();
  return text.length > 0 ? text : null;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeUuid(value) {
  const text = normalizeOptionalText(value);
  if (!text) return null;
  return UUID_REGEX.test(text) ? text : null;
}

function normalizeIdAsText(value) {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized : null;
}

function mapPatientResponse(row) {
  return {
    id: row.id,
    nome: row.nome,
    cpf: row.cpf,
    telefone: row.telefone,
    email: row.email,
    dataNascimento: row.dataNascimento,
    status: row.status,
    status_jornada: row.status_jornada,
  };
}

function resolveLoggedUserIdInt(req) {
  return normalizeUserIdInt(req.user?.id);
}

function isPreAppointmentConverted(row) {
  if (!row || typeof row !== 'object') return false;

  const convertedToPatientId = normalizeOptionalText(row.converted_to_patient_id);
  if (convertedToPatientId) return true;

  if (row.converted_at) return true;

  const status = normalizeOptionalText(row.status);
  return status ? status.toLowerCase() === 'converted' : false;
}

async function lockPreAppointmentForConversion(client, preAppointmentId) {
  const result = await client.query(
    `
      SELECT
        id::text AS id,
        status,
        converted_to_patient_id::text AS converted_to_patient_id,
        converted_at
      FROM public.pre_appointments
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [preAppointmentId]
  );

  return result.rows[0] || null;
}

async function markPreAppointmentAsConverted({
  client,
  preAppointmentId,
  patientId,
  convertedBy,
}) {
  await client.query(
    `
      UPDATE public.pre_appointments
      SET status = 'converted',
          converted_to_patient_id = $2,
          converted_at = NOW(),
          converted_by = $3,
          updated_at = NOW()
      WHERE id = $1
    `,
    [preAppointmentId, patientId, convertedBy]
  );
}

function buildPatientPayload(body, existing = null) {
  const payload = body || {};

  const name = (
    payload.name ??
    payload.nome ??
    existing?.name ??
    existing?.nome ??
    ''
  )
    .toString()
    .trim();

  const rawDateOfBirth =
    payload.date_of_birth ?? payload.data_nascimento ?? existing?.date_of_birth ?? null;
  const dateOfBirth = normalizeDate(rawDateOfBirth);

  const rawStatusJornada = hasOwn(payload, 'status_jornada')
    ? payload.status_jornada
    : existing?.status_jornada;
  const statusJornada = rawStatusJornada
    ? normalizeJourneyStatus(rawStatusJornada)
    : null;

  return {
    name,
    cpf: normalizeCpf(payload.cpf !== undefined ? payload.cpf : existing?.cpf),
    rg: normalizeOptionalText(payload.rg !== undefined ? payload.rg : existing?.rg),
    date_of_birth: dateOfBirth,
    email: normalizeOptionalText(payload.email !== undefined ? payload.email : existing?.email),
    phone: normalizeOptionalText(payload.phone ?? payload.telefone ?? existing?.phone),
    mobile: normalizeOptionalText(payload.mobile ?? payload.celular ?? existing?.mobile),
    address: normalizeOptionalText(payload.address ?? payload.endereco ?? existing?.address),
    number: normalizeOptionalText(payload.number ?? payload.numero ?? existing?.number),
    complement: normalizeOptionalText(
      payload.complement ?? payload.complemento ?? existing?.complement
    ),
    neighborhood: normalizeOptionalText(
      payload.neighborhood ?? payload.bairro ?? existing?.neighborhood
    ),
    city: normalizeOptionalText(payload.city ?? payload.cidade ?? existing?.city),
    state: normalizeOptionalText(payload.state ?? payload.estado ?? existing?.state),
    zip_code: normalizeOptionalText(payload.zip_code ?? payload.cep ?? existing?.zip_code),
    profession: normalizeOptionalText(
      payload.profession ?? payload.profissao ?? existing?.profession
    ),
    marital_status: normalizeOptionalText(
      payload.marital_status ?? payload.estado_civil ?? existing?.marital_status
    ),
    education: normalizeOptionalText(
      payload.education ?? payload.escolaridade ?? existing?.education
    ),
    insurance_plan: normalizeOptionalText(
      payload.insurance_plan ?? payload.convenio ?? existing?.insurance_plan
    ),
    insurance_number: normalizeOptionalText(
      payload.insurance_number ?? payload.numero_convenio ?? existing?.insurance_number
    ),
    notes: normalizeOptionalText(payload.notes ?? payload.observacoes ?? existing?.notes),
    status: normalizeOptionalText(payload.status ?? existing?.status ?? 'pre_cadastro') || 'pre_cadastro',
    status_jornada: statusJornada || existing?.status_jornada || 'em_fila_espera',
  };
}

function normalizePatientOperationalStatusInput(value) {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.toLowerCase() : null;
}

function validateCreatePatientStatusInputs(body) {
  const hasStatus = hasOwn(body, 'status');
  const hasJourneyStatus = hasOwn(body, 'status_jornada');
  const requestedStatus = normalizePatientOperationalStatusInput(body?.status);
  const requestedJourneyStatus = normalizeJourneyStatus(body?.status_jornada);
  const conflicts = [];

  if (hasStatus && requestedStatus && requestedStatus !== 'pre_cadastro') {
    conflicts.push('status deve ser pre_cadastro na criacao do cadastro.');
  }

  if (hasJourneyStatus && requestedJourneyStatus && requestedJourneyStatus !== 'em_fila_espera') {
    conflicts.push('status_jornada deve ser em_fila_espera na criacao do cadastro.');
  }

  if (hasStatus && !requestedStatus) {
    conflicts.push('status invalido');
  }

  if (hasJourneyStatus && !requestedJourneyStatus) {
    conflicts.push('status_jornada invalido');
  }

  return {
    ok: conflicts.length === 0,
    conflicts,
  };
}

async function findDuplicatePatient({
  client,
  cpf,
  name,
  dateOfBirth,
  excludePatientId = null,
}) {
  if (cpf) {
    const duplicateByCpf = await client.query(
      `
        SELECT id::text AS id
        FROM public.patients
        WHERE regexp_replace(COALESCE(cpf, ''), '\\D', '', 'g') = $1
          AND ($2::text IS NULL OR id::text <> $2::text)
        LIMIT 1
      `,
      [cpf, excludePatientId]
    );

    if (duplicateByCpf.rows.length > 0) {
      return duplicateByCpf.rows[0].id;
    }

    return null;
  }

  if (name && dateOfBirth) {
    const duplicateByNameAndDob = await client.query(
      `
        SELECT id::text AS id
        FROM public.patients
        WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
          AND date_of_birth = $2
          AND ($3::text IS NULL OR id::text <> $3::text)
        LIMIT 1
      `,
      [name, dateOfBirth, excludePatientId]
    );

    if (duplicateByNameAndDob.rows.length > 0) {
      return duplicateByNameAndDob.rows[0].id;
    }
  }

  return null;
}

async function getPatientById(client, patientId) {
  const result = await client.query(
    `
      SELECT
        id::text AS id,
        name AS "nome",
        cpf,
        phone AS "telefone",
        email,
        date_of_birth AS "dataNascimento",
        status,
        status_jornada
      FROM public.patients
      WHERE id = $1
      LIMIT 1
    `,
    [patientId]
  );

  return result.rows[0] || null;
}

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id::text AS id,
          name AS "nome",
          cpf,
          phone AS "telefone",
          email,
          date_of_birth AS "dataNascimento",
          status,
          status_jornada
        FROM public.patients
        ORDER BY created_at DESC
        LIMIT 100
      `
    );

    return res.json({
      success: true,
      total: result.rows.length,
      pacientes: result.rows.map(mapPatientResponse),
    });
  } catch (error) {
    console.error('Erro ao listar pacientes:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar pacientes',
    });
  }
});

router.get('/vaga-elegiveis', authorizeVagaEligibilityLookup, async (req, res) => {
  const q = normalizeOptionalText(req.query?.q);
  const childName = normalizeOptionalText(req.query?.child_name);
  const responsibleName = normalizeOptionalText(req.query?.responsible_name);
  const cpfDigits = normalizeCpf(req.query?.cpf);
  const phoneDigits = normalizeDigits(req.query?.phone);
  const cid = normalizeOptionalText(req.query?.cid);
  const specialty = normalizeOptionalText(req.query?.specialty);
  const journeyStatusFilter = normalizeJourneyStatus(req.query?.status_jornada);
  const readyForVaga = normalizeBooleanQuery(req.query?.ready_for_vaga);
  const hasSocialInterview = normalizeBooleanQuery(req.query?.has_social_interview);
  const hasCompletedEvaluation = normalizeBooleanQuery(req.query?.has_completed_evaluation);
  const sentToVaga = normalizeBooleanQuery(req.query?.sent_to_vaga);
  const limit = normalizeInteger(req.query?.limit, 20, { min: 1, max: 100 });
  const offset = normalizeInteger(req.query?.offset, 0, { min: 0, max: 5000 });
  const ageMin = normalizeInteger(req.query?.age_min, null, { min: 0, max: 120 });
  const ageMax = normalizeInteger(req.query?.age_max, null, { min: 0, max: 120 });

  if (journeyStatusFilter && !VALID_JOURNEY_STATUSES.has(journeyStatusFilter)) {
    return res.status(400).json({
      success: false,
      message: 'status_jornada invalido para filtro',
    });
  }

  if (ageMin !== null && ageMax !== null && ageMin > ageMax) {
    return res.status(400).json({
      success: false,
      message: 'age_min nao pode ser maior que age_max',
    });
  }

  const params = [];
  const whereClauses = [];

  if (q) {
    params.push(`%${q}%`);
    const qParam = `$${params.length}`;
    whereClauses.push(
      `(
        p.name ILIKE ${qParam}
        OR COALESCE(origin.responsible_name, '') ILIKE ${qParam}
        OR COALESCE(p.phone, '') ILIKE ${qParam}
        OR COALESCE(p.mobile, '') ILIKE ${qParam}
        OR COALESCE(p.cpf, '') ILIKE ${qParam}
        OR COALESCE(origin.cid, '') ILIKE ${qParam}
        OR COALESCE(eval.primary_need, '') ILIKE ${qParam}
      )`
    );
  }

  if (childName) {
    params.push(`%${childName}%`);
    whereClauses.push(`p.name ILIKE $${params.length}`);
  }

  if (responsibleName) {
    params.push(`%${responsibleName}%`);
    whereClauses.push(`COALESCE(origin.responsible_name, '') ILIKE $${params.length}`);
  }

  if (cpfDigits) {
    params.push(`%${cpfDigits}%`);
    whereClauses.push(
      `(
        regexp_replace(COALESCE(p.cpf, ''), '\\D', '', 'g') LIKE $${params.length}
        OR regexp_replace(COALESCE(origin.origin_cpf, ''), '\\D', '', 'g') LIKE $${params.length}
      )`
    );
  }

  if (phoneDigits) {
    params.push(`%${phoneDigits}%`);
    whereClauses.push(
      `(
        regexp_replace(COALESCE(p.phone, ''), '\\D', '', 'g') LIKE $${params.length}
        OR regexp_replace(COALESCE(p.mobile, ''), '\\D', '', 'g') LIKE $${params.length}
        OR regexp_replace(COALESCE(origin.responsible_phone, ''), '\\D', '', 'g') LIKE $${params.length}
      )`
    );
  }

  if (journeyStatusFilter) {
    params.push(journeyStatusFilter);
    whereClauses.push(`LOWER(COALESCE(p.status_jornada, '')) = $${params.length}`);
  }

  if (cid) {
    params.push(`%${cid}%`);
    whereClauses.push(`COALESCE(origin.cid, '') ILIKE $${params.length}`);
  }

  if (specialty) {
    params.push(`%${specialty}%`);
    const specialtyParam = `$${params.length}`;
    whereClauses.push(
      `(
        COALESCE(eval.primary_need, '') ILIKE ${specialtyParam}
        OR COALESCE(origin.service_type, '') ILIKE ${specialtyParam}
      )`
    );
  }

  if (readyForVaga !== null) {
    params.push(readyForVaga);
    whereClauses.push(
      `(COALESCE(eval.completed_individual_count, 0) > 0 AND COALESCE(eval.has_consolidation_ready, false) = true) = $${params.length}`
    );
  }

  if (hasSocialInterview !== null) {
    params.push(hasSocialInterview);
    whereClauses.push(
      `(COALESCE(interview.completed_social_interview_count, 0) > 0) = $${params.length}`
    );
  }

  if (hasCompletedEvaluation !== null) {
    params.push(hasCompletedEvaluation);
    whereClauses.push(`(COALESCE(eval.completed_individual_count, 0) > 0) = $${params.length}`);
  }

  if (sentToVaga !== null) {
    params.push(sentToVaga);
    whereClauses.push(`(eval.latest_sent_to_vaga_at IS NOT NULL) = $${params.length}`);
  }

  if (ageMin !== null) {
    params.push(ageMin);
    whereClauses.push(`DATE_PART('year', AGE(CURRENT_DATE, p.date_of_birth)) >= $${params.length}`);
  }

  if (ageMax !== null) {
    params.push(ageMax);
    whereClauses.push(`DATE_PART('year', AGE(CURRENT_DATE, p.date_of_birth)) <= $${params.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join('\n      AND ')}` : '';
  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  try {
    const result = await pool.query(
      `
        WITH evaluation_summary AS (
          SELECT
            e.patient_id::text AS patient_id,
            COUNT(*) FILTER (
              WHERE COALESCE(e.is_stage_consolidation, false) = false
                AND LOWER(COALESCE(e.status, '')) IN ('completed', 'concluida')
            )::int AS completed_individual_count,
            BOOL_OR(
              COALESCE(e.is_stage_consolidation, false) = true
              AND COALESCE(e.checklist_ready_for_vaga, false) = true
              AND LOWER(COALESCE(e.status, '')) IN ('completed', 'concluida')
            ) AS has_consolidation_ready,
            MAX(e.sent_to_vaga_at) FILTER (
              WHERE COALESCE(e.is_stage_consolidation, false) = true
            ) AS latest_sent_to_vaga_at,
            (
              ARRAY_REMOVE(
                ARRAY_AGG(
                  CASE
                    WHEN COALESCE(e.is_stage_consolidation, false) = false
                      THEN NULLIF(BTRIM(e.type), '')
                    ELSE NULL
                  END
                  ORDER BY e.end_date DESC NULLS LAST, e.updated_at DESC NULLS LAST, e.created_at DESC NULLS LAST
                ),
                NULL
              )
            )[1] AS primary_need
          FROM public.evaluations e
          GROUP BY e.patient_id::text
        ),
        interview_summary AS (
          SELECT
            s.patient_id::text AS patient_id,
            COUNT(*) FILTER (
              WHERE CASE
                WHEN LOWER(COALESCE(to_jsonb(s)->>'is_draft', '')) IN ('true', '1', 't', 'sim', 'yes', 'y') THEN true
                WHEN LOWER(COALESCE(to_jsonb(s)->>'is_draft', '')) IN ('false', '0', 'f', 'nao', 'no', 'n') THEN false
                ELSE false
              END = false
            )::int AS completed_social_interview_count,
            MAX(s.interview_date) FILTER (
              WHERE CASE
                WHEN LOWER(COALESCE(to_jsonb(s)->>'is_draft', '')) IN ('true', '1', 't', 'sim', 'yes', 'y') THEN true
                WHEN LOWER(COALESCE(to_jsonb(s)->>'is_draft', '')) IN ('false', '0', 'f', 'nao', 'no', 'n') THEN false
                ELSE false
              END = false
            ) AS latest_social_interview_date
          FROM public.social_interviews s
          GROUP BY s.patient_id::text
        ),
        pre_appointment_origin AS (
          SELECT
            pa.converted_to_patient_id::text AS patient_id,
            (
              ARRAY_REMOVE(
                ARRAY_AGG(NULLIF(BTRIM(pa.responsible_name), '') ORDER BY pa.created_at DESC NULLS LAST),
                NULL
              )
            )[1] AS responsible_name,
            (
              ARRAY_REMOVE(
                ARRAY_AGG(NULLIF(BTRIM(pa.phone), '') ORDER BY pa.created_at DESC NULLS LAST),
                NULL
              )
            )[1] AS responsible_phone,
            (
              ARRAY_REMOVE(
                ARRAY_AGG(NULLIF(BTRIM(pa.cpf), '') ORDER BY pa.created_at DESC NULLS LAST),
                NULL
              )
            )[1] AS origin_cpf,
            (
              ARRAY_REMOVE(
                ARRAY_AGG(NULLIF(BTRIM(pa.cid), '') ORDER BY pa.created_at DESC NULLS LAST),
                NULL
              )
            )[1] AS cid,
            (
              ARRAY_REMOVE(
                ARRAY_AGG(NULLIF(BTRIM(pa.service_type), '') ORDER BY pa.created_at DESC NULLS LAST),
                NULL
              )
            )[1] AS service_type,
            (
              ARRAY_REMOVE(
                ARRAY_AGG(NULLIF(BTRIM(pa.notes), '') ORDER BY pa.created_at DESC NULLS LAST),
                NULL
              )
            )[1] AS notes
          FROM public.pre_appointments pa
          WHERE NULLIF(BTRIM(COALESCE(pa.converted_to_patient_id::text, '')), '') IS NOT NULL
          GROUP BY pa.converted_to_patient_id::text
        )
        SELECT
          p.id::text AS id,
          p.name AS nome,
          p.cpf,
          p.phone AS telefone,
          p.mobile AS celular,
          p.email,
          p.date_of_birth AS data_nascimento,
          p.status,
          p.status_jornada,
          origin.responsible_name,
          COALESCE(
            NULLIF(BTRIM(origin.responsible_phone), ''),
            NULLIF(BTRIM(p.phone), ''),
            NULLIF(BTRIM(p.mobile), '')
          ) AS contato_principal,
          origin.cid,
          COALESCE(eval.primary_need, origin.service_type) AS necessidade_principal,
          COALESCE(eval.completed_individual_count, 0) AS completed_evaluation_count,
          COALESCE(eval.completed_individual_count, 0) > 0 AS has_completed_evaluation,
          COALESCE(eval.has_consolidation_ready, false) AS has_consolidation_ready,
          COALESCE(interview.completed_social_interview_count, 0) > 0 AS has_social_interview,
          interview.latest_social_interview_date,
          eval.latest_sent_to_vaga_at AS sent_to_vaga_at,
          (
            COALESCE(eval.completed_individual_count, 0) > 0
            AND COALESCE(eval.has_consolidation_ready, false) = true
          ) AS ready_for_vaga,
          CASE
            WHEN LOWER(COALESCE(p.status_jornada, '')) = 'em_analise_vaga'
              THEN 'em_analise_vaga'
            WHEN COALESCE(eval.completed_individual_count, 0) > 0
              AND COALESCE(eval.has_consolidation_ready, false) = true
              AND eval.latest_sent_to_vaga_at IS NOT NULL
              THEN 'enviado_para_analise'
            WHEN COALESCE(eval.completed_individual_count, 0) > 0
              AND COALESCE(eval.has_consolidation_ready, false) = true
              THEN 'pronto_para_envio'
            WHEN COALESCE(eval.completed_individual_count, 0) > 0
              THEN 'avaliacao_em_andamento'
            ELSE 'aguardando_insumos'
          END AS eligibility_indicator,
          COALESCE(
            NULLIF(BTRIM(origin.notes), ''),
            NULLIF(BTRIM(p.notes), '')
          ) AS observacao_resumida,
          COUNT(*) OVER()::int AS total_count
        FROM public.patients p
        LEFT JOIN evaluation_summary eval
          ON eval.patient_id = p.id::text
        LEFT JOIN interview_summary interview
          ON interview.patient_id = p.id::text
        LEFT JOIN pre_appointment_origin origin
          ON origin.patient_id = p.id::text
        ${whereSql}
        ORDER BY
          (
            COALESCE(eval.completed_individual_count, 0) > 0
            AND COALESCE(eval.has_consolidation_ready, false) = true
          ) DESC,
          eval.latest_sent_to_vaga_at DESC NULLS LAST,
          p.updated_at DESC NULLS LAST,
          p.created_at DESC NULLS LAST
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
      `,
      params
    );

    const total = result.rows[0]?.total_count ? Number(result.rows[0].total_count) : 0;
    const items = result.rows.map((row) => {
      const { total_count, ...payload } = row;
      return payload;
    });

    return res.json({
      success: true,
      total,
      limit,
      offset,
      items,
    });
  } catch (error) {
    console.error('Erro ao listar pacientes elegiveis para vaga:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar pacientes elegiveis para vaga',
    });
  }
});

router.get('/:id', async (req, res) => {
  const patientId = normalizeIdAsText(req.params?.id);
  if (!patientId) {
    return res.status(400).json({
      success: false,
      message: 'id do assistido e obrigatorio',
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id::text AS id,
          name,
          cpf,
          rg,
          date_of_birth,
          email,
          phone,
          mobile,
          address,
          number,
          complement,
          neighborhood,
          city,
          state,
          zip_code,
          profession,
          marital_status,
          education,
          insurance_plan,
          insurance_number,
          notes,
          status,
          status_jornada,
          created_at,
          updated_at
        FROM public.patients
        WHERE id::text = $1
        LIMIT 1
      `,
      [patientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Assistido nao encontrado',
      });
    }

    return res.json({
      success: true,
      paciente: result.rows[0],
    });
  } catch (error) {
    console.error('Erro ao buscar paciente por id:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar paciente',
    });
  }
});

router.post('/', async (req, res) => {
  const userIdInt = resolveLoggedUserIdInt(req);
  if (userIdInt === null) {
    return res.status(400).json({
      success: false,
      message: 'Nao foi possivel identificar o usuario logado (users.id deve ser inteiro positivo ou UUID).',
    });
  }

  const createStatusValidation = validateCreatePatientStatusInputs(req.body);
  if (!createStatusValidation.ok) {
    return res.status(400).json({
      success: false,
      message: createStatusValidation.conflicts[0],
    });
  }

  const payload = buildPatientPayload(req.body);
  payload.status = 'pre_cadastro';
  payload.status_jornada = 'em_fila_espera';

  if (!payload.name) {
    return res.status(400).json({
      success: false,
      message: 'name (ou nome) e obrigatorio',
    });
  }

  const dateWasProvided =
    hasOwn(req.body, 'date_of_birth') || hasOwn(req.body, 'data_nascimento');
  if (dateWasProvided && !payload.date_of_birth) {
    return res.status(400).json({
      success: false,
      message: 'date_of_birth/data_nascimento invalida. Use YYYY-MM-DD',
    });
  }

  if (!VALID_JOURNEY_STATUSES.has(payload.status_jornada)) {
    return res.status(400).json({
      success: false,
      message: 'status_jornada invalido',
    });
  }

  const sourcePreAppointmentIdProvided = hasOwn(req.body, 'source_pre_appointment_id');
  const sourcePreAppointmentId = sourcePreAppointmentIdProvided
    ? normalizeUuid(req.body?.source_pre_appointment_id)
    : null;
  if (sourcePreAppointmentIdProvided && !sourcePreAppointmentId) {
    return res.status(400).json({
      success: false,
      message: 'source_pre_appointment_id invalido. Use UUID.',
    });
  }

  const linkExistingPatientIdProvided = hasOwn(req.body, 'link_existing_patient_id');
  const linkExistingPatientId = linkExistingPatientIdProvided
    ? normalizeIdAsText(req.body?.link_existing_patient_id)
    : null;
  if (linkExistingPatientIdProvided && !linkExistingPatientId) {
    return res.status(400).json({
      success: false,
      message: 'link_existing_patient_id invalido.',
    });
  }

  if (linkExistingPatientId && !sourcePreAppointmentId) {
    return res.status(400).json({
      success: false,
      message: 'link_existing_patient_id so pode ser usado com source_pre_appointment_id.',
    });
  }

  const convertedBy = normalizeIdAsText(req.user?.id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (sourcePreAppointmentId) {
      const sourcePreAppointment = await lockPreAppointmentForConversion(
        client,
        sourcePreAppointmentId
      );

      if (!sourcePreAppointment) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Pre-agendamento de origem nao encontrado.',
        });
      }

      if (isPreAppointmentConverted(sourcePreAppointment)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          code: 'pre_appointment_already_converted',
          source_pre_appointment_id: sourcePreAppointmentId,
          converted_to_patient_id:
            normalizeIdAsText(sourcePreAppointment.converted_to_patient_id) || null,
          message: 'Este pre-agendamento ja foi convertido e nao pode gerar novo cadastro.',
        });
      }
    }

    const duplicateId = await findDuplicatePatient({
      client,
      cpf: payload.cpf,
      name: payload.name,
      dateOfBirth: payload.date_of_birth,
    });

    if (duplicateId) {
      const duplicateIdText = String(duplicateId).trim();
      const duplicateIdComparison = duplicateIdText.toLowerCase();
      const linkExistingComparison = linkExistingPatientId
        ? linkExistingPatientId.toLowerCase()
        : null;

      if (sourcePreAppointmentId) {
        if (!linkExistingPatientId || linkExistingComparison !== duplicateIdComparison) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            existing_patient_id: duplicateIdText,
            source_pre_appointment_id: sourcePreAppointmentId,
            requires_link_confirmation: true,
            message:
              'Assistido ja cadastrado (CPF ou nome + data de nascimento). Confirme a vinculacao para converter o pre-agendamento sem duplicar.',
          });
        }

        const existingPatient = await getPatientById(client, duplicateIdText);
        if (!existingPatient) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            success: false,
            message: 'Cadastro existente nao encontrado para vinculacao.',
          });
        }

        await markPreAppointmentAsConverted({
          client,
          preAppointmentId: sourcePreAppointmentId,
          patientId: duplicateIdText,
          convertedBy,
        });

        await client.query('COMMIT');

        return res.status(200).json({
          success: true,
          paciente: mapPatientResponse(existingPatient),
          linked_existing_patient: true,
          source_pre_appointment_id: sourcePreAppointmentId,
          pre_appointment_conversion: {
            pre_appointment_id: sourcePreAppointmentId,
            converted_to_patient_id: duplicateIdText,
            linked_existing_patient: true,
          },
          message: 'Pre-agendamento convertido com vinculacao ao cadastro ja existente.',
        });
      }

      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        existing_patient_id: duplicateIdText,
        message: 'Assistido ja cadastrado (CPF ou nome + data de nascimento).',
      });
    }

    const insertResult = await client.query(
      `
        INSERT INTO public.patients (
          name,
          cpf,
          rg,
          date_of_birth,
          email,
          phone,
          mobile,
          address,
          number,
          complement,
          neighborhood,
          city,
          state,
          zip_code,
          profession,
          marital_status,
          education,
          insurance_plan,
          insurance_number,
          notes,
          status,
          status_jornada
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        )
        RETURNING
          id::text AS id,
          name AS "nome",
          cpf,
          phone AS "telefone",
          email,
          date_of_birth AS "dataNascimento",
          status,
          status_jornada
      `,
      [
        payload.name,
        payload.cpf,
        payload.rg,
        payload.date_of_birth,
        payload.email,
        payload.phone,
        payload.mobile,
        payload.address,
        payload.number,
        payload.complement,
        payload.neighborhood,
        payload.city,
        payload.state,
        payload.zip_code,
        payload.profession,
        payload.marital_status,
        payload.education,
        payload.insurance_plan,
        payload.insurance_number,
        payload.notes,
        payload.status,
        payload.status_jornada,
      ]
    );

    await createInitialStatusHistory({
      patientId: insertResult.rows[0].id,
      userIdInt,
      motivoNullable: 'Cadastro criado',
      client,
    });

    if (sourcePreAppointmentId) {
      await markPreAppointmentAsConverted({
        client,
        preAppointmentId: sourcePreAppointmentId,
        patientId: insertResult.rows[0].id,
        convertedBy,
      });
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      paciente: mapPatientResponse(insertResult.rows[0]),
      ...(sourcePreAppointmentId
        ? {
            source_pre_appointment_id: sourcePreAppointmentId,
            pre_appointment_conversion: {
              pre_appointment_id: sourcePreAppointmentId,
              converted_to_patient_id: insertResult.rows[0].id,
              linked_existing_patient: false,
            },
          }
        : {}),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar paciente:', error);

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

    if (error?.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Conflito de duplicidade ao criar assistido.',
      });
    }

    return res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao criar paciente',
    });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const patientId = (req.params?.id || '').toString().trim();
  if (!patientId) {
    return res.status(400).json({ success: false, message: 'id do assistido e obrigatorio' });
  }

  const userIdInt = resolveLoggedUserIdInt(req);
  if (userIdInt === null) {
    return res.status(400).json({
      success: false,
      message: 'Nao foi possivel identificar o usuario logado (users.id deve ser inteiro positivo ou UUID).',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      `
        SELECT *
        FROM public.patients
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [patientId]
    );

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Assistido nao encontrado' });
    }

    const existing = existingResult.rows[0];
    const payload = buildPatientPayload(req.body, existing);

    if (!payload.name) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'name (ou nome) e obrigatorio',
      });
    }

    const dateWasProvided =
      hasOwn(req.body, 'date_of_birth') || hasOwn(req.body, 'data_nascimento');
    if (dateWasProvided && !payload.date_of_birth) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'date_of_birth/data_nascimento invalida. Use YYYY-MM-DD',
      });
    }

    const hasRequestedJourneyStatus = hasOwn(req.body, 'status_jornada');
    const requestedJourneyStatus = hasRequestedJourneyStatus
      ? normalizeJourneyStatus(req.body.status_jornada)
      : null;

    if (hasRequestedJourneyStatus && !VALID_JOURNEY_STATUSES.has(requestedJourneyStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'status_jornada invalido',
      });
    }

    const duplicateId = await findDuplicatePatient({
      client,
      cpf: payload.cpf,
      name: payload.name,
      dateOfBirth: payload.date_of_birth,
      excludePatientId: patientId,
    });

    if (duplicateId) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        existing_patient_id: duplicateId,
        message: 'Assistido duplicado (CPF ou nome + data de nascimento).',
      });
    }

    await client.query(
      `
        UPDATE public.patients
        SET name = $1,
            cpf = $2,
            rg = $3,
            date_of_birth = $4,
            email = $5,
            phone = $6,
            mobile = $7,
            address = $8,
            number = $9,
            complement = $10,
            neighborhood = $11,
            city = $12,
            state = $13,
            zip_code = $14,
            profession = $15,
            marital_status = $16,
            education = $17,
            insurance_plan = $18,
            insurance_number = $19,
            notes = $20,
            status = $21,
            updated_at = NOW()
        WHERE id = $22
      `,
      [
        payload.name,
        payload.cpf,
        payload.rg,
        payload.date_of_birth,
        payload.email,
        payload.phone,
        payload.mobile,
        payload.address,
        payload.number,
        payload.complement,
        payload.neighborhood,
        payload.city,
        payload.state,
        payload.zip_code,
        payload.profession,
        payload.marital_status,
        payload.education,
        payload.insurance_plan,
        payload.insurance_number,
        payload.notes,
        payload.status,
        patientId,
      ]
    );

    if (
      hasRequestedJourneyStatus &&
      normalizeJourneyStatus(existing.status_jornada) !== requestedJourneyStatus
    ) {
      await transitionPatientStatus({
        patientId,
        newStatus: requestedJourneyStatus,
        userIdInt,
        motivoNullable: 'Status atualizado no cadastro',
        client,
      });
    }

    const updatedResult = await client.query(
      `
        SELECT
          id::text AS id,
          name AS "nome",
          cpf,
          phone AS "telefone",
          email,
          date_of_birth AS "dataNascimento",
          status,
          status_jornada
        FROM public.patients
        WHERE id = $1
        LIMIT 1
      `,
      [patientId]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      paciente: mapPatientResponse(updatedResult.rows[0]),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar paciente:', error);

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
      message: error?.message || 'Erro ao atualizar paciente',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
