const express = require('express');
const { randomUUID } = require('crypto');
const pool = require('../config/pg');
const authMiddleware = require('../middleware/auth');
const { authorizeAny } = require('../middleware/authorize');

const router = express.Router();
router.use(authMiddleware);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});

const ROOM_TYPES = new Set(['terapia', 'multifuncional', 'pedagogica', 'sensorial', 'movimento', 'apoio']);
const ROOM_STATUS = new Set(['ativa', 'manutencao', 'inativa']);
const ACTIVITY_CATEGORIES = new Set(['terapeutica', 'pedagogica', 'assistencial', 'expressiva', 'autonomia']);
const ACTIVITY_MODES = new Set(['presencial', 'hibrido', 'externo']);
const ACTIVITY_ATTENDANCE_TYPES = new Set(['individual', 'grupo']);
const ACTIVITY_STATUS = new Set(['ativa', 'inativa', 'em_revisao']);
const CLASS_STATUS = new Set(['ativa', 'planejada', 'pausada', 'encerrada']);
const SLOT_WEEKDAYS = new Set(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']);
const SLOT_RECURRENCES = new Set(['semanal', 'quinzenal', 'mensal']);
const SLOT_STATUS = new Set(['ativa', 'planejada', 'suspensa']);
const ENROLLMENT_STATUS = new Set(['ativo', 'aguardando_vaga', 'suspenso', 'desligado', 'concluido']);
const ENROLLMENT_PRIORITY = new Set(['alta', 'media', 'baixa']);
const UNIT_OPS_REQUIRED_SCHEMA_TABLES = [
  'institution_units',
  'unit_rooms',
  'unit_activities',
  'unit_classes',
  'unit_class_staff',
  'unit_class_schedule_slots',
  'unit_class_enrollments',
];
const UNIT_OPS_SCHEMA_MISSING_MESSAGE = 'Schema de Operacao da Unidade nao aplicado no banco';
const DEFAULT_INSTITUTION_UNITS = [
  {
    id: 'u-centro',
    codigo: 'CENTRO',
    nome: 'Unidade Centro',
    observacoes: 'Unidade base inicial da operacao de turmas.',
  },
  {
    id: 'u-norte',
    codigo: 'NORTE',
    nome: 'Unidade Norte',
    observacoes: 'Unidade secundaria para expansao operacional.',
  },
];

const authorizeUnitOpsView = authorizeAny([
  ['salas', 'view'],
  ['atividades_unidade', 'view'],
  ['turmas', 'view'],
  ['grade', 'view'],
  ['matriculas', 'view'],
]);

const authorizeRoomsWrite = authorizeAny([
  ['salas', 'create'],
  ['salas', 'edit'],
  ['salas', 'status'],
]);
const authorizeActivitiesWrite = authorizeAny([
  ['atividades_unidade', 'create'],
  ['atividades_unidade', 'edit'],
  ['atividades_unidade', 'status'],
]);
const authorizeClassesWrite = authorizeAny([
  ['turmas', 'create'],
  ['turmas', 'edit'],
  ['turmas', 'status'],
]);
const authorizeSlotsWrite = authorizeAny([
  ['grade', 'create'],
  ['grade', 'edit'],
  ['grade', 'allocate'],
  ['grade', 'status'],
]);
const authorizeEnrollmentsWrite = authorizeAny([
  ['matriculas', 'create'],
  ['matriculas', 'edit'],
  ['matriculas', 'status'],
  ['matriculas', 'enroll'],
]);

function normalizeText(value) {
  return (value || '').toString().trim();
}
function normalizeFirstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return '';
}
function normalizeOptionalText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}
function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'sim', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'nao', 'não', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}
function normalizeInteger(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return null;
  return numeric;
}
function normalizeDate(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  return normalized;
}
function normalizeTime(value) {
  const normalized = normalizeText(value);
  if (!/^\d{2}:\d{2}$/.test(normalized)) return null;
  const [hoursRaw, minutesRaw] = normalized.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return normalized;
}
function toTimeMinutes(timeValue) {
  const normalized = normalizeTime(timeValue);
  if (!normalized) return null;
  const [hoursRaw, minutesRaw] = normalized.split(':');
  return Number(hoursRaw) * 60 + Number(minutesRaw);
}
function toError(res, statusCode, message, extra = {}) {
  return res.status(statusCode).json({ success: false, message, ...extra });
}
function toSchemaUnavailableError(res, missingTables = []) {
  return res.status(503).json({
    success: false,
    error: UNIT_OPS_SCHEMA_MISSING_MESSAGE,
    message: UNIT_OPS_SCHEMA_MISSING_MESSAGE,
    missingTables,
  });
}

function normalizeRoomType(value) {
  const normalized = normalizeText(value).toLowerCase();
  return ROOM_TYPES.has(normalized) ? normalized : null;
}
function normalizeRoomStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  return ROOM_STATUS.has(normalized) ? normalized : null;
}
function normalizeActivityCategory(value) {
  const normalized = normalizeText(value).toLowerCase();
  return ACTIVITY_CATEGORIES.has(normalized) ? normalized : null;
}
function normalizeActivityMode(value) {
  const normalized = normalizeText(value).toLowerCase();
  return ACTIVITY_MODES.has(normalized) ? normalized : null;
}
function normalizeActivityAttendanceType(value) {
  const normalized = normalizeText(value).toLowerCase();
  return ACTIVITY_ATTENDANCE_TYPES.has(normalized) ? normalized : null;
}
function normalizeActivityStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  return ACTIVITY_STATUS.has(normalized) ? normalized : null;
}
function normalizeClassStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  return CLASS_STATUS.has(normalized) ? normalized : null;
}
function normalizeSlotWeekday(value) {
  const normalized = normalizeText(value).toLowerCase();
  return SLOT_WEEKDAYS.has(normalized) ? normalized : null;
}
function normalizeSlotRecurrence(value) {
  const normalized = normalizeText(value).toLowerCase();
  return SLOT_RECURRENCES.has(normalized) ? normalized : null;
}
function normalizeSlotStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  return SLOT_STATUS.has(normalized) ? normalized : null;
}
function normalizeEnrollmentStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  return ENROLLMENT_STATUS.has(normalized) ? normalized : null;
}
function normalizeEnrollmentPriority(value) {
  const normalized = normalizeText(value).toLowerCase();
  return ENROLLMENT_PRIORITY.has(normalized) ? normalized : null;
}

function normalizeEquipmentList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const item of value) {
    const text = normalizeText(item);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);
  }
  return normalized;
}

