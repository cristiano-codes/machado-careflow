const express = require('express');
const router = express.Router();
const pool = require('../config/pg');
const authMiddleware = require('../middleware/auth');
const { authorizeAny, normalizeRole, normalizePermissionEntries } = require('../middleware/authorize');

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRE_APPOINTMENT_OPERATIONAL_STATUS = 'pending';
const PRE_APPOINTMENT_STATUS_NOTE =
  'Status da fila de espera e operacional; nao altera status_jornada do cadastro principal.';
const authorizeWaitingListLookup = authorizeAny([
  ['pre_cadastro', 'view'],
  ['fila_espera', 'view'],
  ['pre_agendamento', 'view'],
]);
const authorizeReceptionLookup = authorizeAny([
  ['fila_espera', 'view'],
  ['pre_agendamento', 'view'],
]);
const authorizeReceptionOperate = authorizeAny([
  ['fila_espera', 'view'],
  ['fila_espera', 'create'],
  ['fila_espera', 'edit'],
  ['pre_agendamento', 'view'],
  ['pre_agendamento', 'create'],
  ['pre_agendamento', 'edit'],
]);
const PRE_APPOINTMENT_STATUS_NORMALIZATION_SQL = `
  CASE
    WHEN pa.converted_at IS NOT NULL
      OR NULLIF(BTRIM(COALESCE(pa.converted_to_patient_id::text, '')), '') IS NOT NULL
      OR LOWER(COALESCE(pa.status, '')) = 'converted'
      THEN 'converted'
    WHEN LOWER(COALESCE(pa.status, '')) IN ('not_eligible', 'sem_perfil')
      THEN 'not_eligible'
    WHEN LOWER(COALESCE(pa.status, '')) IN ('archived', 'cancelled', 'cancelado', 'cancelada')
      THEN 'archived'
    WHEN LOWER(COALESCE(pa.status, '')) IN ('in_review', 'em_analise', 'em_analise_social')
      THEN 'in_review'
    WHEN LOWER(COALESCE(pa.status, '')) IN ('selected_for_pre_cadastro', 'selecionado_pre_cadastro')
      THEN 'selected_for_pre_cadastro'
    ELSE 'pending'
  END
`;
const PRE_APPOINTMENT_STATUS_ALIASES = new Map([
  ['pending', 'pending'],
  ['pendente', 'pending'],
  ['em_fila_espera', 'pending'],
  ['fila_espera', 'pending'],
  ['in_review', 'in_review'],
  ['em_analise', 'in_review'],
  ['em_analise_social', 'in_review'],
  ['selected_for_pre_cadastro', 'selected_for_pre_cadastro'],
  ['selecionado_pre_cadastro', 'selected_for_pre_cadastro'],
  ['converted', 'converted'],
  ['not_eligible', 'not_eligible'],
  ['sem_perfil', 'not_eligible'],
  ['archived', 'archived'],
  ['cancelled', 'archived'],
  ['cancelado', 'archived'],
  ['cancelada', 'archived'],
]);
const PRE_APPOINTMENT_ALLOWED_TRIAGE_STATUSES = new Set([
  'pending',
  'in_review',
  'selected_for_pre_cadastro',
  'not_eligible',
  'archived',
]);

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeOptionalText(value) {
  const text = normalizeText(value);
  return text.length > 0 ? text : null;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'sim', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'nao', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function normalizeCpf(value) {
  const digits = normalizeText(value).replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

function normalizeLimit(value, fallback = 20) {
  const raw = Number.parseInt(normalizeText(value), 10);
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  if (raw > 100) return 100;
  return raw;
}

function normalizeOffset(value, fallback = 0) {
  const raw = Number.parseInt(normalizeText(value), 10);
  if (!Number.isFinite(raw) || raw < 0) return fallback;
  if (raw > 5000) return 5000;
  return raw;
}

function normalizeServices(rawServices) {
  if (!Array.isArray(rawServices)) return [];
  const seen = new Set();
  const normalized = [];

  for (const item of rawServices) {
    const value = normalizeText(item).toLowerCase();
    if (!value || seen.has(value)) continue;
    if (!UUID_REGEX.test(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function normalizePhoneDigits(value) {
  return normalizeText(value).replace(/\D/g, '');
}

function normalizeNameForMatching(value) {
  const text = normalizeText(value);
  if (!text) return '';

  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeName(value) {
  const normalized = normalizeNameForMatching(value);
  if (!normalized) return [];
  return normalized.split(' ').filter((token) => token.length > 1);
}

function hasStrongPhoneSimilarity(queryPhoneDigits, candidatePhoneDigits) {
  if (!queryPhoneDigits || !candidatePhoneDigits) return false;
  if (queryPhoneDigits === candidatePhoneDigits) return true;

  const queryTail =
    queryPhoneDigits.length > 8 ? queryPhoneDigits.slice(-8) : queryPhoneDigits;
  const candidateTail =
    candidatePhoneDigits.length > 8 ? candidatePhoneDigits.slice(-8) : candidatePhoneDigits;

  return queryTail.length >= 8 && candidateTail.length >= 8 && queryTail === candidateTail;
}

function hasStrongNameSimilarity(queryName, candidateName) {
  if (!queryName || !candidateName) return false;
  if (queryName === candidateName) return true;

  if (
    (queryName.includes(candidateName) || candidateName.includes(queryName)) &&
    Math.min(queryName.length, candidateName.length) >= 4
  ) {
    return true;
  }

  const queryTokens = tokenizeName(queryName);
  const candidateTokens = tokenizeName(candidateName);
  if (queryTokens.length < 2 || candidateTokens.length < 2) {
    return false;
  }

  const candidateTokenSet = new Set(candidateTokens);
  const overlapCount = queryTokens.filter((token) => candidateTokenSet.has(token)).length;
  const minTokenCount = Math.min(queryTokens.length, candidateTokens.length);

  return overlapCount >= 2 && overlapCount / minTokenCount >= 0.6;
}

function sanitizeRecentNote(...values) {
  for (const value of values) {
    const normalized = normalizeOptionalText(value);
    if (!normalized) continue;
    const oneLine = normalized.replace(/\s+/g, ' ').trim();
    if (!oneLine) continue;
    return oneLine.length > 260 ? `${oneLine.slice(0, 257)}...` : oneLine;
  }
  return null;
}

function mapReceptionCandidate(row) {
  const patientId = normalizeOptionalText(row?.patient_id);
  if (!patientId) return null;

  const childName = normalizeOptionalText(row?.child_name) || '-';
  const dateOfBirth = normalizeDate(row?.date_of_birth);
  const patientPhone = normalizeOptionalText(row?.patient_phone);
  const originPhone = normalizeOptionalText(row?.origin_phone);
  const resolvedPhone = patientPhone || originPhone || null;

  return {
    patient_id: patientId,
    child_name: childName,
    responsible_name: normalizeOptionalText(row?.responsible_name),
    phone: resolvedPhone,
    date_of_birth: dateOfBirth,
    status_jornada: normalizeOptionalText(row?.status_jornada) || 'em_fila_espera',
    entry_date: row?.entry_date || row?.patient_created_at || null,
    recent_note: sanitizeRecentNote(row?.patient_notes, row?.origin_notes),
    patient_phone_digits: normalizePhoneDigits(resolvedPhone),
    patient_name_normalized: normalizeNameForMatching(childName),
    patient_cpf_digits: normalizeCpf(row?.patient_cpf),
  };
}

function removeInternalReceptionFields(candidate) {
  if (!candidate) return null;
  const {
    patient_phone_digits,
    patient_name_normalized,
    patient_cpf_digits,
    ...publicFields
  } = candidate;
  return publicFields;
}

function dedupeReceptionCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const byPatientId = new Map();
  for (const candidate of candidates) {
    const patientId = normalizeOptionalText(candidate?.patient_id);
    if (!patientId || byPatientId.has(patientId)) continue;
    byPatientId.set(patientId, candidate);
  }

  return Array.from(byPatientId.values());
}

async function queryReceptionCandidatesByCpf(client, cpfDigits) {
  if (!cpfDigits) return [];

  const result = await client.query(
    `
      SELECT
        p.id::text AS patient_id,
        p.name AS child_name,
        p.cpf AS patient_cpf,
        p.phone AS patient_phone,
        p.date_of_birth,
        p.status_jornada,
        p.notes AS patient_notes,
        p.created_at AS patient_created_at,
        origin.responsible_name,
        origin.phone AS origin_phone,
        origin.notes AS origin_notes,
        origin.created_at AS origin_created_at,
        COALESCE(origin.created_at, p.created_at) AS entry_date
      FROM public.patients p
      LEFT JOIN LATERAL (
        SELECT
          pa.responsible_name,
          pa.phone,
          pa.notes,
          pa.created_at
        FROM public.fila_de_espera pa
        WHERE pa.converted_to_patient_id::text = p.id::text
        ORDER BY pa.created_at DESC NULLS LAST
        LIMIT 1
      ) origin ON TRUE
      WHERE regexp_replace(COALESCE(p.cpf, ''), '\\D', '', 'g') = $1
      ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
      LIMIT 10
    `,
    [cpfDigits]
  );

  return result.rows
    .map(mapReceptionCandidate)
    .filter((candidate) => candidate !== null);
}

async function queryReceptionCandidatesByDateOfBirth(client, dateOfBirth, limit = 60) {
  if (!dateOfBirth) return [];

  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 120)) : 60;
  const result = await client.query(
    `
      SELECT
        p.id::text AS patient_id,
        p.name AS child_name,
        p.cpf AS patient_cpf,
        p.phone AS patient_phone,
        p.date_of_birth,
        p.status_jornada,
        p.notes AS patient_notes,
        p.created_at AS patient_created_at,
        origin.responsible_name,
        origin.phone AS origin_phone,
        origin.notes AS origin_notes,
        origin.created_at AS origin_created_at,
        COALESCE(origin.created_at, p.created_at) AS entry_date
      FROM public.patients p
      LEFT JOIN LATERAL (
        SELECT
          pa.responsible_name,
          pa.phone,
          pa.notes,
          pa.created_at
        FROM public.fila_de_espera pa
        WHERE pa.converted_to_patient_id::text = p.id::text
        ORDER BY pa.created_at DESC NULLS LAST
        LIMIT 1
      ) origin ON TRUE
      WHERE p.date_of_birth = $1
      ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
      LIMIT $2
    `,
    [dateOfBirth, safeLimit]
  );

  return result.rows
    .map(mapReceptionCandidate)
    .filter((candidate) => candidate !== null);
}

function classifyReceptionCandidate({
  candidate,
  cpfDigits,
  queryNameNormalized,
  phoneDigits,
  dateOfBirth,
}) {
  const matchReasons = [];
  let exact = false;

  if (cpfDigits && candidate.patient_cpf_digits && cpfDigits === candidate.patient_cpf_digits) {
    matchReasons.push('cpf');
    exact = true;
  }

  const candidateDob = normalizeDate(candidate.date_of_birth);
  const sameDob = Boolean(dateOfBirth && candidateDob && dateOfBirth === candidateDob);

  if (sameDob && queryNameNormalized && candidate.patient_name_normalized) {
    if (queryNameNormalized === candidate.patient_name_normalized) {
      matchReasons.push('nome_data_nascimento');
      exact = true;
    }
  }

  if (sameDob && phoneDigits && candidate.patient_phone_digits) {
    if (phoneDigits === candidate.patient_phone_digits) {
      matchReasons.push('telefone_data_nascimento');
      exact = true;
    }
  }

  let similar = false;
  if (!exact && sameDob) {
    const phoneSimilar = hasStrongPhoneSimilarity(phoneDigits, candidate.patient_phone_digits);
    const nameSimilar = hasStrongNameSimilarity(
      queryNameNormalized,
      candidate.patient_name_normalized
    );

    if (phoneSimilar) {
      matchReasons.push('telefone_semelhante_data_nascimento');
      similar = true;
    }

    if (nameSimilar) {
      matchReasons.push('nome_semelhante_data_nascimento');
      similar = true;
    }
  }

  return {
    exact,
    similar,
    match_reasons: matchReasons,
  };
}

function resolveReceptionScenario({ exactMatches, similarMatches }) {
  const exactCount = Array.isArray(exactMatches) ? exactMatches.length : 0;
  const similarCount = Array.isArray(similarMatches) ? similarMatches.length : 0;

  if (exactCount === 1 && similarCount === 0) {
    return 'found';
  }

  if (exactCount > 1 || similarCount > 0) {
    return 'possible_duplicate';
  }

  return 'not_found';
}

function appendTraceNotes(baseNote, lines) {
  const normalizedBase = normalizeOptionalText(baseNote);
  const normalizedLines = Array.isArray(lines)
    ? lines.map((line) => normalizeOptionalText(line)).filter((line) => Boolean(line))
    : [];

  if (normalizedLines.length === 0) {
    return normalizedBase;
  }

  if (!normalizedBase) {
    return normalizedLines.join('\n');
  }

  return `${normalizedBase}\n${normalizedLines.join('\n')}`;
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const normalized = [];

  for (const raw of values) {
    const value = normalizeOptionalText(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function resolveActorContext(req) {
  const user = req?.user || {};
  return {
    actor_id: normalizeOptionalText(user?.id),
    actor_name:
      normalizeOptionalText(user?.name) ||
      normalizeOptionalText(user?.username) ||
      normalizeOptionalText(user?.email),
    actor_role: normalizeOptionalText(user?.role),
  };
}

function hasAnyReceptionScope(req, targets) {
  const normalizedRole = normalizeRole(req?.user?.role);
  if (normalizedRole === 'ADM') {
    return true;
  }

  const scopes = normalizePermissionEntries(req?.user?.permissions);
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return false;
  }

  for (const target of targets || []) {
    const moduleNames = Array.isArray(target?.modules) ? target.modules : [];
    const actions = Array.isArray(target?.actions) ? target.actions : [];

    if (moduleNames.length === 0 || actions.length === 0) {
      continue;
    }

    const allowed = scopes.some((scope) => {
      const matchesModule = moduleNames.includes(scope.module) || scope.module === '*';
      const matchesAction = actions.includes(scope.action) || scope.action === '*';
      return matchesModule && matchesAction;
    });

    if (allowed) {
      return true;
    }
  }

  return false;
}

function canAuthorizeDuplicateOverride(req) {
  return hasAnyReceptionScope(req, [
    { modules: ['fila_espera', 'pre_agendamento'], actions: ['edit', 'delete', 'access'] },
  ]);
}

function canEditSensitiveReceptionData(req) {
  return hasAnyReceptionScope(req, [
    { modules: ['fila_espera', 'pre_agendamento'], actions: ['edit', 'delete', 'access'] },
  ]);
}

function buildReceptionAuditEntry({ req, event, details = {} }) {
  const actor = resolveActorContext(req);
  const envelope = {
    ns: 'recepcao.fila_espera',
    event: normalizeOptionalText(event) || 'evento_nao_informado',
    at: new Date().toISOString(),
    actor,
    details: details && typeof details === 'object' ? details : {},
  };
  return `[AUDIT_RECEPCAO] ${JSON.stringify(envelope)}`;
}

async function detectReceptionDuplicateRisk({
  client,
  cpf,
  name,
  phone,
  dateOfBirth,
  candidateLimit = 60,
}) {
  const cpfDigits = normalizeCpf(cpf);
  const queryNameNormalized = normalizeNameForMatching(name);
  const phoneDigits = normalizePhoneDigits(phone);
  const normalizedDateOfBirth = normalizeDate(dateOfBirth);

  const exactMatches = [];
  const similarMatches = [];
  const orderedCandidates = [];

  const cpfCandidates = await queryReceptionCandidatesByCpf(client, cpfDigits);
  const dobCandidates = await queryReceptionCandidatesByDateOfBirth(
    client,
    normalizedDateOfBirth,
    candidateLimit
  );

  const allCandidates = dedupeReceptionCandidates([...cpfCandidates, ...dobCandidates]);
  for (const candidate of allCandidates) {
    const match = classifyReceptionCandidate({
      candidate,
      cpfDigits,
      queryNameNormalized,
      phoneDigits,
      dateOfBirth: normalizedDateOfBirth,
    });

    if (!match.exact && !match.similar) {
      continue;
    }

    const payload = {
      ...removeInternalReceptionFields(candidate),
      match_reasons: match.match_reasons,
    };
    orderedCandidates.push(payload);

    if (match.exact) {
      exactMatches.push(payload);
      continue;
    }

    similarMatches.push(payload);
  }

  return {
    scenario: resolveReceptionScenario({ exactMatches, similarMatches }),
    exact_matches: exactMatches,
    similar_matches: similarMatches,
    candidates: orderedCandidates,
    query: {
      cpf: cpfDigits || null,
      name: queryNameNormalized || null,
      phone: phoneDigits || null,
      date_of_birth: normalizedDateOfBirth,
    },
  };
}

function normalizeQueueSort(value) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return 'oldest';

  const sortKey = normalized.toLowerCase();
  if (sortKey === 'oldest') return 'oldest';
  if (sortKey === 'newest') return 'newest';
  if (sortKey === 'priority') return 'priority';
  if (sortKey === 'name') return 'name';
  return 'oldest';
}

function normalizeQueuePriority(value) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  const priority = normalized.toLowerCase();

  if (['prioritario', 'priority', 'alta', 'high', 'urgente', 'urgent'].includes(priority)) {
    return 'prioritario';
  }
  if (['normal', 'baixa', 'low'].includes(priority)) {
    return 'normal';
  }
  return null;
}

function normalizePreAppointmentOperationalStatus(value, { allowNull = false } = {}) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return allowNull ? null : 'pending';
  return PRE_APPOINTMENT_STATUS_ALIASES.get(normalized.toLowerCase()) || (allowNull ? null : null);
}

function resolveOperationalStatusFromRow(row) {
  const convertedToPatientId = normalizeOptionalText(row?.converted_to_patient_id);
  if (convertedToPatientId) return 'converted';
  if (row?.converted_at) return 'converted';

  if (typeof row?.status_normalized === 'string' && row.status_normalized.trim().length > 0) {
    return row.status_normalized.trim();
  }

  return normalizePreAppointmentOperationalStatus(row?.status) || 'pending';
}

function getQueueOrderBySql(sortBy) {
  if (sortBy === 'newest') {
    return `
      pa.created_at DESC NULLS LAST,
      pa.name ASC NULLS LAST
    `;
  }
  if (sortBy === 'priority') {
    return `
      CASE
        WHEN LOWER(COALESCE(pa.urgency, 'normal')) IN ('prioritario', 'high', 'urgente')
          THEN 0
        ELSE 1
      END ASC,
      pa.created_at ASC NULLS LAST,
      pa.name ASC NULLS LAST
    `;
  }
  if (sortBy === 'name') {
    return `
      pa.name ASC NULLS LAST,
      pa.created_at ASC NULLS LAST
    `;
  }

  return `
    pa.created_at ASC NULLS LAST,
    pa.name ASC NULLS LAST
  `;
}

function mapPreAppointmentRow(row) {
  const convertedToPatientId =
    row?.converted_to_patient_id === undefined || row?.converted_to_patient_id === null
      ? null
      : String(row.converted_to_patient_id);
  const statusOperational = resolveOperationalStatusFromRow({
    ...row,
    converted_to_patient_id: convertedToPatientId,
  });

  return {
    ...row,
    converted_to_patient_id: convertedToPatientId,
    status_operacional: statusOperational,
    status_normalized: statusOperational,
    status_raw: row?.status || null,
    status_contexto: PRE_APPOINTMENT_STATUS_NOTE,
  };
}

// POST - Criar registro na fila de espera institucional
router.post('/', authMiddleware, authorizeReceptionOperate, async (req, res) => {
  const name = normalizeText(req.body?.name);
  const phone = normalizeText(req.body?.phone);
  const email = normalizeText(req.body?.email);
  const cpf = normalizeCpf(req.body?.cpf);
  const dateOfBirth = normalizeDate(req.body?.date_of_birth);
  const services = normalizeServices(req.body?.services);
  const consentLgpd = normalizeBoolean(req.body?.consent_lgpd, false);
  const duplicateJustification = normalizeOptionalText(req.body?.duplicate_justification);
  const duplicateCandidateIds = normalizeStringArray(req.body?.duplicate_candidate_ids);

  if (!name || !phone || !email) {
    return res.status(400).json({
      success: false,
      message: 'name, phone e email sao obrigatorios.',
    });
  }

  if (services.length < 1) {
    return res.status(400).json({
      success: false,
      message: 'Selecione pelo menos 1 servico.',
    });
  }

  if (consentLgpd !== true) {
    return res.status(400).json({
      success: false,
      message: 'consent_lgpd deve ser true.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const duplicateRisk = await detectReceptionDuplicateRisk({
      client,
      cpf,
      name,
      phone,
      dateOfBirth,
      candidateLimit: 80,
    });

    if (duplicateRisk.exact_matches.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        code: 'duplicate_patient_detected',
        existing_patient_id: duplicateRisk.exact_matches[0]?.patient_id || null,
        scenario: duplicateRisk.scenario,
        exact_matches: duplicateRisk.exact_matches,
        similar_matches: duplicateRisk.similar_matches,
        message:
          'Cadastro principal ja existente para os dados informados. Abra o cadastro existente em vez de criar um novo.',
      });
    }

    if (duplicateRisk.similar_matches.length > 0 && !duplicateJustification) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        code: 'possible_duplicate_detected',
        requires_justification: true,
        scenario: duplicateRisk.scenario,
        exact_matches: duplicateRisk.exact_matches,
        similar_matches: duplicateRisk.similar_matches,
        message:
          'Possivel duplicidade detectada. Informe uma justificativa explicita para criar novo cadastro.',
      });
    }

    if (duplicateRisk.similar_matches.length > 0 && duplicateJustification) {
      if (!canAuthorizeDuplicateOverride(req)) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          code: 'duplicate_override_forbidden',
          scenario: duplicateRisk.scenario,
          exact_matches: duplicateRisk.exact_matches,
          similar_matches: duplicateRisk.similar_matches,
          requires_override_permission: true,
          message:
            'Seu perfil nao possui permissao para autorizar excecao de duplicidade. Solicite um usuario autorizado.',
        });
      }
    }

    const activeServicesResult = await client.query(
      `
        SELECT id::text AS id, name
        FROM services
        WHERE active = true
          AND id = ANY($1::uuid[])
      `,
      [services]
    );

    const activeServiceIds = new Set(
      activeServicesResult.rows.map((row) => String(row.id).toLowerCase())
    );

    if (activeServiceIds.size !== services.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Ha servicos invalidos ou inativos na solicitacao.',
      });
    }

    const legacyServiceType = activeServicesResult.rows[0]?.name || 'servico_institucional';
    const traceLines = [];
    const createAuditLine = buildReceptionAuditEntry({
      req,
      event: 'create_waiting_list',
      details: {
        child_name: name,
        date_of_birth: dateOfBirth,
        service_count: services.length,
      },
    });
    traceLines.push(createAuditLine);

    if (duplicateRisk.similar_matches.length > 0 && duplicateJustification) {
      traceLines.push(
        buildReceptionAuditEntry({
          req,
          event: 'duplicate_override_authorized',
          details: {
            justification: duplicateJustification,
            candidate_ids: duplicateCandidateIds.slice(0, 20),
            similar_match_count: duplicateRisk.similar_matches.length,
          },
        })
      );
    }

    if (duplicateCandidateIds.length > 0) {
      traceLines.push(
        buildReceptionAuditEntry({
          req,
          event: 'duplicate_candidates_reviewed',
          details: {
            candidate_ids: duplicateCandidateIds.slice(0, 20),
          },
        })
      );
    }

    const notesForInsert = appendTraceNotes(normalizeOptionalText(req.body?.notes), traceLines);

    const insertResult = await client.query(
      `
        INSERT INTO fila_de_espera (
          name,
          cpf,
          phone,
          email,
          date_of_birth,
          sex,
          has_report,
          cid,
          urgency,
          services,
          responsible_name,
          whatsapp,
          how_heard,
          how_heard_other,
          referred_by,
          referred_by_other,
          cadunico,
          consent_whatsapp,
          consent_lgpd,
          source,
          status,
          notes,
          service_type
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12,
          $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        )
        RETURNING id::text AS id
      `,
      [
        name,
        cpf,
        phone,
        email,
        dateOfBirth,
        normalizeOptionalText(req.body?.sex),
        normalizeBoolean(req.body?.has_report, false),
        normalizeOptionalText(req.body?.cid),
        normalizeOptionalText(req.body?.urgency) || 'normal',
        JSON.stringify(services),
        normalizeOptionalText(req.body?.responsible_name),
        normalizeBoolean(req.body?.whatsapp, false),
        normalizeOptionalText(req.body?.how_heard),
        normalizeOptionalText(req.body?.how_heard_other),
        normalizeOptionalText(req.body?.referred_by),
        normalizeOptionalText(req.body?.referred_by_other),
        normalizeBoolean(req.body?.cadunico, false),
        normalizeBoolean(req.body?.consent_whatsapp, false),
        consentLgpd,
        'pre_agendamento_online',
        PRE_APPOINTMENT_OPERATIONAL_STATUS,
        notesForInsert,
        legacyServiceType,
      ]
    );

    await client.query('COMMIT');
    const filaEsperaId = insertResult.rows[0]?.id || null;

    return res.json({
      success: true,
      fila_espera_id: filaEsperaId,
      pre_appointment_id: filaEsperaId,
      status_operacional: PRE_APPOINTMENT_OPERATIONAL_STATUS,
      status_contexto: PRE_APPOINTMENT_STATUS_NOTE,
      duplicate_review: {
        scenario: duplicateRisk.scenario,
        exact_matches: duplicateRisk.exact_matches,
        similar_matches: duplicateRisk.similar_matches,
        justification_recorded: Boolean(duplicateJustification),
        override_authorized: Boolean(
          duplicateRisk.similar_matches.length > 0 && duplicateJustification
        ),
        actor: resolveActorContext(req),
      },
      message: 'Solicitacao enviada com sucesso.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar registro da fila de espera:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  } finally {
    client.release();
  }
});

