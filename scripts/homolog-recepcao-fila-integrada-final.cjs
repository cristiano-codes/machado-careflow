const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

function loadBackendEnv() {
  const envPath = path.resolve(__dirname, '..', 'institutoback', '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    const envKey = key.trim();
    if (!envKey || Object.prototype.hasOwnProperty.call(process.env, envKey)) continue;
    process.env[envKey] = rest.join('=').trim();
  }
}

loadBackendEnv();
const pool = require('../institutoback/config/pg');

const API_BASE_URL = (process.env.HOMOLOG_BASE_URL || 'http://localhost:3000/api').replace(
  /\/$/,
  ''
);
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

function normalizeDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
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
  const headers = {
    Accept: 'application/json',
  };
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

async function ensureUsersAndPermissions(runId) {
  const password = 'Homolog@123';
  const hashedPassword = await bcrypt.hash(password, 10);

  const usersBlueprint = [
    {
      key: 'recepcao_view',
      username: `hml_recepcao_view_final_${runId}`,
      name: `Homolog Recepcao View ${runId}`,
      email: `hml.recepcao.view.final.${runId}@example.com`,
      phone: '11910001000',
      grant: ['view', 'create'],
    },
    {
      key: 'recepcao_strong',
      username: `hml_recepcao_strong_final_${runId}`,
      name: `Homolog Recepcao Strong ${runId}`,
      email: `hml.recepcao.strong.final.${runId}@example.com`,
      phone: '11910002000',
      grant: ['view', 'create', 'edit'],
    },
    {
      key: 'sem_acesso',
      username: `hml_sem_acesso_final_${runId}`,
      name: `Homolog Sem Acesso ${runId}`,
      email: `hml.sem.acesso.final.${runId}@example.com`,
      phone: '11910003000',
      grant: [],
    },
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const users = {};
    for (const user of usersBlueprint) {
      const upsertResult = await client.query(
        `
          INSERT INTO public.users (
            username,
            email,
            name,
            phone,
            password,
            role,
            status,
            first_access,
            must_change_password,
            deleted_at
          )
          VALUES ($1, $2, $3, $4, $5, 'Usuario', 'ativo', false, false, NULL)
          ON CONFLICT (username) DO UPDATE
          SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            password = EXCLUDED.password,
            role = 'Usuario',
            status = 'ativo',
            first_access = false,
            must_change_password = false,
            deleted_at = NULL
          RETURNING id::text AS id, username, name, email
        `,
        [user.username, user.email, user.name, user.phone, hashedPassword]
      );

      users[user.key] = {
        id: upsertResult.rows[0].id,
        username: upsertResult.rows[0].username,
        name: upsertResult.rows[0].name,
        email: upsertResult.rows[0].email,
        password,
        grant: user.grant,
      };
    }

    const modulesResult = await client.query(
      `
        SELECT id, name
        FROM public.modules
        WHERE name IN ('fila_espera', 'pre_agendamento')
      `
    );
    const permissionsResult = await client.query(
      `
        SELECT id, name
        FROM public.permissions
        WHERE name IN ('view', 'create', 'edit')
      `
    );

    const moduleIds = modulesResult.rows.map((row) => String(row.id));
    const moduleNameToId = new Map(modulesResult.rows.map((row) => [row.name, row.id]));
    const permissionNameToId = new Map(permissionsResult.rows.map((row) => [row.name, row.id]));

    const receptionModuleId =
      moduleNameToId.get('fila_espera') || moduleNameToId.get('pre_agendamento') || null;
    if (!receptionModuleId) {
      throw new Error('Nenhum modulo de recepcao encontrado (fila_espera/pre_agendamento)');
    }
    if (!permissionNameToId.has('view') || !permissionNameToId.has('create')) {
      throw new Error('Permissoes base (view/create) nao encontradas em public.permissions');
    }

    for (const user of Object.values(users)) {
      if (moduleIds.length > 0) {
        await client.query(
          `
            DELETE FROM public.user_permissions
            WHERE user_id::text = $1
              AND module_id::text = ANY($2::text[])
          `,
          [user.id, moduleIds]
        );
      }

      for (const permissionName of user.grant) {
        const permissionId = permissionNameToId.get(permissionName);
        if (!permissionId) continue;
        await client.query(
          `
            INSERT INTO public.user_permissions (user_id, module_id, permission_id, granted_by)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
          `,
          [user.id, receptionModuleId, permissionId, user.id]
        );
      }
    }

    await client.query('COMMIT');
    return users;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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

async function seedBasePatients(adminToken, runId) {
  const baseDob = '2018-09-15';
  const similarDob = '2017-08-10';

  const baseCpf = `7${runId.slice(-10)}`.slice(0, 11);
  const similarCpf = `8${runId.slice(-10)}`.slice(0, 11);
  const basePhone = `119${runId.slice(-8)}`.slice(0, 11);
  const similarPhone = `118${runId.slice(-8)}`.slice(0, 11);

  const basePatient = await apiRequest('POST', '/pacientes', adminToken, {
    name: `Homolog Crianca Base Final ${runId}`,
    cpf: baseCpf,
    phone: basePhone,
    date_of_birth: baseDob,
    notes: `Seed base recepcao final ${runId}`,
  });

  if (!(basePatient.status === 201 || basePatient.status === 409)) {
    throw new Error(
      `Falha ao semear paciente base: status=${basePatient.status} message=${basePatient.payload?.message || ''}`
    );
  }

  let basePatientId = basePatient.payload?.paciente?.id || null;
  if (!basePatientId && basePatient.status === 409) {
    basePatientId = basePatient.payload?.existing_patient_id || null;
  }

  const similarPatient = await apiRequest('POST', '/pacientes', adminToken, {
    name: `Joao Pedro Silva Final ${runId}`,
    cpf: similarCpf,
    phone: similarPhone,
    date_of_birth: similarDob,
    notes: `Seed similar recepcao final ${runId}`,
  });
  if (!(similarPatient.status === 201 || similarPatient.status === 409)) {
    throw new Error(
      `Falha ao semear paciente similar: status=${similarPatient.status} message=${similarPatient.payload?.message || ''}`
    );
  }

  let similarPatientId = similarPatient.payload?.paciente?.id || null;
  if (!similarPatientId && similarPatient.status === 409) {
    similarPatientId = similarPatient.payload?.existing_patient_id || null;
  }

  if (!basePatientId || !similarPatientId) {
    throw new Error('Nao foi possivel resolver IDs de pacientes base/similar para homologacao.');
  }

  return {
    basePatientId,
    similarPatientId,
    baseDob,
    similarDob,
    baseCpf,
    similarCpf,
    basePhone,
    similarPhone,
  };
}

function extractAuditEventsFromNotes(notes) {
  return parseAuditLines(notes).map((entry) => entry.event).filter(Boolean);
}

async function run() {
  const runId = nowRunId();
  const startedAt = new Date().toISOString();
  const report = {
    runId,
    startedAt,
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

    const users = await ensureUsersAndPermissions(runId);
    report.generatedData.users = users;

    const recepcaoViewLogin = await loginOrThrow(users.recepcao_view.username, users.recepcao_view.password);
    const recepcaoStrongLogin = await loginOrThrow(
      users.recepcao_strong.username,
      users.recepcao_strong.password
    );
    const semAcessoLogin = await loginOrThrow(users.sem_acesso.username, users.sem_acesso.password);

    pushDiagnostic(report, 'logins_perfis_reais', true, {
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
      throw new Error('Nao foi possivel obter servico ativo para fluxo da fila de espera.');
    }

    const seeds = await seedBasePatients(adminToken, runId);
    report.generatedData.patientSeed = seeds;

    const scenario1 = await httpLog(
      'GET',
      `/fila-espera/reception-search?phone=${encodeURIComponent(seeds.basePhone)}&date_of_birth=${encodeURIComponent(seeds.baseDob)}`,
      recepcaoViewLogin.token
    );
    pushScenario(
      report,
      'S1',
      'consulta da recepcao encontra cadastro existente',
      scenario1.status === 200 &&
        scenario1.payload?.scenario === 'found' &&
        Array.isArray(scenario1.payload?.exact_matches) &&
        scenario1.payload.exact_matches.length > 0,
      {
        status: scenario1.status,
        scenario: scenario1.payload?.scenario || null,
        exact_match_count: Array.isArray(scenario1.payload?.exact_matches)
          ? scenario1.payload.exact_matches.length
          : 0,
      }
    );

    const scenarioNoAccess = await httpLog(
      'GET',
      `/fila-espera/reception-search?phone=${encodeURIComponent(seeds.basePhone)}&date_of_birth=${encodeURIComponent(seeds.baseDob)}`,
      semAcessoLogin.token
    );
    pushScenario(
      report,
      'S2',
      'perfil sem acesso nao pode consultar a recepcao',
      scenarioNoAccess.status === 403,
      {
        status: scenarioNoAccess.status,
        message: scenarioNoAccess.payload?.message || null,
      }
    );

    const similarName = `Joao Pedro Silveira Final ${runId}`;
    const similarPhone = `55${seeds.similarPhone}`;
    const similarBasePayload = {
      name: similarName,
      phone: similarPhone,
      email: `hml.similar.final.${runId}@example.com`,
      date_of_birth: `${seeds.similarDob}T00:00:00.000Z`,
      services: [serviceId],
      consent_lgpd: true,
      urgency: 'normal',
      responsible_name: `Responsavel Similar ${runId}`,
      notes: `Homolog similar final ${runId}`,
    };

    const scenarioSimilarNoJust = await httpLog(
      'POST',
      '/fila-espera',
      recepcaoViewLogin.token,
      similarBasePayload
    );
    pushScenario(
      report,
      'S3',
      'cenario similar exige justificativa',
      scenarioSimilarNoJust.status === 409 &&
        scenarioSimilarNoJust.payload?.code === 'possible_duplicate_detected' &&
        scenarioSimilarNoJust.payload?.requires_justification === true,
      {
        status: scenarioSimilarNoJust.status,
        code: scenarioSimilarNoJust.payload?.code || null,
        requires_justification: scenarioSimilarNoJust.payload?.requires_justification === true,
        similar_match_count: Array.isArray(scenarioSimilarNoJust.payload?.similar_matches)
          ? scenarioSimilarNoJust.payload.similar_matches.length
          : 0,
      }
    );

    const scenarioNoOverride = await httpLog(
      'POST',
      '/fila-espera',
      recepcaoViewLogin.token,
      {
        ...similarBasePayload,
        duplicate_justification: 'Tentativa sem permissao de override',
        duplicate_candidate_ids: [seeds.similarPatientId],
      }
    );
    pushScenario(
      report,
      'S4',
      'perfil sem override recebe 403 duplicate_override_forbidden',
      scenarioNoOverride.status === 403 &&
        scenarioNoOverride.payload?.code === 'duplicate_override_forbidden',
      {
        status: scenarioNoOverride.status,
        code: scenarioNoOverride.payload?.code || null,
        requires_override_permission:
          scenarioNoOverride.payload?.requires_override_permission === true,
      }
    );

    const scenarioOverrideAuthorized = await httpLog(
      'POST',
      '/fila-espera',
      recepcaoStrongLogin.token,
      {
        ...similarBasePayload,
        email: `hml.similar.override.final.${runId}@example.com`,
        duplicate_justification: 'Override autorizado com conferencia documental',
        duplicate_candidate_ids: [seeds.similarPatientId],
      }
    );
    pushScenario(
      report,
      'S5',
      'override autorizado grava duplicate_override_authorized',
      scenarioOverrideAuthorized.status === 200 &&
        scenarioOverrideAuthorized.payload?.duplicate_review?.override_authorized === true,
      {
        status: scenarioOverrideAuthorized.status,
        override_authorized:
          scenarioOverrideAuthorized.payload?.duplicate_review?.override_authorized === true,
        fila_espera_id: scenarioOverrideAuthorized.payload?.fila_espera_id || null,
      }
    );

    const scenarioExact = await httpLog(
      'POST',
      '/fila-espera',
      recepcaoViewLogin.token,
      {
        name: `Qualquer Nome Final ${runId}`,
        phone: seeds.basePhone,
        email: `hml.exact.final.${runId}@example.com`,
        date_of_birth: seeds.baseDob,
        services: [serviceId],
        consent_lgpd: true,
      }
    );
    pushScenario(
      report,
      'S6',
      'duplicidade exata retorna 409',
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
        name: `Zeta Quasar Novo ${runId}`,
        cpf: `9${runId.slice(-10)}`.slice(0, 11),
        phone: buildDistinctPhone(runId, [seeds.basePhone, seeds.similarPhone, similarPhone]),
        email: `hml.novo.final.${runId}@example.com`,
        date_of_birth: buildNoDuplicateDate(runId),
        services: [serviceId],
        consent_lgpd: true,
        notes: `Cadastro novo final ${runId}`,
      }
    );
    pushScenario(
      report,
      'S7',
      'novo cadastro sem duplicidade segue normal',
      scenarioNew.status === 200 &&
        scenarioNew.payload?.duplicate_review?.scenario === 'not_found' &&
        normalizeText(scenarioNew.payload?.fila_espera_id).length > 0,
      {
        status: scenarioNew.status,
        scenario: scenarioNew.payload?.duplicate_review?.scenario || null,
        fila_espera_id: scenarioNew.payload?.fila_espera_id || null,
      }
    );

    const beforeSimpleEdit = await httpLog('GET', `/pacientes/${seeds.basePatientId}`, adminToken);
    const beforeStatusJornada = beforeSimpleEdit.payload?.paciente?.status_jornada || null;
    const currentPhoneDigits = normalizeDigits(beforeSimpleEdit.payload?.paciente?.phone || '');
    const changedSimplePhone = buildDistinctPhone(runId, [currentPhoneDigits, seeds.basePhone, seeds.similarPhone]);

    const scenarioSimpleEdit = await httpLog(
      'PATCH',
      `/fila-espera/reception/patient/${seeds.basePatientId}/basic`,
      recepcaoViewLogin.token,
      {
        phone: changedSimplePhone,
      }
    );
    pushScenario(
      report,
      'S8',
      'edicao basica simples continua funcionando',
      scenarioSimpleEdit.status === 200 &&
        Array.isArray(scenarioSimpleEdit.payload?.audit?.changed_simple_fields) &&
        scenarioSimpleEdit.payload.audit.changed_simple_fields.includes('phone'),
      {
        status: scenarioSimpleEdit.status,
        changed_simple_fields: scenarioSimpleEdit.payload?.audit?.changed_simple_fields || [],
      }
    );

    const afterSimpleEdit = await httpLog('GET', `/pacientes/${seeds.basePatientId}`, adminToken);
    const afterStatusJornada = afterSimpleEdit.payload?.paciente?.status_jornada || null;
    pushDiagnostic(report, 'status_jornada_pos_edicao_simples', beforeStatusJornada === afterStatusJornada, {
      before: beforeStatusJornada,
      after: afterStatusJornada,
    });

    const scenarioSensitiveBlocked = await httpLog(
      'PATCH',
      `/fila-espera/reception/patient/${seeds.basePatientId}/basic`,
      recepcaoViewLogin.token,
      {
        name: `Nome Sensivel Bloqueado ${runId}`,
      }
    );
    pushScenario(
      report,
      'S9',
      'campo sensivel bloqueado sem permissao forte',
      scenarioSensitiveBlocked.status === 403 &&
        scenarioSensitiveBlocked.payload?.code === 'sensitive_field_edit_forbidden',
      {
        status: scenarioSensitiveBlocked.status,
        code: scenarioSensitiveBlocked.payload?.code || null,
        message: scenarioSensitiveBlocked.payload?.message || null,
      }
    );

    const afterSensitiveBlocked = await httpLog('GET', `/pacientes/${seeds.basePatientId}`, adminToken);
    pushDiagnostic(
      report,
      'status_jornada_pos_edicao_sensivel_bloqueada',
      afterSensitiveBlocked.payload?.paciente?.status_jornada === beforeStatusJornada,
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
      'auditoria_create_waiting_list',
      report.auditEvidence.events.create_waiting_list.length > 0,
      report.auditEvidence.events.create_waiting_list
    );
    pushDiagnostic(
      report,
      'auditoria_edit_basic_patient_data',
      report.auditEvidence.events.edit_basic_patient_data.length > 0,
      report.auditEvidence.events.edit_basic_patient_data
    );
    pushDiagnostic(
      report,
      'auditoria_duplicate_override_authorized',
      report.auditEvidence.events.duplicate_override_authorized.length > 0,
      report.auditEvidence.events.duplicate_override_authorized
    );

    const failedScenarios = report.scenarios.filter((scenario) => !scenario.passed);
    const failedDiagnostics = report.diagnostics.filter((item) => !item.passed);
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
      `homolog-recepcao-fila-integrada-final-${runId}.json`
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

    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