function mapUnitRow(row) {
  return {
    id: row.id,
    codigo: row.codigo || '',
    nome: row.nome,
    ativo: row.ativo === true,
    observacoes: row.observacoes || '',
  };
}
function mapRoomRow(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    codigo: row.codigo,
    nome: row.nome,
    nomeConhecido: row.nome_conhecido || '',
    descricao: row.descricao || '',
    tipo: row.tipo,
    capacidadeTotal: Number(row.capacidade_total || 0),
    capacidadeRecomendada: Number(row.capacidade_recomendada || 0),
    localizacaoInterna: row.localizacao_interna || '',
    especialidadePrincipal: row.especialidade_principal || '',
    usoPreferencial: row.uso_preferencial || '',
    permiteUsoCompartilhado: row.permite_uso_compartilhado === true,
    status: row.status,
    acessibilidade: row.acessibilidade || '',
    equipamentos: Array.isArray(row.equipamentos) ? row.equipamentos : [],
    observacoes: row.observacoes || '',
  };
}
function mapActivityRow(row) {
  return {
    id: row.id,
    nome: row.nome,
    categoria: row.categoria,
    descricao: row.descricao || '',
    duracaoPadraoMinutos: Number(row.duracao_padrao_minutos || 0),
    modalidade: row.modalidade,
    faixaEtariaSugerida: row.faixa_etaria_sugerida || '',
    atendimentoTipo: row.atendimento_tipo,
    exigeSalaEspecifica: row.exige_sala_especifica === true,
    exigeEquipamento: row.exige_equipamento === true,
    corIdentificacao: row.cor_identificacao || '#1d4ed8',
    status: row.status,
    observacoes: row.observacoes || '',
  };
}
function mapClassRow(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    nome: row.nome,
    activityId: row.activity_id,
    descricao: row.descricao || '',
    objetivo: row.objetivo || '',
    publicoAlvo: row.publico_alvo || '',
    faixaEtaria: row.faixa_etaria || '',
    capacidadeMinima: Number(row.capacidade_minima || 0),
    capacidadeIdeal: Number(row.capacidade_ideal || 0),
    capacidadeMaxima: Number(row.capacidade_maxima || 0),
    status: row.status,
    dataInicio: row.data_inicio,
    dataTermino: row.data_termino || null,
    profissionalPrincipalId: row.professional_principal_id || '',
    profissionalApoioId: row.professional_apoio_id || null,
    exigeSalaEspecifica: row.exige_sala_especifica === true,
    projetoConvenio: row.projeto_convenio || '',
    observacoes: row.observacoes || '',
  };
}
function mapSlotRow(row) {
  return {
    id: row.id,
    classId: row.class_id,
    weekday: row.weekday,
    horaInicial: row.hora_inicial,
    horaFinal: row.hora_final,
    roomId: row.room_id,
    professionalId: row.professional_id || '',
    recorrencia: row.recorrencia,
    status: row.status,
    observacao: row.observacao || '',
  };
}
function mapEnrollmentRow(row) {
  return {
    id: row.id,
    classId: row.class_id,
    studentId: row.patient_id || '',
    status: row.status,
    dataEntrada: row.data_entrada,
    dataSaida: row.data_saida || null,
    prioridade: row.prioridade,
    origemEncaminhamento: row.origem_encaminhamento || '',
    observacao: row.observacao || '',
  };
}
function mapProfessionalRow(row) {
  const normalizedStatus = normalizeText(row.status).toLowerCase();
  const inactiveStatuses = new Set(['inativo', 'inactive', 'desligado', 'suspenso']);
  return {
    id: row.id,
    nome: row.nome || `Profissional ${String(row.id || '').slice(0, 8)}`,
    funcao: row.funcao || 'Profissional',
    status: inactiveStatuses.has(normalizedStatus) ? 'inativo' : 'ativo',
  };
}
function mapStudentRow(row) {
  const normalizedStatus = normalizeText(row.status).toLowerCase();
  const inactiveStatuses = new Set(['inativo', 'inactive', 'desligado']);
  return {
    id: row.id,
    nome: row.nome || `Assistido ${String(row.id || '').slice(0, 8)}`,
    idade: Number(row.idade || 0),
    status: inactiveStatuses.has(normalizedStatus) ? 'inativo' : 'ativo',
  };
}

function actorId(req) {
  return normalizeOptionalText(req?.user?.id);
}

async function fetchUnitById(client, unitId) {
  const result = await client.query(
    `
      SELECT id, nome, ativo
      FROM public.institution_units
      WHERE id = $1
      LIMIT 1
    `,
    [unitId]
  );
  return result.rows[0] || null;
}

async function fetchRoomById(client, roomId) {
  const result = await client.query(
    `
      SELECT id, unit_id
      FROM public.unit_rooms
      WHERE id = $1
      LIMIT 1
    `,
    [roomId]
  );
  return result.rows[0] || null;
}

async function fetchActivityById(client, activityId) {
  const result = await client.query(
    `
      SELECT id
      FROM public.unit_activities
      WHERE id = $1
      LIMIT 1
    `,
    [activityId]
  );
  return result.rows[0] || null;
}

async function fetchClassById(client, classId, options = {}) {
  const shouldLock = options?.forUpdate === true;
  const result = await client.query(
    `
      SELECT id, unit_id, capacidade_maxima, data_inicio, data_termino
      FROM public.unit_classes
      WHERE id = $1
      LIMIT 1
      ${shouldLock ? 'FOR UPDATE' : ''}
    `,
    [classId]
  );
  return result.rows[0] || null;
}

async function fetchProfessionalByTextId(client, professionalId) {
  const result = await client.query(
    `
      SELECT id, id::text AS id_text
      FROM public.professionals
      WHERE id::text = $1
      LIMIT 1
    `,
    [professionalId]
  );
  return result.rows[0] || null;
}

async function fetchPatientByTextId(client, patientId) {
  const result = await client.query(
    `
      SELECT id, id::text AS id_text
      FROM public.patients
      WHERE id::text = $1
      LIMIT 1
    `,
    [patientId]
  );
  return result.rows[0] || null;
}

async function resolveMissingUnitOpsSchemaTables() {
  const result = await pool.query(
    `
      SELECT
        required.table_name,
        to_regclass(format('public.%I', required.table_name)) IS NOT NULL AS exists
      FROM unnest($1::text[]) AS required(table_name)
    `,
    [UNIT_OPS_REQUIRED_SCHEMA_TABLES]
  );

  return result.rows
    .filter((row) => row.exists !== true)
    .map((row) => row.table_name);
}

async function ensureDefaultInstitutionUnits(dbClient = pool) {
  for (const unit of DEFAULT_INSTITUTION_UNITS) {
    await dbClient.query(
      `
        INSERT INTO public.institution_units (id, codigo, nome, ativo, observacoes)
        SELECT $1, $2, $3, true, $4
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.institution_units
          WHERE LOWER(nome) = LOWER($3)
        )
      `,
      [unit.id, unit.codigo, unit.nome, unit.observacoes]
    );
  }
}

