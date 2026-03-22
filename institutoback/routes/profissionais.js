const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const pool = require('../config/pg');
const bcrypt = require('bcryptjs');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const {
  DEFAULT_ACCESS_SETTINGS,
  readAccessSettings,
} = require('../lib/accessSettings');
const {
  AGENDA_PRIMARY_SCOPE,
  AGENDA_LEGACY_COMPAT_SCOPE,
  AGENDA_LEGACY_COMPAT_PHASE,
  AGENDA_LEGACY_FALLBACK_ENABLED,
  AGENDA_READ_ACCESS_MODE,
  AGENDA_LEGACY_SCOPE_REASON,
  AGENDA_WRITE_VALIDATION_SUPPORTED_LEVELS,
  buildAgendaInstitutionalContext,
  buildAgendaReadMetadata,
  prepareAgendaWriteGuard,
  prepareAgendaWriteValidation,
  resolveAgendaWriteEnforcementMode,
  summarizeWriteValidation,
  toAgendaWriteValidationPayload,
  normalizeJourneyStatus,
} = require('../services/agendaInstitutionalService');

router.use(authMiddleware);

const authorizeProfessionalsView = authorize('profissionais', 'view');
const LEGACY_ACCESS_SIGNAL_THROTTLE_MS = 5 * 60 * 1000;
function readAgendaBooleanFlag(envName, fallback = false) {
  const rawValue = process.env[envName];
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }

  return ['1', 'true', 'sim', 'yes', 'on'].includes(
    rawValue.toString().trim().toLowerCase()
  );
}

// Flags operacionais da agenda institucional (rollout controlado).
const AGENDA_VALIDATE_WRITE_ALLOW_LEGACY = readAgendaBooleanFlag(
  'AGENDA_VALIDATE_WRITE_ALLOW_LEGACY',
  false
);
const AGENDA_CREATE_WRITE_ALLOW_LEGACY = readAgendaBooleanFlag(
  'AGENDA_CREATE_WRITE_ALLOW_LEGACY',
  false
);
const AGENDA_CREATE_PERSIST_ENABLED = readAgendaBooleanFlag(
  'AGENDA_CREATE_PERSIST_ENABLED',
  true
);
const AGENDA_CREATE_ALLOW_CONFIRMED_STATUS = readAgendaBooleanFlag(
  'AGENDA_CREATE_ALLOW_CONFIRMED_STATUS',
  false
);
const AGENDA_STATUS_UPDATE_ALLOW_LEGACY = readAgendaBooleanFlag(
  'AGENDA_STATUS_UPDATE_ALLOW_LEGACY',
  false
);
const AGENDA_STATUS_UPDATE_ENABLED = readAgendaBooleanFlag(
  'AGENDA_STATUS_UPDATE_ENABLED',
  true
);

let patientsStatusJornadaColumnCache = null;
const legacyAgendaAccessSignalCache = new Map();

