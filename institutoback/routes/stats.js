const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');
const {
  JOURNEY_STATUS_FLOW,
  JOURNEY_STATUS_LABELS,
} = require('../services/journeyService');


function buildEmptyStatusSummary() {
  return JOURNEY_STATUS_FLOW.map((status) => ({
    status,
    label: JOURNEY_STATUS_LABELS[status] || status,
    total: 0,
  }));
}

function buildEmptyStats() {
  return {
    totalAssistidos: 0,
    unknownStatusCount: 0,
    journeyTotals: {
      em_triagem: 0,
      em_avaliacao_e_vaga: 0,
      decisao_vaga: 0,
      em_acompanhamento: 0,
      encerrados: 0,
      em_fluxo_institucional: 0,
    },
    journeyStatusSummary: buildEmptyStatusSummary(),
    updatedAt: new Date().toISOString(),
  };
}

function toCount(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
}

async function loadJourneyStats() {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        COALESCE(NULLIF(BTRIM(status_jornada), ''), '__unknown__') AS status_jornada,
        COUNT(*)::int AS total
      FROM public.patients
      GROUP BY 1
    `);

    const summaryMap = new Map();
    let unknownStatusCount = 0;
    let totalAssistidos = 0;

    for (const row of rows || []) {
      const rawStatus = typeof row?.status_jornada === 'string' ? row.status_jornada.trim().toLowerCase() : '';
      const status = rawStatus || '__unknown__';
      const total = toCount(row?.total);

      totalAssistidos += total;

      if (status === '__unknown__' || !JOURNEY_STATUS_FLOW.includes(status)) {
        unknownStatusCount += total;
        continue;
      }

      summaryMap.set(status, (summaryMap.get(status) || 0) + total);
    }

    const journeyStatusSummary = JOURNEY_STATUS_FLOW.map((status) => ({
      status,
      label: JOURNEY_STATUS_LABELS[status] || status,
      total: summaryMap.get(status) || 0,
    }));

    const counts = journeyStatusSummary.reduce((acc, item) => {
      acc[item.status] = item.total;
      return acc;
    }, {});

    const emTriagem = (counts.em_fila_espera || 0) + (counts.entrevista_realizada || 0);
    const emAvaliacaoEVaga = (counts.em_avaliacao || 0) + (counts.em_analise_vaga || 0);
    const decisaoVaga = (counts.aprovado || 0) + (counts.encaminhado || 0);
    const emAcompanhamento =
      (counts.matriculado || 0) + (counts.ativo || 0) + (counts.inativo_assistencial || 0);
    const encerrados = counts.desligado || 0;
    const emFluxoInstitucional = journeyStatusSummary.reduce((acc, item) => acc + item.total, 0);

    return {
      totalAssistidos,
      unknownStatusCount,
      journeyTotals: {
        em_triagem: emTriagem,
        em_avaliacao_e_vaga: emAvaliacaoEVaga,
        decisao_vaga: decisaoVaga,
        em_acompanhamento: emAcompanhamento,
        encerrados,
        em_fluxo_institucional: emFluxoInstitucional,
      },
      journeyStatusSummary,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[stats] Erro ao consolidar jornada institucional:', error.message);
    return buildEmptyStats();
  }
}

router.get('/', async (_req, res) => {
  try {
    const stats = await loadJourneyStats();

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[stats] Erro ao buscar estatisticas:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

module.exports = router;

