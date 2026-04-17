const express = require('express');
const { randomUUID } = require('crypto');
const pool = require('../config/pg');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const {
  REGISTRATION_MODES,
  PUBLIC_SIGNUP_DEFAULT_STATUSES,
  LINK_POLICIES,
  DEFAULT_ACCESS_SETTINGS,
  normalizeRegistrationMode,
  normalizePublicSignupDefaultStatus,
  normalizeLinkPolicy,
  deriveAllowPublicRegistration,
} = require('../lib/accessSettings');

const router = express.Router();

const LOGO_DATA_URL_PREFIX = 'data:image/png;base64,';
const MAX_LOGO_BYTES = 1.5 * 1024 * 1024;
const MAX_PUBLIC_LOGO_BYTES = 300 * 1024;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CNPJ_DIGITS_REGEX = /^\d{14}$/;
const CEP_DIGITS_REGEX = /^\d{8}$/;
const CONVENIO_STATUS_VALUES = ['ativo', 'inativo'];
const CONVENIO_STATUS_SET = new Set(CONVENIO_STATUS_VALUES);

const DEFAULT_BUSINESS_HOURS = {
  opening_time: '08:00',
  closing_time: '17:20',
  lunch_break_minutes: 60,
  operating_days: {
    seg: true,
    ter: true,
    qua: true,
    qui: true,
    sex: true,
    sab: false,
    dom: false,
  },
};

const DEFAULT_PROFESSIONALS_CONFIG = {
  allowed_contract_types: ['CLT', 'PJ', 'Voluntário', 'Estágio', 'Temporário'],
  suggested_weekly_hours: [20, 30, 40],
};

const DEFAULT_PROFESSIONAL_ROLES = [
  'Psicologo',
  'Fonoaudiologo',
  'Assistente Social',
  'Terapeuta Ocupacional',
  'Fisioterapeuta',
  'Psicopedagogo',
  'Pedagogo',
  'Nutricionista',
  'Enfermeiro',
];

const DEFAULT_SETTINGS = {
  instituicao_nome: 'Instituto Lauir Machado',
  instituicao_email: 'contato@institutolauir.com.br',
  instituicao_telefone: '(11) 3456-7890',
  instituicao_endereco: 'Rua das Flores, 123 - Sao Paulo, SP',
  instituicao_cnpj: '',
  instituicao_cep: '',
  instituicao_cidade: '',
  instituicao_estado: '',
  instituicao_logo_url: null,
  instituicao_logo_base64: null,
  email_notifications: true,
  sms_notifications: false,
  push_notifications: true,
  weekly_reports: true,
  two_factor_auth: false,
  password_expiry_days: 90,
  max_login_attempts: 3,
  session_timeout: 60,
  backup_frequency: 'daily',
  data_retention_days: 365,
  auto_updates: true,
  debug_mode: false,
  registration_mode: DEFAULT_ACCESS_SETTINGS.registration_mode,
  public_signup_default_status: DEFAULT_ACCESS_SETTINGS.public_signup_default_status,
  link_policy: DEFAULT_ACCESS_SETTINGS.link_policy,
  allow_create_user_from_professional:
    DEFAULT_ACCESS_SETTINGS.allow_create_user_from_professional,
  block_duplicate_email: DEFAULT_ACCESS_SETTINGS.block_duplicate_email,
  allow_public_registration: DEFAULT_ACCESS_SETTINGS.allow_public_registration,
  allow_professional_view_others: false,
  business_hours: DEFAULT_BUSINESS_HOURS,
  professionals_config: DEFAULT_PROFESSIONALS_CONFIG,
};

const SETTINGS_EDITABLE_FIELDS = [
  'instituicao_nome',
  'instituicao_email',
  'instituicao_telefone',
  'instituicao_endereco',
  'instituicao_cnpj',
  'instituicao_cep',
  'instituicao_cidade',
  'instituicao_estado',
  'instituicao_logo_base64',
  'email_notifications',
  'sms_notifications',
  'push_notifications',
  'weekly_reports',
  'two_factor_auth',
  'password_expiry_days',
  'max_login_attempts',
  'session_timeout',
  'backup_frequency',
  'data_retention_days',
  'auto_updates',
  'debug_mode',
  'registration_mode',
  'public_signup_default_status',
  'link_policy',
  'allow_create_user_from_professional',
  'block_duplicate_email',
  'allow_public_registration',
  'allow_professional_view_others',
  'business_hours',
  'professionals_config',
];

let settingsSchemaReadyPromise = null;
let settingsColumnsCache = null;
let conveniosSchemaReadyPromise = null;
let professionalRolesSchemaReadyPromise = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

function normalizeIntegerId(value) {
  const asNumber = Number(value);
  if (!Number.isInteger(asNumber) || asNumber <= 0) return null;
  return asNumber;
}

function resolveUpdatedByValue(userId, columnType) {
  if (userId === null || userId === undefined || !columnType) {
    return { ok: false };
  }

  const type = (columnType || '').toLowerCase();

  if (type === 'uuid') {
    const normalized = typeof userId === 'string' ? userId.trim() : String(userId);
    return isUuid(normalized) ? { ok: true, value: normalized } : { ok: false };
  }

  if (['int2', 'int4', 'int8'].includes(type)) {
    const normalized = normalizeIntegerId(userId);
    return normalized !== null ? { ok: true, value: normalized } : { ok: false };
  }

  return { ok: true, value: userId };
}

