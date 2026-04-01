const fs = require('fs');
const path = require('path');
const puppeteer = require('../institutoback/node_modules/puppeteer');

const BASE = process.env.HOMOLOG_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE}/api`;
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
  'salas:view',
  'atividades_unidade:view',
  'turmas:view',
  'grade:view',
  'matriculas:view',
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

async function apiRequest(method, endpoint, { token, body } = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

async function apiLogin(username, password) {
  const response = await apiRequest('POST', '/auth/login', {
    body: { username, password },
  });
  const payload = response.payload;
  if (!response.ok || !payload?.token) {
    throw new Error(
      `Falha no login de ${username}: status=${response.status} payload=${JSON.stringify(payload)}`
    );
  }
  return payload.token;
}

async function fetchPermissionsMetadata(adminToken) {
  const [usersRes, modulesRes, permissionsRes] = await Promise.all([
    apiRequest('GET', '/permissions/users', { token: adminToken }),
    apiRequest('GET', '/permissions/modules', { token: adminToken }),
    apiRequest('GET', '/permissions/permissions', { token: adminToken }),
  ]);

  if (!usersRes.ok || !modulesRes.ok || !permissionsRes.ok) {
    throw new Error(
      `Falha ao carregar metadados de permissao para UI wave1: users=${usersRes.status} modules=${modulesRes.status} permissions=${permissionsRes.status}`
    );
  }

  return {
    users: usersRes.payload?.users || [],
    modules: modulesRes.payload?.modules || [],
    permissions: permissionsRes.payload?.permissions || [],
  };
}

async function fetchUserPermissions(adminToken, userId) {
  const response = await apiRequest(
    'GET',
    `/permissions/users/${encodeURIComponent(userId)}/permissions`,
    { token: adminToken }
  );
  if (!response.ok) {
    throw new Error(
      `Falha ao listar permissoes do usuario ${userId} na validacao UI: status=${response.status}`
    );
  }
  return response.payload?.permissions || [];
}

async function syncCoordScopes(adminToken, coordUserId, modules, permissions, desiredScopes) {
  const moduleMap = new Map(modules.map((entry) => [entry.name, entry.id]));
  const permissionMap = new Map(permissions.map((entry) => [entry.name, entry.id]));
  const currentPermissions = await fetchUserPermissions(adminToken, coordUserId);
  const currentScopes = new Set(
    currentPermissions
      .map((entry) => `${entry.module?.name || ''}:${entry.permission?.name || ''}`.toLowerCase())
      .filter((scope) => scope.includes(':'))
  );

  const revokeQueue = [];
  for (const scope of currentScopes) {
    const [moduleName] = scope.split(':');
    if (!UNIT_OPERATION_MODULES.includes(moduleName)) continue;
    if (!desiredScopes.has(scope)) {
      revokeQueue.push(scope);
    }
  }

  const grantQueue = [];
  for (const scope of desiredScopes) {
    if (!currentScopes.has(scope)) {
      grantQueue.push(scope);
    }
  }

  for (const scope of revokeQueue) {
    const [moduleName, permissionName] = scope.split(':');
    const moduleId = moduleMap.get(moduleName);
    const permissionId = permissionMap.get(permissionName);
    if (!moduleId || !permissionId) continue;
    await apiRequest('POST', `/permissions/users/${encodeURIComponent(coordUserId)}/revoke`, {
      token: adminToken,
      body: { moduleId, permissionId },
    });
  }

  for (const scope of grantQueue) {
    const [moduleName, permissionName] = scope.split(':');
    const moduleId = moduleMap.get(moduleName);
    const permissionId = permissionMap.get(permissionName);
    if (!moduleId || !permissionId) continue;
    await apiRequest('POST', `/permissions/users/${encodeURIComponent(coordUserId)}/grant`, {
      token: adminToken,
      body: { moduleId, permissionId },
    });
  }
}

async function openWithToken(browser, token, routePath) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await page.evaluate((authToken) => {
    localStorage.setItem('token', authToken);
    sessionStorage.removeItem('token');
  }, token);

  await page.goto(`${BASE}${routePath}`, { waitUntil: 'networkidle2' });
  await new Promise((resolve) => setTimeout(resolve, 800));

  const diagnostics = await page.evaluate(() => {
    const bodyText = document.body.innerText || '';
    return {
      hasAcessoRestrito: bodyText.includes('Acesso Restrito'),
      hasOperacaoMenu: bodyText.includes('Operacao da Unidade'),
      hasLegacyAgendaMenu: bodyText.includes('Agenda'),
      bodySample: bodyText.slice(0, 260).replace(/\s+/g, ' ').trim(),
    };
  });

  const finalUrl = page.url().replace(BASE, '');
  return { page, finalUrl, ...diagnostics };
}

async function testRouteAccess(browser, token, user, routePath) {
  const { page, finalUrl, hasAcessoRestrito, bodySample } = await openWithToken(
    browser,
    token,
    routePath
  );
  await page.close();

  return {
    user,
    routePath,
    finalUrl,
    hasAcessoRestrito,
    bodySample,
  };
}

async function testRefreshBehavior(browser, token, routePath) {
  const { page, finalUrl: beforeReload } = await openWithToken(browser, token, routePath);
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((resolve) => setTimeout(resolve, 800));
  const afterReload = page.url().replace(BASE, '');
  const hasAcessoRestrito = await page.evaluate(() =>
    (document.body.innerText || '').includes('Acesso Restrito')
  );
  await page.close();
  return { routePath, beforeReload, afterReload, hasAcessoRestrito };
}

async function testDeniedMenuVisibility(browser, deniedToken) {
  const { page, finalUrl, hasOperacaoMenu, hasAcessoRestrito, bodySample } = await openWithToken(
    browser,
    deniedToken,
    '/dashboard'
  );
  await page.close();
  return { finalUrl, hasOperacaoMenu, hasAcessoRestrito, bodySample };
}

async function testAgendaLegacy(browser, adminToken) {
  const { page, finalUrl, hasAcessoRestrito } = await openWithToken(browser, adminToken, '/agenda');
  const hasAgendaTitle = await page.evaluate(() => {
    const text = document.body.innerText || '';
    return text.includes('Agenda') || text.includes('agenda');
  });
  await page.close();
  return { finalUrl, hasAcessoRestrito, hasAgendaTitle };
}

async function main() {
  const adminToken = await apiLogin('homol_ops_admin', 'Homolog@123');
  const deniedToken = await apiLogin('homol_ops_denied', 'Homolog@123');
  const metadata = await fetchPermissionsMetadata(adminToken);
  const coordUser = metadata.users.find(
    (entry) => String(entry.email || '').toLowerCase() === 'homol_ops_legacy@test.local'
  );
  if (!coordUser?.id) {
    throw new Error('Usuario de coordenacao (legacy) nao encontrado para validacao UI da onda 1');
  }

  const beforePermissions = await fetchUserPermissions(adminToken, coordUser.id);
  const beforeScopes = new Set(
    beforePermissions
      .map((entry) => `${entry.module?.name || ''}:${entry.permission?.name || ''}`.toLowerCase())
      .filter((scope) => scope.includes(':'))
  );

  await syncCoordScopes(
    adminToken,
    coordUser.id,
    metadata.modules,
    metadata.permissions,
    COORD_DESIRED_SCOPES
  );
  const coordToken = await apiLogin(COORD_USERNAME, COORD_PASSWORD);

  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const checks = [];
    function assertCheck(name, pass, detail = {}) {
      checks.push({ name, pass, detail });
      const marker = pass ? 'PASS' : 'FAIL';
      console.log(`[${marker}] ${name} ${JSON.stringify(detail)}`);
    }

    const routes = [
      '/operacao-unidade',
      '/operacao-unidade/agenda',
      '/operacao-unidade/salas',
      '/operacao-unidade/atividades',
      '/operacao-unidade/turmas',
      '/operacao-unidade/grade',
      '/operacao-unidade/matriculas',
    ];

    const adminResults = [];
    for (const routePath of routes) {
      adminResults.push(await testRouteAccess(browser, adminToken, 'admin', routePath));
    }
    for (const result of adminResults) {
      const pass =
        result.hasAcessoRestrito === false &&
        result.finalUrl.startsWith('/operacao-unidade/');
      assertCheck(`admin acessa ${result.routePath}`, pass, {
        finalUrl: result.finalUrl,
        hasAcessoRestrito: result.hasAcessoRestrito,
      });
    }

    const coordResults = [];
    for (const routePath of routes) {
      coordResults.push(await testRouteAccess(browser, coordToken, 'coordenacao', routePath));
    }
    for (const result of coordResults) {
      const pass =
        result.hasAcessoRestrito === false &&
        result.finalUrl.startsWith('/operacao-unidade/');
      assertCheck(`coordenacao acessa ${result.routePath}`, pass, {
        finalUrl: result.finalUrl,
        hasAcessoRestrito: result.hasAcessoRestrito,
      });
    }

    const deniedRoute = await testRouteAccess(
      browser,
      deniedToken,
      'denied',
      '/operacao-unidade/turmas'
    );
    assertCheck(
      'perfil negado bloqueado na rota operacional',
      deniedRoute.finalUrl === '/' && deniedRoute.hasAcessoRestrito === true,
      {
        finalUrl: deniedRoute.finalUrl,
        hasAcessoRestrito: deniedRoute.hasAcessoRestrito,
      }
    );

    const deniedMenu = await testDeniedMenuVisibility(browser, deniedToken);
    assertCheck(
      'perfil negado sem menu indevido de operacao',
      deniedMenu.hasOperacaoMenu === false,
      {
        finalUrl: deniedMenu.finalUrl,
        hasOperacaoMenu: deniedMenu.hasOperacaoMenu,
      }
    );

    const refreshResult = await testRefreshBehavior(browser, adminToken, '/operacao-unidade/turmas');
    assertCheck(
      'refresh preserva rota operacional no admin',
      refreshResult.beforeReload === '/operacao-unidade/turmas' &&
        refreshResult.afterReload === '/operacao-unidade/turmas' &&
        refreshResult.hasAcessoRestrito === false,
      refreshResult
    );

    const legacyAgenda = await testAgendaLegacy(browser, adminToken);
    assertCheck(
      'agenda oficial continua acessivel',
      legacyAgenda.finalUrl === '/agenda' &&
        legacyAgenda.hasAcessoRestrito === false &&
        legacyAgenda.hasAgendaTitle === true,
      legacyAgenda
    );

    const summary = {
      total: checks.length,
      passed: checks.filter((entry) => entry.pass).length,
      failed: checks.filter((entry) => !entry.pass).length,
    };

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE,
      summary,
      checks,
      artifacts: {
        coordUserId: coordUser.id,
        adminResults,
        coordResults,
        deniedRoute,
        deniedMenu,
        refreshResult,
        legacyAgenda,
      },
    };

    const outDir = path.join(process.cwd(), 'smoke-evidence');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `homolog-unit-ops-wave1-ui-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`REPORT=${outPath}`);

    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await syncCoordScopes(
      adminToken,
      coordUser.id,
      metadata.modules,
      metadata.permissions,
      new Set(
        Array.from(beforeScopes).filter((scope) =>
          UNIT_OPERATION_MODULES.some((moduleName) => scope.startsWith(`${moduleName}:`))
        )
      )
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
