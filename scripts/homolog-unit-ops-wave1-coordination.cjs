const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.HOMOLOG_BASE_URL || 'http://localhost:3000/api';

const COORD_USERNAME = 'homol_ops_legacy';
const COORD_PASSWORD = 'Homolog@123';

const UNIT_OPERATION_MODULES = [
  'salas',
  'atividades_unidade',
  'turmas',
  'grade',
  'matriculas',
];

const COORD_DESIRED_SCOPES = new Set([
  // leitura em todo o dominio novo
  'salas:view',
  'atividades_unidade:view',
  'turmas:view',
  'grade:view',
  'matriculas:view',
  // escrita operacional liberada na Onda 1 para coordenacao
  'turmas:create',
  'turmas:edit',
  'turmas:status',
  'grade:create',
  'grade:edit',
  'grade:status',
  'grade:allocate',
  'matriculas:create',
  'matriculas:edit',
  'matriculas:status',
  'matriculas:enroll',
]);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function buildId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
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
  return response.payload;
}

async function fetchPermissionsMetadata(adminToken) {
  const [usersRes, modulesRes, permissionsRes] = await Promise.all([
    request('GET', '/permissions/users', { token: adminToken }),
    request('GET', '/permissions/modules', { token: adminToken }),
    request('GET', '/permissions/permissions', { token: adminToken }),
  ]);

  if (!usersRes.ok || !modulesRes.ok || !permissionsRes.ok) {
    throw new Error(
      `Falha ao carregar metadados de permissao: users=${usersRes.status} modules=${modulesRes.status} permissions=${permissionsRes.status}`
    );
  }

  return {
    users: usersRes.payload?.users || [],
    modules: modulesRes.payload?.modules || [],
    permissions: permissionsRes.payload?.permissions || [],
  };
}

async function fetchUserPermissions(adminToken, userId) {
  const response = await request('GET', `/permissions/users/${encodeURIComponent(userId)}/permissions`, {
    token: adminToken,
  });
  if (!response.ok) {
    throw new Error(`Falha ao listar permissoes do usuario ${userId}: status=${response.status}`);
  }
  return response.payload?.permissions || [];
}

async function ensureCoordPermissionMatrix(adminToken, coordUserId, modules, permissions) {
  const moduleMap = new Map(modules.map((entry) => [entry.name, entry.id]));
  const permissionMap = new Map(permissions.map((entry) => [entry.name, entry.id]));
  const currentPermissions = await fetchUserPermissions(adminToken, coordUserId);
  const currentScopes = new Set(
    currentPermissions
      .map((entry) => `${entry.module?.name || ''}:${entry.permission?.name || ''}`.toLowerCase())
      .filter((scope) => scope.includes(':'))
  );

  const targetScopes = new Set(COORD_DESIRED_SCOPES);

  const revokeQueue = [];
  for (const scope of currentScopes) {
    const [moduleName, permissionName] = scope.split(':');
    if (!UNIT_OPERATION_MODULES.includes(moduleName)) continue;
    if (!targetScopes.has(scope)) {
      revokeQueue.push({ moduleName, permissionName });
    }
  }

  const grantQueue = [];
  for (const scope of targetScopes) {
    if (!currentScopes.has(scope)) {
      const [moduleName, permissionName] = scope.split(':');
      grantQueue.push({ moduleName, permissionName });
    }
  }

  for (const item of revokeQueue) {
    const moduleId = moduleMap.get(item.moduleName);
    const permissionId = permissionMap.get(item.permissionName);
    if (!moduleId || !permissionId) continue;
    const response = await request(
      'POST',
      `/permissions/users/${encodeURIComponent(coordUserId)}/revoke`,
      {
        token: adminToken,
        body: { moduleId, permissionId },
      }
    );
    if (!response.ok) {
      throw new Error(
        `Falha ao revogar ${item.moduleName}:${item.permissionName} do coord: status=${response.status}`
      );
    }
  }

  for (const item of grantQueue) {
    const moduleId = moduleMap.get(item.moduleName);
    const permissionId = permissionMap.get(item.permissionName);
    if (!moduleId || !permissionId) continue;
    const response = await request(
      'POST',
      `/permissions/users/${encodeURIComponent(coordUserId)}/grant`,
      {
        token: adminToken,
        body: { moduleId, permissionId },
      }
    );
    if (!response.ok) {
      throw new Error(
        `Falha ao conceder ${item.moduleName}:${item.permissionName} ao coord: status=${response.status}`
      );
    }
  }

  return {
    revoked: revokeQueue,
    granted: grantQueue,
    before: Array.from(currentScopes).sort(),
    after: Array.from(targetScopes).sort(),
  };
}