function normalizeDateParam(value) {
  const text = (value || '').toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function daysBetweenInclusive(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  if (Number.isNaN(diffMs)) return null;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

function normalizeOptionalText(value) {
  const text = (value || '').toString().trim();
  return text || null;
}

function normalizeEntityId(value) {
  const text = normalizeOptionalText(value);
  return text || null;
}

function normalizeAppointmentStatus(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (!normalized) return 'scheduled';

  if (['scheduled', 'agendado'].includes(normalized)) return 'scheduled';
  if (['confirmed', 'confirmado'].includes(normalized)) return 'confirmed';
  if (['completed', 'concluido'].includes(normalized)) return 'completed';
  if (['cancelled', 'cancelado'].includes(normalized)) return 'cancelled';
  return null;
}

function normalizeAppointmentTime(value) {
  const text = (value || '').toString().trim();
  if (!text) return null;
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  if (parseTimeToMinutes(text) === null) return null;
  return text;
}

function normalizeAppointmentStatusAction(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (!normalized) return null;
  if (['confirm', 'confirmar', 'confirmed', 'confirmado'].includes(normalized)) return 'confirm';
  if (['cancel', 'cancelar', 'cancelled', 'cancelado'].includes(normalized)) return 'cancel';
  return null;
}

function mapAppointmentStatusActionToTarget(action) {
  if (action === 'confirm') return 'confirmed';
  if (action === 'cancel') return 'cancelled';
  return null;
}

function getAllowedCreateAppointmentStatuses() {
  return AGENDA_CREATE_ALLOW_CONFIRMED_STATUS === true
    ? ['scheduled', 'confirmed']
    : ['scheduled'];
}

function buildCreateStatusAllowedLabel() {
  const allowed = getAllowedCreateAppointmentStatuses();
  if (allowed.includes('confirmed')) {
    return 'scheduled/agendado ou confirmed/confirmado';
  }
  return 'scheduled/agendado';
}

function buildStatusUpdatePolicyPayload() {
  return {
    allowed_actions: ['confirm', 'cancel'],
    allowed_target_statuses: ['confirmed', 'cancelled'],
    immutable_statuses: ['completed'],
    cancellation_guard_bypass_controlled: true,
  };
}

function buildAgendaScopePayload(access, extra = {}) {
  return {
    ...buildAgendaReadMetadata({
      accessMode: access?.mode || null,
      compatibilityMode: access?.compatibilityMode === true,
      legacyReason: access?.legacyReason || null,
    }),
    ...extra,
  };
}

function canAccessAgendaWriteTarget(accessContext, professionalId) {
  const isOwnAgenda =
    accessContext?.linkedProfessionalId &&
    String(accessContext.linkedProfessionalId) === String(professionalId);

  if (
    accessContext?.linkedProfessionalId &&
    !isOwnAgenda &&
    !accessContext?.canViewOtherProfessionals
  ) {
    return false;
  }

  return true;
}

function buildAgendaWriteScopeWithSummary({
  agendaReadAccess,
  accessContext,
  writeEnforcement,
  validationPayload,
  writeValidationSummary,
}) {
  return buildAgendaScopePayload(agendaReadAccess, {
    professional_id: accessContext?.linkedProfessionalId || null,
    can_view_all_professionals: accessContext?.canViewOtherProfessionals === true,
    allow_professional_view_others: accessContext?.allowProfessionalViewOthers === true,
    write_validation_summary: {
      mode: validationPayload?.mode || writeEnforcement?.configuredMode || null,
      effective_mode:
        validationPayload?.effective_mode || writeEnforcement?.effectiveMode || null,
      rollout_phase: validationPayload?.rollout_phase || writeEnforcement?.rolloutPhase || null,
      hard_block_enabled: validationPayload?.hard_block_enabled === true,
      legacy_mode_alias: validationPayload?.legacy_mode_alias || null,
      ...(writeValidationSummary || {}),
      blocking_active: validationPayload?.blocking_active === true,
      enforcement_ready: validationPayload?.enforcement_ready === true,
    },
  });
}

function buildAgendaWriteOverridePayload({
  requestedEnforcementMode,
  canOverrideEnforcementMode,
  writeEnforcement,
}) {
  return {
    requested_enforcement_mode: requestedEnforcementMode || null,
    override_allowed: canOverrideEnforcementMode === true,
    override_ignored: Boolean(requestedEnforcementMode && !canOverrideEnforcementMode),
    configured_mode: writeEnforcement?.configuredMode || null,
    effective_mode: writeEnforcement?.effectiveMode || null,
  };
}

function buildAgendaWriteResponseBase({
  dryRun,
  persisted,
  endpoint,
  blocked,
  canProceed,
  validationPayload,
  resolvedContext,
  overridePayload,
  scopePayload,
  extra = {},
}) {
  return {
    dry_run: dryRun === true,
    persisted: persisted === true,
    endpoint: endpoint || null,
    blocked: blocked === true,
    can_proceed: canProceed === true,
    validation: validationPayload || null,
    resolved_context: resolvedContext || null,
    override: overridePayload || null,
    scope: scopePayload || null,
    ...extra,
  };
}

function buildAgendaLegacyWriteScopeError({
  code,
  message,
  agendaReadAccess,
  accessContext,
}) {
  return {
    success: false,
    code,
    message,
    scope: buildAgendaScopePayload(agendaReadAccess, {
      professional_id: accessContext?.linkedProfessionalId || null,
      can_view_all_professionals: accessContext?.canViewOtherProfessionals === true,
      allow_professional_view_others: accessContext?.allowProfessionalViewOthers === true,
    }),
  };
}

function resolveAgendaReadAccess(user) {
  const hasAgendaViewScope = hasPermissionScope(user?.permissions, AGENDA_PRIMARY_SCOPE);
  if (hasAgendaViewScope) {
    return {
      allowed: true,
      mode: AGENDA_READ_ACCESS_MODE.AGENDA_SCOPE,
      compatibilityMode: false,
      legacyReason: null,
    };
  }

  if (AGENDA_LEGACY_FALLBACK_ENABLED !== true) {
    return {
      allowed: false,
      mode: null,
      compatibilityMode: false,
      legacyReason: null,
    };
  }

  // Compatibilidade temporaria: manter leitura com profissionais:view enquanto
  // os perfis de agenda sao saneados para escopo explicito agenda:view.
  const hasLegacyProfessionalsViewScope = hasPermissionScope(
    user?.permissions,
    AGENDA_LEGACY_COMPAT_SCOPE
  );
  if (hasLegacyProfessionalsViewScope) {
    return {
      allowed: true,
      mode: AGENDA_READ_ACCESS_MODE.LEGACY_PROFISSIONAIS_SCOPE,
      compatibilityMode: true,
      legacyReason: AGENDA_LEGACY_SCOPE_REASON.LEGACY_SCOPE_PERMISSION,
    };
  }

  if (isAdminUser(user)) {
    return {
      allowed: true,
      mode: AGENDA_READ_ACCESS_MODE.ADMIN_ROLE_COMPAT,
      compatibilityMode: true,
      legacyReason: AGENDA_LEGACY_SCOPE_REASON.ADMIN_ROLE_COMPATIBILITY,
    };
  }

  return {
    allowed: false,
    mode: null,
    compatibilityMode: false,
    legacyReason: null,
  };
}

function emitLegacyAgendaAccessSignal(req, access) {
  if (!access || access.compatibilityMode !== true) return;

  const userId = (req?.user?.id || 'unknown').toString();
  const accessMode = (access?.mode || 'unknown').toString();
  const cacheKey = `${userId}:${accessMode}`;
  const now = Date.now();
  const lastSignalAt = legacyAgendaAccessSignalCache.get(cacheKey) || 0;

  if (now - lastSignalAt < LEGACY_ACCESS_SIGNAL_THROTTLE_MS) {
    return;
  }

  legacyAgendaAccessSignalCache.set(cacheKey, now);
  if (legacyAgendaAccessSignalCache.size > 1000) {
    for (const [key, timestamp] of legacyAgendaAccessSignalCache.entries()) {
      if (now - timestamp > LEGACY_ACCESS_SIGNAL_THROTTLE_MS * 4) {
        legacyAgendaAccessSignalCache.delete(key);
      }
    }
  }

  console.warn('[agenda][legacy_scope_compatibility_active]', {
    user_id: userId,
    access_mode: accessMode,
    legacy_scope_reason: access?.legacyReason || null,
    legacy_scope_required: AGENDA_LEGACY_COMPAT_SCOPE,
    primary_scope_required: AGENDA_PRIMARY_SCOPE,
    legacy_scope_deprecation_phase: AGENDA_LEGACY_COMPAT_PHASE,
    endpoint: req?.originalUrl || req?.path || null,
    method: req?.method || null,
    timestamp: new Date(now).toISOString(),
  });
}

function authorizeAgendaRead(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Nao autenticado' });
  }

  const access = resolveAgendaReadAccess(req.user);
  if (!access.allowed) {
    return res.status(403).json({
      success: false,
      message: 'Acesso negado para visualizar agenda',
    });
  }

  req.agendaReadAccess = access;
  emitLegacyAgendaAccessSignal(req, access);
  return next();
}

function authorizeProfessionalsListView(req, res, next) {
  const forAgenda = ['1', 'true', 'sim', 'yes'].includes(
    (req.query.for_agenda || '').toString().trim().toLowerCase()
  );

  if (forAgenda) {
    return authorizeAgendaRead(req, res, next);
  }

  return authorizeProfessionalsView(req, res, next);
}

const DEFAULT_CONTRACT_TYPES = ['CLT', 'PJ', 'VoluntÃ¡rio', 'EstÃ¡gio', 'TemporÃ¡rio'];
const SCALE_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex'];
const DEFAULT_WEEK_SCALE = { seg: true, ter: true, qua: true, qui: true, sex: true };
const DEFAULT_DAY_START_TIME = '08:00';
const DEFAULT_DAY_END_TIME = '17:20';
const ADMIN_ROLE_ALIASES = ['coordenador geral', 'administrador', 'admin', 'gestao', 'gestÃƒÂ£o', 'gestor'];

async function readAccessSettingsSafe(contextLabel = 'profissionais') {
  try {
    return await readAccessSettings(pool);
  } catch (error) {
    if (!['42703', '42P01'].includes(error?.code)) {
      console.warn(`[${contextLabel}] Falha ao carregar configuracoes de acesso:`, error?.message || error);
    }
    return { ...DEFAULT_ACCESS_SETTINGS };
  }
}

function isAdminUser(user) {
  const role = (user?.role || '').toString().trim().toLowerCase();
  if (ADMIN_ROLE_ALIASES.includes(role)) return true;

  const scopes = Array.isArray(user?.permissions)
    ? user.permissions
        .map((scope) => (typeof scope === 'string' ? scope.trim().toLowerCase() : ''))
        .filter(Boolean)
    : [];

  return scopes.some((scope) =>
    ['admin:all', 'admin', 'users:manage', 'manage:users', 'permissions:manage', 'manage:permissions'].includes(scope)
  );
}

function normalizeText(value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeStatus(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return null;

  if (['ativo', 'active', 'plantao', 'onboarding'].includes(raw)) return 'ATIVO';
  if (['inativo', 'inactive', 'afastado'].includes(raw)) return 'INATIVO';
  return null;
}

function parseTimeToMinutes(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return null;

  const [hoursRaw, minutesRaw] = trimmed.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

async function getProfessionalsRuntimeConfig() {
  try {
    const { rows } = await pool.query(
      'SELECT business_hours, professionals_config FROM system_settings LIMIT 1'
    );

    const row = rows[0] || {};
    const config = row.professionals_config && typeof row.professionals_config === 'object'
      ? row.professionals_config
      : {};
    const businessHours = row.business_hours && typeof row.business_hours === 'object'
      ? row.business_hours
      : {};

    const allowedContractTypes = Array.isArray(config.allowed_contract_types)
      ? config.allowed_contract_types
          .map((item) => (item || '').toString().trim())
          .filter(Boolean)
      : [];

    const operatingDays = businessHours.operating_days && typeof businessHours.operating_days === 'object'
      ? businessHours.operating_days
      : {};

    const defaultWeekScale = { ...DEFAULT_WEEK_SCALE };
    for (const key of SCALE_KEYS) {
      if (typeof operatingDays[key] === 'boolean') {
        defaultWeekScale[key] = operatingDays[key];
      }
    }

    const openingTime = typeof businessHours.opening_time === 'string' ? businessHours.opening_time.trim() : '';
    const closingTime = typeof businessHours.closing_time === 'string' ? businessHours.closing_time.trim() : '';

    const defaultStartTime = parseTimeToMinutes(openingTime) === null ? DEFAULT_DAY_START_TIME : openingTime;
    const defaultEndTime = parseTimeToMinutes(closingTime) === null ? DEFAULT_DAY_END_TIME : closingTime;

    return {
      allowedContractTypes: allowedContractTypes.length > 0 ? allowedContractTypes : DEFAULT_CONTRACT_TYPES,
      defaultWeekScale,
      defaultStartTime,
      defaultEndTime,
    };
  } catch (error) {
    return {
      allowedContractTypes: DEFAULT_CONTRACT_TYPES,
      defaultWeekScale: { ...DEFAULT_WEEK_SCALE },
      defaultStartTime: DEFAULT_DAY_START_TIME,
      defaultEndTime: DEFAULT_DAY_END_TIME,
    };
  }
}

async function hasPatientsStatusJornadaColumn(client) {
  if (patientsStatusJornadaColumnCache !== null) {
    return patientsStatusJornadaColumnCache;
  }

  const db = client || pool;
  try {
    const { rows } = await db.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'patients'
          AND column_name = 'status_jornada'
        LIMIT 1
      `
    );
    patientsStatusJornadaColumnCache = rows.length > 0;
  } catch (error) {
    if (!['42P01', '42703'].includes(error?.code)) {
      console.error(
        '[profissionais] Falha ao verificar coluna patients.status_jornada:',
        error
      );
    }
    patientsStatusJornadaColumnCache = false;
  }

  return patientsStatusJornadaColumnCache;
}

async function resolveAgendaWriteProfessionalContext({ professionalId, client }) {
  const normalizedProfessionalId = normalizeEntityId(professionalId);
  if (!normalizedProfessionalId) {
    return {
      professionalId: null,
      professionalName: null,
      professionalRole: null,
      professionalSpecialty: null,
      source: 'not_provided',
      found: null,
    };
  }

  const db = client || pool;
  const result = await db.query(
    `
      SELECT
        p.id::text AS professional_id,
        COALESCE(
          u.name,
          p.email,
          p.funcao,
          p.specialty,
          'Profissional ' || p.id::text
        ) AS professional_name,
        COALESCE(pr.nome, p.funcao, p.specialty) AS professional_role,
        p.specialty AS professional_specialty
      FROM public.professionals p
      LEFT JOIN public.professional_roles pr ON pr.id = p.role_id
      LEFT JOIN public.users u
        ON COALESCE(to_jsonb(p)->>'user_id_int', to_jsonb(p)->>'user_id') = u.id::text
      WHERE p.id::text = $1
      LIMIT 1
    `,
    [normalizedProfessionalId]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      professionalId: normalizedProfessionalId,
      professionalName: null,
      professionalRole: null,
      professionalSpecialty: null,
      source: 'professional_not_found',
      found: false,
    };
  }

  return {
    professionalId: row?.professional_id || normalizedProfessionalId,
    professionalName: row?.professional_name || null,
    professionalRole: row?.professional_role || null,
    professionalSpecialty: row?.professional_specialty || null,
    source: 'professionals.catalog',
    found: true,
  };
}

async function resolveAgendaWritePatientContext({
  patientId,
  journeyStatusInput = null,
  client,
}) {
  const normalizedPatientId = normalizeEntityId(patientId);
  const normalizedJourneyStatus = normalizeJourneyStatus(journeyStatusInput);
  if (!normalizedPatientId) {
    if (normalizedJourneyStatus) {
      return {
        patientId: null,
        patientName: null,
        journeyStatus: normalizedJourneyStatus,
        source: 'request_body_journey_status',
        found: null,
      };
    }

    return {
      patientId: null,
      patientName: null,
      journeyStatus: null,
      source: 'not_provided',
      found: null,
    };
  }

  const db = client || pool;
  const hasStatusJornada = await hasPatientsStatusJornadaColumn(db);
  const patientQuery = hasStatusJornada
    ? `
        SELECT
          pa.id::text AS patient_id,
          pa.name AS patient_name,
          pa.status_jornada AS status_jornada
        FROM public.patients pa
        WHERE pa.id::text = $1
        LIMIT 1
      `
    : `
        SELECT
          pa.id::text AS patient_id,
          pa.name AS patient_name,
          NULL::text AS status_jornada
        FROM public.patients pa
        WHERE pa.id::text = $1
        LIMIT 1
      `;

  const result = await db.query(patientQuery, [normalizedPatientId]);
  const row = result.rows[0];
  if (!row) {
    return {
      patientId: normalizedPatientId,
      patientName: null,
      journeyStatus: null,
      source: 'patient_not_found',
      found: false,
    };
  }

  const journeyStatusFromPatient = normalizeJourneyStatus(row?.status_jornada || null);
  return {
    patientId: row?.patient_id || normalizedPatientId,
    patientName: row?.patient_name || null,
    journeyStatus: journeyStatusFromPatient,
    source: hasStatusJornada
      ? journeyStatusFromPatient
        ? 'patients.status_jornada'
        : 'patients.status_jornada_missing'
      : 'patients.status_jornada_column_unavailable',
    found: true,
  };
}

async function resolveAgendaWriteServiceContext({
  serviceId,
  serviceNameInput = null,
  client,
}) {
  const normalizedServiceId = normalizeEntityId(serviceId);
  const normalizedServiceName = normalizeOptionalText(serviceNameInput);

  if (normalizedServiceName) {
    return {
      serviceId: normalizedServiceId,
      serviceName: normalizedServiceName,
      source: 'request_body_service_name',
      found: normalizedServiceId ? null : true,
    };
  }

  if (!normalizedServiceId) {
    return {
      serviceId: null,
      serviceName: null,
      source: 'not_provided',
      found: null,
    };
  }

  const db = client || pool;
  const result = await db.query(
    `
      SELECT s.id::text AS service_id, s.name AS service_name
      FROM public.services s
      WHERE s.id::text = $1
      LIMIT 1
    `,
    [normalizedServiceId]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      serviceId: normalizedServiceId,
      serviceName: null,
      source: 'service_not_found',
      found: false,
    };
  }

  return {
    serviceId: row?.service_id || normalizedServiceId,
    serviceName: row?.service_name || null,
    source: 'services.catalog',
    found: true,
  };
}

async function resolveAgendaAppointmentContextById({
  appointmentId,
  professionalId,
  client,
}) {
  const normalizedAppointmentId = normalizeEntityId(appointmentId);
  const normalizedProfessionalId = normalizeEntityId(professionalId);
  if (!normalizedAppointmentId || !normalizedProfessionalId) {
    return null;
  }

  const db = client || pool;
  const hasStatusJornada = await hasPatientsStatusJornadaColumn(db);
  const patientJourneyProjection = hasStatusJornada
    ? 'pa.status_jornada AS status_jornada, pa.status_jornada AS journey_status,'
    : 'NULL::text AS status_jornada, NULL::text AS journey_status,';

  const result = await db.query(
    `
      SELECT
        a.id::text AS appointment_id,
        a.id::text AS id,
        a.professional_id::text AS professional_id,
        COALESCE(
          u.name,
          p.email,
          p.funcao,
          p.specialty,
          'Profissional ' || p.id::text
        ) AS professional_name,
        COALESCE(pr.nome, p.funcao, p.specialty) AS professional_role,
        p.specialty AS professional_specialty,
        a.appointment_date,
        to_char(a.appointment_time, 'HH24:MI') AS appointment_time,
        a.status AS appointment_status,
        a.status,
        a.notes,
        pa.id::text AS patient_id,
        pa.name AS patient_name,
        ${patientJourneyProjection}
        s.id::text AS service_id,
        s.name AS service_name,
        COALESCE(pr.nome, p.specialty, p.funcao, NULL) AS sector_responsible,
        COALESCE(
          u.name,
          p.email,
          p.funcao,
          p.specialty,
          NULL
        ) AS responsible_name
      FROM public.appointments a
      JOIN public.patients pa ON pa.id = a.patient_id
      JOIN public.professionals p ON p.id = a.professional_id
      LEFT JOIN public.professional_roles pr ON pr.id = p.role_id
      LEFT JOIN public.users u
        ON COALESCE(to_jsonb(p)->>'user_id_int', to_jsonb(p)->>'user_id') = u.id::text
      LEFT JOIN public.services s ON s.id = a.service_id
      WHERE a.id::text = $1
        AND a.professional_id::text = $2
      LIMIT 1
      FOR UPDATE
    `,
    [normalizedAppointmentId, normalizedProfessionalId]
  );

  return result.rows[0] || null;
}

function normalizeContractType(value, allowedContractTypes = DEFAULT_CONTRACT_TYPES) {
  const raw = normalizeText(value);
  if (!raw) return null;
  return allowedContractTypes.find((item) => normalizeText(item) === raw) || null;
}

function isValidDateValue(value) {
  if (!value) return true;
  const text = value.toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function normalizeWeeklyScale(
  value,
  defaultWeekScale = DEFAULT_WEEK_SCALE,
  defaultStartTime = DEFAULT_DAY_START_TIME,
  defaultEndTime = DEFAULT_DAY_END_TIME
) {
  const startDefaultMinutes = parseTimeToMinutes(defaultStartTime);
  const endDefaultMinutes = parseTimeToMinutes(defaultEndTime);

  const safeDefaultStart = startDefaultMinutes === null ? DEFAULT_DAY_START_TIME : defaultStartTime;
  const safeDefaultEnd = endDefaultMinutes === null ? DEFAULT_DAY_END_TIME : defaultEndTime;

  if (value === undefined || value === null || value === '') {
    const fallback = {};
    for (const key of SCALE_KEYS) {
      fallback[key] = {
        ativo: Boolean(defaultWeekScale[key]),
        inicio: safeDefaultStart,
        fim: safeDefaultEnd,
      };
    }
    return fallback;
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

  const normalized = {};
  for (const key of SCALE_KEYS) {
    const defaultDay = {
      ativo: Boolean(defaultWeekScale[key]),
      inicio: safeDefaultStart,
      fim: safeDefaultEnd,
    };

    const current = raw[key];
    if (current === undefined) {
      normalized[key] = defaultDay;
      continue;
    }

    if (typeof current === 'boolean') {
      normalized[key] = {
        ...defaultDay,
        ativo: current,
      };
      continue;
    }

    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }

    const activeValue =
      current.ativo !== undefined
        ? current.ativo
        : current.active !== undefined
          ? current.active
          : current.enabled !== undefined
            ? current.enabled
            : undefined;

    if (activeValue !== undefined && typeof activeValue !== 'boolean') {
      return null;
    }

    const inicioValue =
      typeof current.inicio === 'string'
        ? current.inicio.trim()
        : typeof current.start === 'string'
          ? current.start.trim()
          : defaultDay.inicio;

    const fimValue =
      typeof current.fim === 'string'
        ? current.fim.trim()
        : typeof current.end === 'string'
          ? current.end.trim()
          : defaultDay.fim;

    const inicioMinutes = parseTimeToMinutes(inicioValue);
    const fimMinutes = parseTimeToMinutes(fimValue);
    if (inicioMinutes === null || fimMinutes === null) {
      return null;
    }

    const ativo = typeof activeValue === 'boolean' ? activeValue : defaultDay.ativo;
    if (ativo && inicioMinutes >= fimMinutes) {
      return null;
    }

    normalized[key] = {
      ativo,
      inicio: inicioValue,
      fim: fimValue,
    };
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

async function fetchProfessionalRoleById(client, roleId) {
  if (!roleId) return null;
  const db = client || pool;
  const { rows } = await db.query(
    `
      SELECT id, nome, ativo
      FROM public.professional_roles
      WHERE id = $1
      LIMIT 1
    `,
    [roleId]
  );
  return rows[0] || null;
}

function validateProfessionalPayload(payload, options = {}) {
  const requireUserIdentity = options.requireUserIdentity ?? false;
  const allowedContractTypes = options.allowedContractTypes ?? DEFAULT_CONTRACT_TYPES;
  const defaultWeekScale = options.defaultWeekScale ?? DEFAULT_WEEK_SCALE;
  const defaultStartTime = options.defaultStartTime ?? DEFAULT_DAY_START_TIME;
  const defaultEndTime = options.defaultEndTime ?? DEFAULT_DAY_END_TIME;

  const name = (payload?.name || '').toString().trim();
  const email = (payload?.email || '').toString().trim().toLowerCase();
  const username = (payload?.username || '').toString().trim();
  const role = (payload?.role || 'UsuÃ¡rio').toString().trim() || 'UsuÃ¡rio';
  const phone = (payload?.phone || '').toString().trim() || null;
  const crp = (payload?.crp || '').toString().trim() || null;
  const specialty = (payload?.specialty || '').toString().trim() || null;
  const funcao = (payload?.funcao || '').toString().trim();
  const roleId = parsePositiveInteger(payload?.role_id);
  const tipoContrato = normalizeContractType(payload?.tipo_contrato, allowedContractTypes);
  const status = normalizeStatus(payload?.status || 'ATIVO');
  const weeklyScale = normalizeWeeklyScale(
    payload?.escala_semanal,
    defaultWeekScale,
    defaultStartTime,
    defaultEndTime
  );
  const weeklyHours = parsePositiveInteger(payload?.horas_semanais);
  const birthDate = payload?.data_nascimento ? payload.data_nascimento.toString().trim() : null;

  if (!name) {
    return { ok: false, message: 'Nome Ã© obrigatÃ³rio' };
  }

  if (
    payload?.role_id !== undefined &&
    payload?.role_id !== null &&
    payload?.role_id !== '' &&
    roleId === null
  ) {
    return { ok: false, message: 'role_id deve ser um inteiro positivo' };
  }

  if (!funcao && roleId === null) {
    return { ok: false, message: 'Funcao obrigatoria: informe role_id ou funcao' };
  }

  if (!tipoContrato) {
      return {
      ok: false,
      message: `tipo_contrato obrigatÃ³rio. Valores aceitos: ${allowedContractTypes.join(', ')}`,
    };
  }

  if (payload?.horas_semanais !== undefined && payload?.horas_semanais !== null && payload?.horas_semanais !== '' && weeklyHours === null) {
    return { ok: false, message: 'horas_semanais deve ser um inteiro positivo' };
  }

  if (birthDate && !isValidDateValue(birthDate)) {
    return { ok: false, message: 'data_nascimento invÃ¡lida. Use o formato YYYY-MM-DD' };
  }

  if (!weeklyScale) {
    return {
      ok: false,
      message:
        'escala_semanal invalida. Use seg/ter/qua/qui/sex como boolean ou objeto {ativo,inicio,fim}',
    };
  }

  if (!status) {
    return { ok: false, message: 'status invÃ¡lido. Use ATIVO ou INATIVO' };
  }

  if (requireUserIdentity && (!email || !username)) {
    return { ok: false, message: 'E-mail e username sÃ£o obrigatÃ³rios' };
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
      role_id: roleId,
      tipo_contrato: tipoContrato,
      status,
      escala_semanal: weeklyScale,
      horas_semanais: weeklyHours,
      data_nascimento: birthDate,
    },
  };
}

function normalizePermissionScopes(scopes) {
  if (!Array.isArray(scopes)) return [];
  return scopes
    .map((scope) => (typeof scope === 'string' ? scope.trim().toLowerCase() : ''))
    .filter(Boolean);
}

function hasPermissionScope(scopes, targetScope) {
  const normalizedTarget = (targetScope || '').toString().trim().toLowerCase();
  if (!normalizedTarget) return false;

  const normalizedScopes = normalizePermissionScopes(scopes);
  return (
    normalizedScopes.includes(normalizedTarget) ||
    normalizedScopes.includes('*') ||
    normalizedScopes.includes('*:*') ||
    normalizedScopes.includes('agenda:*')
  );
}

async function getAllowProfessionalViewOthers(client) {
  const db = client || pool;
  try {
    const { rows } = await db.query(
      'SELECT allow_professional_view_others FROM public.system_settings LIMIT 1'
    );
    return rows[0]?.allow_professional_view_others === true;
  } catch (error) {
    if (!['42703', '42P01'].includes(error?.code)) {
      console.error('[profissionais] Falha ao ler allow_professional_view_others:', error);
    }
    return false;
  }
}

async function getLinkedProfessionalByUserId(userId, client) {
  const db = client || pool;
  const normalizedUserId = (userId || '').toString().trim();
  if (!normalizedUserId) return null;

  const { rows } = await db.query(
    `
      SELECT p.id, p.status
      FROM public.professionals p
      WHERE COALESCE(
        to_jsonb(p)->>'user_id_int',
        to_jsonb(p)->>'user_id'
      ) = $1
      ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [normalizedUserId]
  );

  return rows[0] || null;
}

async function getProfessionalLinkColumn(client) {
  const db = client || pool;
  const { rows } = await db.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'professionals'
        AND column_name IN ('user_id_int', 'user_id')
      ORDER BY CASE column_name WHEN 'user_id_int' THEN 0 ELSE 1 END
      LIMIT 1
    `
  );

  return rows[0]?.column_name || null;
}

async function getColumnSqlType(client, tableName, columnName) {
  const db = client || pool;
  const { rows } = await db.query(
    `
      SELECT format_type(a.atttypid, a.atttypmod) AS sql_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = $1
        AND a.attname = $2
        AND a.attnum > 0
        AND NOT a.attisdropped
      LIMIT 1
    `,
    [tableName, columnName]
  );

  return rows[0]?.sql_type || null;
}

async function ensureProfessionalLinkRequestsSchema(client) {
  const db = client || pool;
  const usersIdType = (await getColumnSqlType(db, 'users', 'id')) || 'uuid';
  const professionalsIdType =
    (await getColumnSqlType(db, 'professionals', 'id')) || 'uuid';

  try {
    await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  } catch (error) {
    // Alguns ambientes nao permitem CREATE EXTENSION em runtime.
  }

  await db.query(
    `
      CREATE TABLE IF NOT EXISTS public.professional_link_requests (
        id uuid PRIMARY KEY,
        user_id ${usersIdType} NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        professional_id ${professionalsIdType} NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'pending',
        notes text NULL,
        decided_at timestamptz NULL,
        decided_by_user_id ${usersIdType} NULL REFERENCES public.users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT professional_link_requests_status_check
          CHECK (status IN ('pending', 'approved', 'rejected'))
      )
    `
  );

  await db.query(
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_professional_link_requests_user_pending
      ON public.professional_link_requests (user_id)
      WHERE status = 'pending'
    `
  );
  await db.query(
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_professional_link_requests_professional_pending
      ON public.professional_link_requests (professional_id)
      WHERE status = 'pending'
    `
  );

  await db.query(
    `
      CREATE INDEX IF NOT EXISTS idx_professional_link_requests_status_created_at
      ON public.professional_link_requests (status, created_at DESC)
    `
  );
}

function denyIfManualLinkRequiresAdmin(accessSettings, req, res) {
  if (accessSettings.link_policy !== 'MANUAL_LINK_ADMIN') {
    return false;
  }

  if (isAdminUser(req.user)) {
    return false;
  }

  res.status(403).json({
    success: false,
    message: 'Apenas administradores podem vincular ou desvincular usuarios nesta politica.',
  });
  return true;
}

function normalizeLinkRequestStatus(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (['pending', 'approved', 'rejected'].includes(normalized)) {
    return normalized;
  }
  return null;
}

async function resolveAgendaAccessContext(user, client) {
  const db = client || pool;
  const linkedProfessional = await getLinkedProfessionalByUserId(user?.id, db);
  const allowProfessionalViewOthers = await getAllowProfessionalViewOthers(db);
  const canViewAllByPermission = hasPermissionScope(
    user?.permissions,
    'agenda:view_all_professionals'
  );

  return {
    linkedProfessionalId: linkedProfessional?.id || null,
    linkedProfessionalStatus: linkedProfessional?.status || null,
    allowProfessionalViewOthers,
    canViewAllByPermission,
    canViewOtherProfessionals:
      Boolean(linkedProfessional?.id) &&
      allowProfessionalViewOthers &&
      canViewAllByPermission,
  };
}

// Criar novo profissional (cria usuÃ¡rio + vÃ­nculo)
router.post('/', authorize('profissionais', 'create'), async (req, res) => {
  const client = await pool.connect();
  try {
    const accessSettings = await readAccessSettingsSafe('profissionais:create');
    const runtimeConfig = await getProfessionalsRuntimeConfig();
    const validation = validateProfessionalPayload(req.body, {
      requireUserIdentity: accessSettings.allow_create_user_from_professional === true,
      allowedContractTypes: runtimeConfig.allowedContractTypes,
      defaultWeekScale: runtimeConfig.defaultWeekScale,
      defaultStartTime: runtimeConfig.defaultStartTime,
      defaultEndTime: runtimeConfig.defaultEndTime,
    });
    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const payload = validation.data;
    const normalizedEmail = (payload.email || '').toString().trim().toLowerCase();

    await client.query('BEGIN');

    const linkColumn = await getProfessionalLinkColumn(client);
    if (!linkColumn) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        success: false,
        message: 'Nao foi possivel identificar coluna de vinculo em professionals',
      });
    }

    let selectedRole = null;
    if (payload.role_id !== null) {
      selectedRole = await fetchProfessionalRoleById(client, payload.role_id);
      if (!selectedRole) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Funcao selecionada nao encontrada' });
      }
      if (!selectedRole.ativo) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Funcao selecionada esta inativa' });
      }
    }

    const resolvedFuncao = payload.funcao || selectedRole?.nome || null;

    if (accessSettings.block_duplicate_email && normalizedEmail) {
      const duplicateProfessionalEmail = await client.query(
        'SELECT id FROM public.professionals WHERE LOWER(COALESCE(email, \'\')) = LOWER($1) LIMIT 1',
        [normalizedEmail]
      );
      if (duplicateProfessionalEmail.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'Ja existe profissional com este e-mail.' });
      }
    }

    let user = null;
    if (accessSettings.allow_create_user_from_professional) {
      const duplicateUsername = await client.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
        [payload.username]
      );
      if (duplicateUsername.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'Username ja existe.' });
      }

      if (accessSettings.block_duplicate_email && normalizedEmail) {
        const duplicateUserEmail = await client.query(
          'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
          [normalizedEmail]
        );
        if (duplicateUserEmail.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ success: false, message: 'E-mail ja existe.' });
        }
      }

      const hashedPassword = await bcrypt.hash('123456', 10);
      const userResult = await client.query(
        'INSERT INTO users (username, email, name, phone, role, status, first_access, password) ' +
          'VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ' +
          'RETURNING id, username, email, name, role, status',
        [
          payload.username,
          normalizedEmail || null,
          payload.name,
          payload.phone,
          payload.role,
          'ativo',
          true,
          hashedPassword,
        ]
      );
      user = userResult.rows[0] || null;
    }

    const professionalInsertSql =
      'INSERT INTO professionals (' +
      linkColumn +
      ', crp, specialty, phone, email, status, role_id, funcao, horas_semanais, data_nascimento, tipo_contrato, escala_semanal) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb) RETURNING *';

    const profResult = await client.query(professionalInsertSql, [
      user?.id || null,
      payload.crp,
      payload.specialty,
      payload.phone,
      normalizedEmail || null,
      payload.status,
      payload.role_id,
      resolvedFuncao,
      payload.horas_semanais,
      payload.data_nascimento,
      payload.tipo_contrato,
      JSON.stringify(payload.escala_semanal),
    ]);

    await client.query('COMMIT');

    return res.json({
      success: true,
      professional: {
        ...profResult.rows[0],
        role_id: profResult.rows[0]?.role_id ?? payload.role_id ?? null,
        role_nome: selectedRole?.nome ?? resolvedFuncao,
        user_name: user?.name || null,
        user_email: user?.email || null,
        user_role: user?.role || null,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') {
      const constraint = (error?.constraint || '').toString().toLowerCase();
      if (constraint.includes('users_email')) {
        return res.status(409).json({ success: false, message: 'E-mail ja existe.' });
      }
      if (constraint.includes('users_username')) {
        return res.status(409).json({ success: false, message: 'Username ja existe.' });
      }
      if (constraint.includes('professionals_user_id')) {
        return res.status(409).json({ success: false, message: 'Usuario ja vinculado a outro profissional.' });
      }
      return res.status(409).json({ success: false, message: 'Conflito ao criar profissional.' });
    }

    console.error('Erro ao criar profissional:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao criar profissional' });
  } finally {
    client.release();
  }
});

// Lista profissionais + dados do usuÃ¡rio vinculado e carga do dia
router.get('/', authorizeProfessionalsListView, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const forAgenda =
    ['1', 'true', 'sim', 'yes'].includes(
      (req.query.for_agenda || '').toString().trim().toLowerCase()
    );

  try {
    const accessContext = forAgenda
      ? await resolveAgendaAccessContext(req.user, pool)
      : null;

    const query = `
      WITH agenda_hoje AS (
        SELECT professional_id, COUNT(*)::int AS total
        FROM appointments
        WHERE appointment_date = $1
        GROUP BY professional_id
      )
      SELECT
        p.id,
        p.crp,
        p.specialty,
        p.phone,
        p.email,
        p.status,
        p.role_id,
        p.funcao,
        p.horas_semanais,
        p.data_nascimento,
        p.tipo_contrato,
        p.escala_semanal,
        COALESCE(pr.nome, p.funcao) AS role_nome,
        u.id::text AS linked_user_id,
        COALESCE(u.name, p.email, '') AS user_name,
        COALESCE(u.email, p.email) AS user_email,
        COALESCE(u.role, 'Usuario') AS user_role,
        COALESCE(u.status, 'ativo') AS user_status,
        COALESCE(u.username, split_part(COALESCE(p.email, ''), '@', 1)) AS user_username,
        COALESCE(a.total, 0) AS agenda_hoje
      FROM professionals p
      LEFT JOIN public.professional_roles pr ON pr.id = p.role_id
      LEFT JOIN public.users u
        ON COALESCE(to_jsonb(p)->>'user_id_int', to_jsonb(p)->>'user_id') = u.id::text
      LEFT JOIN agenda_hoje a ON a.professional_id = p.id
      ORDER BY COALESCE(u.name, p.email, '') NULLS LAST, p.created_at DESC;
    `;

    const result = await pool.query(query, [date]);
    let professionals = Array.isArray(result.rows) ? result.rows : [];

    if (
      forAgenda &&
      accessContext?.linkedProfessionalId &&
      !accessContext.canViewOtherProfessionals
    ) {
      professionals = professionals.filter(
        (item) => String(item.id) === String(accessContext.linkedProfessionalId)
      );
    }

    if (forAgenda) {
      professionals = professionals.map((item) => ({
        id: item.id,
        user_name: item.user_name,
        role_nome: item.role_nome,
        funcao: item.funcao,
        status: item.status,
      }));
    }

    const agendaReadAccess = forAgenda
      ? req.agendaReadAccess || resolveAgendaReadAccess(req.user)
      : null;

    res.json({
      success: true,
      professionals,
      ...(forAgenda
        ? {
            scope: buildAgendaScopePayload(agendaReadAccess),
          }
        : {}),
    });
  } catch (error) {
    console.error('Erro ao listar profissionais:', error);
    res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao listar profissionais',
      professionals: [],
    });
  }
});

// Lista usuarios elegiveis para vinculo (ativos e sem vinculo, incluindo o atual se houver)
router.get('/linkable-users', authorize('profissionais', 'edit'), async (req, res) => {
  const professionalId = (req.query?.professional_id || req.query?.professionalId || '')
    .toString()
    .trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (professionalId) {
      const professionalExists = await client.query(
        'SELECT id FROM public.professionals WHERE id = $1 LIMIT 1 FOR UPDATE',
        [professionalId]
      );
      if (professionalExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Profissional nao encontrado',
        });
      }
    }

    const params = [];
    const professionalFilter = professionalId
      ? (() => {
          params.push(professionalId);
          return 'OR p.id = $1';
        })()
      : '';
    const includeCurrentLinkedFilter = professionalId
      ? (() => {
          params.push(professionalId);
          return 'OR p.id = $2';
        })()
      : '';

    const usersResult = await client.query(
      `
        SELECT
          u.id::text AS id,
          u.name,
          u.email,
          u.username,
          u.status,
          p.id::text AS professional_id
        FROM public.users u
        LEFT JOIN public.professionals p
          ON COALESCE(
            to_jsonb(p)->>'user_id_int',
            to_jsonb(p)->>'user_id'
          ) = u.id::text
        WHERE u.deleted_at IS NULL
          AND (
            p.id IS NULL
            ${professionalFilter}
          )
          AND (
            LOWER(COALESCE(u.status, '')) = 'ativo'
            ${includeCurrentLinkedFilter}
          )
        ORDER BY u.name ASC, u.email ASC
      `,
      params
    );

    await client.query('COMMIT');
    return res.json({
      success: true,
      users: usersResult.rows,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao listar usuarios elegiveis para vinculo:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar usuarios elegiveis para vinculo',
    });
  } finally {
    client.release();
  }
});
// Atualizar profissional (dados principais)
router.put('/:id', authorize('profissionais', 'edit'), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const accessSettings = await readAccessSettingsSafe('profissionais:update');
    const existingResult = await client.query(
      `SELECT
         p.*,
         COALESCE(pr.nome, p.funcao) AS role_nome,
         u.id::text AS linked_user_id,
         COALESCE(u.name, p.email, '') AS user_name,
         COALESCE(u.email, p.email) AS user_email,
         COALESCE(u.username, split_part(COALESCE(p.email, ''), '@', 1)) AS user_username,
         COALESCE(u.role, 'Usuario') AS user_role,
         COALESCE(u.status, 'ativo') AS user_status
       FROM professionals p
       LEFT JOIN public.professional_roles pr ON pr.id = p.role_id
       LEFT JOIN public.users u
         ON COALESCE(to_jsonb(p)->>'user_id_int', to_jsonb(p)->>'user_id') = u.id::text
       WHERE p.id = $1`,
      [id]
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profissional nÃ£o encontrado' });
    }

    const existing = existingResult.rows[0];
    const mergedPayload = {
      ...req.body,
      name: req.body?.name ?? existing.user_name,
      email: req.body?.email ?? existing.user_email ?? existing.email,
      username: req.body?.username ?? existing.user_username,
      role: req.body?.role ?? existing.user_role ?? 'UsuÃ¡rio',
      phone: req.body?.phone ?? existing.phone,
      crp: req.body?.crp ?? existing.crp,
      specialty: req.body?.specialty ?? existing.specialty,
      role_id: req.body?.role_id ?? existing.role_id ?? null,
      funcao: req.body?.funcao ?? existing.role_nome ?? existing.funcao ?? existing.specialty,
      horas_semanais: req.body?.horas_semanais ?? existing.horas_semanais,
      data_nascimento: req.body?.data_nascimento ?? existing.data_nascimento,
      tipo_contrato: req.body?.tipo_contrato ?? existing.tipo_contrato,
      escala_semanal: req.body?.escala_semanal ?? existing.escala_semanal,
      status: req.body?.status ?? existing.status,
    };

    const runtimeConfig = await getProfessionalsRuntimeConfig();
    const validation = validateProfessionalPayload(mergedPayload, {
      requireUserIdentity: Boolean(existing.linked_user_id),
      allowedContractTypes: runtimeConfig.allowedContractTypes,
      defaultWeekScale: runtimeConfig.defaultWeekScale,
      defaultStartTime: runtimeConfig.defaultStartTime,
      defaultEndTime: runtimeConfig.defaultEndTime,
    });

    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const payload = validation.data;

    await client.query('BEGIN');

    let selectedRole = null;
    if (payload.role_id !== null) {
      selectedRole = await fetchProfessionalRoleById(client, payload.role_id);
      if (!selectedRole) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Funcao selecionada nao encontrada' });
      }
      if (!selectedRole.ativo && payload.role_id !== existing.role_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Funcao selecionada esta inativa' });
      }
    }

    const resolvedFuncao =
      payload.funcao ||
      selectedRole?.nome ||
      existing.role_nome ||
      existing.funcao ||
      existing.specialty ||
      null;

    if (accessSettings.block_duplicate_email && payload.email) {
      const duplicateProfessionalEmail = await client.query(
        `
          SELECT id
          FROM public.professionals
          WHERE id <> $1
            AND LOWER(COALESCE(email, '')) = LOWER($2)
          LIMIT 1
        `,
        [id, payload.email]
      );
      if (duplicateProfessionalEmail.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Ja existe profissional com este e-mail.',
        });
      }
    }

    if (existing.linked_user_id) {
      const duplicateClauses = ['LOWER(username) = LOWER($2)'];
      const duplicateParams = [existing.linked_user_id, payload.username];

      if (accessSettings.block_duplicate_email && payload.email) {
        duplicateParams.push(payload.email);
        duplicateClauses.push(`LOWER(email) = LOWER($${duplicateParams.length})`);
      }

      const duplicateIdentity = await client.query(
        `
          SELECT 1
          FROM users
          WHERE id <> $1
            AND (${duplicateClauses.join(' OR ')})
          LIMIT 1
        `,
        duplicateParams
      );

      if (duplicateIdentity.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: accessSettings.block_duplicate_email
            ? 'Username ou e-mail ja existe.'
            : 'Username ja existe.',
        });
      }

      await client.query(
        `UPDATE users
         SET name = $1,
             email = $2,
             username = $3,
             phone = $4,
             role = $5
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
           role_id = $6,
           funcao = $7,
           horas_semanais = $8,
           data_nascimento = $9,
           tipo_contrato = $10,
           escala_semanal = $11::jsonb,
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        payload.crp,
        payload.specialty,
        payload.phone,
        payload.email,
        payload.status,
        payload.role_id,
        resolvedFuncao,
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
        role_id: updatedProfessional.rows[0]?.role_id ?? payload.role_id ?? null,
        role_nome: selectedRole?.nome ?? resolvedFuncao,
        user_name: updatedUser?.name ?? existing.user_name,
        user_email: updatedUser?.email ?? existing.user_email,
        user_role: updatedUser?.role ?? existing.user_role,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') {
      const constraint = (error?.constraint || '').toString().toLowerCase();
      if (constraint.includes('users_email')) {
        return res.status(409).json({ success: false, message: 'E-mail ja existe.' });
      }
      if (constraint.includes('users_username')) {
        return res.status(409).json({ success: false, message: 'Username ja existe.' });
      }
      if (constraint.includes('professionals_email')) {
        return res.status(409).json({
          success: false,
          message: 'Ja existe profissional com este e-mail.',
        });
      }
      return res.status(409).json({ success: false, message: 'Conflito ao atualizar profissional.' });
    }
    console.error('Erro ao atualizar profissional:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao atualizar profissional' });
  } finally {
    client.release();
  }
});