async function readDataset() {
  await ensureDefaultInstitutionUnits();

  const professionalsResult = await pool.query(
    `
      SELECT
        p.id::text AS id,
        COALESCE(u.name, p.email, CONCAT('Profissional ', LEFT(p.id::text, 8))) AS nome,
        COALESCE(
          NULLIF(to_jsonb(p)->>'funcao', ''),
          NULLIF(p.specialty, ''),
          'Profissional'
        ) AS funcao,
        COALESCE(NULLIF(to_jsonb(p)->>'status', ''), p.status, 'active') AS status
      FROM public.professionals p
      LEFT JOIN public.users u
        ON COALESCE(
          to_jsonb(p)->>'user_id_int',
          to_jsonb(p)->>'user_id'
        ) = u.id::text
      ORDER BY COALESCE(u.name, p.email, p.id::text) ASC
    `
  );

  const studentsResult = await pool.query(
    `
      SELECT
        p.id::text AS id,
        p.name AS nome,
        COALESCE(DATE_PART('year', AGE(CURRENT_DATE, p.date_of_birth))::int, 0) AS idade,
        p.status
      FROM public.patients p
      ORDER BY p.created_at DESC
      LIMIT 500
    `
  );

  const unitsResult = await pool.query(
    `
      SELECT id, codigo, nome, ativo, observacoes
      FROM public.institution_units
      ORDER BY nome ASC
    `
  );

  const roomsResult = await pool.query(
    `
      SELECT
        id, unit_id, codigo, nome, nome_conhecido, descricao, tipo,
        capacidade_total, capacidade_recomendada, localizacao_interna,
        especialidade_principal, uso_preferencial, permite_uso_compartilhado,
        status, acessibilidade, equipamentos, observacoes
      FROM public.unit_rooms
      WHERE ativo = true
      ORDER BY nome ASC
    `
  );

  const activitiesResult = await pool.query(
    `
      SELECT
        id, nome, categoria, descricao, duracao_padrao_minutos,
        modalidade, faixa_etaria_sugerida, atendimento_tipo,
        exige_sala_especifica, exige_equipamento, cor_identificacao,
        status, observacoes
      FROM public.unit_activities
      WHERE ativo = true
      ORDER BY nome ASC
    `
  );

  const classesResult = await pool.query(
    `
      SELECT
        id, unit_id, nome, activity_id, descricao, objetivo,
        publico_alvo, faixa_etaria, capacidade_minima, capacidade_ideal,
        capacidade_maxima, status, data_inicio, data_termino,
        professional_principal_id::text AS professional_principal_id,
        professional_apoio_id::text AS professional_apoio_id,
        exige_sala_especifica, projeto_convenio, observacoes
      FROM public.unit_classes
      WHERE ativo = true
      ORDER BY nome ASC
    `
  );

  const slotsResult = await pool.query(
    `
      SELECT
        id, class_id, weekday,
        to_char(hora_inicial, 'HH24:MI') AS hora_inicial,
        to_char(hora_final, 'HH24:MI') AS hora_final,
        room_id, professional_id::text AS professional_id,
        recorrencia, status, observacao, vigencia_inicio, vigencia_fim
      FROM public.unit_class_schedule_slots
      WHERE ativo = true
      ORDER BY weekday, hora_inicial, created_at
    `
  );

  const enrollmentsResult = await pool.query(
    `
      SELECT
        id, class_id, patient_id::text AS patient_id, status,
        data_entrada, data_saida, prioridade, origem_encaminhamento,
        observacao
      FROM public.unit_class_enrollments
      WHERE ativo = true
      ORDER BY created_at DESC
    `
  );

  return {
    units: unitsResult.rows.map(mapUnitRow),
    professionals: professionalsResult.rows.map(mapProfessionalRow),
    students: studentsResult.rows.map(mapStudentRow),
    rooms: roomsResult.rows.map(mapRoomRow),
    activities: activitiesResult.rows.map(mapActivityRow),
    classes: classesResult.rows.map(mapClassRow),
    allocations: slotsResult.rows.map(mapSlotRow),
    enrollments: enrollmentsResult.rows.map(mapEnrollmentRow),
  };
}

router.get('/units', authorizeUnitOpsView, async (_req, res) => {
  try {
    await ensureDefaultInstitutionUnits();

    const result = await pool.query(
      `
        SELECT id, codigo, nome, ativo, observacoes
        FROM public.institution_units
        ORDER BY nome ASC
      `
    );

    return res.json({ success: true, units: result.rows.map(mapUnitRow) });
  } catch (error) {
    console.error('[unit-operations][units][GET] erro ao listar unidades:', error);
    return toError(res, 500, 'Erro ao listar unidades operacionais');
  }
});

