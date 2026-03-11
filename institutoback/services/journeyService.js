const pool = require('../config/pg');

const VALID_JOURNEY_STATUSES = new Set([
  'em_fila_espera',
  'entrevista_realizada',
  'em_avaliacao',
  'em_analise_vaga',
  'aprovado',
  'encaminhado',
  'matriculado',
  'ativo',
  'inativo_assistencial',
  'desligado',
]);

const JOURNEY_STATUS_FLOW = [
  'em_fila_espera',
  'entrevista_realizada',
  'em_avaliacao',
  'em_analise_vaga',
  'aprovado',
  'encaminhado',
  'matriculado',
  'ativo',
  'inativo_assistencial',
  'desligado',
];

const JOURNEY_STATUS_ORDER = new Map(
  JOURNEY_STATUS_FLOW.map((status, index) => [status, index])
);

let historySchemaCache = null;

function normalizeJourneyStatus(value) {
  return (value || '').toString().trim().toLowerCase();
}

function normalizeUserId(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  }

  // Compatibilidade: ambiente atual utiliza users.id como UUID.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    return normalized;
  }

  return null;
}

// Mantido para compatibilidade com imports legados.
const normalizeUserIdInt = normalizeUserId;

function getJourneyStatusRank(value) {
  const normalized = normalizeJourneyStatus(value);
  if (!normalized) return null;
  return JOURNEY_STATUS_ORDER.has(normalized) ? JOURNEY_STATUS_ORDER.get(normalized) : null;
}

function isJourneyRegression(previousStatus, nextStatus) {
  const previousRank = getJourneyStatusRank(previousStatus);
  const nextRank = getJourneyStatusRank(nextStatus);

  if (previousRank === null || nextRank === null) {
    return false;
  }

  return nextRank < previousRank;
}

async function resolveHistorySchema(client) {
  if (historySchemaCache) return historySchemaCache;

  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'assistido_status_history'
    `
  );

  const columns = new Set(result.rows.map((row) => row.column_name));
  historySchemaCache = {
    hasMotivo: columns.has('motivo'),
  };

  return historySchemaCache;
}

async function appendStatusHistory({
  client,
  patientId,
  previousStatus,
  newStatus,
  userId,
  motivoNullable,
}) {
  const schema = await resolveHistorySchema(client);
  const motivo = motivoNullable ? String(motivoNullable).trim() : null;

  if (schema.hasMotivo) {
    await client.query(
      `
        INSERT INTO public.assistido_status_history (
          assistido_id,
          status_anterior,
          status_novo,
          changed_by,
          motivo,
          changed_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
      `,
      [patientId, previousStatus, newStatus, userId, motivo]
    );
    return;
  }

  await client.query(
    `
      INSERT INTO public.assistido_status_history (
        assistido_id,
        status_anterior,
        status_novo,
        changed_by,
        changed_at
      )
      VALUES ($1, $2, $3, $4, NOW())
    `,
    [patientId, previousStatus, newStatus, userId]
  );
}

async function transitionPatientStatus({
  patientId,
  newStatus,
  userIdInt,
  motivoNullable = null,
  client: externalClient = null,
  preventRegression = false,
}) {
  const normalizedPatientId = (patientId || '').toString().trim();
  const normalizedStatus = normalizeJourneyStatus(newStatus);
  const actorUserId = normalizeUserId(userIdInt);

  if (!normalizedPatientId) {
    throw new Error('patientId e obrigatorio');
  }

  if (!VALID_JOURNEY_STATUSES.has(normalizedStatus)) {
    throw new Error('status_jornada invalido');
  }

  if (actorUserId === null) {
    throw new Error('userId invalido para registrar historico');
  }

  const client = externalClient || (await pool.connect());
  const ownsTransaction = !externalClient;

  try {
    if (ownsTransaction) {
      await client.query('BEGIN');
    }

    const currentResult = await client.query(
      `
        SELECT id::text AS id, status_jornada
        FROM public.patients
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [normalizedPatientId]
    );

    if (currentResult.rows.length === 0) {
      const error = new Error('Assistido nao encontrado');
      error.code = 'PATIENT_NOT_FOUND';
      throw error;
    }

    const previousStatus = normalizeJourneyStatus(currentResult.rows[0].status_jornada);

    if (previousStatus === normalizedStatus) {
      if (ownsTransaction) {
        await client.query('COMMIT');
      }
      return {
        previousStatus,
        newStatus: normalizedStatus,
        changed: false,
      };
    }

    if (preventRegression === true && isJourneyRegression(previousStatus, normalizedStatus)) {
      if (ownsTransaction) {
        await client.query('COMMIT');
      }
      return {
        previousStatus,
        newStatus: normalizedStatus,
        changed: false,
        regressionPrevented: true,
      };
    }

    await client.query(
      `
        UPDATE public.patients
        SET status_jornada = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [normalizedStatus, normalizedPatientId]
    );

    await appendStatusHistory({
      client,
      patientId: normalizedPatientId,
      previousStatus: previousStatus || null,
      newStatus: normalizedStatus,
      userId: actorUserId,
      motivoNullable,
    });

    if (ownsTransaction) {
      await client.query('COMMIT');
    }

    return {
      previousStatus,
      newStatus: normalizedStatus,
      changed: true,
    };
  } catch (error) {
    if (ownsTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (ownsTransaction) {
      client.release();
    }
  }
}

async function createInitialStatusHistory({
  patientId,
  userIdInt,
  motivoNullable = 'Cadastro criado',
  client: externalClient = null,
}) {
  const normalizedPatientId = (patientId || '').toString().trim();
  const actorUserId = normalizeUserId(userIdInt);

  if (!normalizedPatientId) {
    throw new Error('patientId e obrigatorio');
  }

  if (actorUserId === null) {
    throw new Error('userId invalido para registrar historico');
  }

  const client = externalClient || (await pool.connect());
  const ownsTransaction = !externalClient;

  try {
    if (ownsTransaction) {
      await client.query('BEGIN');
    }

    const patientResult = await client.query(
      `
        SELECT id::text AS id, status_jornada
        FROM public.patients
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [normalizedPatientId]
    );

    if (patientResult.rows.length === 0) {
      const error = new Error('Assistido nao encontrado');
      error.code = 'PATIENT_NOT_FOUND';
      throw error;
    }

    const statusAtual =
      normalizeJourneyStatus(patientResult.rows[0].status_jornada) || 'em_fila_espera';

    const existingHistory = await client.query(
      `
        SELECT id
        FROM public.assistido_status_history
        WHERE assistido_id = $1
          AND status_anterior IS NULL
        LIMIT 1
      `,
      [normalizedPatientId]
    );

    if (existingHistory.rows.length > 0) {
      if (ownsTransaction) {
        await client.query('COMMIT');
      }
      return {
        inserted: false,
        status: statusAtual,
      };
    }

    await appendStatusHistory({
      client,
      patientId: normalizedPatientId,
      previousStatus: null,
      newStatus: statusAtual,
      userId: actorUserId,
      motivoNullable,
    });

    if (ownsTransaction) {
      await client.query('COMMIT');
    }

    return {
      inserted: true,
      status: statusAtual,
    };
  } catch (error) {
    if (ownsTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (ownsTransaction) {
      client.release();
    }
  }
}

module.exports = {
  VALID_JOURNEY_STATUSES,
  JOURNEY_STATUS_FLOW,
  normalizeJourneyStatus,
  normalizeUserId,
  normalizeUserIdInt,
  getJourneyStatusRank,
  isJourneyRegression,
  transitionPatientStatus,
  createInitialStatusHistory,
};