// Excluir profissional (hard delete quando sem vinculos historicos)
router.delete('/:id', authorize('profissionais', 'status'), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const professionalLockResult = await client.query(
      `SELECT
         id,
         email,
         COALESCE(
           to_jsonb(professionals)->>'user_id_int',
           to_jsonb(professionals)->>'user_id'
         ) AS linked_user_candidate
       FROM professionals
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (professionalLockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Profissional nao encontrado' });
    }

    const lockedProfessional = professionalLockResult.rows[0];

    const linkedUserId = lockedProfessional?.linked_user_candidate || null;

    const depsResult = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM appointments WHERE professional_id = $1) AS appointments,
         (SELECT COUNT(*)::int FROM evaluations WHERE professional_id = $1) AS evaluations,
         (SELECT COUNT(*)::int FROM interviews WHERE professional_id = $1) AS interviews`,
      [id]
    );

    const deps = depsResult.rows[0] || {};
    const appointments = Number(deps.appointments || 0);
    const evaluations = Number(deps.evaluations || 0);
    const interviews = Number(deps.interviews || 0);
    const totalDependencies = appointments + evaluations + interviews;

    if (totalDependencies > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message:
          `Nao foi possivel excluir: existem vinculos historicos (agendamentos: ${appointments}, ` +
          `avaliacoes: ${evaluations}, entrevistas: ${interviews}).`,
      });
    }

    await client.query('DELETE FROM professionals WHERE id = $1', [id]);

    if (linkedUserId) {
      await client.query('UPDATE users SET status = $1 WHERE id = $2', ['inativo', linkedUserId]);
    }

    await client.query('COMMIT');
    return res.json({ success: true, message: 'Profissional excluido com sucesso' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao excluir profissional:', error);

    if (error?.code === '23503') {
      return res.status(409).json({
        success: false,
        message: 'Nao foi possivel excluir este profissional porque existem registros vinculados.',
      });
    }

    return res.status(500).json({ success: false, message: error?.message || 'Erro ao excluir profissional' });
  } finally {
    client.release();
  }
});