router.get('/dataset', authorizeUnitOpsView, async (_req, res) => {
  try {
    const missingTables = await resolveMissingUnitOpsSchemaTables();
    if (missingTables.length > 0) {
      return toSchemaUnavailableError(res, missingTables);
    }

    const dataset = await readDataset();
    const activitiesCount = Array.isArray(dataset?.activities) ? dataset.activities.length : 0;
    const warnings = activitiesCount === 0 ? ['unit_activities_empty'] : [];

    return res.json({
      success: true,
      dataset,
      meta: { activitiesCount },
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (error) {
    if (error?.code === '42P01') {
      return toSchemaUnavailableError(res, UNIT_OPS_REQUIRED_SCHEMA_TABLES);
    }

    console.error('[unit-operations][dataset][GET] erro ao montar dataset:', error);
    return toError(res, 500, 'Erro ao carregar dataset operacional de turmas');
  }
});
router.get('/rooms', authorizeUnitOpsView, async (_req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id, unit_id, codigo, nome, nome_conhecido, descricao, tipo,
          capacidade_total, capacidade_recomendada, localizacao_interna,
          especialidade_principal, uso_preferencial, permite_uso_compartilhado,
          status, acessibilidade, equipamentos, observacoes
        FROM public.unit_rooms
        WHERE ativo = true
        ORDER BY nome ASC
      `
    );

    return res.json({ success: true, rooms: result.rows.map(mapRoomRow) });
  } catch (error) {
    console.error('[unit-operations][rooms][GET] erro ao listar salas:', error);
    return toError(res, 500, 'Erro ao listar salas da unidade');
  }
});

router.post('/rooms/upsert', authorizeRoomsWrite, async (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const id = normalizeOptionalText(payload.id) || `room-${randomUUID()}`;
  const unitId = normalizeFirstText(
    payload.unitId,
    payload.unit_id,
    payload.institutionUnitId,
    payload.institution_unit_id,
    payload.unidadeId,
    payload.unidade_id
  );
  const codigo = normalizeFirstText(payload.codigo, payload.code, payload.room_code);
  const nome = normalizeFirstText(payload.nome, payload.name, payload.room_name);
  const nomeConhecido = normalizeOptionalText(payload.nomeConhecido);
  const descricao = normalizeOptionalText(payload.descricao);
  const tipo = normalizeRoomType(payload.tipo);
  const capacidadeTotal = normalizeInteger(payload.capacidadeTotal);
  const capacidadeRecomendada = normalizeInteger(payload.capacidadeRecomendada);
  const localizacaoInterna = normalizeOptionalText(payload.localizacaoInterna);
  const especialidadePrincipal = normalizeOptionalText(payload.especialidadePrincipal);
  const usoPreferencial = normalizeOptionalText(payload.usoPreferencial);
  const permiteUsoCompartilhado = normalizeBoolean(payload.permiteUsoCompartilhado, true);
  const status = normalizeRoomStatus(payload.status);
  const acessibilidade = normalizeOptionalText(payload.acessibilidade);
  const equipamentos = normalizeEquipmentList(payload.equipamentos);
  const observacoes = normalizeOptionalText(payload.observacoes);

  if (!unitId || !codigo || !nome) {
    return toError(res, 400, 'Unidade, codigo e nome da sala sao obrigatorios');
  }
  if (!tipo) return toError(res, 400, 'Tipo de sala invalido');
  if (!status) return toError(res, 400, 'Status de sala invalido');
  if (!Number.isInteger(capacidadeTotal) || capacidadeTotal <= 0) {
    return toError(res, 400, 'Capacidade total deve ser um inteiro positivo');
  }
  if (!Number.isInteger(capacidadeRecomendada) || capacidadeRecomendada <= 0) {
    return toError(res, 400, 'Capacidade recomendada deve ser um inteiro positivo');
  }
  if (capacidadeRecomendada > capacidadeTotal) {
    return toError(res, 400, 'Capacidade recomendada nao pode ser maior que a capacidade total');
  }

  const client = await pool.connect();
  try {
    const unit = await fetchUnitById(client, unitId);
    if (!unit) return toError(res, 404, 'Unidade informada nao foi encontrada');

    const duplicateCode = await client.query(
      `
        SELECT id
        FROM public.unit_rooms
        WHERE unit_id = $1
          AND LOWER(codigo) = LOWER($2)
          AND id <> $3
        LIMIT 1
      `,
      [unitId, codigo, id]
    );
    if (duplicateCode.rows.length > 0) {
      return toError(res, 409, 'Ja existe sala com este codigo na unidade informada');
    }

    const result = await client.query(
      `
        INSERT INTO public.unit_rooms (
          id, unit_id, codigo, nome, nome_conhecido, descricao, tipo,
          capacidade_total, capacidade_recomendada, localizacao_interna,
          especialidade_principal, uso_preferencial, permite_uso_compartilhado,
          status, acessibilidade, equipamentos, observacoes, ativo,
          created_by, updated_by
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16::jsonb, $17, true,
          COALESCE((SELECT created_by FROM public.unit_rooms WHERE id = $1), $18),
          $18
        )
        ON CONFLICT (id) DO UPDATE
        SET
          unit_id = EXCLUDED.unit_id,
          codigo = EXCLUDED.codigo,
          nome = EXCLUDED.nome,
          nome_conhecido = EXCLUDED.nome_conhecido,
          descricao = EXCLUDED.descricao,
          tipo = EXCLUDED.tipo,
          capacidade_total = EXCLUDED.capacidade_total,
          capacidade_recomendada = EXCLUDED.capacidade_recomendada,
          localizacao_interna = EXCLUDED.localizacao_interna,
          especialidade_principal = EXCLUDED.especialidade_principal,
          uso_preferencial = EXCLUDED.uso_preferencial,
          permite_uso_compartilhado = EXCLUDED.permite_uso_compartilhado,
          status = EXCLUDED.status,
          acessibilidade = EXCLUDED.acessibilidade,
          equipamentos = EXCLUDED.equipamentos,
          observacoes = EXCLUDED.observacoes,
          ativo = true,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING
          id, unit_id, codigo, nome, nome_conhecido, descricao, tipo,
          capacidade_total, capacidade_recomendada, localizacao_interna,
          especialidade_principal, uso_preferencial, permite_uso_compartilhado,
          status, acessibilidade, equipamentos, observacoes
      `,
      [
        id,
        unitId,
        codigo,
        nome,
        nomeConhecido,
        descricao,
        tipo,
        capacidadeTotal,
        capacidadeRecomendada,
        localizacaoInterna,
        especialidadePrincipal,
        usoPreferencial,
        permiteUsoCompartilhado,
        status,
        acessibilidade,
        JSON.stringify(equipamentos),
        observacoes,
        actorId(req),
      ]
    );

    return res.json({ success: true, room: mapRoomRow(result.rows[0]) });
  } catch (error) {
    if (error?.code === '23505') {
      return toError(res, 409, 'Conflito de unicidade ao salvar sala', { code: 'room_duplicate' });
    }
    console.error('[unit-operations][rooms][UPSERT] erro ao salvar sala:', error);
    return toError(res, 500, 'Erro ao salvar sala da unidade');
  } finally {
    client.release();
  }
});
router.get('/activities', authorizeUnitOpsView, async (_req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id, nome, categoria, descricao, duracao_padrao_minutos,
          modalidade, faixa_etaria_sugerida, atendimento_tipo,
          exige_sala_especifica, exige_equipamento, cor_identificacao,
          status, observacoes
        FROM public.unit_activities
        WHERE ativo = true
        ORDER BY nome ASC
      `
    );

    return res.json({ success: true, activities: result.rows.map(mapActivityRow) });
  } catch (error) {
    console.error('[unit-operations][activities][GET] erro ao listar atividades:', error);
    return toError(res, 500, 'Erro ao listar atividades da unidade');
  }
});

router.post('/activities/upsert', authorizeActivitiesWrite, async (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const id = normalizeOptionalText(payload.id) || `activity-${randomUUID()}`;
  const nome = normalizeText(payload.nome);
  const categoria = normalizeActivityCategory(payload.categoria);
  const descricao = normalizeOptionalText(payload.descricao);
  const duracaoPadraoMinutos = normalizeInteger(payload.duracaoPadraoMinutos);
  const modalidade = normalizeActivityMode(payload.modalidade);
  const faixaEtariaSugerida = normalizeOptionalText(payload.faixaEtariaSugerida);
  const atendimentoTipo = normalizeActivityAttendanceType(payload.atendimentoTipo);
  const exigeSalaEspecifica = normalizeBoolean(payload.exigeSalaEspecifica, false);
  const exigeEquipamento = normalizeBoolean(payload.exigeEquipamento, false);
  const corIdentificacao = normalizeOptionalText(payload.corIdentificacao) || '#1d4ed8';
  const status = normalizeActivityStatus(payload.status);
  const observacoes = normalizeOptionalText(payload.observacoes);

  if (!nome) return toError(res, 400, 'Nome da atividade e obrigatorio');
  if (!categoria) return toError(res, 400, 'Categoria de atividade invalida');
  if (!Number.isInteger(duracaoPadraoMinutos) || duracaoPadraoMinutos <= 0) {
    return toError(res, 400, 'Duracao padrao deve ser inteiro positivo');
  }
  if (!modalidade) return toError(res, 400, 'Modalidade de atividade invalida');
  if (!atendimentoTipo) return toError(res, 400, 'Tipo de atendimento invalido');
  if (!status) return toError(res, 400, 'Status de atividade invalido');

  const client = await pool.connect();
  try {
    const duplicateName = await client.query(
      `
        SELECT id
        FROM public.unit_activities
        WHERE LOWER(nome) = LOWER($1)
          AND id <> $2
        LIMIT 1
      `,
      [nome, id]
    );
    if (duplicateName.rows.length > 0) {
      return toError(res, 409, 'Ja existe atividade com este nome');
    }

    const result = await client.query(
      `
        INSERT INTO public.unit_activities (
          id, nome, categoria, descricao, duracao_padrao_minutos,
          modalidade, faixa_etaria_sugerida, atendimento_tipo,
          exige_sala_especifica, exige_equipamento, cor_identificacao,
          status, observacoes, ativo, created_by, updated_by
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11,
          $12, $13, true,
          COALESCE((SELECT created_by FROM public.unit_activities WHERE id = $1), $14),
          $14
        )
        ON CONFLICT (id) DO UPDATE
        SET
          nome = EXCLUDED.nome,
          categoria = EXCLUDED.categoria,
          descricao = EXCLUDED.descricao,
          duracao_padrao_minutos = EXCLUDED.duracao_padrao_minutos,
          modalidade = EXCLUDED.modalidade,
          faixa_etaria_sugerida = EXCLUDED.faixa_etaria_sugerida,
          atendimento_tipo = EXCLUDED.atendimento_tipo,
          exige_sala_especifica = EXCLUDED.exige_sala_especifica,
          exige_equipamento = EXCLUDED.exige_equipamento,
          cor_identificacao = EXCLUDED.cor_identificacao,
          status = EXCLUDED.status,
          observacoes = EXCLUDED.observacoes,
          ativo = true,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING
          id, nome, categoria, descricao, duracao_padrao_minutos,
          modalidade, faixa_etaria_sugerida, atendimento_tipo,
          exige_sala_especifica, exige_equipamento, cor_identificacao,
          status, observacoes
      `,
      [
        id,
        nome,
        categoria,
        descricao,
        duracaoPadraoMinutos,
        modalidade,
        faixaEtariaSugerida,
        atendimentoTipo,
        exigeSalaEspecifica,
        exigeEquipamento,
        corIdentificacao,
        status,
        observacoes,
        actorId(req),
      ]
    );

    return res.json({ success: true, activity: mapActivityRow(result.rows[0]) });
  } catch (error) {
    if (error?.code === '23505') {
      return toError(res, 409, 'Conflito de unicidade ao salvar atividade', { code: 'activity_duplicate' });
    }
    console.error('[unit-operations][activities][UPSERT] erro ao salvar atividade:', error);
    return toError(res, 500, 'Erro ao salvar atividade da unidade');
  } finally {
    client.release();
  }
});

router.get('/classes', authorizeUnitOpsView, async (_req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id, unit_id, nome, activity_id, descricao, objetivo,
          publico_alvo, faixa_etaria, capacidade_minima, capacidade_ideal,
          capacidade_maxima, status, data_inicio, data_termino,
          professional_principal_id::text AS professional_principal_id,
          professional_apoio_id::text AS professional_apoio_id,
          exige_sala_especifica, projeto_convenio, observacoes
        FROM public.unit_classes
        WHERE ativo = true
        ORDER BY nome ASC
      `
    );

    return res.json({ success: true, classes: result.rows.map(mapClassRow) });
  } catch (error) {
    console.error('[unit-operations][classes][GET] erro ao listar turmas:', error);
    return toError(res, 500, 'Erro ao listar turmas da unidade');
  }
});
router.post('/classes/upsert', authorizeClassesWrite, async (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const id = normalizeOptionalText(payload.id) || `class-${randomUUID()}`;
  const unitId = normalizeText(payload.unitId);
  const nome = normalizeText(payload.nome);
  const activityId = normalizeText(payload.activityId);
  const descricao = normalizeOptionalText(payload.descricao);
  const objetivo = normalizeOptionalText(payload.objetivo);
  const publicoAlvo = normalizeOptionalText(payload.publicoAlvo);
  const faixaEtaria = normalizeOptionalText(payload.faixaEtaria);
  const capacidadeMinima = normalizeInteger(payload.capacidadeMinima);
  const capacidadeIdeal = normalizeInteger(payload.capacidadeIdeal);
  const capacidadeMaxima = normalizeInteger(payload.capacidadeMaxima);
  const status = normalizeClassStatus(payload.status);
  const dataInicio = normalizeDate(payload.dataInicio);
  const dataTermino = normalizeDate(payload.dataTermino);
  const profissionalPrincipalId = normalizeText(payload.profissionalPrincipalId);
  const profissionalApoioIdInput = normalizeOptionalText(payload.profissionalApoioId);
  const exigeSalaEspecifica = normalizeBoolean(payload.exigeSalaEspecifica, false);
  const projetoConvenio = normalizeOptionalText(payload.projetoConvenio);
  const observacoes = normalizeOptionalText(payload.observacoes);

  if (!unitId || !nome || !activityId || !profissionalPrincipalId) {
    return toError(res, 400, 'Unidade, nome, atividade e profissional principal sao obrigatorios');
  }
  if (!status) return toError(res, 400, 'Status de turma invalido');
  if (!dataInicio) return toError(res, 400, 'Data de inicio da turma e obrigatoria');
  if (!Number.isInteger(capacidadeMinima) || capacidadeMinima <= 0) {
    return toError(res, 400, 'Capacidade minima deve ser inteiro positivo');
  }
  if (!Number.isInteger(capacidadeIdeal) || capacidadeIdeal <= 0) {
    return toError(res, 400, 'Capacidade ideal deve ser inteiro positivo');
  }
  if (!Number.isInteger(capacidadeMaxima) || capacidadeMaxima <= 0) {
    return toError(res, 400, 'Capacidade maxima deve ser inteiro positivo');
  }
  if (!(capacidadeMinima <= capacidadeIdeal && capacidadeIdeal <= capacidadeMaxima)) {
    return toError(res, 400, 'Capacidades invalidas: minimo <= ideal <= maximo');
  }
  if (dataTermino && dataTermino < dataInicio) {
    return toError(res, 400, 'Data de termino nao pode ser anterior a data de inicio');
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const unit = await fetchUnitById(client, unitId);
    if (!unit) return toError(res, 404, 'Unidade informada nao foi encontrada');

    const activity = await fetchActivityById(client, activityId);
    if (!activity) return toError(res, 404, 'Atividade informada nao foi encontrada');

    const principal = await fetchProfessionalByTextId(client, profissionalPrincipalId);
    if (!principal) {
      return toError(res, 404, 'Profissional principal informado nao foi encontrado');
    }

    let apoio = null;
    if (profissionalApoioIdInput) {
      apoio = await fetchProfessionalByTextId(client, profissionalApoioIdInput);
      if (!apoio) {
        return toError(res, 404, 'Profissional de apoio informado nao foi encontrado');
      }
    }

    const duplicateName = await client.query(
      `
        SELECT id
        FROM public.unit_classes
        WHERE unit_id = $1
          AND LOWER(nome) = LOWER($2)
          AND data_inicio = $3
          AND id <> $4
        LIMIT 1
      `,
      [unitId, nome, dataInicio, id]
    );
    if (duplicateName.rows.length > 0) {
      return toError(res, 409, 'Ja existe turma com este nome na unidade para a mesma data de inicio');
    }

    await client.query('BEGIN');
    transactionStarted = true;

    const classResult = await client.query(
      `
        INSERT INTO public.unit_classes (
          id, unit_id, nome, activity_id, descricao, objetivo,
          publico_alvo, faixa_etaria, capacidade_minima, capacidade_ideal,
          capacidade_maxima, status, data_inicio, data_termino,
          professional_principal_id, professional_apoio_id,
          exige_sala_especifica, projeto_convenio, observacoes,
          ativo, created_by, updated_by
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16,
          $17, $18, $19,
          true,
          COALESCE((SELECT created_by FROM public.unit_classes WHERE id = $1), $20),
          $20
        )
        ON CONFLICT (id) DO UPDATE
        SET
          unit_id = EXCLUDED.unit_id,
          nome = EXCLUDED.nome,
          activity_id = EXCLUDED.activity_id,
          descricao = EXCLUDED.descricao,
          objetivo = EXCLUDED.objetivo,
          publico_alvo = EXCLUDED.publico_alvo,
          faixa_etaria = EXCLUDED.faixa_etaria,
          capacidade_minima = EXCLUDED.capacidade_minima,
          capacidade_ideal = EXCLUDED.capacidade_ideal,
          capacidade_maxima = EXCLUDED.capacidade_maxima,
          status = EXCLUDED.status,
          data_inicio = EXCLUDED.data_inicio,
          data_termino = EXCLUDED.data_termino,
          professional_principal_id = EXCLUDED.professional_principal_id,
          professional_apoio_id = EXCLUDED.professional_apoio_id,
          exige_sala_especifica = EXCLUDED.exige_sala_especifica,
          projeto_convenio = EXCLUDED.projeto_convenio,
          observacoes = EXCLUDED.observacoes,
          ativo = true,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING
          id, unit_id, nome, activity_id, descricao, objetivo,
          publico_alvo, faixa_etaria, capacidade_minima, capacidade_ideal,
          capacidade_maxima, status, data_inicio, data_termino,
          professional_principal_id::text AS professional_principal_id,
          professional_apoio_id::text AS professional_apoio_id,
          exige_sala_especifica, projeto_convenio, observacoes
      `,
      [
        id,
        unitId,
        nome,
        activityId,
        descricao,
        objetivo,
        publicoAlvo,
        faixaEtaria,
        capacidadeMinima,
        capacidadeIdeal,
        capacidadeMaxima,
        status,
        dataInicio,
        dataTermino,
        principal.id,
        apoio?.id || null,
        exigeSalaEspecifica,
        projetoConvenio,
        observacoes,
        actorId(req),
      ]
    );

    await client.query(
      `
        UPDATE public.unit_class_staff
        SET
          status = 'inativo',
          data_fim = COALESCE(data_fim, CURRENT_DATE),
          updated_by = $2,
          updated_at = NOW()
        WHERE class_id = $1
          AND papel IN ('principal', 'apoio')
          AND status = 'ativo'
          AND data_fim IS NULL
      `,
      [id, actorId(req)]
    );

    await client.query(
      `
        INSERT INTO public.unit_class_staff (
          id, class_id, professional_id, papel, status,
          data_inicio, data_fim, observacoes, created_by, updated_by
        )
        VALUES ($1, $2, $3, 'principal', 'ativo', CURRENT_DATE, NULL, $4, $5, $5)
      `,
      [`staff-${randomUUID()}`, id, principal.id, 'Profissional principal da turma', actorId(req)]
    );

    if (apoio && apoio.id !== principal.id) {
      await client.query(
        `
          INSERT INTO public.unit_class_staff (
            id, class_id, professional_id, papel, status,
            data_inicio, data_fim, observacoes, created_by, updated_by
          )
          VALUES ($1, $2, $3, 'apoio', 'ativo', CURRENT_DATE, NULL, $4, $5, $5)
        `,
        [`staff-${randomUUID()}`, id, apoio.id, 'Profissional de apoio da turma', actorId(req)]
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;

    return res.json({ success: true, classItem: mapClassRow(classResult.rows[0]) });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');

    if (error?.code === '23505') {
      return toError(res, 409, 'Conflito de unicidade ao salvar turma', { code: 'class_duplicate' });
    }

    console.error('[unit-operations][classes][UPSERT] erro ao salvar turma:', error);
    return toError(res, 500, 'Erro ao salvar turma da unidade');
  } finally {
    client.release();
  }
});

router.get('/schedule-slots', authorizeUnitOpsView, async (_req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id, class_id, weekday,
          to_char(hora_inicial, 'HH24:MI') AS hora_inicial,
          to_char(hora_final, 'HH24:MI') AS hora_final,
          room_id, professional_id::text AS professional_id,
          recorrencia, status, observacao, vigencia_inicio, vigencia_fim
        FROM public.unit_class_schedule_slots
        WHERE ativo = true
        ORDER BY weekday, hora_inicial, created_at
      `
    );

    return res.json({ success: true, allocations: result.rows.map(mapSlotRow) });
  } catch (error) {
    console.error('[unit-operations][schedule-slots][GET] erro ao listar alocacoes:', error);
    return toError(res, 500, 'Erro ao listar alocacoes da grade operacional');
  }
});

