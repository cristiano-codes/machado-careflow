const fs = require('fs');
const path = require('path');
const puppeteer = require('./institutoback/node_modules/puppeteer');

const FRONTEND_URL = 'https://home-production-7dda.up.railway.app';
const BACKEND_API_URL = 'https://friendly-insight-production.up.railway.app/api';
const LOGIN_PAYLOAD = { username: 'admin', password: 'admin' };

const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const reportDir = path.resolve(__dirname, 'smoke-evidence', `published-preag-services-hotfix-${runId}`);
fs.mkdirSync(reportDir, { recursive: true });

const report = {
  runId,
  startedAt: new Date().toISOString(),
  urls: { frontend: FRONTEND_URL, backend: BACKEND_API_URL },
  checks: [],
  api: [],
  screenshots: {},
  status: 'running',
  error: null,
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function pushCheck(name, ok, details = null) {
  report.checks.push({ name, ok, details });
  if (!ok) {
    throw new Error(`${name} | ${JSON.stringify(details || {})}`);
  }
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  report.api.push({ method: options.method || 'GET', url, status: response.status });
  return { response, data };
}

async function saveScreenshot(page, name) {
  const filepath = path.join(reportDir, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  report.screenshots[name] = filepath;
}

async function clickButtonByText(page, text, exact = false) {
  return page.evaluate(({ needle, exactMatch }) => {
    const norm = (v) =>
      String(v || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    const target = Array.from(document.querySelectorAll('button')).find((btn) => {
      const label = norm(btn.textContent || '');
      if (btn.disabled) return false;
      return exactMatch ? label === norm(needle) : label.includes(norm(needle));
    });
    if (!target) return false;
    target.click();
    return true;
  }, { needle: text, exactMatch: exact });
}

async function waitForText(page, text, timeout = 30000) {
  const needle = normalizeText(text);
  await page.waitForFunction(
    (wanted) => {
      const norm = (v) =>
        String(v || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      return norm(document.body.textContent || '').includes(wanted);
    },
    { timeout },
    needle
  );
}

async function openFuncoesSection(page) {
  await page.goto(`${FRONTEND_URL}/configuracoes`, { waitUntil: 'networkidle2' });
  await waitForText(page, 'Configuracoes do Sistema');

  const hasInputVisible = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).some((entry) =>
      ((entry.getAttribute('placeholder') || '').toLowerCase().includes('nova funcao'))
    )
  );

  if (!hasInputVisible) {
    const clicked = await clickButtonByText(page, 'Funcoes', true);
    if (!clicked) throw new Error('Falha ao abrir secao Funcoes');
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('input')).some((entry) =>
          ((entry.getAttribute('placeholder') || '').toLowerCase().includes('nova funcao'))
        ),
      { timeout: 15000 }
    );
  }
}