// Atualizar somente status (soft disable)
router.patch('/:id/status', authorize('profissionais', 'status'), async (req, res) => {
  const { id } = req.params;
  const status = normalizeStatus(req.body?.status);

  if (!status) {
    return res.status(400).json({ success: false, message: 'status invÃ¡lido. Use ATIVO ou INATIVO' });
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
      return res.status(404).json({ success: false, message: 'Profissional nÃ£o encontrado' });
    }

    return res.json({ success: true, professional: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar status do profissional:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao atualizar status' });
  }
});

router.patch('/:id/link-user', authorize('profissionais', 'edit'), async (req, res) => {
  const professionalId = (req.params?.id || '').toString().trim();
  const userIdRaw = req.body?.userId ?? req.body?.user_id ?? '';
  const userIdText = userIdRaw === null || userIdRaw === undefined
    ? ''
    : userIdRaw.toString().trim();

  if (!professionalId) {
    return res.status(400).json({
      success: false,
      message: 'professionalId invalido',
    });
  }

  if (!userIdText) {
    return res.status(400).json({
      success: false,
      message: 'userId e obrigatorio',
    });
  }

  const accessSettings = await readAccessSettingsSafe('profissionais:link-user');
  if (denyIfManualLinkRequiresAdmin(accessSettings, req, res)) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const linkColumn = await getProfessionalLinkColumn(client);
    if (!linkColumn) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        success: false,
        message: 'Nao foi possivel identificar coluna de vinculo em professionals',
      });
    }

    const professionalResult = await client.query(
      `
        SELECT
          p.id,
          COALESCE(
            to_jsonb(p)->>'user_id_int',
            to_jsonb(p)->>'user_id'
          ) AS linked_user_id
        FROM public.professionals p
        WHERE p.id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [professionalId]
    );
    if (professionalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Profissional nao encontrado',
      });
    }

    const userResult = await client.query(
      `
        SELECT id, name, email, status
        FROM public.users
        WHERE id::text = $1
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [userIdText]
    );
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Usuario nao encontrado',
      });
    }

    const user = userResult.rows[0];
    const currentProfessional = professionalResult.rows[0];
    if (
      currentProfessional.linked_user_id &&
      String(currentProfessional.linked_user_id) !== String(user.id)
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Profissional ja vinculado a outro usuario',
      });
    }

    const alreadyLinkedElsewhere = await client.query(
      `
        SELECT p.id
        FROM public.professionals p
        WHERE p.id <> $2
          AND COALESCE(
            to_jsonb(p)->>'user_id_int',
            to_jsonb(p)->>'user_id'
          ) = $1
        LIMIT 1
      `,
      [String(user.id), professionalId]
    );
    if (alreadyLinkedElsewhere.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Usuario ja vinculado a outro profissional',
      });
    }

    await client.query(
      `
        UPDATE public.professionals
        SET ${linkColumn} = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [user.id, professionalId]
    );

    await client.query('COMMIT');
    return res.json({
      success: true,
      message: 'Vinculo atualizado com sucesso',
      link: {
        professional_id: professionalId,
        user_id: String(user.id),
      },
      user: {
        id: String(user.id),
        name: user.name,
        email: user.email,
        status: user.status,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao vincular usuario ao profissional:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao vincular usuario ao profissional',
    });
  } finally {
    client.release();
  }
});

router.patch('/:id/unlink-user', authorize('profissionais', 'edit'), async (req, res) => {
  const professionalId = (req.params?.id || '').toString().trim();

  if (!professionalId) {
    return res.status(400).json({
      success: false,
      message: 'professionalId invalido',
    });
  }

  const accessSettings = await readAccessSettingsSafe('profissionais:unlink-user');
  if (denyIfManualLinkRequiresAdmin(accessSettings, req, res)) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const linkColumn = await getProfessionalLinkColumn(client);
    if (!linkColumn) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        success: false,
        message: 'Nao foi possivel identificar coluna de vinculo em professionals',
      });
    }

    const professionalResult = await client.query(
      `
        SELECT
          p.id,
          COALESCE(
            to_jsonb(p)->>'user_id_int',
            to_jsonb(p)->>'user_id'
          ) AS linked_user_id
        FROM public.professionals p
        WHERE p.id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [professionalId]
    );

    if (professionalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Profissional nao encontrado',
      });
    }

    const linkedUserId = professionalResult.rows[0]?.linked_user_id
      ? String(professionalResult.rows[0].linked_user_id)
      : null;

    if (!linkedUserId) {
      await client.query('COMMIT');
      return res.json({
        success: true,
        message: 'Profissional ja estava sem usuario vinculado',
        link: {
          professional_id: professionalId,
          user_id: null,
        },
      });
    }

    await client.query(
      `
        UPDATE public.professionals
        SET ${linkColumn} = NULL,
            updated_at = NOW()
        WHERE id = $1
      `,
      [professionalId]
    );

    await client.query('COMMIT');
    return res.json({
      success: true,
      message: 'Vinculo removido com sucesso',
      link: {
        professional_id: professionalId,
        user_id: null,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao desvincular usuario do profissional:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao desvincular usuario do profissional',
    });
  } finally {
    client.release();
  }
});

router.post('/:id/link-requests', authorize('profissionais', 'view'), async (req, res) => {
  const professionalId = (req.params?.id || '').toString().trim();
  const requesterUserId = (req.user?.id || '').toString().trim();
  const notesRaw = req.body?.notes;
  const notes =
    typeof notesRaw === 'string' && notesRaw.trim().length > 0
      ? notesRaw.trim().slice(0, 1000)
      : null;

  if (!professionalId) {
    return res.status(400).json({
      success: false,
      message: 'professionalId invalido',
    });
  }

  if (!requesterUserId) {
    return res.status(401).json({
      success: false,
      message: 'Usuario autenticado invalido',
    });
  }

  const accessSettings = await readAccessSettingsSafe('profissionais:link-request:create');
  if (accessSettings.link_policy !== 'SELF_CLAIM_WITH_APPROVAL') {
    return res.status(403).json({
      success: false,
      message: 'Solicitacao de vinculo desativada pela politica atual.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureProfessionalLinkRequestsSchema(client);

    const linkColumn = await getProfessionalLinkColumn(client);
    if (!linkColumn) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        success: false,
        message: 'Nao foi possivel identificar coluna de vinculo em professionals',
      });
    }

    const userResult = await client.query(
      `
        SELECT id, name, email
        FROM public.users
        WHERE id::text = $1
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [requesterUserId]
    );
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Usuario nao encontrado',
      });
    }

    const professionalResult = await client.query(
      `
        SELECT
          p.id,
          COALESCE(
            to_jsonb(p)->>'user_id_int',
            to_jsonb(p)->>'user_id'
          ) AS linked_user_id
        FROM public.professionals p
        WHERE p.id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [professionalId]
    );
    if (professionalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Profissional nao encontrado',
      });
    }

    const professional = professionalResult.rows[0];
    if (
      professional.linked_user_id &&
      String(professional.linked_user_id) !== requesterUserId
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Profissional ja vinculado a outro usuario.',
      });
    }

    if (String(professional.linked_user_id || '') === requesterUserId) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Usuario ja esta vinculado a este profissional.',
      });
    }

    const userLinkedElsewhere = await client.query(
      `
        SELECT p.id
        FROM public.professionals p
        WHERE COALESCE(
          to_jsonb(p)->>'user_id_int',
          to_jsonb(p)->>'user_id'
        ) = $1
          AND p.id <> $2
        LIMIT 1
      `,
      [requesterUserId, professionalId]
    );
    if (userLinkedElsewhere.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Usuario ja vinculado a outro profissional.',
      });
    }

    const inserted = await client.query(
      `
        INSERT INTO public.professional_link_requests (
          id,
          user_id,
          professional_id,
          status,
          notes
        )
        VALUES ($1, $2, $3, 'pending', $4)
        RETURNING id::text AS id,
                  user_id::text AS user_id,
                  professional_id::text AS professional_id,
                  status,
                  notes,
                  created_at,
                  updated_at
      `,
      [randomUUID(), requesterUserId, professionalId, notes]
    );

    await client.query('COMMIT');
    return res.status(201).json({
      success: true,
      message: 'Solicitacao de vinculo enviada com sucesso.',
      request: inserted.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') {
      const constraint = (error?.constraint || '').toString().toLowerCase();
      if (constraint.includes('idx_professional_link_requests_user_pending')) {
        return res.status(409).json({
          success: false,
          message: 'Voce ja possui uma solicitacao pendente.',
        });
      }
      if (constraint.includes('idx_professional_link_requests_professional_pending')) {
        return res.status(409).json({
          success: false,
          message: 'Este profissional ja possui solicitacao pendente.',
        });
      }
    }

    console.error('Erro ao criar solicitacao de vinculo:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao criar solicitacao de vinculo',
    });
  } finally {
    client.release();
  }
});