async function ensureSystemSettingsSchema() {
  if (!settingsSchemaReadyPromise) {
    settingsSchemaReadyPromise = (async () => {
      await pool.query(`
        ALTER TABLE public.system_settings
          ADD COLUMN IF NOT EXISTS instituicao_cnpj text,
          ADD COLUMN IF NOT EXISTS instituicao_cep text,
          ADD COLUMN IF NOT EXISTS instituicao_cidade text,
          ADD COLUMN IF NOT EXISTS instituicao_estado text,
          ADD COLUMN IF NOT EXISTS instituicao_logo_base64 text,
          ADD COLUMN IF NOT EXISTS instituicao_logo_updated_at timestamptz DEFAULT now(),
          ADD COLUMN IF NOT EXISTS business_hours jsonb,
          ADD COLUMN IF NOT EXISTS professionals_config jsonb,
          ADD COLUMN IF NOT EXISTS registration_mode text,
          ADD COLUMN IF NOT EXISTS public_signup_default_status text,
          ADD COLUMN IF NOT EXISTS link_policy text,
          ADD COLUMN IF NOT EXISTS allow_create_user_from_professional boolean,
          ADD COLUMN IF NOT EXISTS block_duplicate_email boolean,
          ADD COLUMN IF NOT EXISTS allow_public_registration boolean,
          ADD COLUMN IF NOT EXISTS allow_professional_view_others boolean
      `);

      await pool.query(
        `
          UPDATE public.system_settings
          SET business_hours = COALESCE(business_hours, $1::jsonb),
              professionals_config = COALESCE(professionals_config, $2::jsonb),
              registration_mode = CASE
                WHEN UPPER(COALESCE(registration_mode, '')) IN ('ADMIN_ONLY', 'PUBLIC_SIGNUP', 'INVITE_ONLY')
                  THEN UPPER(registration_mode)
                WHEN allow_public_registration = true THEN 'PUBLIC_SIGNUP'
                ELSE $3
              END,
              public_signup_default_status = CASE
                WHEN LOWER(COALESCE(public_signup_default_status, '')) IN ('pendente', 'ativo')
                  THEN LOWER(public_signup_default_status)
                ELSE $4
              END,
              link_policy = CASE
                WHEN UPPER(COALESCE(link_policy, '')) IN ('MANUAL_LINK_ADMIN', 'AUTO_LINK_BY_EMAIL', 'SELF_CLAIM_WITH_APPROVAL')
                  THEN UPPER(link_policy)
                ELSE $5
              END,
              allow_create_user_from_professional = COALESCE(
                allow_create_user_from_professional,
                $6
              ),
              block_duplicate_email = COALESCE(block_duplicate_email, $7),
              allow_public_registration = COALESCE(
                allow_public_registration,
                registration_mode = 'PUBLIC_SIGNUP',
                false
              ),
              allow_professional_view_others = COALESCE(allow_professional_view_others, false)
        `,
        [
          JSON.stringify(DEFAULT_BUSINESS_HOURS),
          JSON.stringify(DEFAULT_PROFESSIONALS_CONFIG),
          DEFAULT_ACCESS_SETTINGS.registration_mode,
          DEFAULT_ACCESS_SETTINGS.public_signup_default_status,
          DEFAULT_ACCESS_SETTINGS.link_policy,
          DEFAULT_ACCESS_SETTINGS.allow_create_user_from_professional,
          DEFAULT_ACCESS_SETTINGS.block_duplicate_email,
        ]
      );

      await pool.query(`
        ALTER TABLE public.system_settings
          ALTER COLUMN registration_mode SET DEFAULT '${DEFAULT_ACCESS_SETTINGS.registration_mode}',
          ALTER COLUMN registration_mode SET NOT NULL,
          ALTER COLUMN public_signup_default_status SET DEFAULT '${DEFAULT_ACCESS_SETTINGS.public_signup_default_status}',
          ALTER COLUMN public_signup_default_status SET NOT NULL,
          ALTER COLUMN link_policy SET DEFAULT '${DEFAULT_ACCESS_SETTINGS.link_policy}',
          ALTER COLUMN link_policy SET NOT NULL,
          ALTER COLUMN allow_create_user_from_professional SET DEFAULT ${DEFAULT_ACCESS_SETTINGS.allow_create_user_from_professional ? 'true' : 'false'},
          ALTER COLUMN allow_create_user_from_professional SET NOT NULL,
          ALTER COLUMN block_duplicate_email SET DEFAULT ${DEFAULT_ACCESS_SETTINGS.block_duplicate_email ? 'true' : 'false'},
          ALTER COLUMN block_duplicate_email SET NOT NULL,
          ALTER COLUMN allow_public_registration SET DEFAULT false,
          ALTER COLUMN allow_public_registration SET NOT NULL,
          ALTER COLUMN allow_professional_view_others SET DEFAULT false,
          ALTER COLUMN allow_professional_view_others SET NOT NULL
      `);

      settingsColumnsCache = null;
    })().catch((error) => {
      settingsSchemaReadyPromise = null;
      throw error;
    });
  }

  return settingsSchemaReadyPromise;
}

async function getSystemSettingsColumnsMap() {
  if (settingsColumnsCache) return settingsColumnsCache;

  const { rows } = await pool.query(
    `
      SELECT column_name, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'system_settings'
    `
  );

  settingsColumnsCache = new Map(
    rows.map((row) => [row.column_name, (row.udt_name || '').toLowerCase()])
  );

  return settingsColumnsCache;
}