// GET - Buscar registros da fila de espera
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM fila_de_espera
      ORDER BY created_at DESC
    `);
    const items = result.rows.map(mapPreAppointmentRow);
    res.json({
      success: true,
      filaEspera: items,
      preAppointments: items,
    });
  } catch (error) {
    console.error('Erro ao buscar registros da fila de espera:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

// GET - Fila operacional de triagem da fila de espera
router.get('/triage-queue', authMiddleware, authorizeWaitingListLookup, async (req, res) => {
  const q = normalizeOptionalText(req.query?.q);
  const childName = normalizeOptionalText(req.query?.child_name);
  const responsibleName = normalizeOptionalText(req.query?.responsible_name);
  const phoneDigits = normalizePhoneDigits(req.query?.phone);
  const cpfDigits = normalizeCpf(req.query?.cpf);
  const date = normalizeDate(req.query?.date);
  const serviceType = normalizeOptionalText(req.query?.service_type);
  const cid = normalizeOptionalText(req.query?.cid);
  const referredBy = normalizeOptionalText(req.query?.referred_by);
  const statusRaw = normalizeOptionalText(req.query?.status);
  const status = normalizePreAppointmentOperationalStatus(statusRaw, { allowNull: true });
  const priorityRaw = normalizeOptionalText(req.query?.priority);
  const priority = normalizeQueuePriority(priorityRaw);
  const sort = normalizeQueueSort(req.query?.sort);
  const limit = normalizeLimit(req.query?.limit, 30);
  const offset = normalizeOffset(req.query?.offset, 0);

  if (statusRaw && !status) {
    return res.status(400).json({
      success: false,
      message: 'status invalido para filtro da fila de triagem.',
    });
  }

  if (priorityRaw && !priority) {
    return res.status(400).json({
      success: false,
      message: 'priority invalido para filtro da fila de triagem.',
    });
  }

  const params = [];
  const whereClauses = [];

  if (q) {
    params.push(`%${q}%`);
    const qParam = `$${params.length}`;
    whereClauses.push(
      `(
        pa.name ILIKE ${qParam}
        OR COALESCE(pa.responsible_name, '') ILIKE ${qParam}
        OR COALESCE(pa.phone, '') ILIKE ${qParam}
        OR COALESCE(pa.email, '') ILIKE ${qParam}
        OR COALESCE(pa.cpf, '') ILIKE ${qParam}
        OR COALESCE(pa.service_type, '') ILIKE ${qParam}
        OR COALESCE(pa.cid, '') ILIKE ${qParam}
        OR COALESCE(pa.referred_by, '') ILIKE ${qParam}
        OR COALESCE(pa.how_heard, '') ILIKE ${qParam}
        OR COALESCE(pa.notes, '') ILIKE ${qParam}
      )`
    );
  }

  if (childName) {
    params.push(`%${childName}%`);
    whereClauses.push(`pa.name ILIKE $${params.length}`);
  }

  if (responsibleName) {
    params.push(`%${responsibleName}%`);
    whereClauses.push(`COALESCE(pa.responsible_name, '') ILIKE $${params.length}`);
  }

  if (phoneDigits) {
    params.push(`%${phoneDigits}%`);
    whereClauses.push(
      `regexp_replace(COALESCE(pa.phone, ''), '\\D', '', 'g') LIKE $${params.length}`
    );
  }

  if (cpfDigits) {
    params.push(`%${cpfDigits}%`);
    whereClauses.push(
      `regexp_replace(COALESCE(pa.cpf, ''), '\\D', '', 'g') LIKE $${params.length}`
    );
  }

  if (date) {
    params.push(date);
    const dateParam = `$${params.length}`;
    whereClauses.push(
      `(
        pa.date_of_birth = ${dateParam}
        OR pa.preferred_date = ${dateParam}
        OR DATE(pa.created_at) = ${dateParam}
      )`
    );
  }

  if (serviceType) {
    params.push(`%${serviceType}%`);
    const serviceTypeParam = `$${params.length}`;
    whereClauses.push(
      `(
        COALESCE(pa.service_type, '') ILIKE ${serviceTypeParam}
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(COALESCE(pa.services, '[]'::jsonb)) = 'array'
                THEN COALESCE(pa.services, '[]'::jsonb)
              ELSE '[]'::jsonb
            END
          ) sid(service_id)
          JOIN public.services svc ON svc.id::text = sid.service_id
          WHERE svc.name ILIKE ${serviceTypeParam}
        )
      )`
    );
  }

  if (cid) {
    params.push(`%${cid}%`);
    whereClauses.push(`COALESCE(pa.cid, '') ILIKE $${params.length}`);
  }

  if (referredBy) {
    params.push(`%${referredBy}%`);
    const referredByParam = `$${params.length}`;
    whereClauses.push(
      `(
        COALESCE(pa.referred_by, '') ILIKE ${referredByParam}
        OR COALESCE(pa.how_heard, '') ILIKE ${referredByParam}
      )`
    );
  }

  if (status) {
    params.push(status);
    whereClauses.push(`${PRE_APPOINTMENT_STATUS_NORMALIZATION_SQL} = $${params.length}`);
  }

  if (priority) {
    params.push(priority);
    whereClauses.push(`LOWER(COALESCE(pa.urgency, 'normal')) = $${params.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join('\n        AND ')}` : '';
  const orderBySql = getQueueOrderBySql(sort);

  try {
    const summaryResult = await pool.query(
      `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE ${PRE_APPOINTMENT_STATUS_NORMALIZATION_SQL} = 'pending')::int AS pending_count,
          COUNT(*) FILTER (WHERE ${PRE_APPOINTMENT_STATUS_NORMALIZATION_SQL} = 'in_review')::int AS in_review_count,
          COUNT(*) FILTER (WHERE ${PRE_APPOINTMENT_STATUS_NORMALIZATION_SQL} = 'converted')::int AS converted_count,
          COUNT(*) FILTER (WHERE ${PRE_APPOINTMENT_STATUS_NORMALIZATION_SQL} = 'not_eligible')::int AS not_eligible_count
        FROM public.fila_de_espera pa
        ${whereSql}
      `,
      params
    );

    const listParams = [...params];
    listParams.push(limit);
    const limitParam = `$${listParams.length}`;
    listParams.push(offset);
    const offsetParam = `$${listParams.length}`;

    const listResult = await pool.query(
      `
        SELECT
          pa.id::text AS id,
          pa.name,
          pa.cpf,
          pa.phone,
          pa.email,
          pa.date_of_birth,
          pa.responsible_name,
          pa.referred_by,
          pa.how_heard,
          pa.cid,
          pa.urgency,
          pa.service_type,
          (
            SELECT string_agg(DISTINCT svc.name, ', ' ORDER BY svc.name)
            FROM jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(COALESCE(pa.services, '[]'::jsonb)) = 'array'
                  THEN COALESCE(pa.services, '[]'::jsonb)
                ELSE '[]'::jsonb
              END
            ) sid(service_id)
            JOIN public.services svc ON svc.id::text = sid.service_id
          ) AS requested_services,
          pa.preferred_date,
          NULLIF(BTRIM(COALESCE(pa.notes, '')), '') AS observacao_resumida,
          pa.notes,
          pa.status,
          ${PRE_APPOINTMENT_STATUS_NORMALIZATION_SQL} AS status_normalized,
          pa.created_at,
          pa.converted_to_patient_id::text AS converted_to_patient_id,
          pa.converted_at,
          pa.converted_by::text AS converted_by
        FROM public.fila_de_espera pa
        ${whereSql}
        ORDER BY ${orderBySql}
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
      `,
      listParams
    );

    const summaryRow = summaryResult.rows[0] || {};
    const total = Number.parseInt(String(summaryRow.total || 0), 10) || 0;
    const pendingCount = Number.parseInt(String(summaryRow.pending_count || 0), 10) || 0;
    const inReviewCount = Number.parseInt(String(summaryRow.in_review_count || 0), 10) || 0;
    const convertedCount = Number.parseInt(String(summaryRow.converted_count || 0), 10) || 0;
    const notEligibleCount = Number.parseInt(String(summaryRow.not_eligible_count || 0), 10) || 0;

    return res.json({
      success: true,
      total,
      limit,
      offset,
      sort,
      summary: {
        pending: pendingCount,
        in_review: inReviewCount,
        converted: convertedCount,
        not_eligible: notEligibleCount,
      },
      items: listResult.rows.map(mapPreAppointmentRow),
    });
  } catch (error) {
    console.error('Erro ao listar fila de triagem da fila de espera:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

// GET - Buscar registros elegiveis da fila de espera para importacao no pre-cadastro
router.get('/eligible', authMiddleware, authorizeWaitingListLookup, async (req, res) => {
  const q = normalizeOptionalText(req.query?.q);
  const childName = normalizeOptionalText(req.query?.child_name);
  const responsibleName = normalizeOptionalText(req.query?.responsible_name);
  const phoneDigits = normalizePhoneDigits(req.query?.phone);
  const cpfDigits = normalizeCpf(req.query?.cpf);
  const date = normalizeDate(req.query?.date);
  const limit = normalizeLimit(req.query?.limit, 20);

  const whereClauses = [
    `pa.converted_at IS NULL`,
    `NULLIF(BTRIM(COALESCE(pa.converted_to_patient_id::text, '')), '') IS NULL`,
    `LOWER(COALESCE(pa.status, '')) <> 'converted'`,
    `LOWER(COALESCE(pa.status, '')) <> 'cancelled'`,
    `LOWER(COALESCE(pa.status, '')) <> 'cancelado'`,
    `LOWER(COALESCE(pa.status, '')) <> 'cancelada'`,
    `LOWER(COALESCE(pa.status, '')) <> 'archived'`,
    `LOWER(COALESCE(pa.status, '')) <> 'not_eligible'`,
    `LOWER(COALESCE(pa.status, '')) <> 'sem_perfil'`,
  ];
  const params = [];

  if (q) {
    params.push(`%${q}%`);
    const qParam = `$${params.length}`;
    whereClauses.push(
      `(
        pa.name ILIKE ${qParam}
        OR COALESCE(pa.responsible_name, '') ILIKE ${qParam}
        OR COALESCE(pa.phone, '') ILIKE ${qParam}
        OR COALESCE(pa.email, '') ILIKE ${qParam}
        OR COALESCE(pa.cpf, '') ILIKE ${qParam}
      )`
    );
  }

  if (childName) {
    params.push(`%${childName}%`);
    whereClauses.push(`pa.name ILIKE $${params.length}`);
  }

  if (responsibleName) {
    params.push(`%${responsibleName}%`);
    whereClauses.push(`COALESCE(pa.responsible_name, '') ILIKE $${params.length}`);
  }

  if (phoneDigits) {
    params.push(`%${phoneDigits}%`);
    whereClauses.push(
      `regexp_replace(COALESCE(pa.phone, ''), '\\D', '', 'g') LIKE $${params.length}`
    );
  }

  if (cpfDigits) {
    params.push(`%${cpfDigits}%`);
    whereClauses.push(
      `regexp_replace(COALESCE(pa.cpf, ''), '\\D', '', 'g') LIKE $${params.length}`
    );
  }

  if (date) {
    params.push(date);
    const dateParam = `$${params.length}`;
    whereClauses.push(
      `(
        pa.date_of_birth = ${dateParam}
        OR pa.preferred_date = ${dateParam}
        OR DATE(pa.created_at) = ${dateParam}
      )`
    );
  }

  params.push(limit);

  try {
    const result = await pool.query(
      `
        SELECT
          pa.id::text AS id,
          pa.name,
          pa.cpf,
          pa.phone,
          pa.email,
          pa.date_of_birth,
          pa.responsible_name,
          pa.status,
          pa.preferred_date,
          pa.created_at,
          pa.converted_to_patient_id::text AS converted_to_patient_id,
          pa.converted_at
        FROM fila_de_espera pa
        WHERE ${whereClauses.join('\n          AND ')}
        ORDER BY pa.created_at DESC
        LIMIT $${params.length}
      `,
      params
    );
    const items = result.rows.map(mapPreAppointmentRow);
    return res.json({
      success: true,
      total: result.rows.length,
      filaEspera: items,
      preAppointments: items,
    });
  } catch (error) {
    console.error('Erro ao buscar registros elegiveis da fila de espera:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

// PATCH - Atualizar status/observacao operacional da fila de espera
router.patch('/:id/triage', authMiddleware, authorizeWaitingListLookup, async (req, res) => {
  const preAppointmentId = normalizeText(req.params?.id);
  if (!UUID_REGEX.test(preAppointmentId)) {
    return res.status(400).json({
      success: false,
      message: 'ID de fila de espera invalido.',
    });
  }

  const body = req.body || {};
  const statusProvided = Object.prototype.hasOwnProperty.call(body, 'status');
  const noteProvided =
    Object.prototype.hasOwnProperty.call(body, 'note') ||
    Object.prototype.hasOwnProperty.call(body, 'notes');

  if (!statusProvided && !noteProvided) {
    return res.status(400).json({
      success: false,
      message: 'Informe ao menos status ou observacao para atualizar a triagem.',
    });
  }

  const requestedStatus = statusProvided
    ? normalizePreAppointmentOperationalStatus(body?.status, { allowNull: true })
    : null;
  if (statusProvided && !requestedStatus) {
    return res.status(400).json({
      success: false,
      message: 'status operacional invalido.',
    });
  }

  if (requestedStatus && !PRE_APPOINTMENT_ALLOWED_TRIAGE_STATUSES.has(requestedStatus)) {
    return res.status(400).json({
      success: false,
      message: 'status operacional nao permitido para triagem.',
    });
  }

  const noteText = noteProvided
    ? normalizeOptionalText(
        Object.prototype.hasOwnProperty.call(body, 'note') ? body?.note : body?.notes
      )
    : null;
  const appendNote = normalizeBoolean(body?.append_note, true);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lockedResult = await client.query(
      `
        SELECT
          pa.id::text AS id,
          pa.status,
          pa.notes,
          pa.converted_to_patient_id::text AS converted_to_patient_id,
          pa.converted_at
        FROM public.fila_de_espera pa
        WHERE pa.id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [preAppointmentId]
    );

    if (lockedResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Registro da fila de espera nao encontrado.',
      });
    }

    const lockedRow = lockedResult.rows[0];
    const currentOperationalStatus = resolveOperationalStatusFromRow(lockedRow);
    if (currentOperationalStatus === 'converted' && requestedStatus) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Registro convertido da fila de espera nao pode voltar para status de triagem.',
      });
    }

    const setClauses = ['updated_at = NOW()'];
    const updateParams = [preAppointmentId];

    if (requestedStatus) {
      updateParams.push(requestedStatus);
      setClauses.push(`status = $${updateParams.length}`);
    }

    if (noteProvided) {
      updateParams.push(noteText);
      const noteParam = `$${updateParams.length}`;
      if (appendNote && noteText) {
        setClauses.push(
          `
            notes = CASE
              WHEN NULLIF(BTRIM(COALESCE(notes, '')), '') IS NULL THEN ${noteParam}
              ELSE CONCAT(notes, E'\\n', ${noteParam})
            END
          `
        );
      } else {
        setClauses.push(`notes = ${noteParam}`);
      }
    }

    const updateResult = await client.query(
      `
        UPDATE public.fila_de_espera pa
        SET ${setClauses.join(',\n            ')}
        WHERE pa.id = $1
        RETURNING
          id::text AS id,
          name,
          cpf,
          phone,
          email,
          date_of_birth,
          responsible_name,
          referred_by,
          how_heard,
          cid,
          urgency,
          service_type,
          preferred_date,
          notes,
          status,
          ${PRE_APPOINTMENT_STATUS_NORMALIZATION_SQL} AS status_normalized,
          created_at,
          converted_to_patient_id::text AS converted_to_patient_id,
          converted_at,
          converted_by::text AS converted_by
      `,
      updateParams
    );

    await client.query('COMMIT');
    const updatedItem = mapPreAppointmentRow(updateResult.rows[0]);
    return res.json({
      success: true,
      filaEspera: updatedItem,
      preAppointment: updatedItem,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar triagem da fila de espera:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  } finally {
    client.release();
  }
});

