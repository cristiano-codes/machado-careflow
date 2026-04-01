const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.HOMOLOG_BASE_URL || 'http://localhost:3000/api';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function buildId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function chooseOperationalWindow() {
  const weekdays = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
  const weekday = weekdays[Math.floor(Math.random() * weekdays.length)];
  const startHour = 8 + Math.floor(Math.random() * 10); // 08..17
  const endHour = startHour + 1;
  const pad = (value) => String(value).padStart(2, '0');
  return {
    weekday,
    horaInicial: `${pad(startHour)}:00`,
    horaFinal: `${pad(endHour)}:00`,
  };
}

async function request(method, endpoint, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function login(username, password) {
  const response = await request('POST', '/auth/login', {
    body: { username, password },
  });
  if (!response.ok || !response.payload?.token) {
    throw new Error(
      `Falha no login de ${username}: status=${response.status} payload=${JSON.stringify(response.payload)}`
    );
  }
  return response.payload.token;
}

async function main() {
  const checks = [];
  const artifacts = {};

  function record(name, pass, detail = {}) {
    checks.push({ name, pass, detail });
    const marker = pass ? 'PASS' : 'FAIL';
    console.log(`[${marker}] ${name} ${JSON.stringify(detail)}`);
  }

  const adminToken = await login('homol_ops_admin', 'Homolog@123');
  const deniedToken = await login('homol_ops_denied', 'Homolog@123');

  const datasetResp = await request('GET', '/unit-operations/dataset', { token: adminToken });
  record('admin acessa dataset', datasetResp.status === 200 && datasetResp.payload?.success === true, {
    status: datasetResp.status,
    success: datasetResp.payload?.success,
  });

  const deniedDatasetResp = await request('GET', '/unit-operations/dataset', { token: deniedToken });
  record('negado bloqueado no dataset', deniedDatasetResp.status === 403, {
    status: deniedDatasetResp.status,
  });

  const dataset = datasetResp.payload?.dataset || {};
  const unitId = dataset.units?.[0]?.id;
  const professionals = Array.isArray(dataset.professionals)
    ? dataset.professionals.filter((item) => item.status === 'ativo')
    : [];
  const students = Array.isArray(dataset.students)
    ? dataset.students.filter((item) => item.status === 'ativo')
    : [];

  if (!unitId || professionals.length < 2 || students.length < 2) {
    throw new Error('Fixtures insuficientes para validar onda 1 no perfil admin');
  }

  const professional1Id = professionals[0].id;
  const professional2Id = professionals[1].id;
  const student1Id = students[0].id;
  const student2Id = students[1].id;

  const room1Id = buildId('wave1-admin-room-1');
  const room2Id = buildId('wave1-admin-room-2');
  const activityId = buildId('wave1-admin-activity');
  const classBaseId = buildId('wave1-admin-class-base');
  const classAuxId = buildId('wave1-admin-class-aux');
  const slotBaseId = buildId('wave1-admin-slot-base');
  const enrollmentBaseId = buildId('wave1-admin-enrollment-base');

  const roomCreateResp = await request('POST', '/unit-operations/rooms/upsert', {
    token: adminToken,
    body: {
      id: room1Id,
      unitId,
      codigo: `W1A-${Date.now().toString().slice(-5)}`,
      nome: 'Wave1 Admin Sala 1',
      nomeConhecido: 'Sala Onda1 Admin 1',
      descricao: 'Sala criada na onda 1',
      tipo: 'multifuncional',
      capacidadeTotal: 24,
      capacidadeRecomendada: 12,
      localizacaoInterna: 'Bloco A',
      especialidadePrincipal: 'Operacional',
      usoPreferencial: 'Turmas',
      permiteUsoCompartilhado: true,
      status: 'ativa',
      acessibilidade: 'Padrao',
      equipamentos: ['Quadro'],
      observacoes: 'onda1 admin create',
    },
  });
  record('admin cria sala', roomCreateResp.status === 200 && roomCreateResp.payload?.room?.id === room1Id, {
    status: roomCreateResp.status,
    roomId: roomCreateResp.payload?.room?.id,
  });

  const roomEditResp = await request('POST', '/unit-operations/rooms/upsert', {
    token: adminToken,
    body: {
      id: room1Id,
      unitId,
      codigo: `W1A-${Date.now().toString().slice(-5)}`,
      nome: 'Wave1 Admin Sala 1 (edit)',
      nomeConhecido: 'Sala Onda1 Admin 1',
      descricao: 'Sala editada na onda 1',
      tipo: 'multifuncional',
      capacidadeTotal: 24,
      capacidadeRecomendada: 14,
      localizacaoInterna: 'Bloco A',
      especialidadePrincipal: 'Operacional',
      usoPreferencial: 'Turmas',
      permiteUsoCompartilhado: true,
      status: 'ativa',
      acessibilidade: 'Padrao',
      equipamentos: ['Quadro', 'Projetor'],
      observacoes: 'onda1 admin edit',
    },
  });
  record('admin edita sala', roomEditResp.status === 200 && roomEditResp.payload?.room?.id === room1Id, {
    status: roomEditResp.status,
    roomId: roomEditResp.payload?.room?.id,
  });

  const room2Resp = await request('POST', '/unit-operations/rooms/upsert', {
    token: adminToken,
    body: {
      id: room2Id,
      unitId,
      codigo: `W1B-${Date.now().toString().slice(-5)}`,
      nome: 'Wave1 Admin Sala 2',
      nomeConhecido: 'Sala Onda1 Admin 2',
      descricao: 'Sala auxiliar para conflito de profissional',
      tipo: 'multifuncional',
      capacidadeTotal: 24,
      capacidadeRecomendada: 12,
      localizacaoInterna: 'Bloco B',
      especialidadePrincipal: 'Operacional',
      usoPreferencial: 'Turmas',
      permiteUsoCompartilhado: true,
      status: 'ativa',
      acessibilidade: 'Padrao',
      equipamentos: ['Mesa'],
      observacoes: 'onda1 admin room2',
    },
  });
  record('admin cria sala auxiliar', room2Resp.status === 200, {
    status: room2Resp.status,
    roomId: room2Resp.payload?.room?.id,
  });

  const activityCreateResp = await request('POST', '/unit-operations/activities/upsert', {
    token: adminToken,
    body: {
      id: activityId,
      nome: `Wave1 Admin Atividade ${Date.now()}`,
      categoria: 'pedagogica',
      descricao: 'Atividade onda 1',
      duracaoPadraoMinutos: 60,
      modalidade: 'presencial',
      faixaEtariaSugerida: '8-12',
      atendimentoTipo: 'grupo',
      exigeSalaEspecifica: false,
      exigeEquipamento: false,
      corIdentificacao: '#1d4ed8',
      status: 'ativa',
      observacoes: 'onda1 admin create',
    },
  });
  record(
    'admin cria atividade',
    activityCreateResp.status === 200 && activityCreateResp.payload?.activity?.id === activityId,
    {
      status: activityCreateResp.status,
      activityId: activityCreateResp.payload?.activity?.id,
    }
  );

  const activityEditResp = await request('POST', '/unit-operations/activities/upsert', {
    token: adminToken,
    body: {
      id: activityId,
      nome: `Wave1 Admin Atividade ${Date.now()} (edit)`,
      categoria: 'pedagogica',
      descricao: 'Atividade onda 1 editada',
      duracaoPadraoMinutos: 60,
      modalidade: 'presencial',
      faixaEtariaSugerida: '8-12',
      atendimentoTipo: 'grupo',
      exigeSalaEspecifica: false,
      exigeEquipamento: false,
      corIdentificacao: '#1d4ed8',
      status: 'ativa',
      observacoes: 'onda1 admin edit',
    },
  });
  record(
    'admin edita atividade',
    activityEditResp.status === 200 && activityEditResp.payload?.activity?.id === activityId,
    {
      status: activityEditResp.status,
      activityId: activityEditResp.payload?.activity?.id,
    }
  );

  const classBaseCreateResp = await request('POST', '/unit-operations/classes/upsert', {
    token: adminToken,
    body: {
      id: classBaseId,
      unitId,
      nome: `Wave1 Admin Turma Base ${Date.now()}`,
      activityId,
      descricao: 'Turma base onda 1',
      objetivo: 'Validar operacao',
      publicoAlvo: 'Assistidos ativos',
      faixaEtaria: '8-12',
      capacidadeMinima: 1,
      capacidadeIdeal: 1,
      capacidadeMaxima: 1,
      status: 'ativa',
      dataInicio: todayIso(),
      dataTermino: null,
      profissionalPrincipalId: professional1Id,
      profissionalApoioId: professional2Id,
      exigeSalaEspecifica: false,
      projetoConvenio: 'Wave1',
      observacoes: 'onda1 turma base',
    },
  });
  record('admin cria turma', classBaseCreateResp.status === 200, {
    status: classBaseCreateResp.status,
    classId: classBaseCreateResp.payload?.classItem?.id,
  });

  const classBaseEditResp = await request('POST', '/unit-operations/classes/upsert', {
    token: adminToken,
    body: {
      id: classBaseId,
      unitId,
      nome: `Wave1 Admin Turma Base ${Date.now()} (edit)`,
      activityId,
      descricao: 'Turma base onda 1 editada',
      objetivo: 'Validar operacao',
      publicoAlvo: 'Assistidos ativos',
      faixaEtaria: '8-12',
      capacidadeMinima: 1,
      capacidadeIdeal: 1,
      capacidadeMaxima: 1,
      status: 'ativa',
      dataInicio: todayIso(),
      dataTermino: null,
      profissionalPrincipalId: professional1Id,
      profissionalApoioId: professional2Id,
      exigeSalaEspecifica: false,
      projetoConvenio: 'Wave1',
      observacoes: 'onda1 turma base edit',
    },
  });
  record('admin edita turma', classBaseEditResp.status === 200, {
    status: classBaseEditResp.status,
    classId: classBaseEditResp.payload?.classItem?.id,
  });

  const classAuxResp = await request('POST', '/unit-operations/classes/upsert', {
    token: adminToken,
    body: {
      id: classAuxId,
      unitId,
      nome: `Wave1 Admin Turma Aux ${Date.now()}`,
      activityId,
      descricao: 'Turma auxiliar para conflitos',
      objetivo: 'Conflitos',
      publicoAlvo: 'Assistidos ativos',
      faixaEtaria: '8-12',
      capacidadeMinima: 1,
      capacidadeIdeal: 2,
      capacidadeMaxima: 6,
      status: 'ativa',
      dataInicio: todayIso(),
      dataTermino: null,
      profissionalPrincipalId: professional2Id,
      profissionalApoioId: professional1Id,
      exigeSalaEspecifica: false,
      projetoConvenio: 'Wave1',
      observacoes: 'onda1 turma aux',
    },
  });
  record('admin cria turma auxiliar', classAuxResp.status === 200, {
    status: classAuxResp.status,
    classId: classAuxResp.payload?.classItem?.id,
  });

  const window = chooseOperationalWindow();
  artifacts.operationalWindow = window;

  const slotBaseResp = await request('POST', '/unit-operations/schedule-slots/upsert', {
    token: adminToken,
    body: {
      id: slotBaseId,
      classId: classBaseId,
      weekday: window.weekday,
      horaInicial: window.horaInicial,
      horaFinal: window.horaFinal,
      roomId: room1Id,
      professionalId: professional1Id,
      recorrencia: 'semanal',
      status: 'ativa',
      observacao: 'slot base onda1 admin',
      vigenciaInicio: todayIso(),
    },
  });
  record('admin cria alocacao valida', slotBaseResp.status === 200, {
    status: slotBaseResp.status,
    slotId: slotBaseResp.payload?.allocation?.id,
  });

  const roomConflictResp = await request('POST', '/unit-operations/schedule-slots/upsert', {
    token: adminToken,
    body: {
      id: buildId('wave1-admin-slot-room-conflict'),
      classId: classAuxId,
      weekday: window.weekday,
      horaInicial: window.horaInicial,
      horaFinal: window.horaFinal,
      roomId: room1Id,
      professionalId: professional2Id,
      recorrencia: 'semanal',
      status: 'ativa',
      observacao: 'conflito sala',
      vigenciaInicio: todayIso(),
    },
  });
  record('admin bloqueio conflito de sala', roomConflictResp.status === 409, {
    status: roomConflictResp.status,
    code: roomConflictResp.payload?.code,
  });

  const professionalConflictResp = await request('POST', '/unit-operations/schedule-slots/upsert', {
    token: adminToken,
    body: {
      id: buildId('wave1-admin-slot-prof-conflict'),
      classId: classAuxId,
      weekday: window.weekday,
      horaInicial: window.horaInicial,
      horaFinal: window.horaFinal,
      roomId: room2Id,
      professionalId: professional1Id,
      recorrencia: 'semanal',
      status: 'ativa',
      observacao: 'conflito profissional',
      vigenciaInicio: todayIso(),
    },
  });
  record('admin bloqueio conflito de profissional', professionalConflictResp.status === 409, {
    status: professionalConflictResp.status,
    code: professionalConflictResp.payload?.code,
  });

  const enrollmentBaseResp = await request('POST', '/unit-operations/enrollments/upsert', {
    token: adminToken,
    body: {
      id: enrollmentBaseId,
      classId: classBaseId,
      studentId: student1Id,
      status: 'ativo',
      dataEntrada: todayIso(),
      prioridade: 'media',
      origemEncaminhamento: 'Wave1',
      observacao: 'matricula base admin',
    },
  });
  record('admin cria matricula valida', enrollmentBaseResp.status === 200, {
    status: enrollmentBaseResp.status,
    enrollmentId: enrollmentBaseResp.payload?.enrollment?.id,
  });

  const duplicateEnrollmentResp = await request('POST', '/unit-operations/enrollments/upsert', {
    token: adminToken,
    body: {
      id: buildId('wave1-admin-enrollment-dup'),
      classId: classBaseId,
      studentId: student1Id,
      status: 'ativo',
      dataEntrada: todayIso(),
      prioridade: 'media',
      origemEncaminhamento: 'Wave1',
      observacao: 'duplicada',
    },
  });
  record('admin bloqueio matricula duplicada', duplicateEnrollmentResp.status === 409, {
    status: duplicateEnrollmentResp.status,
    code: duplicateEnrollmentResp.payload?.code,
  });

  const capacityEnrollmentResp = await request('POST', '/unit-operations/enrollments/upsert', {
    token: adminToken,
    body: {
      id: buildId('wave1-admin-enrollment-capacity'),
      classId: classBaseId,
      studentId: student2Id,
      status: 'ativo',
      dataEntrada: todayIso(),
      prioridade: 'media',
      origemEncaminhamento: 'Wave1',
      observacao: 'capacidade',
    },
  });
  record('admin bloqueio superlotacao', capacityEnrollmentResp.status === 409, {
    status: capacityEnrollmentResp.status,
    code: capacityEnrollmentResp.payload?.code,
  });

  const listRoomsResp = await request('GET', '/unit-operations/rooms', { token: adminToken });
  record('admin listagem salas', listRoomsResp.status === 200, {
    status: listRoomsResp.status,
    count: Array.isArray(listRoomsResp.payload?.rooms) ? listRoomsResp.payload.rooms.length : null,
  });

  const listActivitiesResp = await request('GET', '/unit-operations/activities', { token: adminToken });
  record('admin listagem atividades', listActivitiesResp.status === 200, {
    status: listActivitiesResp.status,
    count: Array.isArray(listActivitiesResp.payload?.activities)
      ? listActivitiesResp.payload.activities.length
      : null,
  });

  const listClassesResp = await request('GET', '/unit-operations/classes', { token: adminToken });
  record('admin listagem turmas', listClassesResp.status === 200, {
    status: listClassesResp.status,
    count: Array.isArray(listClassesResp.payload?.classes) ? listClassesResp.payload.classes.length : null,
  });

  const listSlotsResp = await request('GET', '/unit-operations/schedule-slots', { token: adminToken });
  record('admin listagem grade', listSlotsResp.status === 200, {
    status: listSlotsResp.status,
    count: Array.isArray(listSlotsResp.payload?.allocations)
      ? listSlotsResp.payload.allocations.length
      : null,
  });

  const listEnrollmentsResp = await request('GET', '/unit-operations/enrollments', { token: adminToken });
  record('admin listagem matriculas', listEnrollmentsResp.status === 200, {
    status: listEnrollmentsResp.status,
    count: Array.isArray(listEnrollmentsResp.payload?.enrollments)
      ? listEnrollmentsResp.payload.enrollments.length
      : null,
  });

  const deniedRoomWriteResp = await request('POST', '/unit-operations/rooms/upsert', {
    token: deniedToken,
    body: {
      id: buildId('wave1-admin-denied-room'),
      unitId,
      codigo: 'DENY',
      nome: 'Denied',
      tipo: 'multifuncional',
      capacidadeTotal: 10,
      capacidadeRecomendada: 8,
      status: 'ativa',
    },
  });
  record('negado bloqueado em escrita', deniedRoomWriteResp.status === 403, {
    status: deniedRoomWriteResp.status,
  });

  const agendaProfessionalsResp = await request('GET', '/profissionais?for_agenda=1', { token: adminToken });
  record('regressao agenda oficial - profissionais for_agenda', agendaProfessionalsResp.status === 200, {
    status: agendaProfessionalsResp.status,
  });

  const rangeFrom = todayIso();
  const rangeTo = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const agendaRangeResp = await request(
    'GET',
    `/profissionais/agenda/range?date_from=${rangeFrom}&date_to=${rangeTo}`,
    { token: adminToken }
  );
  record('regressao agenda oficial - agenda range', agendaRangeResp.status === 200, {
    status: agendaRangeResp.status,
    success: agendaRangeResp.payload?.success,
  });

  const summary = {
    total: checks.length,
    passed: checks.filter((entry) => entry.pass).length,
    failed: checks.filter((entry) => !entry.pass).length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    summary,
    checks,
    artifacts: {
      unitId,
      professional1Id,
      professional2Id,
      student1Id,
      student2Id,
      room1Id,
      room2Id,
      activityId,
      classBaseId,
      classAuxId,
      slotBaseId,
      enrollmentBaseId,
      ...artifacts,
    },
  };

  const outDir = path.join(process.cwd(), 'smoke-evidence');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `homolog-unit-ops-wave1-admin-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`REPORT=${outPath}`);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
