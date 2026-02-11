const express = require('express');
const { randomUUID } = require('crypto');
const pool = require('../config/pg');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

const LOGO_DATA_URL_PREFIX = 'data:image/png;base64,';
const MAX_LOGO_BYTES = 1.5 * 1024 * 1024;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  business_hours: DEFAULT_BUSINESS_HOURS,
  professionals_config: DEFAULT_PROFESSIONALS_CONFIG,
};

const SETTINGS_EDITABLE_FIELDS = [
  'instituicao_nome',
  'instituicao_email',
  'instituicao_telefone',
  'instituicao_endereco',
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
  'business_hours',
  'professionals_config',
];

let settingsSchemaReadyPromise = null;
let settingsColumnsCache = null;

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
          ADD COLUMN IF NOT EXISTS instituicao_logo_base64 text,
          ADD COLUMN IF NOT EXISTS instituicao_logo_updated_at timestamptz DEFAULT now(),
          ADD COLUMN IF NOT EXISTS business_hours jsonb,
          ADD COLUMN IF NOT EXISTS professionals_config jsonb
      `);

      await pool.query(
        `
          UPDATE public.system_settings
          SET business_hours = COALESCE(business_hours, $1::jsonb),
              professionals_config = COALESCE(professionals_config, $2::jsonb)
        `,
        [
          JSON.stringify(DEFAULT_BUSINESS_HOURS),
          JSON.stringify(DEFAULT_PROFESSIONALS_CONFIG),
        ]
      );

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

function mapRoleRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    ativo: row.ativo,
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

function normalizeSettingsRow(row) {
  const source = row || {};
  const businessHoursValidation = validateBusinessHours(
    source.business_hours || DEFAULT_SETTINGS.business_hours
  );
  const professionalsConfigValidation = validateProfessionalsConfig(
    source.professionals_config || DEFAULT_SETTINGS.professionals_config
  );

  return {
    ...DEFAULT_SETTINGS,
    ...source,
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
          $18::jsonb,
          $19::jsonb
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
          $19::jsonb,
          $20::jsonb
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

async function ensureDefaultProfessionalRoles() {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS total FROM public.professional_roles'
  );
  const total = rows[0]?.total ?? 0;
  if (total > 0) return;

  for (const nome of DEFAULT_PROFESSIONAL_ROLES) {
    await pool.query(
      `
        INSERT INTO public.professional_roles (nome, ativo)
        VALUES ($1, true)
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
        SELECT id, nome, ativo, created_at, updated_at
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
    const nome = sanitizeRoleName(req.body?.nome);
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
        INSERT INTO public.professional_roles (nome, ativo)
        VALUES ($1, true)
        RETURNING id, nome, ativo, created_at, updated_at
      `,
      [nome]
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

    const updated = await pool.query(
      `
        UPDATE public.professional_roles
        SET nome = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING id, nome, ativo, created_at, updated_at
      `,
      [nome, id]
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
        RETURNING id, nome, ativo, created_at, updated_at
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

module.exports = router;