async function ensureConveniosSchema() {
  if (!conveniosSchemaReadyPromise) {
    conveniosSchemaReadyPromise = (async () => {
      await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.convenios (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          nome text NOT NULL,
          numero_projeto text,
          data_inicio date,
          data_fim date,
          status text NOT NULL DEFAULT 'ativo',
          quantidade_atendidos integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW(),
          created_by text,
          updated_by text,
          CONSTRAINT convenios_status_check
            CHECK (status IN ('ativo', 'inativo')),
          CONSTRAINT convenios_quantidade_atendidos_check
            CHECK (quantidade_atendidos >= 0),
          CONSTRAINT convenios_intervalo_datas_check
            CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio)
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_convenios_status
          ON public.convenios (status)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_convenios_nome
          ON public.convenios (LOWER(nome))
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_convenios_data_inicio
          ON public.convenios (data_inicio)
      `);
    })().catch((error) => {
      conveniosSchemaReadyPromise = null;
      throw error;
    });
  }

  return conveniosSchemaReadyPromise;
}

function parseMaybeJson(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return value;
}

function normalizeOperatingDays(value) {
  const fallback = clone(DEFAULT_BUSINESS_HOURS.operating_days);
  const parsed = parseMaybeJson(value);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fallback;
  }

  const output = { ...fallback };
  for (const key of Object.keys(fallback)) {
    if (parsed[key] !== undefined) {
      output[key] = Boolean(parsed[key]);
    }
  }

  return output;
}

function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

function validateBusinessHours(value) {
  const parsed = parseMaybeJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'business_hours deve ser um objeto JSON valido.' };
  }

  const openingTime = (parsed.opening_time || '').toString().trim();
  const closingTime = (parsed.closing_time || '').toString().trim();
  const lunchBreakMinutes = Number(parsed.lunch_break_minutes);

  if (!isValidTime(openingTime) || !isValidTime(closingTime)) {
    return { ok: false, message: 'Horarios invalidos. Use o formato HH:MM.' };
  }

  if (!Number.isInteger(lunchBreakMinutes) || lunchBreakMinutes < 0 || lunchBreakMinutes > 240) {
    return { ok: false, message: 'lunch_break_minutes deve ser inteiro entre 0 e 240.' };
  }

  return {
    ok: true,
    value: {
      opening_time: openingTime,
      closing_time: closingTime,
      lunch_break_minutes: lunchBreakMinutes,
      operating_days: normalizeOperatingDays(parsed.operating_days),
    },
  };
}

function normalizeContractTypes(values) {
  if (!Array.isArray(values)) return [];

  const seen = new Set();
  const cleaned = [];

  for (const item of values) {
    const text = (item || '').toString().trim();
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    cleaned.push(text);
  }

  return cleaned;
}

function normalizeSuggestedWeeklyHours(values) {
  if (!Array.isArray(values)) return [];

  const seen = new Set();
  const cleaned = [];

  for (const item of values) {
    const numberValue = Number(item);
    if (!Number.isInteger(numberValue) || numberValue <= 0 || numberValue > 168) {
      continue;
    }

    if (seen.has(numberValue)) continue;
    seen.add(numberValue);
    cleaned.push(numberValue);
  }

  return cleaned;
}

function validateProfessionalsConfig(value) {
  const parsed = parseMaybeJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'professionals_config deve ser um objeto JSON valido.' };
  }

  const allowedContractTypes = normalizeContractTypes(parsed.allowed_contract_types);
  if (allowedContractTypes.length === 0) {
    return { ok: false, message: 'Informe ao menos um tipo de contrato permitido.' };
  }

  const suggestedWeeklyHours = normalizeSuggestedWeeklyHours(parsed.suggested_weekly_hours);
  if (suggestedWeeklyHours.length === 0) {
    return { ok: false, message: 'Informe ao menos uma carga horaria sugerida.' };
  }

  return {
    ok: true,
    value: {
      allowed_contract_types: allowedContractTypes,
      suggested_weekly_hours: suggestedWeeklyHours,
    },
  };
}

function normalizeSettingsPayload(body) {
  if (!body || typeof body !== 'object') return {};

  const normalized = {};
  for (const field of SETTINGS_EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;

    if (field === 'instituicao_logo_base64' && body[field] === '') {
      normalized[field] = null;
      continue;
    }

    normalized[field] = body[field];
  }

  return normalized;
}

function sanitizeRoleName(value) {
  return (value || '').toString().trim().replace(/\s+/g, ' ');
}

function parseRoleId(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseRoleActive(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 't', 'yes', 'sim'].includes(normalized)) return true;
    if (['0', 'false', 'f', 'no', 'nao', 'não'].includes(normalized)) return false;
  }
  return null;
}

function parseRolePreAppointmentVisibility(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  const parsed = parseRoleActive(value);
  return parsed === null ? fallback : parsed;
}

function mapRoleRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    ativo: row.ativo,
    show_in_pre_appointment: row.show_in_pre_appointment !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function estimateBase64Bytes(base64) {
  const trimmed = base64.trim();
  const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
  return Math.floor((trimmed.length * 3) / 4) - padding;
}

function validateInstitutionLogoDataUrl(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    return 'Campo instituicao_logo_base64 deve ser uma string data URL PNG ou null.';
  }

  const trimmedValue = value.trim();
  if (!trimmedValue.startsWith(LOGO_DATA_URL_PREFIX)) {
    return 'Logo invalida: envie no formato data:image/png;base64,...';
  }

  const base64Payload = trimmedValue.slice(LOGO_DATA_URL_PREFIX.length);
  if (!base64Payload) {
    return 'Logo invalida: conteudo base64 ausente.';
  }

  if (base64Payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+=*$/.test(base64Payload)) {
    return 'Logo invalida: conteudo base64 malformado.';
  }

  const logoBytes = estimateBase64Bytes(base64Payload);
  if (logoBytes > MAX_LOGO_BYTES) {
    return 'Logo excede o limite de 1.5MB.';
  }

  return null;
}

function onlyDigits(value) {
  return (value || '').toString().replace(/\D/g, '');
}

function formatCnpj(digits) {
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatCep(digits) {
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function validateInstitutionCnpj(value) {
  if (value === null || value === undefined || value === '') {
    return { ok: true, value: '' };
  }
  if (typeof value !== 'string') {
    return { ok: false, message: 'instituicao_cnpj deve ser string.' };
  }

  const digits = onlyDigits(value);
  if (!CNPJ_DIGITS_REGEX.test(digits) || /^(\d)\1{13}$/.test(digits)) {
    return { ok: false, message: 'CNPJ invalido. Informe 14 digitos no formato 00.000.000/0000-00.' };
  }

  return { ok: true, value: formatCnpj(digits) };
}

function validateInstitutionCep(value) {
  if (value === null || value === undefined || value === '') {
    return { ok: true, value: '' };
  }
  if (typeof value !== 'string') {
    return { ok: false, message: 'instituicao_cep deve ser string.' };
  }

  const digits = onlyDigits(value);
  if (!CEP_DIGITS_REGEX.test(digits)) {
    return { ok: false, message: 'CEP invalido. Informe 8 digitos no formato 00000-000.' };
  }

  return { ok: true, value: formatCep(digits) };
}

function normalizeInstitutionText(value, fieldName, { maxLength = 120, uppercase = false } = {}) {
  if (value === null || value === undefined || value === '') return { ok: true, value: '' };
  if (typeof value !== 'string') {
    return { ok: false, message: `${fieldName} deve ser string.` };
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { ok: false, message: `${fieldName} deve ter no maximo ${maxLength} caracteres.` };
  }

  return { ok: true, value: uppercase ? trimmed.toUpperCase() : trimmed };
}

function sanitizeConvenioName(value) {
  return (value || '').toString().trim().replace(/\s+/g, ' ');
}

function sanitizeConvenioOptionalText(value, maxLength = 120) {
  if (value === null || value === undefined) return null;
  const text = value.toString().trim().replace(/\s+/g, ' ');
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeConvenioStatus(value, fallback = 'ativo') {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (!normalized) return fallback;
  if (CONVENIO_STATUS_SET.has(normalized)) return normalized;
  if (['active', 'enabled', '1', 'true', 'sim'].includes(normalized)) return 'ativo';
  if (['inactive', 'disabled', '0', 'false', 'nao', 'não'].includes(normalized)) return 'inativo';
  return null;
}

function isValidIsoCalendarDate(value) {
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const normalized = new Date(Date.UTC(year, month - 1, day));
  return (
    normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() === month - 1 &&
    normalized.getUTCDate() === day
  );
}

function parseConvenioDate(rawValue, fieldName) {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return { ok: true, value: null };
  }
  if (typeof rawValue !== 'string') {
    return { ok: false, message: `${fieldName} deve ser data no formato YYYY-MM-DD.` };
  }
  const value = rawValue.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, message: `${fieldName} deve estar no formato YYYY-MM-DD.` };
  }
  if (!isValidIsoCalendarDate(value)) {
    return { ok: false, message: `${fieldName} deve ser uma data valida.` };
  }
  return { ok: true, value };
}

function parseConvenioQuantidade(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return { ok: true, value: 0 };
  }
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) {
    return { ok: false, message: 'quantidade_atendidos deve ser numero inteiro nao negativo.' };
  }
  return { ok: true, value };
}

function mapConvenioRow(row) {
  if (!row) return null;
  return {
    id: row.id?.toString() || '',
    nome: row.nome || '',
    numero_projeto: row.numero_projeto || null,
    data_inicio: row.data_inicio || null,
    data_fim: row.data_fim || null,
    status: normalizeConvenioStatus(row.status, 'ativo') || 'ativo',
    quantidade_atendidos: Number(row.quantidade_atendidos || 0),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    created_by: row.created_by || null,
    updated_by: row.updated_by || null,
  };
}

function parseConvenioPayload(body, { requireName = true } = {}) {
  const rawBody = body && typeof body === 'object' ? body : {};

  const nome = sanitizeConvenioName(rawBody.nome);
  if (requireName && !nome) {
    return { ok: false, message: 'nome e obrigatorio.' };
  }
  if (nome && nome.length > 160) {
    return { ok: false, message: 'nome deve ter no maximo 160 caracteres.' };
  }

  const numeroProjetoText = sanitizeConvenioOptionalText(rawBody.numero_projeto, 500);
  if (numeroProjetoText && numeroProjetoText.length > 80) {
    return { ok: false, message: 'numero_projeto deve ter no maximo 80 caracteres.' };
  }
  const numeroProjeto = numeroProjetoText;
  const dataInicioValidation = parseConvenioDate(rawBody.data_inicio, 'data_inicio');
  if (!dataInicioValidation.ok) {
    return { ok: false, message: dataInicioValidation.message };
  }
  const dataFimValidation = parseConvenioDate(rawBody.data_fim, 'data_fim');
  if (!dataFimValidation.ok) {
    return { ok: false, message: dataFimValidation.message };
  }
  const quantidadeValidation = parseConvenioQuantidade(rawBody.quantidade_atendidos);
  if (!quantidadeValidation.ok) {
    return { ok: false, message: quantidadeValidation.message };
  }

  const status = normalizeConvenioStatus(rawBody.status, 'ativo');
  if (!status) {
    return { ok: false, message: 'status deve ser ativo ou inativo.' };
  }

  if (
    dataInicioValidation.value &&
    dataFimValidation.value &&
    dataFimValidation.value < dataInicioValidation.value
  ) {
    return { ok: false, message: 'data_fim nao pode ser menor que data_inicio.' };
  }

  return {
    ok: true,
    value: {
      nome: nome || '',
      numero_projeto: numeroProjeto,
      data_inicio: dataInicioValidation.value,
      data_fim: dataFimValidation.value,
      status,
      quantidade_atendidos: quantidadeValidation.value,
    },
  };
}

function normalizePublicName(value) {
  if (typeof value !== 'string') return DEFAULT_SETTINGS.instituicao_nome;
  const normalized = value.trim();
  return normalized || DEFAULT_SETTINGS.instituicao_nome;
}

function resolveRequestOrigin(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];

  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : typeof forwardedProto === 'string'
      ? forwardedProto.split(',')[0].trim()
      : req.protocol;

  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : typeof forwardedHost === 'string'
      ? forwardedHost.split(',')[0].trim()
      : req.headers.host;

  if (!host || typeof host !== 'string') return null;
  return `${protocol || 'http'}://${host}`;
}

function normalizePublicLogoUrl(value, req) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (normalized.startsWith('//')) {
    const protocol = req.protocol || 'https';
    return `${protocol}:${normalized}`;
  }

  if (normalized.startsWith('data:') || normalized.startsWith('javascript:')) {
    return null;
  }

  const publicPath = normalized.startsWith('/') ? normalized : `/${normalized}`;
  if (!publicPath.startsWith('/uploads/')) {
    return publicPath;
  }

  const origin = resolveRequestOrigin(req);
  return origin ? `${origin}${publicPath}` : publicPath;
}

function normalizePublicLogoBase64(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized.startsWith(LOGO_DATA_URL_PREFIX)) return null;

  const payload = normalized.slice(LOGO_DATA_URL_PREFIX.length);
  if (!payload) return null;

  const logoBytes = estimateBase64Bytes(payload);
  if (logoBytes > MAX_PUBLIC_LOGO_BYTES) return null;

  return normalized;
}

function buildPublicSettingsResponse(normalized, req) {
  const registrationMode = normalizeRegistrationMode(
    normalized?.registration_mode ||
      (normalized?.allow_public_registration ? 'PUBLIC_SIGNUP' : null)
  );
  const instituicao_nome = normalizePublicName(normalized?.instituicao_nome);
  const instituicao_logo_url = normalizePublicLogoUrl(normalized?.instituicao_logo_url, req);
  const instituicao_logo_base64 = instituicao_logo_url
    ? null
    : normalizePublicLogoBase64(normalized?.instituicao_logo_base64);

  return {
    registration_mode: registrationMode,
    allow_public_registration: deriveAllowPublicRegistration(registrationMode),
    instituicao_nome,
    instituicao_logo_url,
    instituicao_logo_base64,
  };
}

function normalizeSettingsRow(row) {
  const source = row || {};
  const registration_mode = normalizeRegistrationMode(
    source.registration_mode ||
      (source.allow_public_registration === true ? 'PUBLIC_SIGNUP' : null)
  );
  const public_signup_default_status = normalizePublicSignupDefaultStatus(
    source.public_signup_default_status
  );
  const link_policy = normalizeLinkPolicy(source.link_policy);
  const allow_create_user_from_professional =
    typeof source.allow_create_user_from_professional === 'boolean'
      ? source.allow_create_user_from_professional
      : DEFAULT_ACCESS_SETTINGS.allow_create_user_from_professional;
  const block_duplicate_email =
    typeof source.block_duplicate_email === 'boolean'
      ? source.block_duplicate_email
      : DEFAULT_ACCESS_SETTINGS.block_duplicate_email;
  const allow_public_registration = deriveAllowPublicRegistration(registration_mode);

  const businessHoursValidation = validateBusinessHours(
    source.business_hours || DEFAULT_SETTINGS.business_hours
  );
  const professionalsConfigValidation = validateProfessionalsConfig(
    source.professionals_config || DEFAULT_SETTINGS.professionals_config
  );

  return {
    ...DEFAULT_SETTINGS,
    ...source,
    registration_mode,
    public_signup_default_status,
    link_policy,
    allow_create_user_from_professional,
    block_duplicate_email,
    allow_public_registration,
    business_hours: businessHoursValidation.ok
      ? businessHoursValidation.value
      : clone(DEFAULT_BUSINESS_HOURS),
    professionals_config: professionalsConfigValidation.ok
      ? professionalsConfigValidation.value
      : clone(DEFAULT_PROFESSIONALS_CONFIG),
  };
}

async function selectSingletonSettings() {
  const { rows } = await pool.query('SELECT * FROM system_settings LIMIT 1');
  return rows[0] || null;
}

async function createSingletonSettings(seed = {}) {
  const normalizedSeed = normalizeSettingsRow(seed);
  const values = [
    normalizedSeed.instituicao_nome,
    normalizedSeed.instituicao_email,
    normalizedSeed.instituicao_telefone,
    normalizedSeed.instituicao_endereco,
    normalizedSeed.instituicao_cnpj,
    normalizedSeed.instituicao_cep,
    normalizedSeed.instituicao_cidade,
    normalizedSeed.instituicao_estado,
    normalizedSeed.instituicao_logo_base64,
    normalizedSeed.email_notifications,
    normalizedSeed.sms_notifications,
    normalizedSeed.push_notifications,
    normalizedSeed.weekly_reports,
    normalizedSeed.two_factor_auth,
    normalizedSeed.password_expiry_days,
    normalizedSeed.max_login_attempts,
    normalizedSeed.session_timeout,
    normalizedSeed.backup_frequency,
    normalizedSeed.data_retention_days,
    normalizedSeed.auto_updates,
    normalizedSeed.debug_mode,
    normalizedSeed.registration_mode,
    normalizedSeed.public_signup_default_status,
    normalizedSeed.link_policy,
    normalizedSeed.allow_create_user_from_professional,
    normalizedSeed.block_duplicate_email,
    normalizedSeed.allow_public_registration,
    normalizedSeed.allow_professional_view_others,
    JSON.stringify(normalizedSeed.business_hours),
    JSON.stringify(normalizedSeed.professionals_config),
  ];

  try {
    const { rows } = await pool.query(
      `
        INSERT INTO system_settings (
          id,
          instituicao_nome,
          instituicao_email,
          instituicao_telefone,
          instituicao_endereco,
          instituicao_cnpj,
          instituicao_cep,
          instituicao_cidade,
          instituicao_estado,
          instituicao_logo_base64,
          email_notifications,
          sms_notifications,
          push_notifications,
          weekly_reports,
          two_factor_auth,
          password_expiry_days,
          max_login_attempts,
          session_timeout,
          backup_frequency,
          data_retention_days,
          auto_updates,
          debug_mode,
          registration_mode,
          public_signup_default_status,
          link_policy,
          allow_create_user_from_professional,
          block_duplicate_email,
          allow_public_registration,
          allow_professional_view_others,
          business_hours,
          professionals_config
        ) VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20,
          $21,
          $22,
          $23,
          $24,
          $25,
          $26,
          $27,
          $28,
          $29::jsonb,
          $30::jsonb
        )
        RETURNING *
      `,
      values
    );

    return rows[0];
  } catch (error) {
    if (error?.code !== '42883') throw error;

    const fallbackValues = [randomUUID(), ...values];
    const { rows } = await pool.query(
      `
        INSERT INTO system_settings (
          id,
          instituicao_nome,
          instituicao_email,
          instituicao_telefone,
          instituicao_endereco,
          instituicao_cnpj,
          instituicao_cep,
          instituicao_cidade,
          instituicao_estado,
          instituicao_logo_base64,
          email_notifications,
          sms_notifications,
          push_notifications,
          weekly_reports,
          two_factor_auth,
          password_expiry_days,
          max_login_attempts,
          session_timeout,
          backup_frequency,
          data_retention_days,
          auto_updates,
          debug_mode,
          registration_mode,
          public_signup_default_status,
          link_policy,
          allow_create_user_from_professional,
          block_duplicate_email,
          allow_public_registration,
          allow_professional_view_others,
          business_hours,
          professionals_config
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20,
          $21,
          $22,
          $23,
          $24,
          $25,
          $26,
          $27,
          $28,
          $29,
          $30::jsonb,
          $31::jsonb
        )
        RETURNING *
      `,
      fallbackValues
    );

    return rows[0];
  }
}

async function ensureSingletonSettings(seed = {}) {
  await ensureSystemSettingsSchema();

  const existing = await selectSingletonSettings();
  if (existing) return existing;

  try {
    return await createSingletonSettings(seed);
  } catch (error) {
    if (error?.code === '23505') {
      const row = await selectSingletonSettings();
      if (row) return row;
    }

    throw error;
  }
}

function successResponse(res, data) {
  const normalizedData = normalizeSettingsRow(data);

  return res.json({
    success: true,
    data: normalizedData,
    settings: normalizedData,
  });
}

router.get('/public', async (req, res) => {
  try {
    const row = await ensureSingletonSettings();
    const normalized = normalizeSettingsRow(row);
    const publicData = buildPublicSettingsResponse(normalized, req);

    return res.json({
      success: true,
      ...publicData,
      data: publicData,
      settings: publicData,
    });
  } catch (error) {
    console.error('[settings][public][GET] erro ao buscar configuracao publica:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });

    const fallbackData = buildPublicSettingsResponse(DEFAULT_SETTINGS, req);

    return res.json({
      success: false,
      ...fallbackData,
      data: fallbackData,
      settings: fallbackData,
    });
  }
});

function ensureProfessionalRolesSchema() {
  if (!professionalRolesSchemaReadyPromise) {
    professionalRolesSchemaReadyPromise = (async () => {
      await pool.query(`
        ALTER TABLE public.professional_roles
          ADD COLUMN IF NOT EXISTS show_in_pre_appointment boolean
      `);

      await pool.query(`
        UPDATE public.professional_roles
        SET show_in_pre_appointment = true
        WHERE show_in_pre_appointment IS NULL
      `);

      await pool.query(`
        ALTER TABLE public.professional_roles
          ALTER COLUMN show_in_pre_appointment SET DEFAULT true,
          ALTER COLUMN show_in_pre_appointment SET NOT NULL
      `);
    })().catch((error) => {
      professionalRolesSchemaReadyPromise = null;
      throw error;
    });
  }
  return professionalRolesSchemaReadyPromise;
}

async function ensureDefaultProfessionalRoles() {
  await ensureProfessionalRolesSchema();
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS total FROM public.professional_roles'
  );
  const total = rows[0]?.total ?? 0;
  if (total > 0) return;

  for (const nome of DEFAULT_PROFESSIONAL_ROLES) {
    await pool.query(
      `
        INSERT INTO public.professional_roles (nome, ativo, show_in_pre_appointment)
        VALUES ($1, true, true)
        ON CONFLICT DO NOTHING
      `,
      [nome]
    );
  }
}

router.use(authMiddleware);

router.get('/professional-roles', authorize('configuracoes', 'view'), async (req, res) => {
  try {
    await ensureDefaultProfessionalRoles();
    const includeAll = req.query?.all === '1';

    const { rows } = await pool.query(
      `
        SELECT id, nome, ativo, show_in_pre_appointment, created_at, updated_at
        FROM public.professional_roles
        ${includeAll ? '' : 'WHERE ativo = true'}
        ORDER BY nome ASC
      `
    );

    return res.json({
      success: true,
      roles: rows.map(mapRoleRow),
    });
  } catch (error) {
    console.error('[settings][roles][GET] erro ao buscar funcoes:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(500).json({ success: false, message: 'Erro ao buscar funcoes profissionais' });
  }
});

router.post('/professional-roles', authorize('configuracoes', 'edit'), async (req, res) => {
  try {
    await ensureProfessionalRolesSchema();
    const nome = sanitizeRoleName(req.body?.nome);
    const showInPreAppointment = parseRolePreAppointmentVisibility(
      req.body?.show_in_pre_appointment,
      true
    );
    if (!nome) {
      return res.status(400).json({ success: false, message: 'nome e obrigatorio' });
    }
    if (nome.length > 120) {
      return res.status(400).json({ success: false, message: 'nome deve ter no maximo 120 caracteres' });
    }

    const duplicate = await pool.query(
      `
        SELECT id
        FROM public.professional_roles
        WHERE LOWER(nome) = LOWER($1)
        LIMIT 1
      `,
      [nome]
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Ja existe funcao com este nome' });
    }

    const inserted = await pool.query(
      `
        INSERT INTO public.professional_roles (nome, ativo, show_in_pre_appointment)
        VALUES ($1, true, $2)
        RETURNING id, nome, ativo, show_in_pre_appointment, created_at, updated_at
      `,
      [nome, showInPreAppointment]
    );

    return res.status(201).json({
      success: true,
      role: mapRoleRow(inserted.rows[0]),
    });
  } catch (error) {
    console.error('[settings][roles][POST] erro ao criar funcao:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(500).json({ success: false, message: 'Erro ao criar funcao profissional' });
  }
});

router.put('/professional-roles/:id', authorize('configuracoes', 'edit'), async (req, res) => {
  try {
    await ensureProfessionalRolesSchema();
    const id = parseRoleId(req.params?.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'id invalido' });
    }

    const nome = sanitizeRoleName(req.body?.nome);
    if (!nome) {
      return res.status(400).json({ success: false, message: 'nome e obrigatorio' });
    }
    if (nome.length > 120) {
      return res.status(400).json({ success: false, message: 'nome deve ter no maximo 120 caracteres' });
    }

    const body = req.body || {};
    const showInPreAppointmentProvided = Object.prototype.hasOwnProperty.call(
      body,
      'show_in_pre_appointment'
    );
    const showInPreAppointment = parseRolePreAppointmentVisibility(
      body?.show_in_pre_appointment,
      true
    );

    const duplicate = await pool.query(
      `
        SELECT id
        FROM public.professional_roles
        WHERE LOWER(nome) = LOWER($1)
          AND id <> $2
        LIMIT 1
      `,
      [nome, id]
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Ja existe funcao com este nome' });
    }

    const setClauses = ['nome = $1', 'updated_at = NOW()'];
    const updateParams = [nome];
    if (showInPreAppointmentProvided) {
      updateParams.push(showInPreAppointment);
      setClauses.push(`show_in_pre_appointment = $${updateParams.length}`);
    }
    updateParams.push(id);

    const updated = await pool.query(
      `
        UPDATE public.professional_roles
        SET ${setClauses.join(', ')}
        WHERE id = $${updateParams.length}
        RETURNING id, nome, ativo, show_in_pre_appointment, created_at, updated_at
      `,
      updateParams
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Funcao nao encontrada' });
    }

    return res.json({
      success: true,
      role: mapRoleRow(updated.rows[0]),
    });
  } catch (error) {
    console.error('[settings][roles][PUT] erro ao editar funcao:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(500).json({ success: false, message: 'Erro ao editar funcao profissional' });
  }
});

router.patch('/professional-roles/:id/ativo', authorize('configuracoes', 'edit'), async (req, res) => {
  try {
    await ensureProfessionalRolesSchema();
    const id = parseRoleId(req.params?.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'id invalido' });
    }

    const ativo = parseRoleActive(req.body?.ativo);
    if (ativo === null) {
      return res.status(400).json({ success: false, message: 'ativo deve ser booleano' });
    }

    const updated = await pool.query(
      `
        UPDATE public.professional_roles
        SET ativo = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING id, nome, ativo, show_in_pre_appointment, created_at, updated_at
      `,
      [ativo, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Funcao nao encontrada' });
    }

    return res.json({
      success: true,
      role: mapRoleRow(updated.rows[0]),
    });
  } catch (error) {
    console.error('[settings][roles][PATCH] erro ao atualizar status da funcao:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(500).json({ success: false, message: 'Erro ao atualizar status da funcao' });
  }
});

router.patch(
  '/professional-roles/:id/show-in-pre-appointment',
  authorize('configuracoes', 'edit'),
  async (req, res) => {
    try {
      await ensureProfessionalRolesSchema();
      const id = parseRoleId(req.params?.id);
      if (!id) {
        return res.status(400).json({ success: false, message: 'id invalido' });
      }

      const visible = parseRoleActive(req.body?.show_in_pre_appointment);
      if (visible === null) {
        return res.status(400).json({
          success: false,
          message: 'show_in_pre_appointment deve ser booleano',
        });
      }

      const updated = await pool.query(
        `
          UPDATE public.professional_roles
          SET show_in_pre_appointment = $1,
              updated_at = NOW()
          WHERE id = $2
          RETURNING id, nome, ativo, show_in_pre_appointment, created_at, updated_at
        `,
        [visible, id]
      );

      if (updated.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Funcao nao encontrada' });
      }

      return res.json({
        success: true,
        role: mapRoleRow(updated.rows[0]),
      });
    } catch (error) {
      console.error('[settings][roles][PATCH visibility] erro ao atualizar visibilidade:', {
        code: error?.code,
        message: error?.message,
        stack: error?.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Erro ao atualizar visibilidade na fila de espera',
      });
    }
  }
);

router.delete('/professional-roles/:id', authorize('configuracoes', 'edit'), async (req, res) => {
  const id = parseRoleId(req.params?.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'id invalido' });
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await ensureProfessionalRolesSchema();
    await client.query('BEGIN');
    transactionStarted = true;

    const roleResult = await client.query(
      `
        SELECT id, nome, ativo, show_in_pre_appointment, created_at, updated_at
        FROM public.professional_roles
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [id]
    );

    if (roleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Funcao nao encontrada' });
    }

    const usageResult = await client.query(
      `
        SELECT COUNT(*)::int AS total
        FROM public.professionals
        WHERE role_id = $1
      `,
      [id]
    );
    const linkedProfessionals = Number(usageResult.rows[0]?.total || 0);
    if (linkedProfessionals > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        code: 'role_in_use',
        linked_professionals: linkedProfessionals,
        message:
          'Funcao vinculada a profissionais e nao pode ser excluida com seguranca. Inative a funcao para manter o historico.',
      });
    }

    const deleted = await client.query(
      `
        DELETE FROM public.professional_roles
        WHERE id = $1
        RETURNING id, nome, ativo, show_in_pre_appointment, created_at, updated_at
      `,
      [id]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      role: mapRoleRow(deleted.rows[0]),
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    console.error('[settings][roles][DELETE] erro ao excluir funcao:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(500).json({ success: false, message: 'Erro ao excluir funcao profissional' });
  } finally {
    client.release();
  }
});

router.get('/convenios', authorize('configuracoes', 'view'), async (req, res) => {
  try {
    await ensureConveniosSchema();

    const includeInactive = req.query?.all !== '0';
    const { rows } = await pool.query(
      `
        SELECT
          id::text AS id,
          nome,
          numero_projeto,
          data_inicio,
          data_fim,
          status,
          quantidade_atendidos,
          created_at,
          updated_at,
          created_by,
          updated_by
        FROM public.convenios
        ${includeInactive ? '' : "WHERE status = 'ativo'"}
        ORDER BY
          CASE WHEN status = 'ativo' THEN 0 ELSE 1 END,
          nome ASC,
          created_at DESC
      `
    );

    return res.json({
      success: true,
      convenios: rows.map(mapConvenioRow).filter(Boolean),
    });
  } catch (error) {
    console.error('[settings][convenios][GET] erro ao buscar convenios:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(500).json({ success: false, message: 'Erro ao buscar convenios' });
  }
});

router.post('/convenios', authorize('configuracoes', 'edit'), async (req, res) => {
  try {
    await ensureConveniosSchema();

    const parsedPayload = parseConvenioPayload(req.body, { requireName: true });
    if (!parsedPayload.ok) {
      return res.status(400).json({ success: false, message: parsedPayload.message });
    }

    const actorId = req.user?.id ? req.user.id.toString() : null;
    const payload = parsedPayload.value;

    const { rows } = await pool.query(
      `
        INSERT INTO public.convenios (
          nome,
          numero_projeto,
          data_inicio,
          data_fim,
          status,
          quantidade_atendidos,
          created_by,
          updated_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
        RETURNING
          id::text AS id,
          nome,
          numero_projeto,
          data_inicio,
          data_fim,
          status,
          quantidade_atendidos,
          created_at,
          updated_at,
          created_by,
          updated_by
      `,
      [
        payload.nome,
        payload.numero_projeto,
        payload.data_inicio,
        payload.data_fim,
        payload.status,
        payload.quantidade_atendidos,
        actorId,
        actorId,
      ]
    );

    return res.status(201).json({
      success: true,
      convenio: mapConvenioRow(rows[0]),
    });
  } catch (error) {
    console.error('[settings][convenios][POST] erro ao criar convenio:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(500).json({ success: false, message: 'Erro ao criar convenio' });
  }
});

router.put('/convenios/:id', authorize('configuracoes', 'edit'), async (req, res) => {
  try {
    await ensureConveniosSchema();

    const convenioId = (req.params?.id || '').toString().trim();
    if (!convenioId) {
      return res.status(400).json({ success: false, message: 'id invalido' });
    }

    const parsedPayload = parseConvenioPayload(req.body, { requireName: true });
    if (!parsedPayload.ok) {
      return res.status(400).json({ success: false, message: parsedPayload.message });
    }

    const actorId = req.user?.id ? req.user.id.toString() : null;
    const payload = parsedPayload.value;

    const { rows } = await pool.query(
      `
        UPDATE public.convenios
        SET nome = $1,
            numero_projeto = $2,
            data_inicio = $3,
            data_fim = $4,
            status = $5,
            quantidade_atendidos = $6,
            updated_by = $7,
            updated_at = NOW()
        WHERE id::text = $8
        RETURNING
          id::text AS id,
          nome,
          numero_projeto,
          data_inicio,
          data_fim,
          status,
          quantidade_atendidos,
          created_at,
          updated_at,
          created_by,
          updated_by
      `,
      [
        payload.nome,
        payload.numero_projeto,
        payload.data_inicio,
        payload.data_fim,
        payload.status,
        payload.quantidade_atendidos,
        actorId,
        convenioId,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Convenio nao encontrado' });
    }

    return res.json({
      success: true,
      convenio: mapConvenioRow(rows[0]),
    });
  } catch (error) {
    console.error('[settings][convenios][PUT] erro ao editar convenio:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(500).json({ success: false, message: 'Erro ao editar convenio' });
  }
});

router.patch('/convenios/:id/status', authorize('configuracoes', 'edit'), async (req, res) => {
  try {
    await ensureConveniosSchema();

    const convenioId = (req.params?.id || '').toString().trim();
    if (!convenioId) {
      return res.status(400).json({ success: false, message: 'id invalido' });
    }

    let status = normalizeConvenioStatus(req.body?.status, null);
    if (!status && typeof req.body?.ativo === 'boolean') {
      status = req.body.ativo ? 'ativo' : 'inativo';
    }
    if (!status) {
      return res.status(400).json({ success: false, message: 'status deve ser ativo ou inativo.' });
    }

    const actorId = req.user?.id ? req.user.id.toString() : null;
    const { rows } = await pool.query(
      `
        UPDATE public.convenios
        SET status = $1,
            updated_by = $2,
            updated_at = NOW()
        WHERE id::text = $3
        RETURNING
          id::text AS id,
          nome,
          numero_projeto,
          data_inicio,
          data_fim,
          status,
          quantidade_atendidos,
          created_at,
          updated_at,
          created_by,
          updated_by
      `,
      [status, actorId, convenioId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Convenio nao encontrado' });
    }

    return res.json({
      success: true,
      convenio: mapConvenioRow(rows[0]),
    });
  } catch (error) {
    console.error('[settings][convenios][PATCH] erro ao atualizar status do convenio:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(500).json({ success: false, message: 'Erro ao atualizar status do convenio' });
  }
});

router.get('/', authorize('configuracoes', 'view'), async (req, res) => {
  try {
    const row = await ensureSingletonSettings();
    return successResponse(res, row);
  } catch (error) {
    console.error('[settings][GET] erro ao buscar configuracoes:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });

    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

async function saveSettingsHandler(req, res) {
  try {
    const userId = req.user?.id || null;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Token ausente ou invalido' });
    }

    const payload = normalizeSettingsPayload(req.body);

    if (Object.prototype.hasOwnProperty.call(payload, 'instituicao_logo_base64')) {
      const logoValidationError = validateInstitutionLogoDataUrl(payload.instituicao_logo_base64);
      if (logoValidationError) {
        return res.status(400).json({ success: false, message: logoValidationError });
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'instituicao_cnpj')) {
      const cnpjValidation = validateInstitutionCnpj(payload.instituicao_cnpj);
      if (!cnpjValidation.ok) {
        return res.status(400).json({ success: false, message: cnpjValidation.message });
      }
      payload.instituicao_cnpj = cnpjValidation.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'instituicao_cep')) {
      const cepValidation = validateInstitutionCep(payload.instituicao_cep);
      if (!cepValidation.ok) {
        return res.status(400).json({ success: false, message: cepValidation.message });
      }
      payload.instituicao_cep = cepValidation.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'instituicao_cidade')) {
      const cidadeValidation = normalizeInstitutionText(payload.instituicao_cidade, 'instituicao_cidade', {
        maxLength: 120,
      });
      if (!cidadeValidation.ok) {
        return res.status(400).json({ success: false, message: cidadeValidation.message });
      }
      payload.instituicao_cidade = cidadeValidation.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'instituicao_estado')) {
      const estadoValidation = normalizeInstitutionText(payload.instituicao_estado, 'instituicao_estado', {
        maxLength: 32,
        uppercase: true,
      });
      if (!estadoValidation.ok) {
        return res.status(400).json({ success: false, message: estadoValidation.message });
      }
      payload.instituicao_estado = estadoValidation.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'business_hours')) {
      const validation = validateBusinessHours(payload.business_hours);
      if (!validation.ok) {
        return res.status(400).json({ success: false, message: validation.message });
      }
      payload.business_hours = validation.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'professionals_config')) {
      const validation = validateProfessionalsConfig(payload.professionals_config);
      if (!validation.ok) {
        return res.status(400).json({ success: false, message: validation.message });
      }
      payload.professionals_config = validation.value;
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, 'registration_mode') &&
      typeof payload.registration_mode !== 'string'
    ) {
      return res.status(400).json({
        success: false,
        message: 'registration_mode deve ser string.',
      });
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, 'public_signup_default_status') &&
      typeof payload.public_signup_default_status !== 'string'
    ) {
      return res.status(400).json({
        success: false,
        message: 'public_signup_default_status deve ser string.',
      });
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, 'link_policy') &&
      typeof payload.link_policy !== 'string'
    ) {
      return res.status(400).json({
        success: false,
        message: 'link_policy deve ser string.',
      });
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, 'allow_create_user_from_professional') &&
      typeof payload.allow_create_user_from_professional !== 'boolean'
    ) {
      return res.status(400).json({
        success: false,
        message: 'allow_create_user_from_professional deve ser booleano.',
      });
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, 'block_duplicate_email') &&
      typeof payload.block_duplicate_email !== 'boolean'
    ) {
      return res.status(400).json({
        success: false,
        message: 'block_duplicate_email deve ser booleano.',
      });
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, 'allow_public_registration') &&
      typeof payload.allow_public_registration !== 'boolean'
    ) {
      return res.status(400).json({
        success: false,
        message: 'allow_public_registration deve ser booleano.',
      });
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, 'allow_professional_view_others') &&
      typeof payload.allow_professional_view_others !== 'boolean'
    ) {
      return res.status(400).json({
        success: false,
        message: 'allow_professional_view_others deve ser booleano.',
      });
    }

    if (
      !Object.prototype.hasOwnProperty.call(payload, 'registration_mode') &&
      Object.prototype.hasOwnProperty.call(payload, 'allow_public_registration')
    ) {
      payload.registration_mode = payload.allow_public_registration
        ? 'PUBLIC_SIGNUP'
        : DEFAULT_ACCESS_SETTINGS.registration_mode;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'registration_mode')) {
      const normalizedRegistrationMode = normalizeRegistrationMode(payload.registration_mode);
      if (
        payload.registration_mode &&
        normalizedRegistrationMode !== payload.registration_mode.toString().trim().toUpperCase()
      ) {
        return res.status(400).json({
          success: false,
          message: `registration_mode invalido. Use: ${REGISTRATION_MODES.join(', ')}`,
        });
      }
      payload.registration_mode = normalizedRegistrationMode;
      payload.allow_public_registration = deriveAllowPublicRegistration(normalizedRegistrationMode);
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'public_signup_default_status')) {
      const normalizedSignupStatus = normalizePublicSignupDefaultStatus(
        payload.public_signup_default_status
      );
      if (
        payload.public_signup_default_status &&
        normalizedSignupStatus !== payload.public_signup_default_status.toString().trim().toLowerCase()
      ) {
        return res.status(400).json({
          success: false,
          message:
            `public_signup_default_status invalido. Use: ${PUBLIC_SIGNUP_DEFAULT_STATUSES.join(', ')}`,
        });
      }
      payload.public_signup_default_status = normalizedSignupStatus;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'link_policy')) {
      const normalizedLinkPolicy = normalizeLinkPolicy(payload.link_policy);
      if (
        payload.link_policy &&
        normalizedLinkPolicy !== payload.link_policy.toString().trim().toUpperCase()
      ) {
        return res.status(400).json({
          success: false,
          message: `link_policy invalido. Use: ${LINK_POLICIES.join(', ')}`,
        });
      }
      payload.link_policy = normalizedLinkPolicy;
    }

    const singleton = await ensureSingletonSettings(payload);
    const settingsColumns = await getSystemSettingsColumnsMap();
    const fieldsToUpdate = Object.keys(payload).filter((field) => settingsColumns.has(field));

    if (fieldsToUpdate.length === 0) {
      return successResponse(res, singleton);
    }

    const setClauses = [];
    const values = [];

    fieldsToUpdate.forEach((field, index) => {
      const position = index + 1;
      if (field === 'business_hours' || field === 'professionals_config') {
        setClauses.push(`${field} = $${position}::jsonb`);
        values.push(JSON.stringify(payload[field]));
        return;
      }

      setClauses.push(`${field} = $${position}`);
      values.push(payload[field]);
    });

    if (fieldsToUpdate.includes('instituicao_logo_base64')) {
      setClauses.push('instituicao_logo_updated_at = NOW()');
    }

    const updatedByMeta = resolveUpdatedByValue(userId, settingsColumns.get('updated_by'));
    if (updatedByMeta.ok) {
      const updatedByPosition = values.length + 1;
      setClauses.push(`updated_by = $${updatedByPosition}`);
      values.push(updatedByMeta.value);
    }

    const wherePosition = values.length + 1;
    values.push(singleton.id);

    const { rows } = await pool.query(
      `
        UPDATE system_settings
        SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE id = $${wherePosition}
        RETURNING *
      `,
      values
    );

    return successResponse(res, rows[0]);
  } catch (error) {
    console.error('[settings][SAVE] erro ao salvar configuracoes:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });

    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
}

router.put('/', authorize('configuracoes', 'edit'), saveSettingsHandler);
router.post('/', authorize('configuracoes', 'edit'), saveSettingsHandler);
router.patch('/', authorize('configuracoes', 'edit'), saveSettingsHandler);

module.exports = router;