router.post('/schedule-slots/upsert', authorizeSlotsWrite, async (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const id = normalizeOptionalText(payload.id) || `slot-${randomUUID()}`;
  const classId = normalizeText(payload.classId);
  const weekday = normalizeSlotWeekday(payload.weekday);
  const horaInicial = normalizeTime(payload.horaInicial);
  const horaFinal = normalizeTime(payload.horaFinal);
  const roomId = normalizeText(payload.roomId);
  const professionalId = normalizeText(payload.professionalId);
  const recorrencia = normalizeSlotRecurrence(payload.recorrencia);
  const status = normalizeSlotStatus(payload.status);
  const observacao = normalizeOptionalText(payload.observacao);

  if (!classId || !roomId || !professionalId) {
    return toError(res, 400, 'Turma, sala e profissional sao obrigatorios para alocacao');
  }
  if (!weekday) return toError(res, 400, 'Dia da semana invalido para alocacao');
  if (!horaInicial || !horaFinal) return toError(res, 400, 'Horario inicial/final invalido');
  if (!recorrencia) return toError(res, 400, 'Recorrencia invalida para alocacao');
  if (!status) return toError(res, 400, 'Status invalido para alocacao');

  const startMinutes = toTimeMinutes(horaInicial);
  const endMinutes = toTimeMinutes(horaFinal);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return toError(res, 400, 'Intervalo de horario invalido para alocacao');
  }

  const client = await pool.connect();
  try {
    const classData = await fetchClassById(client, classId);
    if (!classData) return toError(res, 404, 'Turma informada nao foi encontrada');

    const room = await fetchRoomById(client, roomId);
    if (!room) return toError(res, 404, 'Sala informada nao foi encontrada');

    if (room.unit_id !== classData.unit_id) {
      return toError(res, 400, 'Sala e turma precisam pertencer a mesma unidade');
    }

    const professional = await fetchProfessionalByTextId(client, professionalId);
    if (!professional) return toError(res, 404, 'Profissional informado nao foi encontrado');

    const vigenciaInicio =
      normalizeDate(payload.vigenciaInicio) || normalizeDate(classData.data_inicio);
    const vigenciaFim = normalizeDate(payload.vigenciaFim);

    if (!vigenciaInicio) {
      return toError(res, 400, 'Vigencia inicial invalida para alocacao');
    }
    if (vigenciaFim && vigenciaFim < vigenciaInicio) {
      return toError(res, 400, 'Vigencia final nao pode ser anterior a vigencia inicial');
    }
    if (classData.data_inicio && vigenciaInicio < classData.data_inicio) {
      return toError(res, 400, 'Vigencia da alocacao nao pode iniciar antes da data de inicio da turma');
    }
    if (classData.data_termino && vigenciaInicio > classData.data_termino) {
      return toError(res, 400, 'Vigencia da alocacao nao pode iniciar apos o termino da turma');
    }
    if (classData.data_termino && vigenciaFim && vigenciaFim > classData.data_termino) {
      return toError(res, 400, 'Vigencia final da alocacao nao pode ultrapassar o termino da turma');
    }

    const roomConflictResult = await client.query(
      `
        SELECT id
        FROM public.unit_class_schedule_slots
        WHERE id <> $1
          AND ativo = true
          AND status IN ('ativa', 'planejada')
          AND weekday = $2
          AND room_id = $3
          AND daterange(
            vigencia_inicio,
            COALESCE(vigencia_fim, 'infinity'::date),
            '[]'
          ) && daterange($4::date, COALESCE($5::date, 'infinity'::date), '[]')
          AND int4range(
            (EXTRACT(HOUR FROM hora_inicial)::int * 60 + EXTRACT(MINUTE FROM hora_inicial)::int),
            (EXTRACT(HOUR FROM hora_final)::int * 60 + EXTRACT(MINUTE FROM hora_final)::int),
            '[)'
          ) && int4range($6::int, $7::int, '[)')
        LIMIT 1
      `,
      [id, weekday, roomId, vigenciaInicio, vigenciaFim, startMinutes, endMinutes]
    );
    if (roomConflictResult.rows.length > 0) {
      return toError(res, 409, 'Conflito de sala para o intervalo informado', {
        code: 'room_conflict',
      });
    }

    const professionalConflictResult = await client.query(
      `
        SELECT id
        FROM public.unit_class_schedule_slots
        WHERE id <> $1
          AND ativo = true
          AND status IN ('ativa', 'planejada')
          AND weekday = $2
          AND professional_id::text = $3
          AND daterange(
            vigencia_inicio,
            COALESCE(vigencia_fim, 'infinity'::date),
            '[]'
          ) && daterange($4::date, COALESCE($5::date, 'infinity'::date), '[]')
          AND int4range(
            (EXTRACT(HOUR FROM hora_inicial)::int * 60 + EXTRACT(MINUTE FROM hora_inicial)::int),
            (EXTRACT(HOUR FROM hora_final)::int * 60 + EXTRACT(MINUTE FROM hora_final)::int),
            '[)'
          ) && int4range($6::int, $7::int, '[)')
        LIMIT 1
      `,
      [id, weekday, String(professional.id), vigenciaInicio, vigenciaFim, startMinutes, endMinutes]
    );
    if (professionalConflictResult.rows.length > 0) {
      return toError(res, 409, 'Conflito de profissional para o intervalo informado', {
        code: 'professional_conflict',
      });
    }

    const result = await client.query(
      `
        INSERT INTO public.unit_class_schedule_slots (
          id, class_id, weekday, hora_inicial, hora_final, room_id,
          professional_id, recorrencia, status, vigencia_inicio,
          vigencia_fim, observacao, ativo, created_by, updated_by
        )
        VALUES (
          $1, $2, $3, $4::time, $5::time, $6,
          $7, $8, $9, $10::date,
          $11::date, $12, true,
          COALESCE((SELECT created_by FROM public.unit_class_schedule_slots WHERE id = $1), $13),
          $13
        )
        ON CONFLICT (id) DO UPDATE
        SET
          class_id = EXCLUDED.class_id,
          weekday = EXCLUDED.weekday,
          hora_inicial = EXCLUDED.hora_inicial,
          hora_final = EXCLUDED.hora_final,
          room_id = EXCLUDED.room_id,
          professional_id = EXCLUDED.professional_id,
          recorrencia = EXCLUDED.recorrencia,
          status = EXCLUDED.status,
          vigencia_inicio = EXCLUDED.vigencia_inicio,
          vigencia_fim = EXCLUDED.vigencia_fim,
          observacao = EXCLUDED.observacao,
          ativo = true,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING
          id, class_id, weekday,
          to_char(hora_inicial, 'HH24:MI') AS hora_inicial,
          to_char(hora_final, 'HH24:MI') AS hora_final,
          room_id, professional_id::text AS professional_id,
          recorrencia, status, observacao
      `,
      [
        id,
        classId,
        weekday,
        horaInicial,
        horaFinal,
        roomId,
        professional.id,
        recorrencia,
        status,
        vigenciaInicio,
        vigenciaFim,
        observacao,
        actorId(req),
      ]
    );

    return res.json({ success: true, allocation: mapSlotRow(result.rows[0]) });
  } catch (error) {
    if (error?.code === '23P01') {
      return toError(res, 409, 'Conflito operacional detectado ao salvar alocacao', {
        code: 'slot_conflict',
      });
    }
    if (error?.code === '23505') {
      return toError(res, 409, 'Conflito de unicidade ao salvar alocacao', {
        code: 'slot_duplicate',
      });
    }
    console.error('[unit-operations][schedule-slots][UPSERT] erro ao salvar alocacao:', error);
    return toError(res, 500, 'Erro ao salvar alocacao da grade');
  } finally {
    client.release();
  }
});

