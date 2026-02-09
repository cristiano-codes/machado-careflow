const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const pool = require('../config/pg');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
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
};

const LOGO_DATA_URL_PREFIX = 'data:image/png;base64,';
const MAX_LOGO_BYTES = 1.5 * 1024 * 1024;

const SETTINGS_EDITABLE_FIELDS = [
  'instituicao_nome',
  'instituicao_email',
  'instituicao_telefone',
  'instituicao_endereco',
  'instituicao_logo_base64',
];

// --- helper: extrai userId do token Bearer ---
function getUserIdFromReq(req) {
  try {
    const auth = req.headers.authorization || '';
    const [, token] = auth.split(' ');
    if (!token) return null;
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded?.id || null;
  } catch {
    return null;
  }
}

async function selectSingletonSettings() {
  const { rows } = await pool.query('SELECT * FROM system_settings LIMIT 1');
  return rows[0] || null;
}

async function createSingletonSettings(seed = {}) {
  const values = [
    seed.instituicao_nome ?? DEFAULT_SETTINGS.instituicao_nome,
    seed.instituicao_email ?? DEFAULT_SETTINGS.instituicao_email,
    seed.instituicao_telefone ?? DEFAULT_SETTINGS.instituicao_telefone,
    seed.instituicao_endereco ?? DEFAULT_SETTINGS.instituicao_endereco,
    seed.instituicao_logo_base64 ?? DEFAULT_SETTINGS.instituicao_logo_base64,
  ];

  try {
    const { rows } = await pool.query(
      `
        INSERT INTO system_settings (
          id, instituicao_nome, instituicao_email, instituicao_telefone, instituicao_endereco, instituicao_logo_base64
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5
        )
        RETURNING *
      `,
      values
    );

    return rows[0];
  } catch (error) {
    // 42883 = undefined_function (gen_random_uuid indisponivel)
    if (error?.code !== '42883') throw error;

    const fallbackValues = [randomUUID(), ...values];
    const { rows } = await pool.query(
      `
        INSERT INTO system_settings (
          id, instituicao_nome, instituicao_email, instituicao_telefone, instituicao_endereco, instituicao_logo_base64
        ) VALUES (
          $1, $2, $3, $4, $5, $6
        )
        RETURNING *
      `,
      fallbackValues
    );

    return rows[0];
  }
}

async function ensureSingletonSettings(seed = {}) {
  const existing = await selectSingletonSettings();
  if (existing) return existing;

  try {
    return await createSingletonSettings(seed);
  } catch (error) {
    // 23505 = unique_violation (corrida entre requests)
    if (error?.code === '23505') {
      const row = await selectSingletonSettings();
      if (row) return row;
    }

    throw error;
  }
}

function normalizePayload(body) {
  if (!body || typeof body !== 'object') return {};

  const normalized = {};
  for (const field of SETTINGS_EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      if (field === 'instituicao_logo_base64' && body[field] === '') {
        normalized[field] = null;
      } else {
        normalized[field] = body[field];
      }
    }
  }

  return normalized;
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

function successResponse(res, data) {
  return res.json({
    success: true,
    data,
    settings: data,
  });
}

// GET - Buscar configuracoes
router.get('/', async (req, res) => {
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
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Token ausente ou invalido' });
    }

    const payload = normalizePayload(req.body);
    if (Object.prototype.hasOwnProperty.call(payload, 'instituicao_logo_base64')) {
      const logoValidationError = validateInstitutionLogoDataUrl(payload.instituicao_logo_base64);
      if (logoValidationError) {
        return res.status(400).json({ success: false, message: logoValidationError });
      }
    }

    const singleton = await ensureSingletonSettings(payload);

    const fieldsToUpdate = Object.keys(payload);
    if (fieldsToUpdate.length === 0) {
      return successResponse(res, singleton);
    }

    const setClauses = fieldsToUpdate.map((field, index) => `${field} = $${index + 1}`);
    if (fieldsToUpdate.includes('instituicao_logo_base64')) {
      setClauses.push('instituicao_logo_updated_at = NOW()');
    }

    const values = fieldsToUpdate.map((field) => payload[field]);
    values.push(singleton.id);

    const { rows } = await pool.query(
      `
        UPDATE system_settings
        SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE id = $${fieldsToUpdate.length + 1}
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

// POST/PUT - Salvar configuracoes (mantem auth atual)
router.post('/', saveSettingsHandler);
router.put('/', saveSettingsHandler);

module.exports = router;
