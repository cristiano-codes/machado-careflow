const express = require('express');
const router = express.Router();
const pool = require('../config/pg');

function isTruthy(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  return ['1', 'true', 'sim', 'yes', 'y'].includes(normalized);
}

function normalizeContext(value) {
  return (value || '').toString().trim().toLowerCase();
}

function normalizeNameKey(value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function listPreAppointmentServicesFromRoles() {
  const client = await pool.connect();
  let started = false;

  try {
    await client.query('BEGIN');
    started = true;
    await client.query('SELECT pg_advisory_xact_lock($1)', [90231001]);

    const rolesResult = await client.query(`
      SELECT id, nome
      FROM public.professional_roles
      WHERE ativo = true
        AND show_in_pre_appointment = true
        AND NULLIF(BTRIM(nome), '') IS NOT NULL
      ORDER BY nome ASC
    `);

    if (rolesResult.rows.length === 0) {
      await client.query('COMMIT');
      started = false;
      return [];
    }

    const servicesResult = await client.query(`
      SELECT id::text AS id, name, active, created_at
      FROM public.services
      WHERE NULLIF(BTRIM(name), '') IS NOT NULL
      ORDER BY created_at ASC NULLS LAST, name ASC
    `);

    const servicesByKey = new Map();
    for (const row of servicesResult.rows) {
      const key = normalizeNameKey(row.name);
      if (!key) continue;
      if (!servicesByKey.has(key)) {
        servicesByKey.set(key, []);
      }
      servicesByKey.get(key).push({
        id: row.id,
        name: row.name,
        active: row.active === true,
      });
    }

    const selectedByKey = new Map();

    for (const role of rolesResult.rows) {
      const roleName = (role.nome || '').toString().trim();
      const key = normalizeNameKey(roleName);
      if (!key) continue;
      if (selectedByKey.has(key)) continue;

      const candidates = servicesByKey.get(key) || [];
      let selected = candidates.find((item) => item.active) || candidates[0] || null;

      if (!selected) {
        const inserted = await client.query(
          `
            INSERT INTO public.services (name, active)
            VALUES ($1, true)
            RETURNING id::text AS id, name, active
          `,
          [roleName]
        );
        selected = {
          id: inserted.rows[0].id,
          name: inserted.rows[0].name,
          active: inserted.rows[0].active === true,
        };
        servicesByKey.set(key, [selected]);
        console.info('[services][pre_appointment_sync] servico criado a partir de funcao visivel', {
          role_id: role.id,
          role_name: roleName,
          service_id: selected.id,
        });
      } else if (!selected.active) {
        const reactivated = await client.query(
          `
            UPDATE public.services
            SET active = true,
                updated_at = NOW()
            WHERE id = $1
            RETURNING id::text AS id, name, active
          `,
          [selected.id]
        );

        if (reactivated.rows.length > 0) {
          selected = {
            id: reactivated.rows[0].id,
            name: reactivated.rows[0].name,
            active: reactivated.rows[0].active === true,
          };
          servicesByKey.set(key, [selected, ...candidates.filter((item) => item.id !== selected.id)]);
          console.info('[services][pre_appointment_sync] servico reativado por funcao visivel', {
            role_id: role.id,
            role_name: roleName,
            service_id: selected.id,
          });
        }
      }

      if (selected && selected.active) {
        selectedByKey.set(key, selected);
      }
    }

    await client.query('COMMIT');
    started = false;

    return Array.from(selectedByKey.values())
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
      .map((item) => ({
        id: item.id,
        name: item.name,
      }));
  } catch (error) {
    if (started) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }
}

// GET - Buscar servicos
router.get('/', async (req, res) => {
  const activeOnly = isTruthy(req.query?.active);
  const context = normalizeContext(req.query?.context);
  const preAppointmentOnly =
    isTruthy(req.query?.pre_appointment) ||
    isTruthy(req.query?.pre_appointment_only) ||
    ['pre_appointment', 'pre-agendamento', 'preagendamento'].includes(context);

  try {
    if (preAppointmentOnly) {
      try {
        return res.json({
          success: true,
          services: await listPreAppointmentServicesFromRoles(),
        });
      } catch (error) {
        if (error?.code !== '42703' && error?.code !== '42P01') {
          throw error;
        }
        console.warn(
          '[services][GET] filtro de pre-agendamento indisponivel; aplicando fallback do catalogo ativo.',
          {
            code: error?.code,
            message: error?.message,
          }
        );
      }
    }

    if (activeOnly) {
      const result = await pool.query(`
        SELECT id, name
        FROM services
        WHERE active = true
        ORDER BY name
      `);

      return res.json({
        success: true,
        services: result.rows,
      });
    }

    const result = await pool.query('SELECT * FROM services WHERE active = true ORDER BY name');

    return res.json({
      success: true,
      services: result.rows,
    });
  } catch (error) {
    console.error('Erro ao buscar servicos:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

module.exports = router;