router.delete('/schedule-slots/:id', authorizeSlotsWrite, async (req, res) => {
  const slotId = normalizeText(req.params?.id);
  if (!slotId) return toError(res, 400, 'Identificador de alocacao invalido');

  try {
    const result = await pool.query(
      `
        UPDATE public.unit_class_schedule_slots
        SET
          ativo = false,
          status = 'suspensa',
          updated_by = $2,
          updated_at = NOW()
        WHERE id = $1
          AND ativo = true
        RETURNING id
      `,
      [slotId, actorId(req)]
    );

    if (result.rows.length === 0) {
      return toError(res, 404, 'Alocacao informada nao foi encontrada');
    }

    return res.json({ success: true, removedId: slotId });
  } catch (error) {
    console.error('[unit-operations][schedule-slots][DELETE] erro ao remover alocacao:', error);
    return toError(res, 500, 'Erro ao remover alocacao da grade');
  }
});

router.get('/enrollments', authorizeUnitOpsView, async (_req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id, class_id, patient_id::text AS patient_id, status,
          data_entrada, data_saida, prioridade, origem_encaminhamento,
          observacao
        FROM public.unit_class_enrollments
        WHERE ativo = true
        ORDER BY created_at DESC
      `
    );

    return res.json({ success: true, enrollments: result.rows.map(mapEnrollmentRow) });
  } catch (error) {
    console.error('[unit-operations][enrollments][GET] erro ao listar matriculas:', error);
    return toError(res, 500, 'Erro ao listar matriculas operacionais');
  }
});

router.post('/enrollments/upsert', authorizeEnrollmentsWrite, async (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const id = normalizeOptionalText(payload.id) || `enrollment-${randomUUID()}`;
  const classId = normalizeText(payload.classId);
  const studentId = normalizeText(payload.studentId);
  const status = normalizeEnrollmentStatus(payload.status);
  const dataEntrada = normalizeDate(payload.dataEntrada);
  const dataSaida = normalizeDate(payload.dataSaida);
  const prioridade = normalizeEnrollmentPriority(payload.prioridade) || 'media';
  const origemEncaminhamento = normalizeOptionalText(payload.origemEncaminhamento);
  const observacao = normalizeOptionalText(payload.observacao);

  if (!classId || !studentId) {
    return toError(res, 400, 'Turma e assistido sao obrigatorios para matricula');
  }
  if (!status) return toError(res, 400, 'Status de matricula invalido');
  if (!dataEntrada) return toError(res, 400, 'Data de entrada da matricula e obrigatoria');
  if (dataSaida && dataSaida < dataEntrada) {
    return toError(res, 400, 'Data de saida nao pode ser anterior a data de entrada');
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const rollbackAndError = async (statusCode, message, extra = {}) => {
      if (transactionStarted) {
        await client.query('ROLLBACK');
        transactionStarted = false;
      }
      return toError(res, statusCode, message, extra);
    };

    const classData = await fetchClassById(client, classId, { forUpdate: true });
    if (!classData) return rollbackAndError(404, 'Turma informada nao foi encontrada');

    const patient = await fetchPatientByTextId(client, studentId);
    if (!patient) return rollbackAndError(404, 'Assistido informado nao foi encontrado');

    if (classData.data_inicio && dataEntrada < classData.data_inicio) {
      return rollbackAndError(400, 'Data de entrada nao pode ser anterior ao inicio da turma');
    }
    if (classData.data_termino && dataEntrada > classData.data_termino) {
      return rollbackAndError(400, 'Data de entrada nao pode ser posterior ao termino da turma');
    }
    if (classData.data_termino && dataSaida && dataSaida > classData.data_termino) {
      return rollbackAndError(400, 'Data de saida nao pode ser posterior ao termino da turma');
    }

    const isActiveEnrollment = ['ativo', 'aguardando_vaga'].includes(status) && !dataSaida;
    if (isActiveEnrollment) {
      const duplicateEnrollmentResult = await client.query(
        `
          SELECT id
          FROM public.unit_class_enrollments
          WHERE class_id = $1
            AND patient_id = $2
            AND id <> $3
            AND ativo = true
            AND status IN ('ativo', 'aguardando_vaga')
            AND data_saida IS NULL
          LIMIT 1
        `,
        [classId, patient.id, id]
      );

      if (duplicateEnrollmentResult.rows.length > 0) {
        return rollbackAndError(409, 'Assistido ja possui matricula ativa/espera nesta turma', {
          code: 'duplicate_active_enrollment',
        });
      }
    }

    if (status === 'ativo' && !dataSaida) {
      const capacityResult = await client.query(
        `
          SELECT COUNT(*)::int AS ativos
          FROM public.unit_class_enrollments
          WHERE class_id = $1
            AND id <> $2
            AND ativo = true
            AND status = 'ativo'
            AND data_saida IS NULL
        `,
        [classId, id]
      );
      const activeCount = Number(capacityResult.rows[0]?.ativos || 0);
      if (activeCount >= Number(classData.capacidade_maxima || 0)) {
        return rollbackAndError(
          409,
          'Turma lotada para matricula ativa. Utilize aguardando_vaga ou ajuste capacidade.',
          { code: 'class_capacity_exceeded' }
        );
      }
    }

    const result = await client.query(
      `
        INSERT INTO public.unit_class_enrollments (
          id, class_id, patient_id, status, data_entrada, data_saida,
          prioridade, origem_encaminhamento, observacao, ativo, created_by, updated_by
        )
        VALUES (
          $1, $2, $3, $4, $5::date, $6::date,
          $7, $8, $9, true,
          COALESCE((SELECT created_by FROM public.unit_class_enrollments WHERE id = $1), $10),
          $10
        )
        ON CONFLICT (id) DO UPDATE
        SET
          class_id = EXCLUDED.class_id,
          patient_id = EXCLUDED.patient_id,
          status = EXCLUDED.status,
          data_entrada = EXCLUDED.data_entrada,
          data_saida = EXCLUDED.data_saida,
          prioridade = EXCLUDED.prioridade,
          origem_encaminhamento = EXCLUDED.origem_encaminhamento,
          observacao = EXCLUDED.observacao,
          ativo = true,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING
          id, class_id, patient_id::text AS patient_id, status,
          data_entrada, data_saida, prioridade, origem_encaminhamento,
          observacao
      `,
      [
        id,
        classId,
        patient.id,
        status,
        dataEntrada,
        dataSaida,
        prioridade,
        origemEncaminhamento,
        observacao,
        actorId(req),
      ]
    );

    await client.query('COMMIT');
    transactionStarted = false;

    return res.json({ success: true, enrollment: mapEnrollmentRow(result.rows[0]) });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');

    if (error?.code === '23505') {
      if (error?.constraint === 'idx_unit_class_enrollments_active_unique') {
        return toError(res, 409, 'Assistido ja possui matricula ativa/espera nesta turma', {
          code: 'duplicate_active_enrollment',
        });
      }
      return toError(res, 409, 'Conflito de unicidade ao salvar matricula', {
        code: 'enrollment_duplicate',
      });
    }
    console.error('[unit-operations][enrollments][UPSERT] erro ao salvar matricula:', error);
    return toError(res, 500, 'Erro ao salvar matricula operacional');
  } finally {
    client.release();
  }
});

module.exports = router;

