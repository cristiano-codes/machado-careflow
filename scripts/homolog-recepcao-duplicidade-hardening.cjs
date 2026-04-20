const fs = require('fs');
const path = require('path');

function normalizeDateOfBirthLike(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizePhoneDigits(value) {
  return String(value ?? '')
    .trim()
    .replace(/\D/g, '');
}

function buildMockRowsFromPatients(patients, preAppointments, { byCpf = null, byDob = null } = {}) {
  const filtered = patients.filter((patient) => {
    if (byCpf) {
      const cpfDigits = String(patient.cpf || '').replace(/\D/g, '');
      return cpfDigits === byCpf;
    }
    if (byDob) {
      return normalizeDateOfBirthLike(patient.date_of_birth) === byDob;
    }
    return true;
  });

  return filtered.map((patient) => {
    const origin = preAppointments
      .filter((item) => String(item.converted_to_patient_id) === String(patient.id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    return {
      patient_id: String(patient.id),
      child_name: patient.name,
      patient_cpf: patient.cpf,
      patient_phone: patient.phone,
      date_of_birth: patient.date_of_birth,
      status_jornada: patient.status_jornada,
      patient_notes: patient.notes,
      patient_created_at: patient.created_at,
      responsible_name: origin?.responsible_name || null,
      origin_phone: origin?.phone || null,
      origin_notes: origin?.notes || null,
      origin_created_at: origin?.created_at || null,
      entry_date: origin?.created_at || patient.created_at,
    };
  });
}

function makeMockRes() {
  return {
    statusCode: 200,
    body: null,
    finished: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.finished = true;
      return this;
    },
    send(payload) {
      this.body = payload;
      this.finished = true;
      return this;
    },
    end(payload) {
      this.body = payload || this.body;
      this.finished = true;
      return this;
    },
  };
}

function normalizeRole(role) {
  if (role === null || role === undefined) return '';
  return String(role).trim().toUpperCase();
}

function normalizePermissionEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      const module = String(entry?.module || entry?.modulo || '').trim().toLowerCase();
      const action = String(entry?.action || entry?.acao || '').trim().toLowerCase();
      if (!module || !action) return null;
      return { module, action };
    })
    .filter((entry) => Boolean(entry));
}

function authorizeAny(requirements) {
  return (req, res, next) => {
    const role = normalizeRole(req?.user?.role);
    if (role === 'ADM') {
      next();
      return;
    }

    const scopes = normalizePermissionEntries(req?.user?.permissions);
    const allowed = requirements.some(([moduleName, actionName]) => {
      return scopes.some((scope) => {
        const matchesModule = scope.module === moduleName || scope.module === '*';
        const matchesAction = scope.action === actionName || scope.action === '*';
        return matchesModule && matchesAction;
      });
    });

    if (!allowed) {
      res.status(403).json({
        success: false,
        message: 'Acesso negado para esta operacao',
      });
      return;
    }

    next();
  };
}

async function invokeRoute(router, { method, routePath, query = {}, body = {}, user = {} }) {
  const targetMethod = String(method || 'get').toLowerCase();
  const layer = router.stack.find(
    (item) =>
      item?.route &&
      item.route.path === routePath &&
      Object.prototype.hasOwnProperty.call(item.route.methods, targetMethod)
  );

  if (!layer) {
    throw new Error(`Rota nao encontrada: ${targetMethod.toUpperCase()} ${routePath}`);
  }

  const handlers = layer.route.stack.map((item) => item.handle);
  const req = {
    method: targetMethod.toUpperCase(),
    query,
    body,
    params: {},
    headers: {},
    user,
  };
  const res = makeMockRes();

  async function runAt(index) {
    if (res.finished || index >= handlers.length) return;
    const handler = handlers[index];
    let nextCalled = false;

    await new Promise((resolve, reject) => {
      const next = (error) => {
        if (nextCalled) return;
        nextCalled = true;
        if (error) {
          reject(error);
          return;
        }
        resolve(runAt(index + 1));
      };

      try {
        const maybePromise = handler(req, res, next);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise
            .then(() => {
              if (!nextCalled) resolve();
            })
            .catch(reject);
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }

      if (!nextCalled) {
        resolve();
      }
    });
  }

  await runAt(0);
  return {
    status: res.statusCode,
    body: res.body,
  };
}

