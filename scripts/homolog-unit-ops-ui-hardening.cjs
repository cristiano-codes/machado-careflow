const fs = require('fs');
const path = require('path');
const puppeteer = require('../institutoback/node_modules/puppeteer');

const BASE = process.env.HOMOLOG_BASE_URL || 'http://localhost:3000';

async function apiLogin(username, password) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.token) {
    throw new Error(
      `Falha no login de ${username}: status=${response.status} payload=${JSON.stringify(payload)}`
    );
  }

  return payload.token;
}

async function testPage(browser, { user, token, routePath, interceptDatasetStatus }) {
  const page = await browser.newPage();
  const datasetStatuses = [];

  if (interceptDatasetStatus) {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const target = request.url();
      if (target.includes('/api/unit-operations/dataset')) {
        request.respond({
          status: interceptDatasetStatus,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            message:
              interceptDatasetStatus === 401
                ? 'Token expirado (simulado)'
                : 'Falha operacional simulada',
          }),
        });
        return;
      }
      request.continue();
    });
  }

  page.on('response', (response) => {
    if (response.url().includes('/api/unit-operations/dataset')) {
      datasetStatuses.push(response.status());
    }
  });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await page.evaluate((authToken) => {
    localStorage.setItem('token', authToken);
    sessionStorage.removeItem('token');
  }, token);

  await page.goto(`${BASE}${routePath}`, { waitUntil: 'networkidle2' });
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const finalUrl = page.url().replace(BASE, '');
  const diagnostics = await page.evaluate(() => {
    const bodyText = document.body.innerText || '';
    const banner = document.querySelector('[data-testid="unit-ops-sync-banner"]');
    return {
      hasAcessoRestrito: bodyText.includes('Acesso Restrito'),
      hasSyncBanner: Boolean(banner),
      syncBannerState: banner?.getAttribute('data-state') || null,
      syncBannerText: banner?.textContent?.replace(/\s+/g, ' ').trim() || null,
      bodySample: bodyText.slice(0, 260).replace(/\s+/g, ' ').trim(),
    };
  });

  await page.close();

  return {
    user,
    routePath,
    interceptDatasetStatus: interceptDatasetStatus || null,
    finalUrl,
    datasetStatuses,
    ...diagnostics,
  };
}

async function main() {
  const [adminToken, deniedToken, legacyToken] = await Promise.all([
    apiLogin('homol_ops_admin', 'Homolog@123'),
    apiLogin('homol_ops_denied', 'Homolog@123'),
    apiLogin('homol_ops_legacy', 'Homolog@123'),
  ]);

  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const checks = [];

    checks.push(
      await testPage(browser, {
        user: 'admin',
        token: adminToken,
        routePath: '/operacao-unidade/turmas',
      })
    );

    checks.push(
      await testPage(browser, {
        user: 'denied',
        token: deniedToken,
        routePath: '/operacao-unidade/turmas',
      })
    );

    checks.push(
      await testPage(browser, {
        user: 'legacy_agenda_view',
        token: legacyToken,
        routePath: '/operacao-unidade/turmas',
      })
    );

    checks.push(
      await testPage(browser, {
        user: 'admin_dataset_503',
        token: adminToken,
        routePath: '/operacao-unidade/turmas',
        interceptDatasetStatus: 503,
      })
    );

    checks.push(
      await testPage(browser, {
        user: 'admin_dataset_401',
        token: adminToken,
        routePath: '/operacao-unidade/turmas',
        interceptDatasetStatus: 401,
      })
    );

    const assertions = [];
    const byUser = new Map(checks.map((item) => [item.user, item]));

    function assertCheck(name, pass, detail = {}) {
      assertions.push({ name, pass, detail });
      const marker = pass ? 'PASS' : 'FAIL';
      console.log(`[${marker}] ${name} ${JSON.stringify(detail)}`);
    }

    const admin = byUser.get('admin');
    assertCheck('admin acessa operacao-unidade', admin?.finalUrl === '/operacao-unidade/turmas', {
      finalUrl: admin?.finalUrl,
    });
    assertCheck('admin sem acesso restrito', admin?.hasAcessoRestrito === false, {
      hasAcessoRestrito: admin?.hasAcessoRestrito,
    });

    const denied = byUser.get('denied');
    assertCheck('denied bloqueado no frontend', denied?.finalUrl === '/' && denied?.hasAcessoRestrito === true, {
      finalUrl: denied?.finalUrl,
      hasAcessoRestrito: denied?.hasAcessoRestrito,
    });

    const legacy = byUser.get('legacy_agenda_view');
    assertCheck(
      'legado agenda:view bloqueado no novo dominio',
      legacy?.finalUrl === '/' && legacy?.hasAcessoRestrito === true,
      {
        finalUrl: legacy?.finalUrl,
        hasAcessoRestrito: legacy?.hasAcessoRestrito,
      }
    );

    const dataset503 = byUser.get('admin_dataset_503');
    assertCheck(
      'erro API 503 exibe banner sem fallback silencioso',
      dataset503?.finalUrl === '/operacao-unidade/turmas' &&
        dataset503?.hasSyncBanner === true &&
        dataset503?.syncBannerState === 'error' &&
        Array.isArray(dataset503?.datasetStatuses) &&
        dataset503.datasetStatuses.includes(503),
      {
        finalUrl: dataset503?.finalUrl,
        hasSyncBanner: dataset503?.hasSyncBanner,
        syncBannerState: dataset503?.syncBannerState,
        datasetStatuses: dataset503?.datasetStatuses,
      }
    );

    const dataset401 = byUser.get('admin_dataset_401');
    assertCheck(
      'erro API 401 derruba sessao e redireciona',
      dataset401?.finalUrl === '/' &&
        Array.isArray(dataset401?.datasetStatuses) &&
        dataset401.datasetStatuses.includes(401),
      {
        finalUrl: dataset401?.finalUrl,
        datasetStatuses: dataset401?.datasetStatuses,
      }
    );

    const summary = {
      total: assertions.length,
      passed: assertions.filter((item) => item.pass).length,
      failed: assertions.filter((item) => !item.pass).length,
    };

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE,
      checks,
      assertions,
      summary,
    };

    const outDir = path.join(process.cwd(), 'smoke-evidence');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `homolog-unit-ops-ui-hardening-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(`REPORT=${outPath}`);
    console.log(JSON.stringify(report, null, 2));

    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
