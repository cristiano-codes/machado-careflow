const express = require('express');
const router = express.Router();
const pool = require('../config/pg');
const bcrypt = require('bcryptjs');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

router.use(authMiddleware);

const DEFAULT_CONTRACT_TYPES = ['CLT', 'PJ', 'Voluntário', 'Estágio', 'Temporário'];
const SCALE_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex'];
const DEFAULT_WEEK_SCALE = { seg: true, ter: true, qua: true, qui: true, sex: true };
const DEFAULT_DAY_START_TIME = '08:00';
const DEFAULT_DAY_END_TIME = '17:20';

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
  const role = (payload?.role || 'Usuário').toString().trim() || 'Usuário';
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
    return { ok: false, message: 'Nome é obrigatório' };
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
      message: `tipo_contrato obrigatório. Valores aceitos: ${allowedContractTypes.join(', ')}`,
    };
  }

  if (payload?.horas_semanais !== undefined && payload?.horas_semanais !== null && payload?.horas_semanais !== '' && weeklyHours === null) {
    return { ok: false, message: 'horas_semanais deve ser um inteiro positivo' };
  }

  if (birthDate && !isValidDateValue(birthDate)) {
    return { ok: false, message: 'data_nascimento inválida. Use o formato YYYY-MM-DD' };
  }

  if (!weeklyScale) {
    return {
      ok: false,
      message:
        'escala_semanal invalida. Use seg/ter/qua/qui/sex como boolean ou objeto {ativo,inicio,fim}',
    };
  }

  if (!status) {
    return { ok: false, message: 'status inválido. Use ATIVO ou INATIVO' };
  }

  if (requireUserIdentity && (!email || !username)) {
    return { ok: false, message: 'E-mail e username são obrigatórios' };
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

// Criar novo profissional (cria usuário + vínculo)
router.post('/', authorize('profissionais', 'create'), async (req, res) => {
  const client = await pool.connect();
  try {
    const runtimeConfig = await getProfessionalsRuntimeConfig();
    const validation = validateProfessionalPayload(req.body, {
      requireUserIdentity: true,
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
      if (!selectedRole.ativo) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Funcao selecionada esta inativa' });
      }
    }

    const resolvedFuncao = payload.funcao || selectedRole?.nome || null;

    const dup = await client.query(
      'SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1',
      [payload.username, payload.email]
    );
    if (dup.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Username ou e-mail já existe' });
    }

    const hashedPassword = await bcrypt.hash('123456', 10);

    const userResult = await client.query(
      `INSERT INTO users (username, email, name, phone, role, status, first_access, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, username, email, name, role, status`,
      [payload.username, payload.email, payload.name, payload.phone, payload.role, 'ativo', true, hashedPassword]
    );
    const user = userResult.rows[0];

    const profResult = await client.query(
      `INSERT INTO professionals (
         user_id, user_id_int, crp, specialty, phone, email, status,
         role_id, funcao, horas_semanais, data_nascimento, tipo_contrato, escala_semanal
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
       RETURNING *`,
      [
        null,
        user.id,
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
      ]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      professional: {
        ...profResult.rows[0],
        role_id: profResult.rows[0]?.role_id ?? payload.role_id ?? null,
        role_nome: selectedRole?.nome ?? resolvedFuncao,
        user_name: user.name,
        user_email: user.email,
        user_role: user.role,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar profissional:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao criar profissional' });
  } finally {
    client.release();
  }
});

// Lista profissionais + dados do usuário vinculado e carga do dia
router.get('/', authorize('profissionais', 'view'), async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];

  try {
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
        u.id AS linked_user_id,
        COALESCE(
          u.name,
          (
            SELECT u2.name
            FROM public.users u2
            WHERE p.user_id_int IS NULL
              AND p.email IS NOT NULL
              AND LOWER(u2.email) = LOWER(p.email)
            LIMIT 1
          ),
          p.email,
          ''
        ) AS user_name,
        COALESCE(
          u.email,
          (
            SELECT u2.email
            FROM public.users u2
            WHERE p.user_id_int IS NULL
              AND p.email IS NOT NULL
              AND LOWER(u2.email) = LOWER(p.email)
            LIMIT 1
          ),
          p.email
        ) AS user_email,
        COALESCE(
          u.role,
          (
            SELECT u2.role
            FROM public.users u2
            WHERE p.user_id_int IS NULL
              AND p.email IS NOT NULL
              AND LOWER(u2.email) = LOWER(p.email)
            LIMIT 1
          ),
          'Usuário'
        ) AS user_role,
        COALESCE(
          u.status,
          (
            SELECT u2.status
            FROM public.users u2
            WHERE p.user_id_int IS NULL
              AND p.email IS NOT NULL
              AND LOWER(u2.email) = LOWER(p.email)
            LIMIT 1
          ),
          'ativo'
        ) AS user_status,
        COALESCE(
          u.username,
          (
            SELECT u2.username
            FROM public.users u2
            WHERE p.user_id_int IS NULL
              AND p.email IS NOT NULL
              AND LOWER(u2.email) = LOWER(p.email)
            LIMIT 1
          ),
          split_part(COALESCE(p.email, ''), '@', 1)
        ) AS user_username,
        COALESCE(a.total, 0) AS agenda_hoje
      FROM professionals p
      LEFT JOIN public.professional_roles pr ON pr.id = p.role_id
      LEFT JOIN public.users u ON u.id = p.user_id_int
      LEFT JOIN agenda_hoje a ON a.professional_id = p.id
      ORDER BY COALESCE(
        u.name,
        (
          SELECT u2.name
          FROM public.users u2
          WHERE p.user_id_int IS NULL
            AND p.email IS NOT NULL
            AND LOWER(u2.email) = LOWER(p.email)
          LIMIT 1
        ),
        p.email,
        ''
      ) NULLS LAST, p.created_at DESC;
    `;

    const result = await pool.query(query, [date]);

    res.json({
      success: true,
      professionals: Array.isArray(result.rows) ? result.rows : []
    });
  } catch (error) {
    console.error('Erro ao listar profissionais:', error);
    res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao listar profissionais',
      professionals: []
    });
  }
});

// Atualizar profissional (dados principais)
router.put('/:id', authorize('profissionais', 'edit'), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const existingResult = await client.query(
      `SELECT
         p.*,
         COALESCE(pr.nome, p.funcao) AS role_nome,
         u.id AS linked_user_id,
         COALESCE(
           u.name,
           (
             SELECT u2.name
             FROM public.users u2
             WHERE p.user_id_int IS NULL
               AND p.email IS NOT NULL
               AND LOWER(u2.email) = LOWER(p.email)
             LIMIT 1
           ),
           p.email,
           ''
         ) AS user_name,
         COALESCE(
           u.email,
           (
             SELECT u2.email
             FROM public.users u2
             WHERE p.user_id_int IS NULL
               AND p.email IS NOT NULL
               AND LOWER(u2.email) = LOWER(p.email)
             LIMIT 1
           ),
           p.email
         ) AS user_email,
         COALESCE(
           u.username,
           (
             SELECT u2.username
             FROM public.users u2
             WHERE p.user_id_int IS NULL
               AND p.email IS NOT NULL
               AND LOWER(u2.email) = LOWER(p.email)
             LIMIT 1
           ),
           split_part(COALESCE(p.email, ''), '@', 1)
         ) AS user_username,
         COALESCE(
           u.role,
           (
             SELECT u2.role
             FROM public.users u2
             WHERE p.user_id_int IS NULL
               AND p.email IS NOT NULL
               AND LOWER(u2.email) = LOWER(p.email)
             LIMIT 1
           ),
           'Usuário'
         ) AS user_role,
         COALESCE(
           u.status,
           (
             SELECT u2.status
             FROM public.users u2
             WHERE p.user_id_int IS NULL
               AND p.email IS NOT NULL
               AND LOWER(u2.email) = LOWER(p.email)
             LIMIT 1
           ),
           'ativo'
         ) AS user_status
       FROM professionals p
       LEFT JOIN public.professional_roles pr ON pr.id = p.role_id
       LEFT JOIN public.users u ON u.id = p.user_id_int
       WHERE p.id = $1`,
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profissional não encontrado' });
    }

    const existing = existingResult.rows[0];
    const mergedPayload = {
      ...req.body,
      name: req.body?.name ?? existing.user_name,
      email: req.body?.email ?? existing.user_email ?? existing.email,
      username: req.body?.username ?? existing.user_username,
      role: req.body?.role ?? existing.user_role ?? 'Usuário',
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

    if (existing.linked_user_id) {
      const duplicateIdentity = await client.query(
        `SELECT 1
         FROM users
         WHERE id <> $1
           AND (LOWER(username) = LOWER($2) OR LOWER(email) = LOWER($3))
         LIMIT 1`,
        [existing.linked_user_id, payload.username, payload.email]
      );

      if (duplicateIdentity.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Username ou e-mail já existe' });
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

    const existingResult = await client.query(
      `SELECT
         p.id,
         COALESCE(
           u.id,
           (
             SELECT u2.id
             FROM public.users u2
             WHERE p.user_id_int IS NULL
               AND p.email IS NOT NULL
               AND LOWER(u2.email) = LOWER(p.email)
             LIMIT 1
           )
         ) AS linked_user_id
       FROM professionals p
       LEFT JOIN public.users u ON u.id = p.user_id_int
       WHERE p.id = $1
       FOR UPDATE`,
      [id]
    );

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Profissional nao encontrado' });
    }

    const linkedUserId = existingResult.rows[0]?.linked_user_id || null;

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
    return res.status(400).json({ success: false, message: 'status inválido. Use ATIVO ou INATIVO' });
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
      return res.status(404).json({ success: false, message: 'Profissional não encontrado' });
    }

    return res.json({ success: true, professional: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar status do profissional:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao atualizar status' });
  }
});

// Agenda do profissional em um dia
router.get('/:id/agenda', authorize('profissionais', 'view'), async (req, res) => {
  const { id } = req.params;
  const date = req.query.date || new Date().toISOString().split('T')[0];

  try {
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
      agenda: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar agenda do profissional:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar agenda' });
  }
});

// Estatísticas gerais dos profissionais
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
    console.error('Erro ao buscar estatísticas de profissionais:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar estatísticas' });
  }
});

module.exports = router;

