const fs = require('fs');
const path = require('path');
const puppeteer = require('./institutoback/node_modules/puppeteer');

const FRONTEND_URL = 'http://localhost:5000';
const BACKEND_API_URL = 'http://localhost:3000/api';
const LOGIN_PAYLOAD = { username: 'admin', password: 'admin' };

const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const reportDir = path.resolve(__dirname, 'smoke-evidence', `homolog-roles-preag-${runId}`);
fs.mkdirSync(reportDir, { recursive: true });

const report = {
  runId,
  startedAt: new Date().toISOString(),
  urls: { frontend: FRONTEND_URL, backend: BACKEND_API_URL },
  tests: {
    test1_create_flag_on: { ok: false, steps: [] },
    test2_toggle_off_hidden: { ok: false, steps: [] },
    test3_delete_in_use_blocked: { ok: false, steps: [] },
    test4_delete_without_link: { ok: false, steps: [] },
  },
  dependencyByName: null,
  checks: [],
  screenshots: {},
  apiCalls: [],
  consoleErrors: [],
  pageErrors: [],
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

function recordStep(testKey, name, ok, details = null) {
  report.tests[testKey].steps.push({ name, ok, details });
  if (!ok) {
    throw new Error(`${testKey} | ${name} | ${JSON.stringify(details || {})}`);
  }
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
  report.apiCalls.push({
    method: options.method || 'GET',
    url,
    status: response.status,
  });
  return { response, data };
}

async function saveScreenshot(page, name) {
  const filename = `${name}.png`;
  const filepath = path.join(reportDir, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  report.screenshots[name] = filepath;
}

async function clickButtonByText(page, text, exact = false) {
  return page.evaluate(
    ({ needle, exactMatch }) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const norm = (v) =>
        String(v || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      const wanted = norm(needle);
      const target = buttons.find((button) => {
        if (button.disabled) return false;
        const label = norm(button.textContent || '');
        return exactMatch ? label === wanted : label.includes(wanted);
      });
      if (!target) return false;
      target.click();
      return true;
    },
    { needle: text, exactMatch: exact }
  );
}

async function waitForText(page, text, timeout = 15000) {
  const target = normalizeText(text);
  await page.waitForFunction(
    (needle) => {
      const norm = (v) =>
        String(v || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      return norm(document.body.textContent || '').includes(needle);
    },
    { timeout },
    target
  );
}

async function openFuncoesSection(page) {
  await page.goto(`${FRONTEND_URL}/configuracoes`, { waitUntil: 'networkidle2' });
  await waitForText(page, 'Configuracoes do Sistema');

  const hasRoleInputVisible = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).some((entry) =>
      ((entry.getAttribute('placeholder') || '').toLowerCase().includes('nova funcao'))
    )
  );
  if (!hasRoleInputVisible) {
    const clicked = await clickButtonByText(page, 'Funcoes', true);
    if (!clicked) throw new Error('Nao foi possivel abrir acordeon de Funcoes');
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('input')).some((entry) =>
          ((entry.getAttribute('placeholder') || '').toLowerCase().includes('nova funcao'))
        ),
      { timeout: 15000 }
    );
  }

  await waitForText(page, 'Funcoes (Profissionais)');
}

async function setNewRoleInput(page, roleName) {
  const handles = await page.$$('input');
  for (const handle of handles) {
    const placeholder = await handle.evaluate((el) => (el.getAttribute('placeholder') || '').toLowerCase());
    if (!placeholder.includes('nova funcao')) continue;
    await handle.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await handle.type(roleName);
    return true;
  }
  return false;
}

