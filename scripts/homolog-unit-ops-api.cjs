const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.HOMOLOG_BASE_URL || 'http://localhost:3000/api';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function request(method, endpoint, { token, body } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };
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
  const result = await request('POST', '/auth/login', {
    body: { username, password },
  });
  if (!result.ok || !result.payload?.token) {
    throw new Error(`Falha no login de ${username}: status=${result.status} payload=${JSON.stringify(result.payload)}`);
  }
  return result.payload.token;
}

function buildId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
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
  record('dataset admin 200', datasetResp.status === 200 && datasetResp.payload?.success === true, {
    status: datasetResp.status,
    success: datasetResp.payload?.success,
  });

  const dataset = datasetResp.payload?.dataset || {};
  const unitId = (dataset.units || []).find((u) => u.id === 'u-centro')?.id || (dataset.units || [])[0]?.id;
  const professionals = (dataset.professionals || []).filter((p) => p.status === 'ativo');
  const students = (dataset.students || []).filter((s) => s.status === 'ativo');

  record('dataset contem unidade', Boolean(unitId), { unitId });
  record('dataset contem >=2 profissionais', professionals.length >= 2, { professionals: professionals.length });
  record('dataset contem >=2 assistidos', students.length >= 2, { students: students.length });

  const deniedDatasetResp = await request('GET', '/unit-operations/dataset', { token: deniedToken });
  record('dataset denied bloqueado', deniedDatasetResp.status === 403, {
    status: deniedDatasetResp.status,
    message: deniedDatasetResp.payload?.message,
  });

  if (!unitId || professionals.length < 2 || students.length < 2) {
    throw new Error('Fixtures insuficientes no dataset para executar cenarios operacionais');
  }

  const prof1 = professionals[0];
  const prof2 = professionals[1];
  const student1 = students[0];
  const student2 = students[1];

  const room1Id = buildId('homol-room-1');
  const room2Id = buildId('homol-room-2');
  const activityId = buildId('homol-activity');
  const classId = buildId('homol-class');
  const slot1Id = buildId('homol-slot-1');
  const slot4Id = buildId('homol-slot-4');
  const enrollment1Id = buildId('homol-enrollment-1');

  const room1Resp = await request('POST', '/unit-operations/rooms/upsert', {
    token: adminToken,
    body: {
      id: room1Id,
      unitId,
      codigo: `H1-${Date.now().toString().slice(-5)}`,
      nome: 'Sala Homolog 1',
      nomeConhecido: 'Sala Homologacao 1',
      descricao: 'Sala de homologacao 1',
      tipo: 'multifuncional',
      capacidadeTotal: 20,
      capacidadeRecomendada: 12,
      localizacaoInterna: 'Bloco H',
      especialidadePrincipal: 'Homologacao',
      usoPreferencial: 'Operacao',
      permiteUsoCompartilhado: true,
      status: 'ativa',
      acessibilidade: 'Padrao',
      equipamentos: ['TV'],
      observacoes: 'Teste homologacao',
    },
  });
  record('criar sala 1', room1Resp.status === 200 && room1Resp.payload?.room?.id === room1Id, {
    status: room1Resp.status,
    roomId: room1Resp.payload?.room?.id,
  });

  const room2Resp = await request('POST', '/unit-operations/rooms/upsert', {
    token: adminToken,
    body: {
      id: room2Id,
      unitId,
      codigo: `H2-${Date.now().toString().slice(-5)}`,
      nome: 'Sala Homolog 2',
      nomeConhecido: 'Sala Homologacao 2',
      descricao: 'Sala de homologacao 2',
      tipo: 'multifuncional',
      capacidadeTotal: 20,
      capacidadeRecomendada: 12,
      localizacaoInterna: 'Bloco H',
      especialidadePrincipal: 'Homologacao',
      usoPreferencial: 'Operacao',
      permiteUsoCompartilhado: true,
      status: 'ativa',
      acessibilidade: 'Padrao',
      equipamentos: ['Mesa'],
      observacoes: 'Teste homologacao',
    },
  });
  record('criar sala 2', room2Resp.status === 200 && room2Resp.payload?.room?.id === room2Id, {
    status: room2Resp.status,
    roomId: room2Resp.payload?.room?.id,
  });

  const activityResp = await request('POST', '/unit-operations/activities/upsert', {
    token: adminToken,
    body: {
      id: activityId,
      nome: `Atividade Homolog ${Date.now()}`,
      categoria: 'pedagogica',
      descricao: 'Atividade de homologacao',
      duracaoPadraoMinutos: 60,
      modalidade: 'presencial',
      faixaEtariaSugerida: '8-12',
      atendimentoTipo: 'grupo',
      exigeSalaEspecifica: false,
      exigeEquipamento: false,
      corIdentificacao: '#1d4ed8',
      status: 'ativa',
      observacoes: 'Teste homologacao',
    },
  });
  record('criar atividade', activityResp.status === 200 && activityResp.payload?.activity?.id === activityId, {
    status: activityResp.status,
    activityId: activityResp.payload?.activity?.id,
  });

  const classResp = await request('POST', '/unit-operations/classes/upsert', {
    token: adminToken,
    body: {
      id: classId,
      unitId,
      nome: `Turma Homolog ${Date.now()}`,
      activityId,
      descricao: 'Turma homologacao',
      objetivo: 'Validar operacao',
      publicoAlvo: 'Assistidos ativos',
      faixaEtaria: '8-12',
      capacidadeMinima: 1,
      capacidadeIdeal: 1,
      capacidadeMaxima: 1,
      status: 'ativa',
      dataInicio: todayIso(),
      dataTermino: null,
      profissionalPrincipalId: prof1.id,
      profissionalApoioId: prof2.id,
      exigeSalaEspecifica: false,
      projetoConvenio: 'Homolog',
      observacoes: 'Teste homologacao',
    },
  });
  record('criar turma', classResp.status === 200 && classResp.payload?.classItem?.id === classId, {
    status: classResp.status,
    classId: classResp.payload?.classItem?.id,
  });

  const invalidClassResp = await request('POST', '/unit-operations/classes/upsert', {
    token: adminToken,
    body: {
      id: buildId('homol-class-invalid'),
      unitId,
      nome: `Turma Invalida ${Date.now()}`,
      activityId,
      capacidadeMinima: 5,
      capacidadeIdeal: 3,
      capacidadeMaxima: 2,
      status: 'planejada',
      dataInicio: todayIso(),
      profissionalPrincipalId: prof1.id,
    },
  });
  record('validacao turma capacidade invalida', invalidClassResp.status === 400, {
    status: invalidClassResp.status,
    message: invalidClassResp.payload?.message,
  });

  const slot1Resp = await request('POST', '/unit-operations/schedule-slots/upsert', {
    token: adminToken,
    body: {
      id: slot1Id,
      classId,
      weekday: 'seg',
      horaInicial: '09:00',
      horaFinal: '10:00',
      roomId: room1Id,
      professionalId: prof1.id,
      recorrencia: 'semanal',
      status: 'ativa',
      observacao: 'slot base',
      vigenciaInicio: todayIso(),
    },
  });
  record('criar alocacao base', slot1Resp.status === 200 && slot1Resp.payload?.allocation?.id === slot1Id, {
    status: slot1Resp.status,
    slotId: slot1Resp.payload?.allocation?.id,
  });

  const roomConflictResp = await request('POST', '/unit-operations/schedule-slots/upsert', {
    token: adminToken,
    body: {
      id: buildId('homol-slot-room-conflict'),
      classId,
      weekday: 'seg',
      horaInicial: '09:00',
      horaFinal: '10:00',
      roomId: room1Id,
      professionalId: prof2.id,
      recorrencia: 'semanal',
      status: 'ativa',
      observacao: 'room conflict',
      vigenciaInicio: todayIso(),
    },
  });
  record('bloqueio conflito sala', roomConflictResp.status === 409, {
    status: roomConflictResp.status,
    code: roomConflictResp.payload?.code,
  });

  const profConflictResp = await request('POST', '/unit-operations/schedule-slots/upsert', {
    token: adminToken,
    body: {
      id: buildId('homol-slot-prof-conflict'),
      classId,
      weekday: 'seg',
      horaInicial: '09:00',
      horaFinal: '10:00',
      roomId: room2Id,
      professionalId: prof1.id,
      recorrencia: 'semanal',
      status: 'ativa',
      observacao: 'prof conflict',
      vigenciaInicio: todayIso(),
    },
  });
  record('bloqueio conflito profissional', profConflictResp.status === 409, {
    status: profConflictResp.status,
    code: profConflictResp.payload?.code,
  });

  const invalidTimeResp = await request('POST', '/unit-operations/schedule-slots/upsert', {
    token: adminToken,
    body: {
      id: buildId('homol-slot-invalid-time'),
      classId,
      weekday: 'seg',
      horaInicial: '10:00',
      horaFinal: '09:00',
      roomId: room2Id,
      professionalId: prof2.id,
      recorrencia: 'semanal',
      status: 'ativa',
      observacao: 'invalid time',
      vigenciaInicio: todayIso(),
    },
  });
  record('validacao horario invalido', invalidTimeResp.status === 400, {
    status: invalidTimeResp.status,
    message: invalidTimeResp.payload?.message,
  });

  const slotClassNotFoundResp = await request('POST', '/unit-operations/schedule-slots/upsert', {
    token: adminToken,
    body: {
      id: buildId('homol-slot-class-notfound'),
      classId: buildId('missing-class'),
      weekday: 'ter',
      horaInicial: '11:00',
      horaFinal: '12:00',
      roomId: room2Id,
      professionalId: prof2.id,
      recorrencia: 'semanal',
      status: 'ativa',
      observacao: 'class missing',
      vigenciaInicio: todayIso(),
    },
  });
  record('validacao turma inexistente em alocacao', slotClassNotFoundResp.status === 404, {
    status: slotClassNotFoundResp.status,
  });

  const slotRoomNotFoundResp = await request('POST', '/unit-operations/schedule-slots/upsert', {
    token: adminToken,
    body: {
      id: buildId('homol-slot-room-notfound'),
      classId,
      weekday: 'ter',
      horaInicial: '11:00',
      horaFinal: '12:00',
      roomId: buildId('missing-room'),
      professionalId: prof2.id,
      recorrencia: 'semanal',
      status: 'ativa',
      observacao: 'room missing',
      vigenciaInicio: todayIso(),
    },
  });
  record('validacao sala inexistente em alocacao', slotRoomNotFoundResp.status === 404, {
    status: slotRoomNotFoundResp.status,
  });

  const slotProfNotFoundResp = await request('POST', '/unit-operations/schedule-slots/upsert', {
    token: adminToken,
    body: {
      id: buildId('homol-slot-prof-notfound'),
      classId,
      weekday: 'ter',
      horaInicial: '11:00',
      horaFinal: '12:00',
      roomId: room2Id,
      professionalId: buildId('missing-prof'),
      recorrencia: 'semanal',
      status: 'ativa',
      observacao: 'prof missing',
      vigenciaInicio: todayIso(),
    },
  });
  record('validacao profissional inexistente em alocacao', slotProfNotFoundResp.status === 404, {
    status: slotProfNotFoundResp.status,
  });

  const slot4Resp = await request('POST', '/unit-operations/schedule-slots/upsert', {
    token: adminToken,
    body: {
      id: slot4Id,
      classId,
      weekday: 'seg',
      horaInicial: '11:00',
      horaFinal: '12:00',
      roomId: room1Id,
      professionalId: prof2.id,
      recorrencia: 'semanal',
      status: 'ativa',
      observacao: 'slot auxiliar',
      vigenciaInicio: todayIso(),
    },
  });
  record('criar alocacao auxiliar', slot4Resp.status === 200, { status: slot4Resp.status });

  const slot4UpdateConflictResp = await request('POST', '/unit-operations/schedule-slots/upsert', {
    token: adminToken,
    body: {
      id: slot4Id,
      classId,
      weekday: 'seg',
      horaInicial: '09:00',
      horaFinal: '10:00',
      roomId: room1Id,
      professionalId: prof2.id,
      recorrencia: 'semanal',
      status: 'ativa',
      observacao: 'slot update conflict',
      vigenciaInicio: todayIso(),
    },
  });
  record('update alocacao com conflito bloqueado', slot4UpdateConflictResp.status === 409, {
    status: slot4UpdateConflictResp.status,
    code: slot4UpdateConflictResp.payload?.code,
  });

  const enrollment1Resp = await request('POST', '/unit-operations/enrollments/upsert', {
    token: adminToken,
    body: {
      id: enrollment1Id,
      classId,
      studentId: student1.id,
      status: 'ativo',
      dataEntrada: todayIso(),
      prioridade: 'media',
      origemEncaminhamento: 'Homologacao',
      observacao: 'matricula base',
    },
  });
  record('criar matricula base', enrollment1Resp.status === 200 && enrollment1Resp.payload?.enrollment?.id === enrollment1Id, {
    status: enrollment1Resp.status,
    enrollmentId: enrollment1Resp.payload?.enrollment?.id,
  });

  const duplicateEnrollmentResp = await request('POST', '/unit-operations/enrollments/upsert', {
    token: adminToken,
    body: {
      id: buildId('homol-enrollment-dup'),
      classId,
      studentId: student1.id,
      status: 'ativo',
      dataEntrada: todayIso(),
      prioridade: 'media',
      origemEncaminhamento: 'Homologacao',
      observacao: 'duplicada',
    },
  });
  record('bloqueio matricula duplicada ativa', duplicateEnrollmentResp.status === 409, {
    status: duplicateEnrollmentResp.status,
    code: duplicateEnrollmentResp.payload?.code,
  });

  const overflowEnrollmentResp = await request('POST', '/unit-operations/enrollments/upsert', {
    token: adminToken,
    body: {
      id: buildId('homol-enrollment-overflow'),
      classId,
      studentId: student2.id,
      status: 'ativo',
      dataEntrada: todayIso(),
      prioridade: 'media',
      origemEncaminhamento: 'Homologacao',
      observacao: 'overflow',
    },
  });
  record('bloqueio superlotacao', overflowEnrollmentResp.status === 409, {
    status: overflowEnrollmentResp.status,
    code: overflowEnrollmentResp.payload?.code,
  });

  const patientNotFoundEnrollmentResp = await request('POST', '/unit-operations/enrollments/upsert', {
    token: adminToken,
    body: {
      id: buildId('homol-enrollment-patient-missing'),
      classId,
      studentId: buildId('missing-patient'),
      status: 'ativo',
      dataEntrada: todayIso(),
      prioridade: 'media',
      origemEncaminhamento: 'Homologacao',
      observacao: 'patient missing',
    },
  });
  record('validacao patient inexistente em matricula', patientNotFoundEnrollmentResp.status === 404, {
    status: patientNotFoundEnrollmentResp.status,
  });

  const classNotFoundEnrollmentResp = await request('POST', '/unit-operations/enrollments/upsert', {
    token: adminToken,
    body: {
      id: buildId('homol-enrollment-class-missing'),
      classId: buildId('missing-class'),
      studentId: student2.id,
      status: 'ativo',
      dataEntrada: todayIso(),
      prioridade: 'media',
      origemEncaminhamento: 'Homologacao',
      observacao: 'class missing',
    },
  });
  record('validacao turma inexistente em matricula', classNotFoundEnrollmentResp.status === 404, {
    status: classNotFoundEnrollmentResp.status,
  });

  const listRoomsResp = await request('GET', '/unit-operations/rooms', { token: adminToken });
  record('listagem salas', listRoomsResp.status === 200 && Array.isArray(listRoomsResp.payload?.rooms), {
    status: listRoomsResp.status,
    count: Array.isArray(listRoomsResp.payload?.rooms) ? listRoomsResp.payload.rooms.length : null,
  });

  const listActivitiesResp = await request('GET', '/unit-operations/activities', { token: adminToken });
  record('listagem atividades', listActivitiesResp.status === 200 && Array.isArray(listActivitiesResp.payload?.activities), {
    status: listActivitiesResp.status,
    count: Array.isArray(listActivitiesResp.payload?.activities) ? listActivitiesResp.payload.activities.length : null,
  });

  const listClassesResp = await request('GET', '/unit-operations/classes', { token: adminToken });
  record('listagem turmas', listClassesResp.status === 200 && Array.isArray(listClassesResp.payload?.classes), {
    status: listClassesResp.status,
    count: Array.isArray(listClassesResp.payload?.classes) ? listClassesResp.payload.classes.length : null,
  });

  const listSlotsResp = await request('GET', '/unit-operations/schedule-slots', { token: adminToken });
  record('listagem alocacoes', listSlotsResp.status === 200 && Array.isArray(listSlotsResp.payload?.allocations), {
    status: listSlotsResp.status,
    count: Array.isArray(listSlotsResp.payload?.allocations) ? listSlotsResp.payload.allocations.length : null,
  });

  const listEnrollmentsResp = await request('GET', '/unit-operations/enrollments', { token: adminToken });
  record('listagem matriculas', listEnrollmentsResp.status === 200 && Array.isArray(listEnrollmentsResp.payload?.enrollments), {
    status: listEnrollmentsResp.status,
    count: Array.isArray(listEnrollmentsResp.payload?.enrollments) ? listEnrollmentsResp.payload.enrollments.length : null,
  });

  const deleteSlotResp = await request('DELETE', `/unit-operations/schedule-slots/${encodeURIComponent(slot4Id)}`, {
    token: adminToken,
  });
  record('delete alocacao (soft)', deleteSlotResp.status === 200, {
    status: deleteSlotResp.status,
    removedId: deleteSlotResp.payload?.removedId,
  });

  const deleteSlotAgainResp = await request('DELETE', `/unit-operations/schedule-slots/${encodeURIComponent(slot4Id)}`, {
    token: adminToken,
  });
  record('delete alocacao inexistente retorna 404', deleteSlotAgainResp.status === 404, {
    status: deleteSlotAgainResp.status,
  });

  const agendaProfessionalsResp = await request('GET', '/profissionais?for_agenda=1', { token: adminToken });
  record('regressao agenda oficial - profissionais for_agenda', agendaProfessionalsResp.status === 200, {
    status: agendaProfessionalsResp.status,
  });

  const rangeFrom = todayIso();
  const rangeTo = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const agendaRangeResp = await request('GET', `/profissionais/agenda/range?date_from=${rangeFrom}&date_to=${rangeTo}`, {
    token: adminToken,
  });
  record('regressao agenda oficial - agenda range', agendaRangeResp.status === 200, {
    status: agendaRangeResp.status,
    success: agendaRangeResp.payload?.success,
  });

  artifacts.created = {
    unitId,
    prof1Id: prof1.id,
    prof2Id: prof2.id,
    student1Id: student1.id,
    student2Id: student2.id,
    room1Id,
    room2Id,
    activityId,
    classId,
    slot1Id,
    slot4Id,
    enrollment1Id,
  };

  const passed = checks.filter((check) => check.pass).length;
  const failed = checks.length - passed;

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    summary: {
      total: checks.length,
      passed,
      failed,
    },
    checks,
    artifacts,
  };

  const outDir = path.join(process.cwd(), 'smoke-evidence');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `homolog-unit-ops-api-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`REPORT=${outPath}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
