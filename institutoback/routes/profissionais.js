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

router.use(authMiddleware);

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
router.get('/', authorize('profissionais', 'view'), async (req, res) => {
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

    res.json({
      success: true,
      professionals,
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

router.get('/me', authorize('profissionais', 'view'), async (req, res) => {
  try {
    const accessContext = await resolveAgendaAccessContext(req.user, pool);

    if (!accessContext.linkedProfessionalId) {
      return res.json({
        success: true,
        professional_id: null,
        can_view_all_professionals: false,
        allow_professional_view_others: accessContext.allowProfessionalViewOthers,
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

// Agenda do profissional em um dia
router.get('/:id/agenda', authorize('profissionais', 'view'), async (req, res) => {
  const { id } = req.params;
  const date = req.query.date || new Date().toISOString().split('T')[0];

  try {
    const accessContext = await resolveAgendaAccessContext(req.user, pool);
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

    const query = `
      SELECT
        a.id,
        a.professional_id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.notes,
        pa.id AS patient_id,
        pa.name AS patient_name,
        s.id AS service_id,
        s.name AS service_name
      FROM appointments a
      JOIN patients pa ON pa.id = a.patient_id
      LEFT JOIN services s ON s.id = a.service_id
      WHERE a.professional_id = $1
        AND a.appointment_date = $2
      ORDER BY a.appointment_time ASC;
    `;

    const result = await pool.query(query, [id, date]);

    res.json({
      success: true,
      agenda: result.rows,
      scope: {
        professional_id: accessContext.linkedProfessionalId,
        can_view_all_professionals: accessContext.canViewOtherProfessionals,
        allow_professional_view_others: accessContext.allowProfessionalViewOthers,
      },
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

module.exports = router;