function parseAuditLines(notes) {
  const text = String(notes || '');
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('[AUDIT_RECEPCAO] '));
  const parsed = [];

  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line.slice('[AUDIT_RECEPCAO] '.length)));
    } catch (_error) {
      parsed.push({ parse_error: true, raw: line });
    }
  }

  return parsed;
}

async function main() {
  const runId = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rootDir = path.resolve(__dirname, '..');
  const outDir = path.join(rootDir, 'smoke-evidence');
  const outPath = path.join(outDir, `homolog-recepcao-duplicidade-hardening-${runId}.json`);

  const state = {
    queryLog: [],
    insertedRows: [],
    sawPreAppointmentsSourceInDuplicateQuery: false,
  };

  const servicesCatalog = [
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'Servico Homologacao',
      active: true,
    },
  ];

  const patients = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Crianca Exata',
      cpf: '12345678901',
      phone: '11900001111',
      date_of_birth: new Date('2018-09-15T00:00:00.000Z'),
      status_jornada: 'em_fila_espera',
      notes: null,
      created_at: '2026-04-20T10:00:00.000Z',
      updated_at: '2026-04-20T10:00:00.000Z',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Joao Pedro Silva',
      cpf: '22233344455',
      phone: '11911112222',
      date_of_birth: new Date('2017-08-10T00:00:00.000Z'),
      status_jornada: 'em_fila_espera',
      notes: null,
      created_at: '2026-04-20T10:05:00.000Z',
      updated_at: '2026-04-20T10:05:00.000Z',
    },
  ];

  const preAppointments = [
    {
      id: '33333333-3333-3333-3333-333333333333',
      converted_to_patient_id: '11111111-1111-1111-1111-111111111111',
      responsible_name: 'Responsavel Exato',
      phone: '11900001111',
      notes: 'Origem exata',
      created_at: '2026-04-20T09:00:00.000Z',
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      converted_to_patient_id: '22222222-2222-2222-2222-222222222222',
      responsible_name: 'Responsavel Similar',
      phone: '11911112222',
      notes: 'Origem similar',
      created_at: '2026-04-20T09:05:00.000Z',
    },
  ];

  const fakeDb = {
    async query(sql, params = []) {
      const text = String(sql || '');
      const normalizedSql = text.replace(/\s+/g, ' ').trim().toLowerCase();
      state.queryLog.push({
        sql: text,
        params,
      });

      if (normalizedSql === 'begin' || normalizedSql === 'commit' || normalizedSql === 'rollback') {
        return { rows: [], rowCount: 0 };
      }

      if (normalizedSql.includes('select coalesce(to_regclass($1)::text, to_regclass($2)::text) as source')) {
        return {
          rows: [{ source: 'public.pre_appointments' }],
          rowCount: 1,
        };
      }

      if (
        normalizedSql.includes('from public.patients p') &&
        normalizedSql.includes('regexp_replace(coalesce(p.cpf')
      ) {
        if (normalizedSql.includes('from public.pre_appointments pa')) {
          state.sawPreAppointmentsSourceInDuplicateQuery = true;
        }
        const cpfDigits = String(params[0] || '');
        const rows = buildMockRowsFromPatients(patients, preAppointments, { byCpf: cpfDigits });
        return { rows, rowCount: rows.length };
      }

      if (normalizedSql.includes('from public.patients p') && normalizedSql.includes('where p.date_of_birth = $1')) {
        if (normalizedSql.includes('from public.pre_appointments pa')) {
          state.sawPreAppointmentsSourceInDuplicateQuery = true;
        }
        const dob = normalizeDateOfBirthLike(params[0]);
        const rows = buildMockRowsFromPatients(patients, preAppointments, { byDob: dob });
        return { rows, rowCount: rows.length };
      }

      if (
        normalizedSql.includes('select id::text as id, name') &&
        normalizedSql.includes('from services') &&
        normalizedSql.includes('where active = true')
      ) {
        const requested = Array.isArray(params[0]) ? params[0].map((value) => String(value)) : [];
        const rows = servicesCatalog
          .filter((service) => service.active && requested.includes(service.id))
          .map((service) => ({ id: service.id, name: service.name }));
        return { rows, rowCount: rows.length };
      }

      if (normalizedSql.includes('insert into fila_de_espera')) {
        const nextId = `${String(state.insertedRows.length + 1).padStart(12, '0')}-0000-0000-0000-000000000000`;
        const row = {
          id: nextId,
          name: params[0],
          cpf: params[1],
          phone: params[2],
          email: params[3],
          date_of_birth: params[4],
          services: params[9],
          status: params[20],
          notes: params[21],
        };
        state.insertedRows.push(row);
        return { rows: [{ id: nextId }], rowCount: 1 };
      }

      throw new Error(`Query nao suportada no mock: ${normalizedSql.slice(0, 160)}`);
    },
  };

  const fakePool = {
    async connect() {
      return {
        query: (sql, params) => fakeDb.query(sql, params),
        release: () => {},
      };
    },
    query: (sql, params) => fakeDb.query(sql, params),
  };

  const fakeAuthMiddleware = (req, _res, next) => {
    req.user = req.user || {};
    next();
  };

  const routeFile = path.join(rootDir, 'institutoback', 'routes', 'filaEspera.js');
  const pgFile = path.join(rootDir, 'institutoback', 'config', 'pg.js');
  const authFile = path.join(rootDir, 'institutoback', 'middleware', 'auth.js');
  const authorizeFile = path.join(rootDir, 'institutoback', 'middleware', 'authorize.js');

  delete require.cache[require.resolve(routeFile)];
  require.cache[require.resolve(pgFile)] = {
    id: require.resolve(pgFile),
    filename: require.resolve(pgFile),
    loaded: true,
    exports: fakePool,
  };
  require.cache[require.resolve(authFile)] = {
    id: require.resolve(authFile),
    filename: require.resolve(authFile),
    loaded: true,
    exports: fakeAuthMiddleware,
  };
  require.cache[require.resolve(authorizeFile)] = {
    id: require.resolve(authorizeFile),
    filename: require.resolve(authorizeFile),
    loaded: true,
    exports: {
      authorizeAny,
      normalizeRole,
      normalizePermissionEntries,
    },
  };

  const router = require(routeFile);

  const userReceptionView = {
    id: 'u-view',
    role: 'usuario',
    permissions: [
      { module: 'fila_espera', action: 'view' },
      { module: 'fila_espera', action: 'create' },
    ],
  };

  const userReceptionStrong = {
    id: 'u-strong',
    role: 'usuario',
    permissions: [
      { module: 'fila_espera', action: 'view' },
      { module: 'fila_espera', action: 'create' },
      { module: 'fila_espera', action: 'edit' },
    ],
  };

  const commonBody = {
    services: [servicesCatalog[0].id],
    consent_lgpd: true,
  };

  const scenarios = [];

  const s1 = await invokeRoute(router, {
    method: 'get',
    routePath: '/reception-search',
    query: {
      phone: '11900001111',
      date_of_birth: '2018-09-15',
    },
    user: userReceptionView,
  });
  scenarios.push({
    key: 'S1',
    name: 'paciente existente encontrado na consulta',
    passed:
      s1.status === 200 &&
      s1.body?.scenario === 'found' &&
      Array.isArray(s1.body?.exact_matches) &&
      s1.body.exact_matches.length === 1,
    details: {
      status: s1.status,
      scenario: s1.body?.scenario,
      exact_match_count: Array.isArray(s1.body?.exact_matches) ? s1.body.exact_matches.length : 0,
    },
  });

  const similarPayload = {
    ...commonBody,
    name: 'Joao Pedro Silveira',
    phone: '11933334444',
    email: 'similar@example.com',
    date_of_birth: '2017-08-10T00:00:00.000Z',
  };

  const s2 = await invokeRoute(router, {
    method: 'post',
    routePath: '/',
    body: similarPayload,
    user: userReceptionView,
  });
  scenarios.push({
    key: 'S2',
    name: 'duplicidade similar exige justificativa',
    passed:
      s2.status === 409 &&
      s2.body?.code === 'possible_duplicate_detected' &&
      s2.body?.requires_justification === true,
    details: {
      status: s2.status,
      code: s2.body?.code || null,
      requires_justification: Boolean(s2.body?.requires_justification),
      similar_match_count: Array.isArray(s2.body?.similar_matches) ? s2.body.similar_matches.length : 0,
    },
  });

  const s3 = await invokeRoute(router, {
    method: 'post',
    routePath: '/',
    body: {
      ...similarPayload,
      duplicate_justification: 'Homonimo confirmado presencialmente',
    },
    user: userReceptionView,
  });
  scenarios.push({
    key: 'S3',
    name: 'perfil sem override recebe 403 duplicate_override_forbidden',
    passed: s3.status === 403 && s3.body?.code === 'duplicate_override_forbidden',
    details: {
      status: s3.status,
      code: s3.body?.code || null,
      requires_override_permission: Boolean(s3.body?.requires_override_permission),
    },
  });

  const s4 = await invokeRoute(router, {
    method: 'post',
    routePath: '/',
    body: {
      ...similarPayload,
      email: 'similar-override@example.com',
      duplicate_justification: 'Responsavel e documentos revisados por perfil forte',
      duplicate_candidate_ids: ['22222222-2222-2222-2222-222222222222'],
    },
    user: userReceptionStrong,
  });
  const insertedOverrideRow = state.insertedRows[state.insertedRows.length - 1];
  const overrideAuditEvents = parseAuditLines(insertedOverrideRow?.notes).map((item) => item.event);
  scenarios.push({
    key: 'S4',
    name: 'override autorizado cria e grava duplicate_override_authorized',
    passed:
      s4.status === 200 &&
      overrideAuditEvents.includes('duplicate_override_authorized') &&
      overrideAuditEvents.includes('create_waiting_list'),
    details: {
      status: s4.status,
      duplicate_review_override_authorized: Boolean(s4.body?.duplicate_review?.override_authorized),
      audit_events: overrideAuditEvents,
    },
  });

  const s5 = await invokeRoute(router, {
    method: 'post',
    routePath: '/',
    body: {
      ...commonBody,
      name: 'Qualquer Nome',
      phone: '11900001111',
      email: 'exact@example.com',
      date_of_birth: '2018-09-15',
    },
    user: userReceptionView,
  });
  scenarios.push({
    key: 'S5',
    name: 'duplicidade exata continua retornando 409',
    passed: s5.status === 409 && s5.body?.code === 'duplicate_patient_detected',
    details: {
      status: s5.status,
      code: s5.body?.code || null,
      exact_match_count: Array.isArray(s5.body?.exact_matches) ? s5.body.exact_matches.length : 0,
    },
  });

  const s6 = await invokeRoute(router, {
    method: 'post',
    routePath: '/',
    body: {
      ...commonBody,
      name: 'Paciente Novo Unico',
      phone: '11977778888',
      email: 'novo@example.com',
      date_of_birth: '2015-03-02',
    },
    user: userReceptionView,
  });
  scenarios.push({
    key: 'S6',
    name: 'novo cadastro sem duplicidade continua entrando no fluxo de fila',
    passed:
      s6.status === 200 &&
      s6.body?.success === true &&
      s6.body?.duplicate_review?.scenario === 'not_found',
    details: {
      status: s6.status,
      duplicate_scenario: s6.body?.duplicate_review?.scenario || null,
      fila_espera_id: s6.body?.fila_espera_id || null,
    },
  });

  const diagnostics = [
    {
      key: 'schema_source_check',
      passed: state.sawPreAppointmentsSourceInDuplicateQuery,
      details: {
        expected_source: 'public.pre_appointments',
        source_used_in_duplicate_queries: state.sawPreAppointmentsSourceInDuplicateQuery,
      },
    },
    {
      key: 'date_normalization_check',
      passed:
        normalizeDateOfBirthLike(patients[0].date_of_birth) === '2018-09-15' &&
        normalizeDateOfBirthLike('2017-08-10T00:00:00.000Z') === '2017-08-10',
      details: {
        from_date_object: normalizeDateOfBirthLike(patients[0].date_of_birth),
        from_iso_datetime: normalizeDateOfBirthLike('2017-08-10T00:00:00.000Z'),
      },
    },
  ];

  const failedScenarios = scenarios.filter((scenario) => !scenario.passed);
  const failedDiagnostics = diagnostics.filter((item) => !item.passed);
  const report = {
    runId,
    generatedAt: new Date().toISOString(),
    status: failedScenarios.length === 0 && failedDiagnostics.length === 0 ? 'passed' : 'failed',
    scenarios,
    diagnostics,
    summary: {
      scenarios_total: scenarios.length,
      scenarios_failed: failedScenarios.length,
      diagnostics_total: diagnostics.length,
      diagnostics_failed: failedDiagnostics.length,
      inserted_rows: state.insertedRows.length,
    },
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ outPath, status: report.status, summary: report.summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