async function setNewRoleVisibilitySwitch(page, desired) {
  return page.evaluate((want) => {
    const labels = Array.from(document.querySelectorAll('label'));
    const norm = (v) =>
      String(v || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    const label = labels.find((entry) =>
      norm(entry.textContent || '').includes('aparecer em servicos desejados')
    );
    if (!label) return false;
    const switchButton = label.querySelector("button[role='switch']");
    if (!switchButton) return false;
    const current = switchButton.getAttribute('aria-checked') === 'true';
    if (current !== want) {
      switchButton.click();
    }
    return true;
  }, desired);
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
    if (!row) {
      return { exists: false };
    }
    const switches = Array.from(row.querySelectorAll("button[role='switch']"));
    const preSwitch = switches[0] || null;
    const activeSwitch = switches[1] || null;
    return {
      exists: true,
      preVisible: preSwitch ? preSwitch.getAttribute('aria-checked') === 'true' : null,
      active: activeSwitch ? activeSwitch.getAttribute('aria-checked') === 'true' : null,
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
  return page.evaluate(
    ({ name, want }) => {
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
      const switches = Array.from(row.querySelectorAll("button[role='switch']"));
      const preSwitch = switches[0];
      if (!preSwitch) return false;
      const current = preSwitch.getAttribute('aria-checked') === 'true';
      if (current !== want) {
        preSwitch.click();
      }
      return true;
    },
    { name: roleName, want: desired }
  );
}

async function editRoleAndSaveSameName(page, roleName) {
  const enteredEdit = await page.evaluate((name) => {
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
    const actionsCell = row.querySelector('td:last-child');
    if (!actionsCell) return false;
    const buttons = Array.from(actionsCell.querySelectorAll('button')).filter(
      (btn) => btn.getAttribute('role') !== 'switch'
    );
    const editButton = buttons[0];
    if (!editButton) return false;
    editButton.click();
    return true;
  }, roleName);
  if (!enteredEdit) return false;

  await new Promise((r) => setTimeout(r, 300));

  const saved = await page.evaluate((name) => {
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
      const input = entry.querySelector('input');
      return input && norm(input.value || '') === wanted;
    });
    if (!row) return false;

    const input = row.querySelector('input');
    if (!input) return false;
    input.focus();
    input.value = name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const actionsCell = row.querySelector('td:last-child');
    if (!actionsCell) return false;
    const buttons = Array.from(actionsCell.querySelectorAll('button')).filter(
      (btn) => btn.getAttribute('role') !== 'switch'
    );
    const saveButton = buttons[0];
    if (!saveButton) return false;
    saveButton.click();
    return true;
  }, roleName);

  return saved === true;
}

async function deleteRoleByRow(page, roleName) {
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
    if (!row) return false;
    const actionsCell = row.querySelector('td:last-child');
    if (!actionsCell) return false;
    const buttons = Array.from(actionsCell.querySelectorAll('button')).filter(
      (btn) => btn.getAttribute('role') !== 'switch'
    );
    const deleteButton = buttons[1];
    if (!deleteButton) return false;
    deleteButton.click();
    return true;
  }, roleName);
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
    const checkboxButton = label.querySelector("button[role='checkbox']");
    if (!checkboxButton) return false;
    const checked = checkboxButton.getAttribute('aria-checked') === 'true';
    if (!checked) checkboxButton.click();
    return true;
  }, serviceName);
}