router.get('/link-requests', authorize('profissionais', 'edit'), async (req, res) => {
  const accessSettings = await readAccessSettingsSafe('profissionais:link-request:list');
  if (accessSettings.link_policy !== 'SELF_CLAIM_WITH_APPROVAL') {
    return res.status(403).json({
      success: false,
      message: 'Solicitacoes de vinculo desativadas pela politica atual.',
    });
  }

  if (!isAdminUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Apenas administradores podem listar solicitacoes de vinculo.',
    });
  }

  const requestedStatus = normalizeLinkRequestStatus(req.query?.status);
  if (req.query?.status !== undefined && !requestedStatus) {
    return res.status(400).json({
      success: false,
      message: 'status invalido. Use pending, approved ou rejected.',
    });
  }

  const client = await pool.connect();
  try {
    await ensureProfessionalLinkRequestsSchema(client);

    const where = requestedStatus ? 'WHERE lr.status = $1' : '';
    const params = requestedStatus ? [requestedStatus] : [];

    const { rows } = await client.query(
      `
        SELECT
          lr.id::text AS id,
          lr.user_id::text AS user_id,
          lr.professional_id::text AS professional_id,
          lr.status,
          lr.notes,
          lr.created_at,
          lr.updated_at,
          lr.decided_at,
          lr.decided_by_user_id::text AS decided_by_user_id,
          u.name AS user_name,
          u.email AS user_email,
          COALESCE(pr.nome, p.funcao, p.specialty, p.email, 'Profissional') AS professional_name,
          p.email AS professional_email,
          d.name AS decided_by_name
        FROM public.professional_link_requests lr
        LEFT JOIN public.users u ON u.id = lr.user_id
        LEFT JOIN public.professionals p ON p.id = lr.professional_id
        LEFT JOIN public.professional_roles pr ON pr.id = p.role_id
        LEFT JOIN public.users d ON d.id = lr.decided_by_user_id
        ${where}
        ORDER BY lr.created_at ASC
      `,
      params
    );

    return res.json({
      success: true,
      requests: rows,
    });
  } catch (error) {
    console.error('Erro ao listar solicitacoes de vinculo:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar solicitacoes de vinculo',
    });
  } finally {
    client.release();
  }
});