async function main() {
  const checks = [];
  const artifacts = {};

  function record(name, pass, detail = {}) {
    checks.push({ name, pass, detail });
    const marker = pass ? 'PASS' : 'FAIL';
    console.log(`[${marker}] ${name} ${JSON.stringify(detail)}`);
  }

  const adminAuth = await login('homol_ops_admin', 'Homolog@123');
  const deniedAuth = await login('homol_ops_denied', 'Homolog@123');
  const adminToken = adminAuth.token;
  const deniedToken = deniedAuth.token;

  const metadata = await fetchPermissionsMetadata(adminToken);
  const coordUser = metadata.users.find(
    (entry) => String(entry.email || '').toLowerCase() === 'homol_ops_legacy@test.local'
  );
  if (!coordUser?.id) {
    throw new Error('Usuario base de coordenacao (homol_ops_legacy@test.local) nao encontrado');
  }
  const coordUserId = coordUser.id;
  artifacts.coordUserId = coordUserId;
  artifacts.coordUserEmail = coordUser.email;
  artifacts.coordProfileMode = 'simulado_por_permissoes_em_usuario_legacy';

  const beforePermissions = await fetchUserPermissions(adminToken, coordUserId);
  const beforeScopes = new Set(
    beforePermissions
      .map((entry) => `${entry.module?.name || ''}:${entry.permission?.name || ''}`.toLowerCase())
      .filter((scope) => scope.includes(':'))
  );
  artifacts.beforeScopes = Array.from(beforeScopes).sort();

  const syncResult = await ensureCoordPermissionMatrix(
    adminToken,
    coordUserId,
    metadata.modules,
    metadata.permissions
  );
  artifacts.permissionSync = syncResult;

  try {
    const coordAuth = await login(COORD_USERNAME, COORD_PASSWORD);
    const coordToken = coordAuth.token;
    const coordScopes = Array.isArray(coordAuth.user?.permissions)
      ? coordAuth.user.permissions
      : [];
    artifacts.coordScopes = coordScopes;

    record(
      'coordenacao possui escopos minimos de leitura',
      ['salas:view', 'atividades_unidade:view', 'turmas:view', 'grade:view', 'matriculas:view'].every(
        (scope) => coordScopes.includes(scope)
      ),
      { scopes: coordScopes }
    );

    const coordDatasetResp = await request('GET', '/unit-operations/dataset', { token: coordToken });
    record('coordenacao dataset 200', coordDatasetResp.status === 200 && coordDatasetResp.payload?.success === true, {
      status: coordDatasetResp.status,
      success: coordDatasetResp.payload?.success,
    });

    const deniedDatasetResp = await request('GET', '/unit-operations/dataset', { token: deniedToken });
    record('perfil negado bloqueado no dataset', deniedDatasetResp.status === 403, {
      status: deniedDatasetResp.status,
      message: deniedDatasetResp.payload?.message,
    });

    const dataset = coordDatasetResp.payload?.dataset || {};
    const unitId = dataset.units?.[0]?.id;
    const rooms = Array.isArray(dataset.rooms) ? dataset.rooms : [];
    const activities = Array.isArray(dataset.activities) ? dataset.activities : [];
    const professionals = Array.isArray(dataset.professionals)
      ? dataset.professionals.filter((entry) => entry.status === 'ativo')
      : [];
    const students = Array.isArray(dataset.students)
      ? dataset.students.filter((entry) => entry.status === 'ativo')
      : [];

    record('dataset coordenacao possui unidade', Boolean(unitId), { unitId });
    record('dataset coordenacao possui >=2 salas', rooms.length >= 2, { rooms: rooms.length });
    record('dataset coordenacao possui >=1 atividade', activities.length >= 1, { activities: activities.length });
    record('dataset coordenacao possui >=2 profissionais', professionals.length >= 2, {
      professionals: professionals.length,
    });
    record('dataset coordenacao possui >=2 assistidos', students.length >= 2, { students: students.length });

    const listRoomsResp = await request('GET', '/unit-operations/rooms', { token: coordToken });
    record('coordenacao lista salas', listRoomsResp.status === 200, { status: listRoomsResp.status });
    const listActivitiesResp = await request('GET', '/unit-operations/activities', { token: coordToken });
    record('coordenacao lista atividades', listActivitiesResp.status === 200, { status: listActivitiesResp.status });
    const listClassesResp = await request('GET', '/unit-operations/classes', { token: coordToken });
    record('coordenacao lista turmas', listClassesResp.status === 200, { status: listClassesResp.status });
    const listGradeResp = await request('GET', '/unit-operations/schedule-slots', { token: coordToken });
    record('coordenacao lista grade', listGradeResp.status === 200, { status: listGradeResp.status });
    const listEnrollmentsResp = await request('GET', '/unit-operations/enrollments', { token: coordToken });
    record('coordenacao lista matriculas', listEnrollmentsResp.status === 200, {
      status: listEnrollmentsResp.status,
    });

    const deniedRoomWriteResp = await request('POST', '/unit-operations/rooms/upsert', {
      token: coordToken,
      body: {
        id: buildId('coord-room-denied'),
        unitId: unitId || 'u-centro',
        codigo: 'CD-RM',
        nome: 'Coord Room Denied',
        tipo: 'multifuncional',
        capacidadeTotal: 10,
        capacidadeRecomendada: 8,
        status: 'ativa',
      },
    });
    record('coordenacao bloqueada para criar sala (escopo nao liberado)', deniedRoomWriteResp.status === 403, {
      status: deniedRoomWriteResp.status,
      message: deniedRoomWriteResp.payload?.message,
    });

    const deniedActivityWriteResp = await request('POST', '/unit-operations/activities/upsert', {
      token: coordToken,
      body: {
        id: buildId('coord-activity-denied'),
        nome: 'Coord Activity Denied',
        categoria: 'pedagogica',
        duracaoPadraoMinutos: 60,
        modalidade: 'presencial',
        atendimentoTipo: 'grupo',
        status: 'ativa',
      },
    });
    record(
      'coordenacao bloqueada para criar atividade (escopo nao liberado)',
      deniedActivityWriteResp.status === 403,
      { status: deniedActivityWriteResp.status, message: deniedActivityWriteResp.payload?.message }
    );

    if (!unitId || rooms.length < 2 || activities.length < 1 || professionals.length < 2 || students.length < 2) {
      throw new Error('Fixtures insuficientes para validacao operacional da coordenacao');
    }

    const activityId = activities[0].id;
    const roomId1 = rooms[0].id;
    const roomId2 = rooms[1].id;
    const professional1Id = professionals[0].id;
    const professional2Id = professionals[1].id;
    const student1Id = students[0].id;
    const student2Id = students[1].id;

    const classIdBase = buildId('wave1-coord-class-base');
    const classIdAux = buildId('wave1-coord-class-aux');
    const slotIdBase = buildId('wave1-coord-slot-base');

    const classCreateResp = await request('POST', '/unit-operations/classes/upsert', {
      token: coordToken,
      body: {
        id: classIdBase,
        unitId,
        nome: `Wave1 Coord Turma Base ${Date.now()}`,
        activityId,
        descricao: 'Turma criada por coordenacao na onda 1',
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
        observacoes: 'Teste coordenacao',
      },
    });
    record('coordenacao cria turma', classCreateResp.status === 200, {
      status: classCreateResp.status,
      classId: classCreateResp.payload?.classItem?.id,
    });

    const classEditResp = await request('POST', '/unit-operations/classes/upsert', {
      token: coordToken,
      body: {
        id: classIdBase,
        unitId,
        nome: `Wave1 Coord Turma Base ${Date.now()} - edicao`,
        activityId,
        descricao: 'Turma editada por coordenacao',
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
        observacoes: 'Teste coordenacao edit',
      },
    });
    record('coordenacao edita turma', classEditResp.status === 200, {
      status: classEditResp.status,
      classId: classEditResp.payload?.classItem?.id,
    });

    const classAuxResp = await request('POST', '/unit-operations/classes/upsert', {
      token: coordToken,
      body: {
        id: classIdAux,
        unitId,
        nome: `Wave1 Coord Turma Aux ${Date.now()}`,
        activityId,
        descricao: 'Turma auxiliar para conflito',
        objetivo: 'Validar conflito',
        publicoAlvo: 'Assistidos ativos',
        faixaEtaria: '8-12',
        capacidadeMinima: 1,
        capacidadeIdeal: 1,
        capacidadeMaxima: 5,
        status: 'ativa',
        dataInicio: todayIso(),
        dataTermino: null,
        profissionalPrincipalId: professional2Id,
        profissionalApoioId: professional1Id,
        exigeSalaEspecifica: false,
        projetoConvenio: 'Wave1',
        observacoes: 'Teste coordenacao conflito',
      },
    });
    record('coordenacao cria turma auxiliar', classAuxResp.status === 200, {
      status: classAuxResp.status,
      classId: classAuxResp.payload?.classItem?.id,
    });

    const slotBaseResp = await request('POST', '/unit-operations/schedule-slots/upsert', {
      token: coordToken,
      body: {
        id: slotIdBase,
        classId: classIdBase,
        weekday: 'ter',
        horaInicial: '14:00',
        horaFinal: '15:00',
        roomId: roomId1,
        professionalId: professional1Id,
        recorrencia: 'semanal',
        status: 'ativa',
        observacao: 'slot base coord',
        vigenciaInicio: todayIso(),
      },
    });
    record('coordenacao cria alocacao valida', slotBaseResp.status === 200, {
      status: slotBaseResp.status,
      slotId: slotBaseResp.payload?.allocation?.id,
    });

    const roomConflictResp = await request('POST', '/unit-operations/schedule-slots/upsert', {
      token: coordToken,
      body: {
        id: buildId('wave1-coord-room-conflict'),
        classId: classIdAux,
        weekday: 'ter',
        horaInicial: '14:00',
        horaFinal: '15:00',
        roomId: roomId1,
        professionalId: professional2Id,
        recorrencia: 'semanal',
        status: 'ativa',
        observacao: 'room conflict coord',
        vigenciaInicio: todayIso(),
      },
    });
    record('coordenacao bloqueio conflito de sala', roomConflictResp.status === 409, {
      status: roomConflictResp.status,
      code: roomConflictResp.payload?.code,
    });

    const professionalConflictResp = await request('POST', '/unit-operations/schedule-slots/upsert', {
      token: coordToken,
      body: {
        id: buildId('wave1-coord-prof-conflict'),
        classId: classIdAux,
        weekday: 'ter',
        horaInicial: '14:00',
        horaFinal: '15:00',
        roomId: roomId2,
        professionalId: professional1Id,
        recorrencia: 'semanal',
        status: 'ativa',
        observacao: 'professional conflict coord',
        vigenciaInicio: todayIso(),
      },
    });
    record('coordenacao bloqueio conflito de profissional', professionalConflictResp.status === 409, {
      status: professionalConflictResp.status,
      code: professionalConflictResp.payload?.code,
    });

    const enrollmentBaseId = buildId('wave1-coord-enrollment-base');
    const enrollmentBaseResp = await request('POST', '/unit-operations/enrollments/upsert', {
      token: coordToken,
      body: {
        id: enrollmentBaseId,
        classId: classIdBase,
        studentId: student1Id,
        status: 'ativo',
        dataEntrada: todayIso(),
        prioridade: 'media',
        origemEncaminhamento: 'Coordenacao',
        observacao: 'matricula coord base',
      },
    });
    record('coordenacao cria matricula valida', enrollmentBaseResp.status === 200, {
      status: enrollmentBaseResp.status,
      enrollmentId: enrollmentBaseResp.payload?.enrollment?.id,
    });

    const duplicateEnrollmentResp = await request('POST', '/unit-operations/enrollments/upsert', {
      token: coordToken,
      body: {
        id: buildId('wave1-coord-enrollment-dup'),
        classId: classIdBase,
        studentId: student1Id,
        status: 'ativo',
        dataEntrada: todayIso(),
        prioridade: 'media',
        origemEncaminhamento: 'Coordenacao',
        observacao: 'duplicada',
      },
    });
    record('coordenacao bloqueio matricula duplicada', duplicateEnrollmentResp.status === 409, {
      status: duplicateEnrollmentResp.status,
      code: duplicateEnrollmentResp.payload?.code,
    });

    const capacityEnrollmentResp = await request('POST', '/unit-operations/enrollments/upsert', {
      token: coordToken,
      body: {
        id: buildId('wave1-coord-enrollment-capacity'),
        classId: classIdBase,
        studentId: student2Id,
        status: 'ativo',
        dataEntrada: todayIso(),
        prioridade: 'media',
        origemEncaminhamento: 'Coordenacao',
        observacao: 'capacity',
      },
    });
    record('coordenacao bloqueio superlotacao', capacityEnrollmentResp.status === 409, {
      status: capacityEnrollmentResp.status,
      code: capacityEnrollmentResp.payload?.code,
    });
  } finally {
    const afterPermissions = await fetchUserPermissions(adminToken, coordUserId);
    const afterScopes = new Set(
      afterPermissions
        .map((entry) => `${entry.module?.name || ''}:${entry.permission?.name || ''}`.toLowerCase())
        .filter((scope) => scope.includes(':'))
    );
    artifacts.afterTestScopes = Array.from(afterScopes).sort();

    const unitOperationAfterScopes = Array.from(afterScopes).filter((scope) =>
      UNIT_OPERATION_MODULES.some((moduleName) => scope.startsWith(`${moduleName}:`))
    );
    const unitOperationBeforeScopes = Array.from(beforeScopes).filter((scope) =>
      UNIT_OPERATION_MODULES.some((moduleName) => scope.startsWith(`${moduleName}:`))
    );

    const scopesToRevoke = unitOperationAfterScopes.filter((scope) => !beforeScopes.has(scope));
    const scopesToGrant = unitOperationBeforeScopes.filter((scope) => !afterScopes.has(scope));

    const moduleMap = new Map(metadata.modules.map((entry) => [entry.name, entry.id]));
    const permissionMap = new Map(metadata.permissions.map((entry) => [entry.name, entry.id]));

    for (const scope of scopesToRevoke) {
      const [moduleName, permissionName] = scope.split(':');
      const moduleId = moduleMap.get(moduleName);
      const permissionId = permissionMap.get(permissionName);
      if (!moduleId || !permissionId) continue;
      await request('POST', `/permissions/users/${encodeURIComponent(coordUserId)}/revoke`, {
        token: adminToken,
        body: { moduleId, permissionId },
      });
    }

    for (const scope of scopesToGrant) {
      const [moduleName, permissionName] = scope.split(':');
      const moduleId = moduleMap.get(moduleName);
      const permissionId = permissionMap.get(permissionName);
      if (!moduleId || !permissionId) continue;
      await request('POST', `/permissions/users/${encodeURIComponent(coordUserId)}/grant`, {
        token: adminToken,
        body: { moduleId, permissionId },
      });
    }

    const finalPermissions = await fetchUserPermissions(adminToken, coordUserId);
    artifacts.finalScopes = finalPermissions
      .map((entry) => `${entry.module?.name || ''}:${entry.permission?.name || ''}`.toLowerCase())
      .filter((scope) => scope.includes(':'))
      .sort();
  }

  const summary = {
    total: checks.length,
    passed: checks.filter((entry) => entry.pass).length,
    failed: checks.filter((entry) => !entry.pass).length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    profile: {
      coordUsername: COORD_USERNAME,
      deniedUsername: 'homol_ops_denied',
    },
    summary,
    checks,
    artifacts,
  };

  const outDir = path.join(process.cwd(), 'smoke-evidence');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `homolog-unit-ops-wave1-coordination-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`REPORT=${outPath}`);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