async function setInputByLabel(page, labelNeedle, value) {
  return page.evaluate(
    ({ labelText, nextValue }) => {
      const norm = (v) =>
        String(v || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      const labels = Array.from(document.querySelectorAll('label'));
      const label = labels.find((entry) => norm(entry.textContent || '').includes(norm(labelText)));
      if (!label) return false;
      const container = label.closest('div');
      if (!container) return false;
      const input = container.querySelector('input');
      if (!input) return false;
      const descriptor = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      );
      const setValue = descriptor && descriptor.set ? descriptor.set : null;
      if (!setValue) return false;
      input.focus();
      setValue.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setValue.call(input, nextValue);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    { labelText: labelNeedle, nextValue: value }
  );
}

async function main() {
  let browser = null;
  let createdRoleName = null;
  let createdRoleId = null;

  try {
    const login = await apiFetch(`${BACKEND_API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(LOGIN_PAYLOAD),
    });
    pushCheck('login API admin/admin 200', login.response.status === 200, { status: login.response.status });
    const token = login.data?.token;
    pushCheck('token de autenticacao recebido', Boolean(token), null);

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const rolesRes = await apiFetch(`${BACKEND_API_URL}/settings/professional-roles?all=1`, {
      headers: authHeaders,
    });
    pushCheck('GET professional-roles 200', rolesRes.response.status === 200, { status: rolesRes.response.status });

    const servicesRes = await apiFetch(`${BACKEND_API_URL}/services?active=true`);
    pushCheck('GET services active 200', servicesRes.response.status === 200, { status: servicesRes.response.status });

    const roles = Array.isArray(rolesRes.data?.roles) ? rolesRes.data.roles : [];
    const services = Array.isArray(servicesRes.data?.services) ? servicesRes.data.services : [];

    const activeVisibleRoles = roles.filter((r) => r?.ativo === true && r?.show_in_pre_appointment === true);
    const allRoleNameSet = new Set(roles.map((r) => normalizeText(r?.nome)));
    const roleNameSet = new Set(activeVisibleRoles.map((r) => normalizeText(r?.nome)));
    const serviceNameSet = new Set(services.map((s) => normalizeText(s?.name)));

    const visibleRolesWithoutService = activeVisibleRoles.filter(
      (r) => !serviceNameSet.has(normalizeText(r?.nome))
    );
    const servicesWithoutVisibleRole = services.filter(
      (s) => !roleNameSet.has(normalizeText(s?.name))
    );

    report.dependencyByName = {
      activeVisibleRoles: activeVisibleRoles.length,
      activeServices: services.length,
      visibleRolesWithoutService: visibleRolesWithoutService.map((r) => ({ id: r.id, nome: r.nome })),
      servicesWithoutVisibleRole: servicesWithoutVisibleRole.map((s) => ({ id: s.id, name: s.name })),
    };

    const preferredServiceNames = [
      'Psicologia Clinica',
      'Terapia Individual',
      'Terapia em Grupo',
      'Fisioterapia Motora',
      'Terapia Ocupacional',
    ];
    const candidateService =
      services.find(
        (s) =>
          preferredServiceNames.some(
            (name) => normalizeText(name) === normalizeText(s?.name)
          ) && !allRoleNameSet.has(normalizeText(s?.name))
      ) ||
      services.find((s) => !allRoleNameSet.has(normalizeText(s?.name)));
    pushCheck('existe servico ativo sem funcao cadastrada para teste de criacao', Boolean(candidateService), {
      services: services.length,
      rolesTotal: roles.length,
    });

    createdRoleName = candidateService.name;

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        report.consoleErrors.push({ text: msg.text(), url: page.url() });
      }
    });
    page.on('pageerror', (error) => {
      report.pageErrors.push({ message: error?.message || String(error), url: page.url() });
    });

    // Login UI
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle2' });
    await saveScreenshot(page, '01-login');
    await page.waitForSelector("input[type='password']");
    const userInput = (await page.$("input[type='text']")) || (await page.$("input[type='email']"));
    pushCheck('campo usuario visivel no login', Boolean(userInput), null);
    await userInput.click({ clickCount: 3 });
    await userInput.type(LOGIN_PAYLOAD.username);
    const passInput = await page.$("input[type='password']");
    await passInput.click({ clickCount: 3 });
    await passInput.type(LOGIN_PAYLOAD.password);
    const clickedLogin = await clickButtonByText(page, 'Entrar');
    pushCheck('botao Entrar clicado', clickedLogin, null);
    await page.waitForFunction(() => Boolean(localStorage.getItem('token')), { timeout: 15000 });
    await saveScreenshot(page, '02-pos-login');

    // Configuracoes abre
    await openFuncoesSection(page);
    await saveScreenshot(page, '03-config-funcoes-aberta');
    pushCheck('tela Configuracoes > Funcoes abre normalmente', true, null);

    // TESTE 1
    recordStep('test1_create_flag_on', 'abrir secao Funcoes', true, null);

    const setInputOk = await setNewRoleInput(page, createdRoleName);
    recordStep('test1_create_flag_on', 'preencher nome da nova funcao', setInputOk, { roleName: createdRoleName });

    const setVisOk = await setNewRoleVisibilitySwitch(page, true);
    recordStep('test1_create_flag_on', 'marcar flag de exibicao no pre-agendamento', setVisOk, null);

    const addClicked = await page.evaluate(() => {
      const norm = (v) =>
        String(v || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      const btn = Array.from(document.querySelectorAll('button')).find((entry) =>
        norm(entry.textContent || '').includes('adicionar funcao')
      );
      if (!btn) return { found: false, disabled: null };
      if (!btn.disabled) btn.click();
      return { found: true, disabled: btn.disabled };
    });
    recordStep(
      'test1_create_flag_on',
      'clicar em Adicionar funcao',
      addClicked.found === true && addClicked.disabled === false,
      addClicked
    );
    await new Promise((r) => setTimeout(r, 1200));

    const createdRow = await getRoleRowState(page, createdRoleName);
    recordStep('test1_create_flag_on', 'nova funcao aparece na lista', createdRow.exists === true, createdRow);
    recordStep('test1_create_flag_on', 'flag persistida como exibido', createdRow.preVisible === true, createdRow);

    // guardar id da role criada
    const rolesAfterCreate = await apiFetch(`${BACKEND_API_URL}/settings/professional-roles?all=1`, {
      headers: authHeaders,
    });
    const roleCreated = (rolesAfterCreate.data?.roles || []).find(
      (r) => normalizeText(r?.nome) === normalizeText(createdRoleName)
    );
    createdRoleId = roleCreated?.id || null;
    recordStep('test1_create_flag_on', 'role criada persistiu no backend', Boolean(createdRoleId), { createdRoleId });

    // editar para validar fluxo de edicao
    const editSaved = await editRoleAndSaveSameName(page, createdRoleName);
    pushCheck('edicao de funcao continua funcionando', editSaved === true, null);
    await new Promise((r) => setTimeout(r, 900));

    const rolesAfterEdit = await apiFetch(`${BACKEND_API_URL}/settings/professional-roles?all=1`, {
      headers: authHeaders,
    });
    const existsAfterEdit = (rolesAfterEdit.data?.roles || []).some(
      (r) => normalizeText(r?.nome) === normalizeText(createdRoleName)
    );
    pushCheck('funcao segue presente apos edicao', existsAfterEdit === true, {
      existsAfterEdit,
      roleName: createdRoleName,
    });

    // validar aparecimento no pre-agendamento
    await page.goto(`${FRONTEND_URL}/pre-agendamento`, { waitUntil: 'networkidle2' });
    await waitForText(page, 'Pre-Agendamento / Recepcao');
    await saveScreenshot(page, '04-preag-test1');

    const hasLabelTest1 = await preAgendamentoHasServiceLabel(page, createdRoleName);
    recordStep('test1_create_flag_on', 'funcao criada aparece em Servicos desejados', hasLabelTest1, { roleName: createdRoleName });

    const preServicesApiAfterCreate = await apiFetch(`${BACKEND_API_URL}/services?active=true&pre_appointment=true`);
    const preServicesListAfterCreate = Array.isArray(preServicesApiAfterCreate.data?.services)
      ? preServicesApiAfterCreate.data.services
      : [];
    const hasInApiAfterCreate = preServicesListAfterCreate.some(
      (s) => normalizeText(s?.name) === normalizeText(createdRoleName)
    );
    recordStep('test1_create_flag_on', 'endpoint filtrado inclui funcao criada', hasInApiAfterCreate, {
      total: preServicesListAfterCreate.length,
    });

    // validar submit pre-agendamento funcionando
    const uniqueId = `HML${runId}`;
    const childName = `Crianca Homolog ${uniqueId}`;
    const phone = `1199${runId.slice(-6)}`;
    const email = `hml.preag.${runId}@teste.local`;

    const nameFilled = await setInputByLabel(page, 'Nome da crianca', childName);
    const phoneFilled = await setInputByLabel(page, 'Telefone principal', phone);
    const emailFilled = await setInputByLabel(page, 'E-mail', email);
    pushCheck('campos obrigatorios do pre-agendamento preenchidos', nameFilled && phoneFilled && emailFilled, {
      nameFilled,
      phoneFilled,
      emailFilled,
    });

    const serviceSelected = await selectServiceByLabel(page, createdRoleName);
    pushCheck('servico desejado selecionado no pre-agendamento', serviceSelected, { roleName: createdRoleName });

    const submitClicked = await clickButtonByText(page, 'Registrar entrada inicial');
    pushCheck('botao Registrar entrada inicial clicado', submitClicked, null);

    await waitForText(page, 'Recepcao registrada', 30000);
    await saveScreenshot(page, '05-preag-submit-ok');
    pushCheck('submit principal do pre-agendamento continua funcionando', true, null);

    report.tests.test1_create_flag_on.ok = true;

    // TESTE 2
    await openFuncoesSection(page);
    await waitForRoleRow(page, createdRoleName);
    const toggledOff = await toggleRolePreVisibility(page, createdRoleName, false);
    recordStep('test2_toggle_off_hidden', 'desligar exibicao no pre-agendamento', toggledOff, null);
    await new Promise((r) => setTimeout(r, 1200));

    await openFuncoesSection(page);
    const rowAfterToggleOff = await getRoleRowState(page, createdRoleName);
    recordStep('test2_toggle_off_hidden', 'funcao permanece cadastrada', rowAfterToggleOff.exists === true, rowAfterToggleOff);
    recordStep('test2_toggle_off_hidden', 'flag ficou desligada', rowAfterToggleOff.preVisible === false, rowAfterToggleOff);

    await page.goto(`${FRONTEND_URL}/pre-agendamento`, { waitUntil: 'networkidle2' });
    await waitForText(page, 'Pre-Agendamento / Recepcao');
    await saveScreenshot(page, '06-preag-test2');
    const hasLabelAfterOff = await preAgendamentoHasServiceLabel(page, createdRoleName);
    recordStep('test2_toggle_off_hidden', 'funcao desligada nao aparece em Servicos desejados', hasLabelAfterOff === false, {
      hasLabelAfterOff,
    });

    report.tests.test2_toggle_off_hidden.ok = true;

    // TESTE 3 (backend)
    const professionalsRes = await apiFetch(`${BACKEND_API_URL}/profissionais`, { headers: authHeaders });
    recordStep('test3_delete_in_use_blocked', 'listar profissionais para localizar vinculo', professionalsRes.response.status === 200, {
      status: professionalsRes.response.status,
    });
    const professionals = Array.isArray(professionalsRes.data?.professionals)
      ? professionalsRes.data.professionals
      : [];
    const linked = professionals.find((p) => Number.isInteger(Number(p?.role_id)) && Number(p.role_id) > 0);
    recordStep('test3_delete_in_use_blocked', 'existe funcao com vinculo real', Boolean(linked), {
      totalProfessionals: professionals.length,
    });

    const deleteInUse = await apiFetch(
      `${BACKEND_API_URL}/settings/professional-roles/${linked.role_id}`,
      {
        method: 'DELETE',
        headers: authHeaders,
      }
    );
    recordStep('test3_delete_in_use_blocked', 'exclusao de funcao em uso bloqueada com 409', deleteInUse.response.status === 409, {
      status: deleteInUse.response.status,
      body: deleteInUse.data,
    });
    recordStep('test3_delete_in_use_blocked', 'retorno nao e erro 500', deleteInUse.response.status !== 500, {
      status: deleteInUse.response.status,
    });

    report.tests.test3_delete_in_use_blocked.ok = true;

    // TESTE 4
    await openFuncoesSection(page);
    await waitForRoleRow(page, createdRoleName);
    const roleBeforeDelete = await getRoleRowState(page, createdRoleName);
    recordStep('test4_delete_without_link', 'funcao de teste existe antes da exclusao', roleBeforeDelete.exists === true, roleBeforeDelete);

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    const deleteClicked = await deleteRoleByRow(page, createdRoleName);
    recordStep('test4_delete_without_link', 'acionar excluir na linha da funcao', deleteClicked, null);
    await new Promise((r) => setTimeout(r, 1400));

    const roleAfterDelete = await getRoleRowState(page, createdRoleName);
    recordStep('test4_delete_without_link', 'funcao removida da listagem', roleAfterDelete.exists === false, roleAfterDelete);

    await openFuncoesSection(page);
    const roleAfterReload = await getRoleRowState(page, createdRoleName);
    recordStep('test4_delete_without_link', 'funcao permanece removida apos recarregar', roleAfterReload.exists === false, roleAfterReload);

    const rolesAfterDelete = await apiFetch(`${BACKEND_API_URL}/settings/professional-roles?all=1`, {
      headers: authHeaders,
    });
    const stillExistsBackend = (rolesAfterDelete.data?.roles || []).some(
      (r) => normalizeText(r?.nome) === normalizeText(createdRoleName)
    );
    recordStep('test4_delete_without_link', 'funcao removida no backend', stillExistsBackend === false, {
      stillExistsBackend,
    });

    await page.goto(`${FRONTEND_URL}/pre-agendamento`, { waitUntil: 'networkidle2' });
    await waitForText(page, 'Pre-Agendamento / Recepcao');
    await saveScreenshot(page, '07-preag-test4');
    const stillShownAfterDelete = await preAgendamentoHasServiceLabel(page, createdRoleName);
    recordStep('test4_delete_without_link', 'funcao excluida nao aparece no pre-agendamento', stillShownAfterDelete === false, {
      stillShownAfterDelete,
    });

    const preAgServicesText = await page.evaluate(() => (document.body.textContent || '').toLowerCase());
    const preAgLoaded =
      preAgServicesText.includes('carregando servicos') ||
      preAgServicesText.includes('nenhum servico ativo encontrado') ||
      preAgServicesText.includes('servicos desejados');
    recordStep('test4_delete_without_link', 'pre-agendamento continua carregando apos exclusao', preAgLoaded, null);

    report.tests.test4_delete_without_link.ok = true;

    // Validacoes complementares finais
    pushCheck('pre-agendamento abre sem erro no fim da homologacao', true, null);
    pushCheck('nao houve erro de page runtime no navegador', report.pageErrors.length === 0, {
      pageErrors: report.pageErrors,
    });

    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = {
      message: error?.message || String(error),
      stack: error?.stack || null,
    };
  } finally {
    try {
      const reportPath = path.join(reportDir, 'report.json');
      report.finishedAt = new Date().toISOString();
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`REPORT_PATH=${reportPath}`);
      console.log(`REPORT_STATUS=${report.status}`);
      if (report.error) {
        console.log(`REPORT_ERROR=${report.error.message}`);
      }
    } catch (writeErr) {
      console.error('Falha ao salvar report:', writeErr?.message || writeErr);
    }
    try {
      if (browser) {
        await browser.close();
      }
    } catch {}

    if (report.status !== 'passed') {
      process.exitCode = 1;
    }
  }
}

main();