async function getRoleRowState(page, roleName) {
  return page.evaluate((name) => {
    const norm = (v) =>
      String(v || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    const wanted = norm(name);
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    const row = rows.find((entry) => {
      const firstCell = entry.querySelector('td');
      return norm(firstCell?.textContent || '') === wanted;
    });
    if (!row) return { exists: false };

    const switches = Array.from(row.querySelectorAll("button[role='switch']"));
    return {
      exists: true,
      preVisible: switches[0] ? switches[0].getAttribute('aria-checked') === 'true' : null,
      active: switches[1] ? switches[1].getAttribute('aria-checked') === 'true' : null,
      text: (row.textContent || '').trim(),
    };
  }, roleName);
}

async function waitForRoleRow(page, roleName, timeout = 20000) {
  const wanted = normalizeText(roleName);
  await page.waitForFunction(
    (needle) => {
      const norm = (v) =>
        String(v || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      return rows.some((entry) => {
        const firstCell = entry.querySelector('td');
        return norm(firstCell?.textContent || '') === needle;
      });
    },
    { timeout },
    wanted
  );
}

async function toggleRolePreVisibility(page, roleName, desired) {
  return page.evaluate(({ name, want }) => {
    const norm = (v) =>
      String(v || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    const wanted = norm(name);
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    const row = rows.find((entry) => {
      const firstCell = entry.querySelector('td');
      return norm(firstCell?.textContent || '') === wanted;
    });
    if (!row) return false;
    const preSwitch = row.querySelector("button[role='switch']");
    if (!preSwitch) return false;
    const current = preSwitch.getAttribute('aria-checked') === 'true';
    if (current !== want) preSwitch.click();
    return true;
  }, { name: roleName, want: desired });
}

async function preAgendamentoHasServiceLabel(page, serviceName) {
  return page.evaluate((name) => {
    const norm = (v) =>
      String(v || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    const wanted = norm(name);
    const labels = Array.from(document.querySelectorAll('label'));
    return labels.some((entry) => {
      const text = norm(entry.textContent || '');
      return text === wanted || text.includes(wanted) || wanted.includes(text);
    });
  }, serviceName);
}

async function selectServiceByLabel(page, serviceName) {
  return page.evaluate((name) => {
    const norm = (v) =>
      String(v || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    const wanted = norm(name);
    const labels = Array.from(document.querySelectorAll('label'));
    const label = labels.find((entry) => {
      const text = norm(entry.textContent || '');
      return text === wanted || text.includes(wanted) || wanted.includes(text);
    });
    if (!label) return false;
    const checkbox = label.querySelector("button[role='checkbox']");
    if (!checkbox) return false;
    if (checkbox.getAttribute('aria-checked') !== 'true') checkbox.click();
    return true;
  }, serviceName);
}

async function setInputByLabel(page, labelNeedle, value) {
  return page.evaluate(({ needle, val }) => {
    const norm = (v) =>
      String(v || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    const labels = Array.from(document.querySelectorAll('label'));
    const label = labels.find((entry) => norm(entry.textContent || '').includes(norm(needle)));
    if (!label) return false;
    const container = label.closest('div');
    if (!container) return false;
    const input = container.querySelector('input');
    if (!input) return false;
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (!descriptor || !descriptor.set) return false;
    input.focus();
    descriptor.set.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { needle: labelNeedle, val: value });
}

async function main() {
  let browser = null;
  let token = null;
  let testedRole = null;

  try {
    const login = await apiFetch(`${BACKEND_API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(LOGIN_PAYLOAD),
    });
    pushCheck('login API publicado 200', login.response.status === 200, { status: login.response.status });
    token = login.data?.token || null;
    pushCheck('token recebido no publicado', Boolean(token), null);

    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const rolesRes = await apiFetch(`${BACKEND_API_URL}/settings/professional-roles?all=1`, {
      headers: authHeaders,
    });
    pushCheck('settings/professional-roles publicado 200', rolesRes.response.status === 200, { status: rolesRes.response.status });

    const roles = Array.isArray(rolesRes.data?.roles) ? rolesRes.data.roles : [];
    const visibleRoles = roles.filter((r) => r?.ativo === true && r?.show_in_pre_appointment === true);
    pushCheck('ha funcoes visiveis em Funcoes', visibleRoles.length > 0, { visibleRoles: visibleRoles.length });

    const preServicesFirst = await apiFetch(`${BACKEND_API_URL}/services?active=true&pre_appointment=true`);
    pushCheck('services pre_appointment publicado 200', preServicesFirst.response.status === 200, { status: preServicesFirst.response.status });
    const preServices = Array.isArray(preServicesFirst.data?.services) ? preServicesFirst.data.services : [];

    const preSet = new Set(preServices.map((s) => normalizeText(s?.name)));
    const visibleWithoutService = visibleRoles.filter((r) => !preSet.has(normalizeText(r?.nome)));
    pushCheck('sincronizacao de visiveis no publicado sem pendencias', visibleWithoutService.length === 0, {
      visibleRoles: visibleRoles.length,
      preServices: preServices.length,
      missing: visibleWithoutService.map((r) => r.nome),
    });

    testedRole = visibleRoles.find((r) => preSet.has(normalizeText(r?.nome))) || null;
    pushCheck('existe role visivel para teste de ocultacao', Boolean(testedRole), testedRole);

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);

    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle2' });
    await saveScreenshot(page, '01-login-publicado');

    const userInput = (await page.$("input[type='text']")) || (await page.$("input[type='email']"));
    pushCheck('campo login publicado visivel', Boolean(userInput), null);
    await userInput.click({ clickCount: 3 });
    await userInput.type(LOGIN_PAYLOAD.username);
    const passInput = await page.$("input[type='password']");
    await passInput.click({ clickCount: 3 });
    await passInput.type(LOGIN_PAYLOAD.password);
    const clickedLogin = await clickButtonByText(page, 'Entrar');
    pushCheck('clicou Entrar no publicado', clickedLogin, null);
    await page.waitForFunction(() => Boolean(localStorage.getItem('token')), { timeout: 15000 });

    await openFuncoesSection(page);
    await waitForRoleRow(page, testedRole.nome);
    const rowInitial = await getRoleRowState(page, testedRole.nome);
    pushCheck('role aparece em Configuracoes/Funcoes publicado', rowInitial.exists === true, rowInitial);
    pushCheck('role inicial exibida em Funcoes publicado', rowInitial.preVisible === true, rowInitial);
    await saveScreenshot(page, '02-funcoes-role-exibida');

    await page.goto(`${FRONTEND_URL}/pre-agendamento`, { waitUntil: 'networkidle2' });
    await waitForText(page, 'Pre-Agendamento / Recepcao');
    const hasEmptyMessageInitial = await page.evaluate(() =>
      (document.body.textContent || '').includes('Nenhum servico ativo encontrado.')
    );
    pushCheck('pre-agendamento publicado nao mostra mensagem de vazio indevida', hasEmptyMessageInitial === false, {
      hasEmptyMessageInitial,
    });

    const hasVisibleRoleInPre = await preAgendamentoHasServiceLabel(page, testedRole.nome);
    pushCheck('funcao exibida aparece em Servicos desejados no publicado', hasVisibleRoleInPre === true, {
      role: testedRole.nome,
    });
    await saveScreenshot(page, '03-preag-com-servicos');

    await openFuncoesSection(page);
    await waitForRoleRow(page, testedRole.nome);
    const toggledOff = await toggleRolePreVisibility(page, testedRole.nome, false);
    pushCheck('toggle para Oculto em Funcoes publicado', toggledOff, null);
    await new Promise((r) => setTimeout(r, 1200));

    const rowAfterOff = await getRoleRowState(page, testedRole.nome);
    pushCheck('role ficou Oculta em Funcoes publicado', rowAfterOff.preVisible === false, rowAfterOff);
    await saveScreenshot(page, '04-funcoes-role-oculta');

    await page.goto(`${FRONTEND_URL}/pre-agendamento`, { waitUntil: 'networkidle2' });
    await waitForText(page, 'Pre-Agendamento / Recepcao');
    const hasRoleWhenOff = await preAgendamentoHasServiceLabel(page, testedRole.nome);
    pushCheck('role oculta nao aparece em Servicos desejados', hasRoleWhenOff === false, {
      role: testedRole.nome,
      hasRoleWhenOff,
    });

    await openFuncoesSection(page);
    await waitForRoleRow(page, testedRole.nome);
    const toggledOn = await toggleRolePreVisibility(page, testedRole.nome, true);
    pushCheck('toggle de volta para Exibido em Funcoes publicado', toggledOn, null);
    await new Promise((r) => setTimeout(r, 1200));

    await page.goto(`${FRONTEND_URL}/pre-agendamento`, { waitUntil: 'networkidle2' });
    await waitForText(page, 'Pre-Agendamento / Recepcao');
    const hasRoleWhenOnAgain = await preAgendamentoHasServiceLabel(page, testedRole.nome);
    pushCheck('role volta a aparecer em Servicos desejados', hasRoleWhenOnAgain === true, {
      role: testedRole.nome,
    });

    const runSuffix = runId.slice(-8);
    const nameOk = await setInputByLabel(page, 'Nome da crianca', `Publ Hotfix ${runSuffix}`);
    const phoneOk = await setInputByLabel(page, 'Telefone principal', `11999${runSuffix.slice(-6)}`);
    const emailOk = await setInputByLabel(page, 'E-mail', `publ.hotfix.${runSuffix}@teste.local`);
    pushCheck('campos obrigatorios preenchidos no publicado', nameOk && phoneOk && emailOk, { nameOk, phoneOk, emailOk });

    const serviceSelected = await selectServiceByLabel(page, testedRole.nome);
    pushCheck('servico desejado selecionado no publicado', serviceSelected, { role: testedRole.nome });

    const submitClicked = await clickButtonByText(page, 'Registrar entrada inicial');
    pushCheck('botao registrar clicado no publicado', submitClicked, null);
    await waitForText(page, 'Recepcao registrada', 30000);
    await saveScreenshot(page, '05-preag-submit-publicado-ok');
    pushCheck('submit do pre-agendamento publicado permanece funcional', true, null);

    // Checagem final de sincronizacao apos fluxo
    const preServicesFinal = await apiFetch(`${BACKEND_API_URL}/services?active=true&pre_appointment=true`);
    const preFinalList = Array.isArray(preServicesFinal.data?.services) ? preServicesFinal.data.services : [];
    const preFinalSet = new Set(preFinalList.map((s) => normalizeText(s?.name)));
    const visibleFinal = await apiFetch(`${BACKEND_API_URL}/settings/professional-roles?all=1`, { headers: authHeaders });
    const visibleFinalRoles = (Array.isArray(visibleFinal.data?.roles) ? visibleFinal.data.roles : [])
      .filter((r) => r?.ativo === true && r?.show_in_pre_appointment === true);
    const stillMissing = visibleFinalRoles.filter((r) => !preFinalSet.has(normalizeText(r?.nome)));
    pushCheck('sincronizacao final consistente no publicado', stillMissing.length === 0, {
      visibleFinal: visibleFinalRoles.length,
      preFinal: preFinalList.length,
      missing: stillMissing.map((r) => r.nome),
    });

    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = {
      message: error?.message || String(error),
      stack: error?.stack || null,
    };
  } finally {
    report.finishedAt = new Date().toISOString();
    const reportPath = path.join(reportDir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`REPORT_PATH=${reportPath}`);
    console.log(`REPORT_STATUS=${report.status}`);
    if (report.error) {
      console.log(`REPORT_ERROR=${report.error.message}`);
    }
  }
}

main();