router.patch('/link-requests/:id/approve', authorize('profissionais', 'edit'), async (req, res) => {
  const requestId = (req.params?.id || '').toString().trim();
  const decidedByUserId = (req.user?.id || '').toString().trim();
  const notesRaw = req.body?.notes;
  const notes =
    typeof notesRaw === 'string' && notesRaw.trim().length > 0
      ? notesRaw.trim().slice(0, 1000)
      : null;

  if (!requestId) {
    return res.status(400).json({
      success: false,
      message: 'requestId invalido',
    });
  }

  const accessSettings = await readAccessSettingsSafe('profissionais:link-request:approve');
  if (accessSettings.link_policy !== 'SELF_CLAIM_WITH_APPROVAL') {
    return res.status(403).json({
      success: false,
      message: 'Solicitacoes de vinculo desativadas pela politica atual.',
    });
  }

  if (!isAdminUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Apenas administradores podem aprovar solicitacoes de vinculo.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureProfessionalLinkRequestsSchema(client);

    const linkColumn = await getProfessionalLinkColumn(client);
    if (!linkColumn) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        success: false,
        message: 'Nao foi possivel identificar coluna de vinculo em professionals',
      });
    }

    const requestResult = await client.query(
      `
        SELECT
          lr.id::text AS id,
          lr.user_id::text AS user_id,
          lr.professional_id::text AS professional_id,
          lr.status
        FROM public.professional_link_requests lr
        WHERE lr.id::text = $1
        LIMIT 1
        FOR UPDATE
      `,
      [requestId]
    );
    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Solicitacao de vinculo nao encontrada',
      });
    }

    const requestRow = requestResult.rows[0];
    if (requestRow.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Esta solicitacao ja foi decidida.',
      });
    }

    const userResult = await client.query(
      `
        SELECT id
        FROM public.users
        WHERE id::text = $1
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [requestRow.user_id]
    );
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Usuario da solicitacao nao encontrado',
      });
    }

    const professionalResult = await client.query(
      `
        SELECT
          p.id,
          COALESCE(
            to_jsonb(p)->>'user_id_int',
            to_jsonb(p)->>'user_id'
          ) AS linked_user_id
        FROM public.professionals p
        WHERE p.id::text = $1
        LIMIT 1
        FOR UPDATE
      `,
      [requestRow.professional_id]
    );
    if (professionalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Profissional da solicitacao nao encontrado',
      });
    }

    const currentProfessional = professionalResult.rows[0];
    if (
      currentProfessional.linked_user_id &&
      String(currentProfessional.linked_user_id) !== String(requestRow.user_id)
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Profissional ja vinculado a outro usuario.',
      });
    }

    const userLinkedElsewhere = await client.query(
      `
        SELECT p.id
        FROM public.professionals p
        WHERE p.id::text <> $2
          AND COALESCE(
            to_jsonb(p)->>'user_id_int',
            to_jsonb(p)->>'user_id'
          ) = $1
        LIMIT 1
      `,
      [requestRow.user_id, requestRow.professional_id]
    );
    if (userLinkedElsewhere.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Usuario ja vinculado a outro profissional.',
      });
    }

    if (!currentProfessional.linked_user_id) {
      const linkResult = await client.query(
        `
          UPDATE public.professionals
          SET ${linkColumn} = $1,
              updated_at = NOW()
          WHERE id::text = $2
            AND COALESCE(
              to_jsonb(professionals)->>'user_id_int',
              to_jsonb(professionals)->>'user_id'
            ) IS NULL
        `,
        [requestRow.user_id, requestRow.professional_id]
      );

      if (linkResult.rowCount !== 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Nao foi possivel efetivar o vinculo por conflito concorrente.',
        });
      }
    }

    const approvedResult = await client.query(
      `
        UPDATE public.professional_link_requests
        SET status = 'approved',
            notes = COALESCE($2, notes),
            decided_at = NOW(),
            decided_by_user_id = $3,
            updated_at = NOW()
        WHERE id::text = $1
        RETURNING id::text AS id,
                  user_id::text AS user_id,
                  professional_id::text AS professional_id,
                  status,
                  notes,
                  created_at,
                  updated_at,
                  decided_at,
                  decided_by_user_id::text AS decided_by_user_id
      `,
      [requestId, notes, decidedByUserId || null]
    );

    await client.query('COMMIT');
    return res.json({
      success: true,
      message: 'Solicitacao aprovada e vinculo efetivado.',
      request: approvedResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') {
      const constraint = (error?.constraint || '').toString().toLowerCase();
      if (constraint.includes('professionals_user_id')) {
        return res.status(409).json({
          success: false,
          message: 'Usuario ja vinculado a outro profissional.',
        });
      }
    }

    console.error('Erro ao aprovar solicitacao de vinculo:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao aprovar solicitacao de vinculo',
    });
  } finally {
    client.release();
  }
});

router.patch('/link-requests/:id/reject', authorize('profissionais', 'edit'), async (req, res) => {
  const requestId = (req.params?.id || '').toString().trim();
  const decidedByUserId = (req.user?.id || '').toString().trim();
  const notesRaw = req.body?.notes;
  const notes =
    typeof notesRaw === 'string' && notesRaw.trim().length > 0
      ? notesRaw.trim().slice(0, 1000)
      : null;

  if (!requestId) {
    return res.status(400).json({
      success: false,
      message: 'requestId invalido',
    });
  }

  const accessSettings = await readAccessSettingsSafe('profissionais:link-request:reject');
  if (accessSettings.link_policy !== 'SELF_CLAIM_WITH_APPROVAL') {
    return res.status(403).json({
      success: false,
      message: 'Solicitacoes de vinculo desativadas pela politica atual.',
    });
  }

  if (!isAdminUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Apenas administradores podem rejeitar solicitacoes de vinculo.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureProfessionalLinkRequestsSchema(client);

    const requestResult = await client.query(
      `
        SELECT id::text AS id, status
        FROM public.professional_link_requests
        WHERE id::text = $1
        LIMIT 1
        FOR UPDATE
      `,
      [requestId]
    );
    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Solicitacao de vinculo nao encontrada',
      });
    }

    if (requestResult.rows[0].status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Esta solicitacao ja foi decidida.',
      });
    }

    const rejectedResult = await client.query(
      `
        UPDATE public.professional_link_requests
        SET status = 'rejected',
            notes = COALESCE($2, notes),
            decided_at = NOW(),
            decided_by_user_id = $3,
            updated_at = NOW()
        WHERE id::text = $1
        RETURNING id::text AS id,
                  user_id::text AS user_id,
                  professional_id::text AS professional_id,
                  status,
                  notes,
                  created_at,
                  updated_at,
                  decided_at,
                  decided_by_user_id::text AS decided_by_user_id
      `,
      [requestId, notes, decidedByUserId || null]
    );

    await client.query('COMMIT');
    return res.json({
      success: true,
      message: 'Solicitacao rejeitada.',
      request: rejectedResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao rejeitar solicitacao de vinculo:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao rejeitar solicitacao de vinculo',
    });
  } finally {
    client.release();
  }
});

router.get('/me', authorizeAgendaRead, async (req, res) => {
  try {
    const accessContext = await resolveAgendaAccessContext(req.user, pool);
    const agendaReadAccess = req.agendaReadAccess || resolveAgendaReadAccess(req.user);
    const agendaReadMetadata = buildAgendaReadMetadata({
      accessMode: agendaReadAccess?.mode || null,
      compatibilityMode: agendaReadAccess?.compatibilityMode === true,
      legacyReason: agendaReadAccess?.legacyReason || null,
    });

    if (!accessContext.linkedProfessionalId) {
      return res.json({
        success: true,
        professional_id: null,
        can_view_all_professionals: false,
        allow_professional_view_others: accessContext.allowProfessionalViewOthers,
        ...agendaReadMetadata,
        professional: null,
      });
    }

    const professionalResult = await pool.query(
      `
        SELECT
          p.id,
          p.status,
          p.funcao,
          p.email,
          p.phone,
          COALESCE(pr.nome, p.funcao) AS role_nome,
          u.id::text AS linked_user_id,
          COALESCE(u.name, p.email, '') AS user_name,
          COALESCE(u.email, p.email) AS user_email,
          COALESCE(u.username, split_part(COALESCE(p.email, ''), '@', 1)) AS user_username,
          COALESCE(u.role, 'Usuario') AS user_role
        FROM public.professionals p
        LEFT JOIN public.professional_roles pr ON pr.id = p.role_id
        LEFT JOIN public.users u
          ON COALESCE(to_jsonb(p)->>'user_id_int', to_jsonb(p)->>'user_id') = u.id::text
        WHERE p.id = $1
        LIMIT 1
      `,
      [accessContext.linkedProfessionalId]
    );

    return res.json({
      success: true,
      professional_id: accessContext.linkedProfessionalId,
      can_view_all_professionals: accessContext.canViewOtherProfessionals,
      allow_professional_view_others: accessContext.allowProfessionalViewOthers,
      ...agendaReadMetadata,
      professional: professionalResult.rows[0] || null,
    });
  } catch (error) {
    console.error('Erro ao resolver contexto do profissional logado:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao carregar contexto do profissional logado',
    });
  }
});

// Agenda visual por intervalo (dia/semana/mes/lista)
router.get('/agenda/range', authorizeAgendaRead, async (req, res) => {
  const dateFrom = normalizeDateParam(req.query?.date_from || req.query?.dateFrom);
  const dateTo = normalizeDateParam(req.query?.date_to || req.query?.dateTo);
  const requestedProfessionalId = normalizeEntityId(
    req.query?.professional_id || req.query?.professionalId
  );

  if (!dateFrom || !dateTo) {
    return res.status(400).json({
      success: false,
      message: 'Parametros date_from e date_to sao obrigatorios (YYYY-MM-DD).',
    });
  }

  if (dateFrom > dateTo) {
    return res.status(400).json({
      success: false,
      message: 'date_from nao pode ser maior que date_to.',
    });
  }

  const rangeDays = daysBetweenInclusive(dateFrom, dateTo);
  if (!rangeDays || rangeDays > 62) {
    return res.status(400).json({
      success: false,
      message: 'Intervalo maximo permitido para agenda visual e de 62 dias.',
    });
  }

  try {
    const accessContext = await resolveAgendaAccessContext(req.user, pool);
    const agendaReadAccess = req.agendaReadAccess || resolveAgendaReadAccess(req.user);
    const writeEnforcement = resolveAgendaWriteEnforcementMode();

    if (
      requestedProfessionalId &&
      !canAccessAgendaWriteTarget(accessContext, requestedProfessionalId)
    ) {
      return res.status(403).json({
        success: false,
        message:
          'Acesso negado: voce nao pode visualizar agenda de outro profissional.',
      });
    }

    let targetProfessionalIds = [];
    if (requestedProfessionalId) {
      targetProfessionalIds = [requestedProfessionalId];
    } else if (
      accessContext.linkedProfessionalId &&
      !accessContext.canViewOtherProfessionals
    ) {
      targetProfessionalIds = [String(accessContext.linkedProfessionalId)];
    } else {
      const professionalsResult = await pool.query(
        `
          SELECT p.id::text AS id
          FROM public.professionals p
          ORDER BY p.created_at DESC
        `
      );
      targetProfessionalIds = professionalsResult.rows
        .map((row) => normalizeEntityId(row?.id))
        .filter(Boolean);
    }

    if (targetProfessionalIds.length === 0) {
      return res.json({
        success: true,
        date_from: dateFrom,
        date_to: dateTo,
        professionals: [],
        appointments: [],
        scope: buildAgendaScopePayload(agendaReadAccess, {
          professional_id: accessContext.linkedProfessionalId,
          can_view_all_professionals: accessContext.canViewOtherProfessionals,
          allow_professional_view_others: accessContext.allowProfessionalViewOthers,
        }),
      });
    }

    const professionalRows = await pool.query(
      `
        SELECT
          p.id::text AS id,
          COALESCE(
            u.name,
            p.email,
            p.funcao,
            p.specialty,
            'Profissional ' || p.id::text
          ) AS professional_name,
          COALESCE(pr.nome, p.funcao, p.specialty) AS professional_role,
          p.specialty AS professional_specialty
        FROM public.professionals p
        LEFT JOIN public.professional_roles pr ON pr.id = p.role_id
        LEFT JOIN public.users u
          ON COALESCE(to_jsonb(p)->>'user_id_int', to_jsonb(p)->>'user_id') = u.id::text
        WHERE p.id::text = ANY($1::text[])
        ORDER BY professional_name ASC, p.id::text ASC
      `,
      [targetProfessionalIds]
    );

    const hasStatusJornada = await hasPatientsStatusJornadaColumn(pool);
    const patientJourneyProjection = hasStatusJornada
      ? 'pa.status_jornada AS status_jornada, pa.status_jornada AS journey_status,'
      : 'NULL::text AS status_jornada, NULL::text AS journey_status,';

    const appointmentsResult = await pool.query(
      `
        SELECT
          a.id::text AS id,
          a.id::text AS appointment_id,
          a.professional_id::text AS professional_id,
          COALESCE(
            u.name,
            p.email,
            p.funcao,
            p.specialty,
            'Profissional ' || p.id::text
          ) AS professional_name,
          COALESCE(pr.nome, p.funcao, p.specialty) AS professional_role,
          p.specialty AS professional_specialty,
          a.appointment_date,
          to_char(a.appointment_time, 'HH24:MI') AS appointment_time,
          a.status AS appointment_status,
          a.status,
          a.notes,
          pa.id::text AS patient_id,
          pa.name AS patient_name,
          ${patientJourneyProjection}
          s.id::text AS service_id,
          s.name AS service_name,
          COALESCE(pr.nome, p.specialty, p.funcao, NULL) AS sector_responsible,
          COALESCE(
            u.name,
            p.email,
            p.funcao,
            p.specialty,
            NULL
          ) AS responsible_name
        FROM public.appointments a
        JOIN public.patients pa ON pa.id = a.patient_id
        JOIN public.professionals p ON p.id = a.professional_id
        LEFT JOIN public.professional_roles pr ON pr.id = p.role_id
        LEFT JOIN public.users u
          ON COALESCE(to_jsonb(p)->>'user_id_int', to_jsonb(p)->>'user_id') = u.id::text
        LEFT JOIN public.services s ON s.id = a.service_id
        WHERE a.professional_id::text = ANY($1::text[])
          AND a.appointment_date BETWEEN $2::date AND $3::date
        ORDER BY a.appointment_date ASC, a.appointment_time ASC, professional_name ASC;
      `,
      [targetProfessionalIds, dateFrom, dateTo]
    );

    const appointments = appointmentsResult.rows.map((row) => {
      const journeyStatus = normalizeJourneyStatus(
        row?.status_jornada || row?.journey_status || null
      );
      const institutionalContext = buildAgendaInstitutionalContext({
        journeyStatus,
        serviceName: row?.service_name || null,
      });
      const writeValidation = prepareAgendaWriteValidation({
        journeyStatus,
        serviceName: row?.service_name || null,
        explicitEventType: institutionalContext.event_type_institutional,
        enforcementMode: writeEnforcement.configuredMode,
      });

      return {
        ...row,
        ...institutionalContext,
        write_validation_ready: true,
        write_validation_mode: writeValidation.mode || writeEnforcement.configuredMode,
        write_validation_effective_mode:
          writeValidation.effectiveMode || writeEnforcement.effectiveMode,
        write_validation_rollout_phase:
          writeValidation.rolloutPhase || writeEnforcement.rolloutPhase,
        write_validation_hard_block_enabled: writeValidation.hardBlockGloballyEnabled === true,
        write_validation_legacy_mode_alias: writeValidation.legacyModeAlias || null,
        write_validation_level: writeValidation.level || null,
        write_validation_action: writeValidation.action || null,
        write_validation_code: writeValidation.code || null,
        write_validation_message: writeValidation.message || null,
        write_validation_supported_levels:
          Array.isArray(writeValidation.supportedLevels) &&
          writeValidation.supportedLevels.length > 0
            ? writeValidation.supportedLevels
            : AGENDA_WRITE_VALIDATION_SUPPORTED_LEVELS,
        write_validation_would_block: writeValidation.wouldBlockWhenEnforced === true,
        write_validation_blocking_active: writeValidation.blockingActive === true,
        write_validation_enforcement_ready: writeValidation.enforcementReady === true,
        write_validation_should_warn: writeValidation.shouldWarn,
        write_validation_should_block: writeValidation.shouldBlock,
      };
    });

    const writeValidationSummary = summarizeWriteValidation(appointments);

    return res.json({
      success: true,
      date_from: dateFrom,
      date_to: dateTo,
      professionals: professionalRows.rows,
      appointments,
      scope: buildAgendaScopePayload(agendaReadAccess, {
        professional_id: accessContext.linkedProfessionalId,
        can_view_all_professionals: accessContext.canViewOtherProfessionals,
        allow_professional_view_others: accessContext.allowProfessionalViewOthers,
        write_validation_summary: {
          mode: writeEnforcement.configuredMode,
          effective_mode: writeEnforcement.effectiveMode,
          rollout_phase: writeEnforcement.rolloutPhase,
          hard_block_enabled: writeEnforcement.hardBlockGloballyEnabled === true,
          legacy_mode_alias: writeEnforcement.legacyModeAlias || null,
          ...writeValidationSummary,
          blocking_active: writeEnforcement.blockingActive,
          enforcement_ready: true,
        },
      }),
    });
  } catch (error) {
    console.error('Erro ao buscar agenda por intervalo:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar agenda por intervalo.',
    });
  }
});

// Agenda do profissional em um dia
router.get('/:id/agenda', authorizeAgendaRead, async (req, res) => {
  const { id } = req.params;
  const dateCandidate = req.query.date || new Date().toISOString().split('T')[0];
  const date = normalizeDateParam(dateCandidate);

  // Fase 5: futuros endpoints de escrita da agenda institucional (POST/PUT/PATCH)
  // devem reutilizar prepareAgendaWriteValidation/prepareAgendaWriteGuard do service.

  if (!date) {
    return res.status(400).json({
      success: false,
      message: 'Parametro date invalido. Use YYYY-MM-DD.',
    });
  }

  try {
    const accessContext = await resolveAgendaAccessContext(req.user, pool);
    const agendaReadAccess = req.agendaReadAccess || resolveAgendaReadAccess(req.user);
    const writeEnforcement = resolveAgendaWriteEnforcementMode();
    const isOwnAgenda =
      accessContext.linkedProfessionalId &&
      String(accessContext.linkedProfessionalId) === String(id);

    // Protege contra IDOR: profissional nÃ£o pode consultar agenda arbitraria sem permissÃ£o + config.
    if (
      accessContext.linkedProfessionalId &&
      !isOwnAgenda &&
      !accessContext.canViewOtherProfessionals
    ) {
      return res.status(403).json({
        success: false,
        message:
          'Acesso negado: voce nao pode visualizar agenda de outro profissional.',
      });
    }

    const hasStatusJornada = await hasPatientsStatusJornadaColumn(pool);
    const patientJourneyProjection = hasStatusJornada
      ? 'pa.status_jornada AS status_jornada, pa.status_jornada AS journey_status,'
      : 'NULL::text AS status_jornada, NULL::text AS journey_status,';

    const query = `
      SELECT
        a.id::text AS id,
        a.id::text AS appointment_id,
        a.professional_id::text AS professional_id,
        COALESCE(
          u.name,
          p.email,
          p.funcao,
          p.specialty,
          'Profissional ' || p.id::text
        ) AS professional_name,
        COALESCE(pr.nome, p.funcao, p.specialty) AS professional_role,
        p.specialty AS professional_specialty,
        a.appointment_date,
        to_char(a.appointment_time, 'HH24:MI') AS appointment_time,
        a.status AS appointment_status,
        a.status,
        a.notes,
        pa.id::text AS patient_id,
        pa.name AS patient_name,
        ${patientJourneyProjection}
        s.id::text AS service_id,
        s.name AS service_name,
        COALESCE(pr.nome, p.specialty, p.funcao, NULL) AS sector_responsible,
        COALESCE(
          u.name,
          p.email,
          p.funcao,
          p.specialty,
          NULL
        ) AS responsible_name
      FROM public.appointments a
      JOIN public.patients pa ON pa.id = a.patient_id
      JOIN public.professionals p ON p.id = a.professional_id
      LEFT JOIN public.professional_roles pr ON pr.id = p.role_id
      LEFT JOIN public.users u
        ON COALESCE(to_jsonb(p)->>'user_id_int', to_jsonb(p)->>'user_id') = u.id::text
      LEFT JOIN public.services s ON s.id = a.service_id
      WHERE a.professional_id::text = $1
        AND a.appointment_date = $2::date
      ORDER BY a.appointment_time ASC;
    `;

    const result = await pool.query(query, [id, date]);
    const agenda = result.rows.map((row) => {
      const journeyStatus = normalizeJourneyStatus(
        row?.status_jornada || row?.journey_status || null
      );
      const institutionalContext = buildAgendaInstitutionalContext({
        journeyStatus,
        serviceName: row?.service_name || null,
      });
      // Fase 5: enforcement controlado preparado para futuras rotas de escrita (POST/PUT agenda).
      const writeValidation = prepareAgendaWriteValidation({
        journeyStatus,
        serviceName: row?.service_name || null,
        explicitEventType: institutionalContext.event_type_institutional,
        enforcementMode: writeEnforcement.configuredMode,
      });

      return {
        ...row,
        ...institutionalContext,
        write_validation_ready: true,
        write_validation_mode: writeValidation.mode || writeEnforcement.configuredMode,
        write_validation_effective_mode:
          writeValidation.effectiveMode || writeEnforcement.effectiveMode,
        write_validation_rollout_phase:
          writeValidation.rolloutPhase || writeEnforcement.rolloutPhase,
        write_validation_hard_block_enabled: writeValidation.hardBlockGloballyEnabled === true,
        write_validation_legacy_mode_alias: writeValidation.legacyModeAlias || null,
        write_validation_level: writeValidation.level || null,
        write_validation_action: writeValidation.action || null,
        write_validation_code: writeValidation.code || null,
        write_validation_message: writeValidation.message || null,
        write_validation_supported_levels:
          Array.isArray(writeValidation.supportedLevels) &&
          writeValidation.supportedLevels.length > 0
            ? writeValidation.supportedLevels
            : AGENDA_WRITE_VALIDATION_SUPPORTED_LEVELS,
        write_validation_would_block: writeValidation.wouldBlockWhenEnforced === true,
        write_validation_blocking_active: writeValidation.blockingActive === true,
        write_validation_enforcement_ready: writeValidation.enforcementReady === true,
        write_validation_should_warn: writeValidation.shouldWarn,
        write_validation_should_block: writeValidation.shouldBlock,
      };
    });
    const writeValidationSummary = summarizeWriteValidation(agenda);

    res.json({
      success: true,
      agenda,
      scope: buildAgendaScopePayload(agendaReadAccess, {
        professional_id: accessContext.linkedProfessionalId,
        can_view_all_professionals: accessContext.canViewOtherProfessionals,
        allow_professional_view_others: accessContext.allowProfessionalViewOthers,
        write_validation_summary: {
          mode: writeEnforcement.configuredMode,
          effective_mode: writeEnforcement.effectiveMode,
          rollout_phase: writeEnforcement.rolloutPhase,
          hard_block_enabled: writeEnforcement.hardBlockGloballyEnabled === true,
          legacy_mode_alias: writeEnforcement.legacyModeAlias || null,
          ...writeValidationSummary,
          blocking_active: writeEnforcement.blockingActive,
          enforcement_ready: true,
        },
      }),
    });
  } catch (error) {
    console.error('Erro ao buscar agenda do profissional:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar agenda' });
  }
});

// EstatÃ­sticas gerais dos profissionais
router.get('/stats/resumo', authorize('profissionais', 'view'), async (req, res) => {
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
    console.error('Erro ao buscar estatÃ­sticas de profissionais:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar estatÃ­sticas' });
  }
});

router.get('/:id', authorize('profissionais', 'view'), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
        SELECT
          p.*,
          COALESCE(
            to_jsonb(p)->>'funcao',
            to_jsonb(p)->>'specialty'
          ) AS role_nome,
          u.id::text AS linked_user_id,
          COALESCE(u.name, p.email, '') AS user_name,
          COALESCE(u.email, p.email) AS user_email,
          COALESCE(u.username, split_part(COALESCE(p.email, ''), '@', 1)) AS user_username,
          COALESCE(u.role, 'Usuario') AS user_role,
          COALESCE(u.status, 'ativo') AS user_status
        FROM public.professionals p
        LEFT JOIN public.users u
          ON COALESCE(to_jsonb(p)->>'user_id_int', to_jsonb(p)->>'user_id') = u.id::text
        WHERE p.id = $1
        LIMIT 1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Profissional nao encontrado',
      });
    }

    return res.json({
      success: true,
      professional: result.rows[0],
    });
  } catch (error) {
    console.error('Erro ao buscar profissional por id:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar profissional',
    });
  }
});

// Validacao de escrita da agenda (dry-run), sem persistencia.
router.post('/:id/agenda/validate-write', authorizeAgendaRead, async (req, res) => {
  const { id } = req.params;

  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const accessContext = await resolveAgendaAccessContext(req.user, pool);
    const agendaReadAccess = req.agendaReadAccess || resolveAgendaReadAccess(req.user);

    // Protege contra IDOR: profissional nao pode validar escrita para agenda arbitraria.
    if (!canAccessAgendaWriteTarget(accessContext, id)) {
      return res.status(403).json({
        success: false,
        message:
          'Acesso negado: voce nao pode validar escrita para agenda de outro profissional.',
      });
    }

    // Reduz dependencia pratica do legado: endpoint de escrita pode optar por nao aceitar fallback.
    if (agendaReadAccess?.compatibilityMode === true && AGENDA_VALIDATE_WRITE_ALLOW_LEGACY !== true) {
      return res.status(403).json(
        buildAgendaLegacyWriteScopeError({
          code: 'agenda_write_validation_requires_primary_scope',
          message:
            'Validacao de escrita da agenda requer escopo primario agenda:view nesta fase de rollout.',
          agendaReadAccess,
          accessContext,
        })
      );
    }

    const patientId = normalizeEntityId(payload?.patient_id);
    const serviceId = normalizeEntityId(payload?.service_id);
    const journeyStatusInput = normalizeOptionalText(payload?.journey_status);
    const serviceNameInput = normalizeOptionalText(payload?.service_name);
    const explicitEventType = normalizeOptionalText(payload?.explicit_event_type);
    const requestedEnforcementMode = normalizeOptionalText(payload?.enforcement_mode);
    const canOverrideEnforcementMode =
      isAdminUser(req.user) ||
      hasPermissionScope(req.user?.permissions, 'agenda:enforcement_control');
    const writeEnforcement = resolveAgendaWriteEnforcementMode({
      requestedMode: canOverrideEnforcementMode ? requestedEnforcementMode : null,
    });

    if (!patientId && !journeyStatusInput) {
      return res.status(400).json({
        success: false,
        code: 'agenda_write_validation_patient_or_journey_required',
        message: 'Informe patient_id ou journey_status para validar a coerencia de jornada.',
      });
    }

    if (!serviceId && !serviceNameInput) {
      return res.status(400).json({
        success: false,
        code: 'agenda_write_validation_service_required',
        message: 'Informe service_id ou service_name para classificar o tipo institucional.',
      });
    }

    const patientContext = await resolveAgendaWritePatientContext({
      patientId,
      journeyStatusInput,
      client: pool,
    });
    const serviceContext = await resolveAgendaWriteServiceContext({
      serviceId,
      serviceNameInput,
      client: pool,
    });

    if (patientId && !patientContext.journeyStatus) {
      return res.status(409).json({
        success: false,
        code: 'patient_journey_status_missing',
        message:
          'Nao foi possivel validar a agenda porque o assistido esta sem status_jornada persistido.',
        patient_id: patientContext.patientId,
      });
    }

    if (
      patientId &&
      journeyStatusInput &&
      patientContext.journeyStatus &&
      journeyStatusInput.toLowerCase() !== patientContext.journeyStatus.toLowerCase()
    ) {
      return res.status(409).json({
        success: false,
        code: 'agenda_journey_status_mismatch',
        message:
          'journey_status informado nao confere com o status_jornada persistido do assistido.',
        journey_status: patientContext.journeyStatus,
        requested_journey_status: journeyStatusInput,
        patient_id: patientContext.patientId,
      });
    }

    const guard = prepareAgendaWriteGuard({
      journeyStatus: patientContext.journeyStatus,
      serviceName: serviceContext.serviceName,
      explicitEventType,
      enforcementMode: writeEnforcement.configuredMode,
      context: {
        endpoint: 'POST /profissionais/:id/agenda/validate-write',
        professional_id: String(id),
        patient_id: patientContext.patientId,
        service_id: serviceContext.serviceId,
      },
    });
    const validationPayload = toAgendaWriteValidationPayload(guard);
    const resolvedContext = {
      professional_id: String(id),
      patient_id: patientContext.patientId,
      patient_name: patientContext.patientName,
      journey_status: patientContext.journeyStatus,
      journey_status_source: patientContext.source,
      journey_status_found: patientContext.found,
      service_id: serviceContext.serviceId,
      service_name: serviceContext.serviceName,
      service_name_source: serviceContext.source,
      service_found: serviceContext.found,
      explicit_event_type: explicitEventType,
    };
    const writeValidationSummary = summarizeWriteValidation([
      {
        write_validation_level: guard.level,
        write_validation_should_block: guard.shouldBlock === true,
      },
    ]);
    const scopePayload = buildAgendaWriteScopeWithSummary({
      agendaReadAccess,
      accessContext,
      writeEnforcement,
      validationPayload,
      writeValidationSummary,
    });
    const responseBase = buildAgendaWriteResponseBase({
      dryRun: true,
      persisted: false,
      endpoint: 'agenda_validate_write_v1',
      blocked: guard.shouldBlock === true,
      canProceed: guard.canProceed === true,
      validationPayload,
      resolvedContext,
      overridePayload: buildAgendaWriteOverridePayload({
        requestedEnforcementMode,
        canOverrideEnforcementMode,
        writeEnforcement,
      }),
      scopePayload,
    });

    if (guard.canProceed !== true) {
      return res.status(guard.statusCode || 409).json({
        success: false,
        code: guard.blockPayload?.code || 'agenda_write_blocked_by_journey',
        message:
          guard.blockPayload?.message ||
          validationPayload.message ||
          'Validacao bloqueada pelo guard institucional no modo atual.',
        ...responseBase,
      });
    }

    return res.json({
      success: true,
      message: validationPayload.should_warn
        ? 'Validacao concluida com alerta(s) no modo atual.'
        : 'Validacao concluida sem bloqueio no modo atual.',
      ...responseBase,
    });
  } catch (error) {
    console.error('Erro ao validar escrita da agenda (dry-run):', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao validar escrita da agenda',
    });
  }
});

// Criacao real de agendamento institucional (escopo minimo, com persistencia).
router.post('/:id/agenda', authorizeAgendaRead, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    if (AGENDA_CREATE_PERSIST_ENABLED !== true) {
      return res.status(503).json({
        success: false,
        code: 'agenda_create_persist_disabled',
        message: 'Criacao de agendamento institucional desabilitada por rollout controlado.',
      });
    }

    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const accessContext = await resolveAgendaAccessContext(req.user, client);
    const agendaReadAccess = req.agendaReadAccess || resolveAgendaReadAccess(req.user);

    // Protege contra IDOR: profissional nao pode criar agendamento para agenda arbitraria.
    if (!canAccessAgendaWriteTarget(accessContext, id)) {
      return res.status(403).json({
        success: false,
        message:
          'Acesso negado: voce nao pode criar agendamento para agenda de outro profissional.',
      });
    }

    // Compatibilidade legada da escrita permanece explicita e desligavel por ambiente.
    if (agendaReadAccess?.compatibilityMode === true && AGENDA_CREATE_WRITE_ALLOW_LEGACY !== true) {
      return res.status(403).json(
        buildAgendaLegacyWriteScopeError({
          code: 'agenda_create_requires_primary_scope',
          message:
            'Criacao de agendamento requer escopo primario agenda:view nesta fase de rollout.',
          agendaReadAccess,
          accessContext,
        })
      );
    }

    const patientId = normalizeEntityId(payload?.patient_id);
    const serviceId = normalizeEntityId(payload?.service_id);
    const appointmentDate = normalizeDateParam(payload?.appointment_date);
    const appointmentTime = normalizeAppointmentTime(payload?.appointment_time);
    const journeyStatusInput = normalizeOptionalText(payload?.journey_status);
    const explicitEventType = normalizeOptionalText(payload?.explicit_event_type);
    const notes = normalizeOptionalText(payload?.notes);
    const statusInput = normalizeOptionalText(payload?.appointment_status || payload?.status);
    const appointmentStatus = normalizeAppointmentStatus(statusInput);
    const createAllowedStatuses = getAllowedCreateAppointmentStatuses();
    const requestedEnforcementMode = normalizeOptionalText(payload?.enforcement_mode);
    const canOverrideEnforcementMode =
      isAdminUser(req.user) ||
      hasPermissionScope(req.user?.permissions, 'agenda:enforcement_control');
    const writeEnforcement = resolveAgendaWriteEnforcementMode({
      requestedMode: canOverrideEnforcementMode ? requestedEnforcementMode : null,
    });

    if (!patientId) {
      return res.status(400).json({
        success: false,
        code: 'agenda_create_patient_required',
        message: 'Informe patient_id para criar o agendamento.',
      });
    }

    if (!serviceId) {
      return res.status(400).json({
        success: false,
        code: 'agenda_create_service_required',
        message: 'Informe service_id para classificar e persistir o agendamento.',
      });
    }

    if (!appointmentDate) {
      return res.status(400).json({
        success: false,
        code: 'agenda_create_date_required',
        message: 'Informe appointment_date valido no formato YYYY-MM-DD.',
      });
    }

    if (!appointmentTime) {
      return res.status(400).json({
        success: false,
        code: 'agenda_create_time_required',
        message: 'Informe appointment_time valido no formato HH:MM.',
      });
    }

    if (!appointmentStatus) {
      return res.status(400).json({
        success: false,
        code: 'agenda_create_status_invalid',
        message:
          `status invalido para criacao. Use ${buildCreateStatusAllowedLabel()}.`,
      });
    }

    if (!createAllowedStatuses.includes(appointmentStatus)) {
      return res.status(400).json({
        success: false,
        code: 'agenda_create_status_not_allowed',
        message:
          `status nao permitido na criacao nesta fase. Use ${buildCreateStatusAllowedLabel()}.`,
        allowed_statuses: createAllowedStatuses,
      });
    }

    const professionalContext = await resolveAgendaWriteProfessionalContext({
      professionalId: id,
      client,
    });
    if (professionalContext.found === false) {
      return res.status(404).json({
        success: false,
        code: 'agenda_create_professional_not_found',
        message: 'Profissional informado nao foi encontrado.',
      });
    }

    const patientContext = await resolveAgendaWritePatientContext({
      patientId,
      journeyStatusInput,
      client,
    });
    if (patientContext.found === false) {
      return res.status(404).json({
        success: false,
        code: 'agenda_create_patient_not_found',
        message: 'Assistido informado nao foi encontrado.',
      });
    }

    const serviceContext = await resolveAgendaWriteServiceContext({
      serviceId,
      serviceNameInput: null,
      client,
    });
    if (serviceContext.found === false) {
      return res.status(404).json({
        success: false,
        code: 'agenda_create_service_not_found',
        message: 'Servico informado nao foi encontrado.',
      });
    }

    const guard = prepareAgendaWriteGuard({
      journeyStatus: patientContext.journeyStatus,
      serviceName: serviceContext.serviceName,
      explicitEventType,
      enforcementMode: writeEnforcement.configuredMode,
      context: {
        endpoint: 'POST /profissionais/:id/agenda',
        professional_id: String(id),
        patient_id: patientContext.patientId,
        service_id: serviceContext.serviceId,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
      },
    });
    const validationPayload = toAgendaWriteValidationPayload(guard);
    const resolvedContext = {
      professional_id: professionalContext.professionalId || String(id),
      professional_name: professionalContext.professionalName,
      patient_id: patientContext.patientId,
      patient_name: patientContext.patientName,
      journey_status: patientContext.journeyStatus,
      journey_status_source: patientContext.source,
      journey_status_found: patientContext.found,
      service_id: serviceContext.serviceId,
      service_name: serviceContext.serviceName,
      service_name_source: serviceContext.source,
      service_found: serviceContext.found,
      explicit_event_type: explicitEventType,
    };
    const writeValidationSummary = summarizeWriteValidation([
      {
        write_validation_level: guard.level,
        write_validation_should_block: guard.shouldBlock === true,
      },
    ]);
    const scopePayload = buildAgendaWriteScopeWithSummary({
      agendaReadAccess,
      accessContext,
      writeEnforcement,
      validationPayload,
      writeValidationSummary,
    });
    const responseBase = buildAgendaWriteResponseBase({
      dryRun: false,
      persisted: false,
      endpoint: 'agenda_create_v1',
      blocked: guard.shouldBlock === true,
      canProceed: guard.canProceed === true,
      validationPayload,
      resolvedContext,
      overridePayload: buildAgendaWriteOverridePayload({
        requestedEnforcementMode,
        canOverrideEnforcementMode,
        writeEnforcement,
      }),
      scopePayload,
      extra: {
        create_status_policy: {
          default_status: 'scheduled',
          allow_confirmed_on_create: AGENDA_CREATE_ALLOW_CONFIRMED_STATUS === true,
          allowed_statuses: createAllowedStatuses,
        },
      },
    });

    if (guard.canProceed !== true) {
      return res.status(guard.statusCode || 409).json({
        success: false,
        code: guard.blockPayload?.code || 'agenda_write_blocked_by_journey',
        message:
          guard.blockPayload?.message ||
          validationPayload.message ||
          'Criacao bloqueada pelo guard institucional no modo atual.',
        ...responseBase,
      });
    }

    await client.query('BEGIN');
    transactionStarted = true;

    // Mitiga corrida de concorrencia no mesmo slot sem exigir mudanca estrutural de schema.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `agenda_slot:${String(id)}:${appointmentDate}:${appointmentTime}`,
    ]);

    const conflictResult = await client.query(
      `
        SELECT
          a.id::text AS appointment_id,
          a.status AS appointment_status
        FROM public.appointments a
        WHERE a.professional_id::text = $1
          AND a.appointment_date = $2::date
          AND a.appointment_time = $3::time
          AND COALESCE(LOWER(a.status), '') NOT IN ('cancelled', 'cancelado')
        LIMIT 1
      `,
      [String(id), appointmentDate, appointmentTime]
    );

    if (conflictResult.rows.length > 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        code: 'agenda_slot_conflict',
        message:
          'Conflito de horario: ja existe agendamento ativo para este profissional na data/hora informada.',
        conflict: {
          appointment_id: conflictResult.rows[0]?.appointment_id || null,
          appointment_status: conflictResult.rows[0]?.appointment_status || null,
        },
        ...responseBase,
      });
    }

    const insertResult = await client.query(
      `
        INSERT INTO public.appointments (
          professional_id,
          patient_id,
          service_id,
          appointment_date,
          appointment_time,
          status,
          notes
        )
        VALUES (
          (SELECT p.id FROM public.professionals p WHERE p.id::text = $1 LIMIT 1),
          (SELECT pa.id FROM public.patients pa WHERE pa.id::text = $2 LIMIT 1),
          (SELECT s.id FROM public.services s WHERE s.id::text = $3 LIMIT 1),
          $4::date,
          $5::time,
          $6,
          $7
        )
        RETURNING
          id::text AS id,
          id::text AS appointment_id,
          professional_id::text AS professional_id,
          appointment_date,
          to_char(appointment_time, 'HH24:MI') AS appointment_time,
          status AS appointment_status,
          status,
          notes,
          patient_id::text AS patient_id,
          service_id::text AS service_id
      `,
      [
        professionalContext.professionalId || String(id),
        patientContext.patientId,
        serviceContext.serviceId,
        appointmentDate,
        appointmentTime,
        appointmentStatus,
        notes,
      ]
    );

    const createdRow = insertResult.rows[0];
    if (!createdRow) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(500).json({
        success: false,
        code: 'agenda_create_insert_failed',
        message: 'Nao foi possivel persistir o agendamento.',
        ...responseBase,
      });
    }

    await client.query('COMMIT');
    transactionStarted = false;

    const appointment = {
      ...createdRow,
      professional_name: professionalContext.professionalName || null,
      professional_role: professionalContext.professionalRole || null,
      professional_specialty: professionalContext.professionalSpecialty || null,
      patient_name: patientContext.patientName || null,
      status_jornada: patientContext.journeyStatus || null,
      journey_status: patientContext.journeyStatus || null,
      service_name: serviceContext.serviceName || null,
      sector_responsible:
        professionalContext.professionalRole || professionalContext.professionalSpecialty || null,
      responsible_name: professionalContext.professionalName || null,
      event_type_institutional: guard.event_type_institutional || null,
      event_type_institutional_source: guard.event_type_institutional_source || null,
      journey_consistency_status: guard.journey_consistency_status || null,
      journey_consistency_code: guard.journey_consistency_code || null,
      journey_consistency_message: guard.journey_consistency_message || null,
      journey_consistency_expected_statuses:
        Array.isArray(guard.journey_consistency_expected_statuses) &&
        guard.journey_consistency_expected_statuses.length > 0
          ? guard.journey_consistency_expected_statuses
          : null,
      write_validation_ready: true,
      write_validation_mode: validationPayload.mode || writeEnforcement.configuredMode,
      write_validation_effective_mode:
        validationPayload.effective_mode || writeEnforcement.effectiveMode,
      write_validation_rollout_phase:
        validationPayload.rollout_phase || writeEnforcement.rolloutPhase,
      write_validation_hard_block_enabled: validationPayload.hard_block_enabled === true,
      write_validation_legacy_mode_alias: validationPayload.legacy_mode_alias || null,
      write_validation_level: validationPayload.level || null,
      write_validation_action: validationPayload.action || null,
      write_validation_code: validationPayload.reason_code || null,
      write_validation_message: validationPayload.message || null,
      write_validation_supported_levels:
        Array.isArray(validationPayload.supported_levels) &&
        validationPayload.supported_levels.length > 0
          ? validationPayload.supported_levels
          : AGENDA_WRITE_VALIDATION_SUPPORTED_LEVELS,
      write_validation_would_block: validationPayload.would_block_when_enforced === true,
      write_validation_blocking_active: validationPayload.blocking_active === true,
      write_validation_enforcement_ready: validationPayload.enforcement_ready === true,
      write_validation_should_warn: validationPayload.should_warn === true,
      write_validation_should_block: validationPayload.should_block === true,
    };

    return res.status(201).json({
      success: true,
      message: validationPayload.should_warn
        ? 'Agendamento criado com alerta(s) de coerencia de jornada.'
        : 'Agendamento criado com sucesso.',
      ...responseBase,
      persisted: true,
      appointment,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Erro ao efetuar rollback na criacao da agenda:', rollbackError);
      }
    }
    console.error('Erro ao criar agendamento institucional:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao criar agendamento institucional',
    });
  } finally {
    client.release();
  }
});

// Atualizacao pontual de status do agendamento (confirmar/cancelar), sem CRUD amplo.
router.post('/:id/agenda/:appointmentId/status', authorizeAgendaRead, async (req, res) => {
  const { id, appointmentId } = req.params;
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    if (AGENDA_STATUS_UPDATE_ENABLED !== true) {
      return res.status(503).json({
        success: false,
        code: 'agenda_status_update_disabled',
        message: 'Atualizacao de status da agenda desabilitada por rollout controlado.',
      });
    }

    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const accessContext = await resolveAgendaAccessContext(req.user, client);
    const agendaReadAccess = req.agendaReadAccess || resolveAgendaReadAccess(req.user);
    const normalizedAppointmentId = normalizeEntityId(appointmentId);

    // Protege contra IDOR: profissional nao pode alterar status de agenda arbitraria.
    if (!canAccessAgendaWriteTarget(accessContext, id)) {
      return res.status(403).json({
        success: false,
        message:
          'Acesso negado: voce nao pode alterar status de agendamento de outro profissional.',
      });
    }

    if (!normalizedAppointmentId) {
      return res.status(400).json({
        success: false,
        code: 'agenda_status_update_appointment_required',
        message: 'Informe appointmentId valido para atualizar status.',
      });
    }

    // Compatibilidade legada da escrita permanece explicita e desligavel por ambiente.
    if (agendaReadAccess?.compatibilityMode === true && AGENDA_STATUS_UPDATE_ALLOW_LEGACY !== true) {
      return res.status(403).json(
        buildAgendaLegacyWriteScopeError({
          code: 'agenda_status_update_requires_primary_scope',
          message:
            'Atualizacao de status requer escopo primario agenda:view nesta fase de rollout.',
          agendaReadAccess,
          accessContext,
        })
      );
    }

    const actionInput = normalizeOptionalText(payload?.action);
    const action = normalizeAppointmentStatusAction(actionInput);
    const statusInput = normalizeOptionalText(payload?.appointment_status || payload?.status);
    const normalizedStatusInput = normalizeAppointmentStatus(statusInput);
    const statusTargetFromAction = mapAppointmentStatusActionToTarget(action);
    const statusTargetFromStatus = ['confirmed', 'cancelled'].includes(normalizedStatusInput)
      ? normalizedStatusInput
      : null;

    if (statusInput && !normalizedStatusInput) {
      return res.status(400).json({
        success: false,
        code: 'agenda_status_update_status_invalid',
        message:
          'status invalido. Use confirmed/confirmado ou cancelled/cancelado para esta operacao.',
      });
    }

    if (statusInput && normalizedStatusInput && !statusTargetFromStatus) {
      return res.status(400).json({
        success: false,
        code: 'agenda_status_update_status_not_allowed',
        message:
          'status nao permitido nesta fase. Use apenas confirmed/confirmado ou cancelled/cancelado.',
      });
    }

    if (!action && actionInput) {
      return res.status(400).json({
        success: false,
        code: 'agenda_status_update_action_invalid',
        message: 'action invalida. Use confirm/confirmar ou cancel/cancelar.',
      });
    }

    const targetStatus = statusTargetFromAction || statusTargetFromStatus;
    if (!targetStatus) {
      return res.status(400).json({
        success: false,
        code: 'agenda_status_update_target_required',
        message:
          'Informe action (confirm/cancel) ou status (confirmed/cancelled) para atualizar o agendamento.',
      });
    }

    if (statusTargetFromAction && statusTargetFromStatus && statusTargetFromAction !== statusTargetFromStatus) {
      return res.status(400).json({
        success: false,
        code: 'agenda_status_update_action_status_conflict',
        message: 'action e status informados sao conflitantes para esta operacao.',
      });
    }

    const requestedEnforcementMode = normalizeOptionalText(payload?.enforcement_mode);
    const canOverrideEnforcementMode =
      isAdminUser(req.user) ||
      hasPermissionScope(req.user?.permissions, 'agenda:enforcement_control');
    const writeEnforcement = resolveAgendaWriteEnforcementMode({
      requestedMode: canOverrideEnforcementMode ? requestedEnforcementMode : null,
    });

    await client.query('BEGIN');
    transactionStarted = true;

    const appointmentContext = await resolveAgendaAppointmentContextById({
      appointmentId: normalizedAppointmentId,
      professionalId: id,
      client,
    });
    if (!appointmentContext) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        code: 'agenda_status_update_not_found',
        message: 'Agendamento informado nao foi encontrado para este profissional.',
      });
    }

    const currentStatus = normalizeAppointmentStatus(
      appointmentContext?.appointment_status || appointmentContext?.status
    );
    if (!currentStatus) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        code: 'agenda_status_update_current_status_invalid',
        message: 'Status atual do agendamento nao reconhecido para transicao segura.',
      });
    }

    if (currentStatus === 'completed') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        code: 'agenda_status_update_transition_not_allowed',
        message: 'Agendamento concluido nao pode ser alterado por esta operacao enxuta.',
      });
    }

    if (currentStatus === 'cancelled' && targetStatus !== 'cancelled') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        code: 'agenda_status_update_transition_not_allowed',
        message: 'Agendamento cancelado nao pode ser confirmado novamente nesta fase.',
      });
    }

    if (targetStatus === 'confirmed' && !['scheduled', 'confirmed'].includes(currentStatus)) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        code: 'agenda_status_update_transition_not_allowed',
        message: `Transicao nao permitida de "${currentStatus}" para "${targetStatus}".`,
      });
    }

    if (targetStatus === 'cancelled' && !['scheduled', 'confirmed', 'cancelled'].includes(currentStatus)) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        code: 'agenda_status_update_transition_not_allowed',
        message: `Transicao nao permitida de "${currentStatus}" para "${targetStatus}".`,
      });
    }

    const journeyStatusInput = normalizeOptionalText(payload?.journey_status);
    const explicitEventType = normalizeOptionalText(payload?.explicit_event_type);
    const journeyStatus = normalizeJourneyStatus(
      appointmentContext?.status_jornada || appointmentContext?.journey_status || null
    );

    if (!journeyStatus) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        code: 'patient_journey_status_missing',
        message:
          'Nao foi possivel atualizar o status do agendamento porque o assistido esta sem status_jornada persistido.',
        patient_id: appointmentContext?.patient_id || null,
      });
    }

    if (
      journeyStatusInput &&
      journeyStatus &&
      journeyStatusInput.toLowerCase() !== journeyStatus.toLowerCase()
    ) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        code: 'agenda_journey_status_mismatch',
        message:
          'journey_status informado nao confere com o status_jornada persistido do assistido.',
        journey_status: journeyStatus,
        requested_journey_status: journeyStatusInput,
      });
    }

    const guard = prepareAgendaWriteGuard({
      journeyStatus,
      serviceName: appointmentContext?.service_name || null,
      explicitEventType,
      enforcementMode: writeEnforcement.configuredMode,
      context: {
        endpoint: 'POST /profissionais/:id/agenda/:appointmentId/status',
        appointment_id: appointmentContext?.appointment_id || null,
        professional_id: String(id),
        patient_id: appointmentContext?.patient_id || null,
        service_id: appointmentContext?.service_id || null,
        current_status: currentStatus,
        target_status: targetStatus,
      },
    });
    const validationPayload = toAgendaWriteValidationPayload(guard);
    const guardWouldBlock = guard.canProceed !== true;
    // Politica operacional desta fase: cancelamento pode seguir com bypass controlado
    // para evitar aprisionar agenda em casos de correção operacional.
    const guardBlockBypassedForCancellation =
      targetStatus === 'cancelled' && guardWouldBlock === true;
    const blockedByGuard = guardWouldBlock && !guardBlockBypassedForCancellation;

    const resolvedContext = {
      professional_id: appointmentContext?.professional_id || String(id),
      professional_name: appointmentContext?.professional_name || null,
      appointment_id: appointmentContext?.appointment_id || null,
      patient_id: appointmentContext?.patient_id || null,
      patient_name: appointmentContext?.patient_name || null,
      journey_status: journeyStatus,
      journey_status_source: journeyStatusInput ? 'request_body_journey_status' : 'appointment_context',
      journey_status_found: journeyStatus ? true : null,
      service_id: appointmentContext?.service_id || null,
      service_name: appointmentContext?.service_name || null,
      service_name_source: 'appointment_context',
      service_found: appointmentContext?.service_id ? true : null,
      explicit_event_type: explicitEventType,
      requested_action: action || null,
      current_status: currentStatus,
      target_status: targetStatus,
      guard_block_bypassed_for_cancellation: guardBlockBypassedForCancellation,
    };
    const writeValidationSummary = summarizeWriteValidation([
      {
        write_validation_level: guard.level,
        write_validation_should_block: blockedByGuard === true,
      },
    ]);
    const scopePayload = buildAgendaWriteScopeWithSummary({
      agendaReadAccess,
      accessContext,
      writeEnforcement,
      validationPayload,
      writeValidationSummary,
    });
    const responseBase = buildAgendaWriteResponseBase({
      dryRun: false,
      persisted: false,
      endpoint: 'agenda_update_status_v1',
      blocked: blockedByGuard,
      canProceed: blockedByGuard !== true,
      validationPayload,
      resolvedContext,
      overridePayload: buildAgendaWriteOverridePayload({
        requestedEnforcementMode,
        canOverrideEnforcementMode,
        writeEnforcement,
      }),
      scopePayload,
      extra: {
        status_update_policy: buildStatusUpdatePolicyPayload(),
      },
    });

    if (blockedByGuard) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(guard.statusCode || 409).json({
        success: false,
        code: guard.blockPayload?.code || 'agenda_write_blocked_by_journey',
        message:
          guard.blockPayload?.message ||
          validationPayload.message ||
          'Atualizacao de status bloqueada pelo guard institucional no modo atual.',
        ...responseBase,
      });
    }

    const finalStatus = targetStatus;
    if (currentStatus !== targetStatus) {
      const updateResult = await client.query(
        `
          UPDATE public.appointments
          SET status = $1
          WHERE id::text = $2
            AND professional_id::text = $3
          RETURNING id::text AS appointment_id
        `,
        [targetStatus, appointmentContext.appointment_id, String(id)]
      );

      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          code: 'agenda_status_update_conflict',
          message: 'Nao foi possivel atualizar status devido a conflito de concorrencia.',
          ...responseBase,
        });
      }
    }

    await client.query('COMMIT');
    transactionStarted = false;

    const appointment = {
      ...appointmentContext,
      appointment_status: finalStatus,
      status: finalStatus,
      event_type_institutional: guard.event_type_institutional || null,
      event_type_institutional_source: guard.event_type_institutional_source || null,
      journey_consistency_status: guard.journey_consistency_status || null,
      journey_consistency_code: guard.journey_consistency_code || null,
      journey_consistency_message: guard.journey_consistency_message || null,
      journey_consistency_expected_statuses:
        Array.isArray(guard.journey_consistency_expected_statuses) &&
        guard.journey_consistency_expected_statuses.length > 0
          ? guard.journey_consistency_expected_statuses
          : null,
      write_validation_ready: true,
      write_validation_mode: validationPayload.mode || writeEnforcement.configuredMode,
      write_validation_effective_mode:
        validationPayload.effective_mode || writeEnforcement.effectiveMode,
      write_validation_rollout_phase:
        validationPayload.rollout_phase || writeEnforcement.rolloutPhase,
      write_validation_hard_block_enabled: validationPayload.hard_block_enabled === true,
      write_validation_legacy_mode_alias: validationPayload.legacy_mode_alias || null,
      write_validation_level: validationPayload.level || null,
      write_validation_action: validationPayload.action || null,
      write_validation_code: validationPayload.reason_code || null,
      write_validation_message: validationPayload.message || null,
      write_validation_supported_levels:
        Array.isArray(validationPayload.supported_levels) &&
        validationPayload.supported_levels.length > 0
          ? validationPayload.supported_levels
          : AGENDA_WRITE_VALIDATION_SUPPORTED_LEVELS,
      write_validation_would_block: validationPayload.would_block_when_enforced === true,
      write_validation_blocking_active: validationPayload.blocking_active === true,
      write_validation_enforcement_ready: validationPayload.enforcement_ready === true,
      write_validation_should_warn: validationPayload.should_warn === true,
      write_validation_should_block: validationPayload.should_block === true,
    };

    return res.json({
      success: true,
      message:
        currentStatus === targetStatus
          ? 'Status ja estava aplicado; nenhuma alteracao de persistencia foi necessaria.'
          : guardBlockBypassedForCancellation
            ? 'Status atualizado com sucesso. Bloqueio de guard foi ignorado por tratar-se de cancelamento controlado.'
            : validationPayload.should_warn
              ? 'Status atualizado com alerta(s) de coerencia de jornada.'
              : 'Status atualizado com sucesso.',
      ...responseBase,
      persisted: currentStatus !== targetStatus,
      appointment,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Erro ao efetuar rollback na atualizacao de status da agenda:', rollbackError);
      }
    }
    console.error('Erro ao atualizar status do agendamento institucional:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar status do agendamento institucional',
    });
  } finally {
    client.release();
  }
});

module.exports = router;




