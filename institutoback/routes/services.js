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
        const result = await pool.query(`
          SELECT s.id, s.name
          FROM public.services s
          INNER JOIN public.professional_roles pr
            ON LOWER(BTRIM(pr.nome)) = LOWER(BTRIM(s.name))
          WHERE s.active = true
            AND pr.ativo = true
            AND pr.show_in_pre_appointment = true
          ORDER BY s.name
        `);

        return res.json({
          success: true,
          services: result.rows,
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
