const express = require('express');
const router = express.Router();
const pool = require('../config/pg');

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (['false', '0', 'nao', 'não', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
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

// POST - Criar pré-agendamento institucional
router.post('/', async (req, res) => {
  const name = normalizeText(req.body?.name);
  const phone = normalizeText(req.body?.phone);
  const email = normalizeText(req.body?.email);
  const dateOfBirth = normalizeDate(req.body?.date_of_birth);
  const services = normalizeServices(req.body?.services);
  const consentLgpd = normalizeBoolean(req.body?.consent_lgpd, false);

  if (!name || !phone || !email) {
    return res.status(400).json({
      success: false,
      message: 'name, phone e email são obrigatórios.',
    });
  }

  if (services.length < 1) {
    return res.status(400).json({
      success: false,
      message: 'Selecione pelo menos 1 serviço.',
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
        message: 'Há serviços inválidos ou inativos na solicitação.',
      });
    }

    const legacyServiceType = activeServicesResult.rows[0]?.name || 'servico_institucional';

    await client.query(
      `
        INSERT INTO pre_appointments (
          name,
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
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        )
      `,
      [
        name,
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
        'em_fila_espera',
        normalizeOptionalText(req.body?.notes),
        legacyServiceType,
      ]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Solicitação enviada com sucesso.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar pré-agendamento:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  } finally {
    client.release();
  }
});

// GET - Buscar pré-agendamentos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM pre_appointments 
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      preAppointments: result.rows,
    });
  } catch (error) {
    console.error('Erro ao buscar pré-agendamentos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

// GET - Consulta pública da solicitação
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
      FROM pre_appointments
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
        preAppointment: null,
      });
    }

    return res.json({
      success: true,
      found: true,
      preAppointment: {
        name: row.name,
        status: row.status,
        created_at: row.created_at,
      },
    });
  } catch (error) {
    console.error('Erro ao consultar pré-agendamento público:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

module.exports = router;
