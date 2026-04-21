const fs = require('fs');
const path = require('path');

const API_BASE_URL = (
  process.env.HOMOLOG_BASE_URL || 'https://friendly-insight-production.up.railway.app/api'
).replace(/\/$/, '');
const ADMIN_USERNAME = process.env.HOMOLOG_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.HOMOLOG_ADMIN_PASS || 'admin';

function nowRunId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeDigits(value) {
  return normalizeText(value).replace(/\D/g, '');
}

function buildDistinctPhone(seed, usedPhones = []) {
  const used = new Set(usedPhones.map((value) => normalizeDigits(value)).filter((value) => value.length > 0));
  const reversedTail = seed
    .split('')
    .reverse()
    .join('')
    .replace(/\D/g, '')
    .slice(0, 8)
    .padEnd(8, '7');

  const candidates = [
    `117${reversedTail}`.slice(0, 11),
    `116${seed.slice(0, 8)}`.slice(0, 11),
    `115${seed.slice(-8)}`.slice(0, 11),
  ];

  for (const candidate of candidates) {
    const digits = normalizeDigits(candidate);
    if (digits.length !== 11) continue;
    if (!used.has(digits)) return digits;
  }

  return `114${seed.slice(-8)}`.slice(0, 11);
}

function buildNoDuplicateDate(seed) {
  const numeric = Number.parseInt(seed.slice(-6), 10) || 123456;
  const year = 1990 + (numeric % 20);
  const month = ((numeric % 12) + 1).toString().padStart(2, '0');
  const day = ((numeric % 27) + 1).toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseAuditLines(sourceText) {
  const text = normalizeText(sourceText);
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('[AUDIT_RECEPCAO] '))
    .map((line) => {
      try {
        return JSON.parse(line.slice('[AUDIT_RECEPCAO] '.length));
      } catch (_error) {
        return null;
      }
    })
    .filter((entry) => entry && typeof entry === 'object');
}

async function apiRequest(method, route, token, body) {
  const url = `${API_BASE_URL}${route}`;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  return {
    method,
    route,
    status: response.status,
    ok: response.ok,
    payload,
  };
}

function pushScenario(report, key, description, passed, details) {
  report.scenarios.push({
    key,
    description,
    passed: Boolean(passed),
    details: details || null,
  });
}

function pushDiagnostic(report, key, passed, details) {
  report.diagnostics.push({
    key,
    passed: Boolean(passed),
    details: details || null,
  });
}

async function loginOrThrow(username, password) {
  const login = await apiRequest('POST', '/auth/login', null, {
    username,
    password,
  });

  if (login.status !== 200 || !login.payload?.token) {
    throw new Error(
      `Falha no login ${username}: status=${login.status} message=${login.payload?.message || ''}`
    );
  }

  return {
    token: login.payload.token,
    payload: login.payload,
  };
}

async function registerApproveAndGrant({ adminToken, username, email, name, phone, password, grants, moduleId, permissionNameToId }) {
  const register = await apiRequest('POST', '/auth/register', null, {
    username,
    email,
    name,
    phone,
    password,
    confirmPassword: password,
  });

  if (!(register.status === 201 || register.status === 409)) {
    throw new Error(
      `Falha ao registrar usuario ${username}: status=${register.status} message=${register.payload?.message || ''}`
    );
  }

  const usersList = await apiRequest('GET', '/permissions/users', adminToken);
  if (usersList.status !== 200 || !Array.isArray(usersList.payload?.users)) {
    throw new Error(`Falha ao listar usuarios para localizar ${username}`);
  }
  const user = usersList.payload.users.find(
    (entry) => normalizeText(entry.email).toLowerCase() === email.toLowerCase() || normalizeText(entry.username).toLowerCase() === username.toLowerCase() || normalizeText(entry.name) === name
  );
  if (!user?.id) {
    throw new Error(`Usuario nao localizado apos registro: ${username}`);
  }

  const approve = await apiRequest('PATCH', `/users/${encodeURIComponent(String(user.id))}/approve`, adminToken);
  if (!(approve.status === 200 || approve.status === 404)) {
    throw new Error(
      `Falha ao aprovar usuario ${username}: status=${approve.status} message=${approve.payload?.message || ''}`
    );
  }

  for (const grantName of grants) {
    const permissionId = permissionNameToId.get(grantName);
    if (!permissionId) continue;
    const grant = await apiRequest(
      'POST',
      `/permissions/users/${encodeURIComponent(String(user.id))}/grant`,
      adminToken,
      {
        moduleId,
        permissionId,
      }
    );

    if (!(grant.status === 200 || grant.status === 409)) {
      throw new Error(
        `Falha ao conceder ${grantName} para ${username}: status=${grant.status} message=${grant.payload?.message || ''}`
      );
    }
  }

  return {
    id: String(user.id),
    username,
    email,
    password,
    grants,
  };
}