// GET - Consulta interna da recepcao com classificacao anti-duplicidade
router.get('/reception-search', authMiddleware, authorizeReceptionLookup, async (req, res) => {
  const phone = normalizeText(req.query?.phone);
  const name = normalizeText(req.query?.name);
  const cpf = normalizeCpf(req.query?.cpf);
  const dateOfBirth = normalizeDate(req.query?.date_of_birth);

  const hasPhoneFlow = Boolean(normalizePhoneDigits(phone) && dateOfBirth);
  const hasNameFlow = Boolean(normalizeNameForMatching(name) && dateOfBirth);
  const hasCpfFlow = Boolean(cpf);

  if (!hasCpfFlow && !hasPhoneFlow && !hasNameFlow) {
    return res.status(400).json({
      success: false,
      message:
        'Informe CPF ou telefone + data de nascimento ou nome + data de nascimento para consultar.',
    });
  }

  const client = await pool.connect();
  try {
    const duplicateRisk = await detectReceptionDuplicateRisk({
      client,
      cpf,
      name,
      phone,
      dateOfBirth,
      candidateLimit: 80,
    });

    return res.json({
      success: true,
      scenario: duplicateRisk.scenario,
      exact_matches: duplicateRisk.exact_matches,
      similar_matches: duplicateRisk.similar_matches,
      found: duplicateRisk.exact_matches.length > 0,
      message:
        duplicateRisk.scenario === 'found'
          ? 'Cadastro localizado com correspondencia exata.'
          : duplicateRisk.scenario === 'possible_duplicate'
            ? 'Possivel duplicidade detectada. Revise antes de criar novo cadastro.'
            : 'Nenhum cadastro correspondente encontrado.',
    });
  } catch (error) {
    console.error('Erro ao consultar cadastro na recepcao:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  } finally {
    client.release();
  }
});

// PATCH - Edicao de dados basicos do cadastro principal no fluxo da recepcao
router.patch(
  '/reception/patient/:patientId/basic',
  authMiddleware,
  authorizeReceptionOperate,
  async (req, res) => {
    const patientId = normalizeText(req.params?.patientId);
    if (!UUID_REGEX.test(patientId)) {
      return res.status(400).json({
        success: false,
        message: 'ID do cadastro principal invalido.',
      });
    }

    const body = req.body || {};
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(body, key);

    const nameProvided = hasOwn('name');
    const cpfProvided = hasOwn('cpf');
    const dateProvided = hasOwn('date_of_birth');
    const phoneProvided = hasOwn('phone');
    const emailProvided = hasOwn('email');
    const notesProvided = hasOwn('notes');
    const responsibleProvided = hasOwn('responsible_name');
    const initialNoteProvided = hasOwn('initial_note');

    if (
      !nameProvided &&
      !cpfProvided &&
      !dateProvided &&
      !phoneProvided &&
      !emailProvided &&
      !notesProvided &&
      !responsibleProvided &&
      !initialNoteProvided
    ) {
      return res.status(400).json({
        success: false,
        message: 'Informe ao menos um campo para atualizar.',
      });
    }

    const nextName = nameProvided ? normalizeText(body.name) : null;
    if (nameProvided && !nextName) {
      return res.status(400).json({
        success: false,
        message: 'name e obrigatorio quando informado.',
      });
    }

    const nextCpfDigits = cpfProvided ? normalizeCpf(body.cpf) : null;
    const nextDateOfBirth = dateProvided ? normalizeDate(body.date_of_birth) : null;
    if (dateProvided && !nextDateOfBirth) {
      return res.status(400).json({
        success: false,
        message: 'date_of_birth invalida. Use YYYY-MM-DD.',
      });
    }

    const nextPhone = phoneProvided ? normalizeOptionalText(body.phone) : null;
    const nextEmail = emailProvided ? normalizeOptionalText(body.email) : null;
    const nextNotesInput = notesProvided ? normalizeOptionalText(body.notes) : null;
    const nextResponsibleName = responsibleProvided
      ? normalizeOptionalText(body.responsible_name)
      : null;
    const nextInitialNote = initialNoteProvided ? normalizeOptionalText(body.initial_note) : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const patientResult = await client.query(
        `
          SELECT
            p.id::text AS id,
            p.name,
            p.cpf,
            p.date_of_birth,
            p.phone,
            p.email,
            p.notes,
            p.status,
            p.status_jornada
          FROM public.patients p
          WHERE p.id::text = $1
          LIMIT 1
          FOR UPDATE
        `,
        [patientId]
      );

      if (patientResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Cadastro principal nao encontrado.',
        });
      }

      const currentPatient = patientResult.rows[0];
      const changedSimpleFields = [];
      const changedSensitiveFields = [];

      const currentCpfDigits = normalizeCpf(currentPatient.cpf);
      const currentDateOfBirth = normalizeDate(currentPatient.date_of_birth);
      const currentPhone = normalizeOptionalText(currentPatient.phone);
      const currentEmail = normalizeOptionalText(currentPatient.email);

      if (nameProvided && nextName !== normalizeText(currentPatient.name)) {
        changedSensitiveFields.push('name');
      }
      if (cpfProvided && nextCpfDigits !== currentCpfDigits) {
        changedSensitiveFields.push('cpf');
      }
      if (dateProvided && nextDateOfBirth !== currentDateOfBirth) {
        changedSensitiveFields.push('date_of_birth');
      }
      if (phoneProvided && nextPhone !== currentPhone) {
        changedSimpleFields.push('phone');
      }
      if (emailProvided && nextEmail !== currentEmail) {
        changedSimpleFields.push('email');
      }
      if (notesProvided) {
        changedSimpleFields.push('notes');
      }
      if (responsibleProvided) {
        changedSimpleFields.push('responsible_name');
      }
      if (initialNoteProvided) {
        changedSimpleFields.push('initial_note');
      }

      if (changedSimpleFields.length === 0 && changedSensitiveFields.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Nenhuma alteracao detectada para salvar.',
        });
      }

      if (changedSensitiveFields.length > 0 && !canEditSensitiveReceptionData(req)) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          code: 'sensitive_field_edit_forbidden',
          message:
            'Seu perfil pode editar apenas campos operacionais simples. Campos sensiveis exigem permissao de edicao da recepcao.',
        });
      }

      const auditLine = buildReceptionAuditEntry({
        req,
        event: 'edit_basic_patient_data',
        details: {
          patient_id: patientId,
          changed_simple_fields: changedSimpleFields,
          changed_sensitive_fields: changedSensitiveFields,
        },
      });

      const nextPatientNotesBase = notesProvided
        ? nextNotesInput
        : normalizeOptionalText(currentPatient.notes);
      const nextPatientNotes = appendTraceNotes(nextPatientNotesBase, [auditLine]);

      await client.query(
        `
          UPDATE public.patients
          SET
            name = $1,
            cpf = $2,
            date_of_birth = $3,
            phone = $4,
            email = $5,
            notes = $6,
            updated_at = NOW()
          WHERE id::text = $7
        `,
        [
          nameProvided ? nextName : currentPatient.name,
          cpfProvided ? nextCpfDigits : currentPatient.cpf,
          dateProvided ? nextDateOfBirth : currentPatient.date_of_birth,
          phoneProvided ? nextPhone : currentPatient.phone,
          emailProvided ? nextEmail : currentPatient.email,
          nextPatientNotes,
          patientId,
        ]
      );

      if (responsibleProvided || initialNoteProvided) {
        const linkedPreAppointmentResult = await client.query(
          `
            SELECT
              pa.id::text AS id,
              pa.responsible_name,
              pa.notes
            FROM public.fila_de_espera pa
            WHERE pa.converted_to_patient_id::text = $1
            ORDER BY pa.created_at DESC NULLS LAST
            LIMIT 1
            FOR UPDATE
          `,
          [patientId]
        );

        if (linkedPreAppointmentResult.rows.length > 0) {
          const currentPreAppointment = linkedPreAppointmentResult.rows[0];
          const nextPreAppointmentNotesBase = initialNoteProvided
            ? nextInitialNote
            : normalizeOptionalText(currentPreAppointment.notes);
          const preAppointmentAuditLine = buildReceptionAuditEntry({
            req,
            event: 'edit_basic_pre_appointment_data',
            details: {
              patient_id: patientId,
              pre_appointment_id: currentPreAppointment.id,
              changed_fields: [
                ...(responsibleProvided ? ['responsible_name'] : []),
                ...(initialNoteProvided ? ['initial_note'] : []),
              ],
            },
          });
          const nextPreAppointmentNotes = appendTraceNotes(nextPreAppointmentNotesBase, [
            preAppointmentAuditLine,
          ]);

          await client.query(
            `
              UPDATE public.fila_de_espera
              SET
                responsible_name = $1,
                notes = $2,
                updated_at = NOW()
              WHERE id::text = $3
            `,
            [
              responsibleProvided ? nextResponsibleName : currentPreAppointment.responsible_name,
              nextPreAppointmentNotes,
              currentPreAppointment.id,
            ]
          );
        }
      }

      const updatedPatientResult = await client.query(
        `
          SELECT
            p.id::text AS id,
            p.name AS nome,
            p.cpf,
            p.phone AS telefone,
            p.email,
            p.date_of_birth AS "dataNascimento",
            p.status,
            p.status_jornada,
            p.notes
          FROM public.patients p
          WHERE p.id::text = $1
          LIMIT 1
        `,
        [patientId]
      );

      await client.query('COMMIT');

      return res.json({
        success: true,
        paciente: updatedPatientResult.rows[0],
        audit: {
          actor: resolveActorContext(req),
          changed_simple_fields: changedSimpleFields,
          changed_sensitive_fields: changedSensitiveFields,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao editar dados basicos na recepcao:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    } finally {
      client.release();
    }
  }
);