function extractAuditEventsFromNotes(notes) {
  return parseAuditLines(notes).map((entry) => entry.event).filter(Boolean);
}

async function run() {
  const runId = nowRunId();
  const report = {
    runId,
    startedAt: new Date().toISOString(),
    apiBaseUrl: API_BASE_URL,
    scenarios: [],
    diagnostics: [],
    http: [],
    generatedData: {},
    auditEvidence: {},
    status: 'running',
    error: null,
  };

  const httpLog = async (method, route, token, body) => {
    const response = await apiRequest(method, route, token, body);
    report.http.push({
      method: response.method,
      route: response.route,
      status: response.status,
      ok: response.ok,
    });
    return response;
  };

  try {
    const health = await httpLog('GET', '/health', null);
    pushDiagnostic(report, 'backend_health', health.status === 200, {
      status: health.status,
      payload: health.payload,
    });

    const adminLogin = await loginOrThrow(ADMIN_USERNAME, ADMIN_PASSWORD);
    const adminToken = adminLogin.token;
    pushDiagnostic(report, 'admin_login', true, {
      username: ADMIN_USERNAME,
      userId: adminLogin.payload?.user?.id || null,
    });

    const modules = await httpLog('GET', '/permissions/modules', adminToken);
    const permissions = await httpLog('GET', '/permissions/permissions', adminToken);
    if (modules.status !== 200 || permissions.status !== 200) {
      throw new Error('Falha ao obter catalogo de modulos/permissoes na API publicada.');
    }

    const moduleRow =
      (modules.payload?.modules || []).find((entry) => entry.name === 'fila_espera') ||
      (modules.payload?.modules || []).find((entry) => entry.name === 'pre_agendamento');
    if (!moduleRow?.id) {
      throw new Error('Modulo fila_espera/pre_agendamento nao encontrado na API publicada.');
    }
    const permissionNameToId = new Map(
      (permissions.payload?.permissions || []).map((entry) => [entry.name, entry.id])
    );
    if (!permissionNameToId.has('view') || !permissionNameToId.has('create') || !permissionNameToId.has('edit')) {
      throw new Error('Permissoes view/create/edit nao encontradas na API publicada.');
    }

    const password = 'Homolog@123';
    const users = {};
    users.recepcao_view = await registerApproveAndGrant({
      adminToken,
      username: `pub_recepcao_view_${runId}`,
      email: `pub.recepcao.view.${runId}@example.com`,
      name: `Public Recepcao View ${runId}`,
      phone: '11940001000',
      password,
      grants: ['view', 'create'],
      moduleId: moduleRow.id,
      permissionNameToId,
    });
    users.recepcao_strong = await registerApproveAndGrant({
      adminToken,
      username: `pub_recepcao_strong_${runId}`,
      email: `pub.recepcao.strong.${runId}@example.com`,
      name: `Public Recepcao Strong ${runId}`,
      phone: '11940002000',
      password,
      grants: ['view', 'create', 'edit'],
      moduleId: moduleRow.id,
      permissionNameToId,
    });
    users.sem_acesso = await registerApproveAndGrant({
      adminToken,
      username: `pub_sem_acesso_${runId}`,
      email: `pub.sem.acesso.${runId}@example.com`,
      name: `Public Sem Acesso ${runId}`,
      phone: '11940003000',
      password,
      grants: [],
      moduleId: moduleRow.id,
      permissionNameToId,
    });
    report.generatedData.users = users;

    const recepcaoViewLogin = await loginOrThrow(users.recepcao_view.username, users.recepcao_view.password);
    const recepcaoStrongLogin = await loginOrThrow(users.recepcao_strong.username, users.recepcao_strong.password);
    const semAcessoLogin = await loginOrThrow(users.sem_acesso.username, users.sem_acesso.password);
    pushDiagnostic(report, 'logins_perfis_publicados', true, {
      recepcao_view_user_id: recepcaoViewLogin.payload?.user?.id || null,
      recepcao_strong_user_id: recepcaoStrongLogin.payload?.user?.id || null,
      sem_acesso_user_id: semAcessoLogin.payload?.user?.id || null,
    });

    const services = await httpLog(
      'GET',
      '/services?active=true&pre_appointment=true&context=fila-espera',
      adminToken
    );
    const serviceId = services.payload?.services?.[0]?.id || null;
    if (services.status !== 200 || !serviceId) {
      throw new Error('Nao foi possivel obter servico ativo na API publicada.');
    }

    const seeds = {
      baseDob: '2018-09-15',
      similarDob: '2017-08-10',
      baseCpf: `7${runId.slice(-10)}`.slice(0, 11),
      similarCpf: `8${runId.slice(-10)}`.slice(0, 11),
      basePhone: `119${runId.slice(-8)}`.slice(0, 11),
      similarPhone: `118${runId.slice(-8)}`.slice(0, 11),
    };

    const basePatient = await httpLog('POST', '/pacientes', adminToken, {
      name: `Public Crianca Base ${runId}`,
      cpf: seeds.baseCpf,
      phone: seeds.basePhone,
      date_of_birth: seeds.baseDob,
      notes: `Seed published base ${runId}`,
    });
    const similarPatient = await httpLog('POST', '/pacientes', adminToken, {
      name: `Public Joao Pedro Silva ${runId}`,
      cpf: seeds.similarCpf,
      phone: seeds.similarPhone,
      date_of_birth: seeds.similarDob,
      notes: `Seed published similar ${runId}`,
    });

    if (!(basePatient.status === 201 || basePatient.status === 409)) {
      throw new Error('Falha ao semear paciente base publicado.');
    }
    if (!(similarPatient.status === 201 || similarPatient.status === 409)) {
      throw new Error('Falha ao semear paciente similar publicado.');
    }

    seeds.basePatientId = basePatient.payload?.paciente?.id || basePatient.payload?.existing_patient_id || null;
    seeds.similarPatientId =
      similarPatient.payload?.paciente?.id || similarPatient.payload?.existing_patient_id || null;
    if (!seeds.basePatientId || !seeds.similarPatientId) {
      throw new Error('Nao foi possivel resolver IDs dos pacientes seed na API publicada.');
    }
    report.generatedData.patientSeed = seeds;

    const scenario1 = await httpLog(
      'GET',
      `/fila-espera/reception-search?phone=${encodeURIComponent(seeds.basePhone)}&date_of_birth=${encodeURIComponent(seeds.baseDob)}`,
      recepcaoViewLogin.token
    );
    pushScenario(
      report,
      'P1',
      'publicado: consulta da recepcao encontra cadastro existente',
      scenario1.status === 200 && scenario1.payload?.scenario === 'found',
      {
        status: scenario1.status,
        scenario: scenario1.payload?.scenario || null,
      }
    );

    const scenarioNoAccess = await httpLog(
      'GET',
      `/fila-espera/reception-search?phone=${encodeURIComponent(seeds.basePhone)}&date_of_birth=${encodeURIComponent(seeds.baseDob)}`,
      semAcessoLogin.token
    );
    pushScenario(report, 'P2', 'publicado: perfil sem acesso continua bloqueado', scenarioNoAccess.status === 403, {
      status: scenarioNoAccess.status,
      message: scenarioNoAccess.payload?.message || null,
    });

    const similarName = `Public Joao Pedro Silveira ${runId}`;
    const similarPhone = `55${seeds.similarPhone}`;
    const similarBasePayload = {
      name: similarName,
      phone: similarPhone,
      email: `pub.similar.${runId}@example.com`,
      date_of_birth: `${seeds.similarDob}T00:00:00.000Z`,
      services: [serviceId],
      consent_lgpd: true,
      urgency: 'normal',
      responsible_name: `Resp Pub Similar ${runId}`,
      notes: `Published similar ${runId}`,
    };

    const scenarioSimilarNoJust = await httpLog(
      'POST',
      '/fila-espera',
      recepcaoViewLogin.token,
      similarBasePayload
    );
    pushScenario(
      report,
      'P3',
      'publicado: similar exige justificativa',
      scenarioSimilarNoJust.status === 409 &&
        scenarioSimilarNoJust.payload?.code === 'possible_duplicate_detected',
      {
        status: scenarioSimilarNoJust.status,
        code: scenarioSimilarNoJust.payload?.code || null,
      }
    );

    const scenarioNoOverride = await httpLog(
      'POST',
      '/fila-espera',
      recepcaoViewLogin.token,
      {
        ...similarBasePayload,
        duplicate_justification: 'Tentativa sem permissao no publicado',
        duplicate_candidate_ids: [seeds.similarPatientId],
      }
    );
    pushScenario(
      report,
      'P4',
      'publicado: sem override recebe duplicate_override_forbidden',
      scenarioNoOverride.status === 403 &&
        scenarioNoOverride.payload?.code === 'duplicate_override_forbidden',
      {
        status: scenarioNoOverride.status,
        code: scenarioNoOverride.payload?.code || null,
      }
    );

    const scenarioOverrideAuthorized = await httpLog(
      'POST',
      '/fila-espera',
      recepcaoStrongLogin.token,
      {
        ...similarBasePayload,
        email: `pub.similar.override.${runId}@example.com`,
        duplicate_justification: 'Override autorizado publicado',
        duplicate_candidate_ids: [seeds.similarPatientId],
      }
    );
    pushScenario(
      report,
      'P5',
      'publicado: override autorizado segue funcional',
      scenarioOverrideAuthorized.status === 200 &&
        scenarioOverrideAuthorized.payload?.duplicate_review?.override_authorized === true,
      {
        status: scenarioOverrideAuthorized.status,
        override_authorized:
          scenarioOverrideAuthorized.payload?.duplicate_review?.override_authorized === true,
      }
    );

    const scenarioExact = await httpLog(
      'POST',
      '/fila-espera',
      recepcaoViewLogin.token,
      {
        name: `Public Qualquer ${runId}`,
        phone: seeds.basePhone,
        email: `pub.exact.${runId}@example.com`,
        date_of_birth: seeds.baseDob,
        services: [serviceId],
        consent_lgpd: true,
      }
    );
    pushScenario(
      report,
      'P6',
      'publicado: duplicidade exata continua 409',
      scenarioExact.status === 409 && scenarioExact.payload?.code === 'duplicate_patient_detected',
      {
        status: scenarioExact.status,
        code: scenarioExact.payload?.code || null,
      }
    );

    const scenarioNew = await httpLog(
      'POST',
      '/fila-espera',
      recepcaoViewLogin.token,
      {
        name: `Public Zeta Novo ${runId}`,
        cpf: `9${runId.slice(-10)}`.slice(0, 11),
        phone: buildDistinctPhone(runId, [seeds.basePhone, seeds.similarPhone, similarPhone]),
        email: `pub.novo.${runId}@example.com`,
        date_of_birth: buildNoDuplicateDate(runId),
        services: [serviceId],
        consent_lgpd: true,
      }
    );
    pushScenario(
      report,
      'P7',
      'publicado: novo cadastro sem duplicidade segue normal',
      scenarioNew.status === 200,
      {
        status: scenarioNew.status,
        code: scenarioNew.payload?.code || null,
      }
    );

    const beforeSimpleEdit = await httpLog('GET', `/pacientes/${seeds.basePatientId}`, adminToken);
    const beforeStatusJornada = beforeSimpleEdit.payload?.paciente?.status_jornada || null;
    const changedSimplePhone = buildDistinctPhone(runId, [beforeSimpleEdit.payload?.paciente?.phone || seeds.basePhone]);

    const scenarioSimpleEdit = await httpLog(
      'PATCH',
      `/fila-espera/reception/patient/${seeds.basePatientId}/basic`,
      recepcaoViewLogin.token,
      { phone: changedSimplePhone }
    );
    pushScenario(
      report,
      'P8',
      'publicado: edicao simples continua funcionando',
      scenarioSimpleEdit.status === 200 &&
        Array.isArray(scenarioSimpleEdit.payload?.audit?.changed_simple_fields) &&
        scenarioSimpleEdit.payload.audit.changed_simple_fields.includes('phone'),
      {
        status: scenarioSimpleEdit.status,
        changed_simple_fields: scenarioSimpleEdit.payload?.audit?.changed_simple_fields || [],
      }
    );

    const scenarioSensitiveBlocked = await httpLog(
      'PATCH',
      `/fila-espera/reception/patient/${seeds.basePatientId}/basic`,
      recepcaoViewLogin.token,
      { name: `Public Nome Sensivel ${runId}` }
    );
    pushScenario(
      report,
      'P9',
      'publicado: campo sensivel segue bloqueado sem permissao forte',
      scenarioSensitiveBlocked.status === 403 &&
        scenarioSensitiveBlocked.payload?.code === 'sensitive_field_edit_forbidden',
      {
        status: scenarioSensitiveBlocked.status,
        code: scenarioSensitiveBlocked.payload?.code || null,
      }
    );

    const afterSensitiveBlocked = await httpLog('GET', `/pacientes/${seeds.basePatientId}`, adminToken);
    pushDiagnostic(
      report,
      'status_jornada_consistente_publicado',
      beforeStatusJornada === afterSensitiveBlocked.payload?.paciente?.status_jornada,
      {
        before: beforeStatusJornada,
        after: afterSensitiveBlocked.payload?.paciente?.status_jornada || null,
      }
    );

    const overrideFilaId = scenarioOverrideAuthorized.payload?.fila_espera_id || null;
    const newFilaId = scenarioNew.payload?.fila_espera_id || null;
    const overrideFilaDetail = overrideFilaId
      ? await httpLog('GET', `/fila-espera/${overrideFilaId}`, adminToken)
      : null;
    const newFilaDetail = newFilaId
      ? await httpLog('GET', `/fila-espera/${newFilaId}`, adminToken)
      : null;
    const patientDetailForAudit = await httpLog('GET', `/pacientes/${seeds.basePatientId}`, adminToken);

    const overrideEvents = extractAuditEventsFromNotes(
      overrideFilaDetail?.payload?.filaEspera?.notes || overrideFilaDetail?.payload?.preAppointment?.notes
    );
    const newEvents = extractAuditEventsFromNotes(
      newFilaDetail?.payload?.filaEspera?.notes || newFilaDetail?.payload?.preAppointment?.notes
    );
    const patientEvents = extractAuditEventsFromNotes(patientDetailForAudit.payload?.paciente?.notes);

    report.auditEvidence = {
      patient_id_for_basic_edit: seeds.basePatientId,
      fila_id_for_create_no_duplicate: newFilaId,
      fila_id_for_override: overrideFilaId,
      events: {
        create_waiting_list: Array.from(new Set([...newEvents, ...overrideEvents])).filter(
          (event) => event === 'create_waiting_list'
        ),
        edit_basic_patient_data: patientEvents.filter((event) => event === 'edit_basic_patient_data'),
        duplicate_override_authorized: overrideEvents.filter(
          (event) => event === 'duplicate_override_authorized'
        ),
      },
    };

    pushDiagnostic(
      report,
      'auditoria_create_waiting_list_publicado',
      report.auditEvidence.events.create_waiting_list.length > 0,
      report.auditEvidence.events.create_waiting_list
    );
    pushDiagnostic(
      report,
      'auditoria_edit_basic_patient_data_publicado',
      report.auditEvidence.events.edit_basic_patient_data.length > 0,
      report.auditEvidence.events.edit_basic_patient_data
    );
    pushDiagnostic(
      report,
      'auditoria_duplicate_override_authorized_publicado',
      report.auditEvidence.events.duplicate_override_authorized.length > 0,
      report.auditEvidence.events.duplicate_override_authorized
    );

    const failedScenarios = report.scenarios.filter((entry) => !entry.passed);
    const failedDiagnostics = report.diagnostics.filter((entry) => !entry.passed);
    report.summary = {
      scenarios_total: report.scenarios.length,
      scenarios_failed: failedScenarios.length,
      diagnostics_total: report.diagnostics.length,
      diagnostics_failed: failedDiagnostics.length,
    };
    report.status = failedScenarios.length === 0 && failedDiagnostics.length === 0 ? 'passed' : 'failed';
  } catch (error) {
    report.status = 'failed';
    report.error = error?.message || String(error);
  } finally {
    report.finishedAt = new Date().toISOString();
    const outPath = path.resolve(
      __dirname,
      '..',
      'smoke-evidence',
      `smoke-recepcao-published-final-${report.runId}.json`
    );
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(
      JSON.stringify(
        {
          outPath,
          status: report.status,
          summary: report.summary || null,
          error: report.error || null,
        },
        null,
        2
      )
    );
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