// GET - Consulta publica da solicitacao
router.get('/public-search', async (req, res) => {
  const phone = normalizeText(req.query?.phone);
  const name = normalizeText(req.query?.name);
  const dateOfBirth = normalizeDate(req.query?.date_of_birth);

  const hasPhoneFlow = Boolean(phone && dateOfBirth);
  const hasNameFlow = Boolean(name && dateOfBirth);

  if (!hasPhoneFlow && !hasNameFlow) {
    return res.status(400).json({
      success: false,
      message: 'Informe phone + date_of_birth ou name + date_of_birth.',
    });
  }

  try {
    const params = [];
    let sql = `
      SELECT name, status, created_at
      FROM fila_de_espera
      WHERE
    `;

    if (hasPhoneFlow) {
      params.push(normalizePhoneDigits(phone));
      params.push(dateOfBirth);
      sql += `
        regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
        AND date_of_birth = $2
      `;
    } else {
      params.push(name);
      params.push(dateOfBirth);
      sql += `
        LOWER(TRIM(name)) = LOWER(TRIM($1))
        AND date_of_birth = $2
      `;
    }

    sql += `
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await pool.query(sql, params);
    const row = result.rows[0];

    if (!row) {
      return res.json({
        success: true,
        found: false,
        filaEspera: null,
        preAppointment: null,
      });
    }

    return res.json({
      success: true,
      found: true,
      filaEspera: {
        name: row.name,
        status: row.status,
        status_operacional: row.status,
        status_contexto: PRE_APPOINTMENT_STATUS_NOTE,
        created_at: row.created_at,
      },
      preAppointment: {
        name: row.name,
        status: row.status,
        status_operacional: row.status,
        status_contexto: PRE_APPOINTMENT_STATUS_NOTE,
        created_at: row.created_at,
      },
    });
  } catch (error) {
    console.error('Erro ao consultar fila de espera publica:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

// GET - Detalhe interno da fila de espera para importacao
router.get('/:id', authMiddleware, authorizeWaitingListLookup, async (req, res) => {
  const preAppointmentId = normalizeText(req.params?.id);
  if (!UUID_REGEX.test(preAppointmentId)) {
    return res.status(400).json({
      success: false,
      message: 'ID de fila de espera invalido.',
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          pa.*,
          pa.id::text AS id,
          pa.converted_to_patient_id::text AS converted_to_patient_id
        FROM fila_de_espera pa
        WHERE pa.id = $1
        LIMIT 1
      `,
      [preAppointmentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Registro da fila de espera nao encontrado.',
      });
    }

    const item = mapPreAppointmentRow(result.rows[0]);
    return res.json({
      success: true,
      filaEspera: item,
      preAppointment: item,
    });
  } catch (error) {
    console.error('Erro ao buscar detalhe da fila de espera:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

module.exports = router;

