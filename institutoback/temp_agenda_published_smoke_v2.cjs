const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const FRONTEND_URL = "https://home-production-7dda.up.railway.app";
const BACKEND_API_URL = "https://friendly-insight-production.up.railway.app/api";
const LOGIN_PAYLOAD = { username: "admin", password: "admin" };

const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const reportDir = path.resolve(
  __dirname,
  "..",
  "smoke-evidence",
  `published-agenda-${runId}`
);
fs.mkdirSync(reportDir, { recursive: true });

const report = {
  runId,
  startedAt: new Date().toISOString(),
  urls: {
    frontend: FRONTEND_URL,
    backend: BACKEND_API_URL,
  },
  checks: [],
  apiResponses: [],
  screenshots: {},
  status: "running",
  error: null,
};

function pushCheck(name, ok, details = null) {
  report.checks.push({ name, ok, details });
  if (!ok) {
    throw new Error(`ASSERT FAIL: ${name} | ${JSON.stringify(details || {})}`);
  }
}

function recordApi(url, status) {
  report.apiResponses.push({ url, status });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  recordApi(url, response.status);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { response, data };
}

async function saveScreenshot(page, name) {
  const filename = `${name}.png`;
  const filepath = path.join(reportDir, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  report.screenshots[name] = filepath;
}

async function clickButtonByText(page, text) {
  const clicked = await page.evaluate((needle) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const target = buttons.find((button) =>
      (button.textContent || "").trim().toLowerCase().includes(needle.toLowerCase())
    );
    if (!target) return false;
    target.click();
    return true;
  }, text);
  return clicked === true;
}

async function clickEnabledButtonByText(page, text) {
  const clicked = await page.evaluate((needle) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const target = buttons.find((button) => {
      const label = (button.textContent || "").trim().toLowerCase();
      return label.includes(needle.toLowerCase()) && !button.disabled;
    });
    if (!target) return false;
    target.click();
    return true;
  }, text);
  return clicked === true;
}

async function setInputByLabel(page, labelText, value) {
  const updated = await page.evaluate(
    ({ labelTextInner, valueInner }) => {
      const labels = Array.from(document.querySelectorAll("label"));
      const matches = labels.filter((entry) =>
        (entry.textContent || "").trim().toLowerCase().includes(labelTextInner.toLowerCase())
      );
      const label = matches.length > 0 ? matches[matches.length - 1] : null;
      if (!label) return false;
      const container = label.closest("div");
      if (!container) return false;
      const input = container.querySelector("input, textarea");
      if (!input) return false;
      input.focus();
      input.value = valueInner;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    { labelTextInner: labelText, valueInner: value }
  );
  return updated === true;
}

async function selectByLabel(page, labelText, optionText) {
  const opened = await page.evaluate((labelTextInner) => {
    const labels = Array.from(document.querySelectorAll("label"));
    const matches = labels.filter((entry) =>
      (entry.textContent || "").trim().toLowerCase().includes(labelTextInner.toLowerCase())
    );
    const label = matches.length > 0 ? matches[matches.length - 1] : null;
    if (!label) return false;
    const container = label.closest("div");
    if (!container) return false;
    const trigger = container.querySelector("button[role='combobox']");
    if (!trigger) return false;
    trigger.click();
    return true;
  }, labelText);
  if (!opened) return false;

  await sleep(250);
  const selected = await page.evaluate((optionTextInner) => {
    const options = Array.from(document.querySelectorAll("[role='option']"));
    const option = options.find((entry) =>
      (entry.textContent || "").trim().toLowerCase().includes(optionTextInner.toLowerCase())
    );
    if (!option) return false;
    option.click();
    return true;
  }, optionText);
  return selected === true;
}

async function typeBySelector(page, selector, value) {
  const input = await page.$(selector);
  if (!input) return false;
  await input.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await input.type(value);
  return true;
}

async function setNativeValueBySelector(page, selector, value) {
  const updated = await page.$eval(
    selector,
    (el, nextValue) => {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
      el.value = String(nextValue ?? "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    value
  ).catch(() => false);
  return updated === true;
}

async function selectComboboxFromEnd(page, fromEndIndex, optionText) {
  const opened = await page.evaluate((innerFromEndIndex) => {
    const combos = Array.from(document.querySelectorAll("button[role='combobox']"));
    if (combos.length === 0) return false;
    const index = combos.length - innerFromEndIndex;
    if (index < 0 || index >= combos.length) return false;
    const target = combos[index];
    if (!target) return false;
    target.click();
    return true;
  }, fromEndIndex);
  if (!opened) return false;
  await sleep(250);
  const selected = await page.evaluate((optionTextInner) => {
    const options = Array.from(document.querySelectorAll("[role='option']"));
    const option = options.find((entry) =>
      (entry.textContent || "").trim().toLowerCase().includes(optionTextInner.toLowerCase())
    );
    if (!option) return false;
    option.click();
    return true;
  }, optionText);
  return selected === true;
}

async function readToastMessages(page) {
  const messages = await page.evaluate(() => {
    const selectors = [
      "[data-sonner-toast]",
      "[role='status']",
      "[role='alert']",
      "[data-radix-toast-viewport] > *",
      "[data-state='open']",
    ];
    const bucket = [];
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        const text = (node.textContent || "").trim();
        if (text.length > 0) bucket.push(text);
      }
    }
    return Array.from(new Set(bucket));
  });
  return messages;
}

async function pickOptionsInMultiFilter(page, labelText, amount = 2) {
  const opened = await page.evaluate((needle) => {
    const labels = Array.from(document.querySelectorAll("label"));
    const label = labels.find((entry) =>
      (entry.textContent || "").trim().toLowerCase().includes(needle.toLowerCase())
    );
    if (!label) return false;
    const container = label.closest("div");
    if (!container) return false;
    const trigger = container.querySelector("button");
    if (!trigger || trigger.disabled) return false;
    trigger.click();
    return true;
  }, labelText);
  if (!opened) return { opened: false, available: 0, selected: 0, labels: [] };

  await sleep(250);
  const picked = await page.evaluate((count) => {
    const wrappers = Array.from(document.querySelectorAll("[data-radix-popper-content-wrapper]"));
    if (wrappers.length === 0) return { available: 0, selected: 0, labels: [] };

    const wrapperWithOptions = wrappers
      .map((root) => {
        const options = Array.from(root.querySelectorAll("button"))
          .filter((button) => {
            const text = (button.textContent || "").trim();
            return text.length > 0 && !text.toLowerCase().includes("todos");
          });
        return { root, options };
      })
      .sort((a, b) => b.options.length - a.options.length)[0];
    if (!wrapperWithOptions || wrapperWithOptions.options.length === 0) {
      return { available: 0, selected: 0, labels: [] };
    }

    const options = wrapperWithOptions.options;
    const labels = [];
    for (const button of options) {
      if (labels.length >= count) break;
      button.click();
      labels.push((button.textContent || "").trim());
    }
    return { available: options.length, selected: labels.length, labels };
  }, amount);

  await sleep(200);
  await page.keyboard.press("Escape").catch(() => {});
  return { opened: true, ...picked };
}

async function readMultiFilterSummary(page, labelText) {
  return page.evaluate((needle) => {
    const labels = Array.from(document.querySelectorAll("label"));
    const label = labels.find((entry) =>
      (entry.textContent || "").trim().toLowerCase().includes(needle.toLowerCase())
    );
    if (!label) return "";
    const container = label.closest("div");
    if (!container) return "";
    const trigger = container.querySelector("button");
    return trigger ? (trigger.textContent || "").trim() : "";
  }, labelText);
}

async function main() {
  let browser = null;
  try {
    const loginResult = await apiFetch(`${BACKEND_API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(LOGIN_PAYLOAD),
    });
    pushCheck("login API admin/admin 200", loginResult.response.status === 200, {
      status: loginResult.response.status,
    });
    pushCheck("token recebido", Boolean(loginResult.data?.token), null);
    const token = loginResult.data.token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    const triageResult = await apiFetch(`${BACKEND_API_URL}/social-triage?limit=10&offset=0`, {
      headers: authHeaders,
    });
    pushCheck("social-triage API 200", triageResult.response.status === 200, {
      status: triageResult.response.status,
    });
    const triageItems = Array.isArray(triageResult.data?.items) ? triageResult.data.items : [];
    pushCheck("fila triagem retornou itens", triageItems.length > 0, {
      total: triageResult.data?.total || 0,
    });
    const triagePatient = triageItems[0];

    const professionalsResult = await apiFetch(
      `${BACKEND_API_URL}/profissionais?for_agenda=1`,
      { headers: authHeaders }
    );
    pushCheck("profissionais API 200", professionalsResult.response.status === 200, {
      status: professionalsResult.response.status,
    });
    const professionalsRaw = Array.isArray(professionalsResult.data)
      ? professionalsResult.data
      : Array.isArray(professionalsResult.data?.professionals)
        ? professionalsResult.data.professionals
        : [];
    pushCheck("profissionais disponiveis", professionalsRaw.length > 0, {
      total: professionalsRaw.length,
    });
    const professional = professionalsRaw[0];

    const servicesResult = await apiFetch(`${BACKEND_API_URL}/services?active=true`, {
      headers: authHeaders,
    });
    pushCheck("services API 200", servicesResult.response.status === 200, {
      status: servicesResult.response.status,
    });
    const services = Array.isArray(servicesResult.data?.services)
      ? servicesResult.data.services
      : [];
    pushCheck("servicos ativos disponiveis", services.length > 0, { total: services.length });
    const service =
      services.find((entry) =>
        String(entry?.name || "").toLowerCase().includes("entrevista")
      ) || services[0];

    const today = new Date().toISOString().slice(0, 10);
    const createDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const createTime = `10:${runId.slice(-2)}`;
    const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const rangeResult = await apiFetch(
      `${BACKEND_API_URL}/profissionais/agenda/range?date_from=${today}&date_to=${inSevenDays}`,
      { headers: authHeaders }
    );
    pushCheck("agenda/range API 200", rangeResult.response.status === 200, {
      status: rangeResult.response.status,
    });
    pushCheck("agenda/range success=true", rangeResult.data?.success === true, null);

    browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    const page = await browser.newPage();
    page.setDefaultTimeout(90000);
    page.setDefaultNavigationTimeout(120000);

    await page.goto(FRONTEND_URL, { waitUntil: "networkidle2" });
    await saveScreenshot(page, "01-login");
    await page.waitForSelector("input[type='password']");
    const textInput =
      (await page.$("input[type='text']")) || (await page.$("input[type='email']"));
    pushCheck("campo de usuario no login visivel", Boolean(textInput), null);
    await textInput.click({ clickCount: 3 });
    await textInput.type("admin");
    const passInput = await page.$("input[type='password']");
    await passInput.click({ clickCount: 3 });
    await passInput.type("admin");
    const clickedLogin = await clickButtonByText(page, "Entrar");
    pushCheck("botao Entrar clicado", clickedLogin, null);
    await sleep(2500);
    await saveScreenshot(page, "02-pos-login");

    await page.goto(`${FRONTEND_URL}/agenda`, { waitUntil: "networkidle2" });
    await page.waitForFunction(
      () => (document.body.textContent || "").toLowerCase().includes("agenda")
    );
    await saveScreenshot(page, "03-agenda-aberta");
    pushCheck(
      "Agenda abre sem erro",
      (await page.content()).toLowerCase().includes("agenda"),
      null
    );
    pushCheck(
      "visao padrao Semana aparece",
      (await page.content()).toLowerCase().includes("semana"),
      null
    );

    const viewModes = ["Dia", "Semana", "Mes", "Lista"];
    for (const mode of viewModes) {
      const clicked = await clickButtonByText(page, mode);
      pushCheck(`modo ${mode} clicavel`, clicked, null);
      await sleep(500);
    }
    await saveScreenshot(page, "04-modos");

    const pageText = (await page.content()).toLowerCase();
    pushCheck("filtro profissional visivel", pageText.includes("profissional"), null);
    pushCheck("filtro servico visivel", pageText.includes("servico"), null);
    pushCheck("filtro status visivel", pageText.includes("status"), null);
    const profPick = await pickOptionsInMultiFilter(page, "Profissional", 2);
    const profSummary = await readMultiFilterSummary(page, "Profissional");
    const profTarget = Math.min(2, Math.max(1, profPick.available || 0));
    pushCheck(
      "multi-selecao profissional funciona",
      profPick.opened &&
        profPick.selected >= profTarget &&
        !profSummary.toLowerCase().includes("todos os profissionais"),
      { available: profPick.available, selected: profPick.selected, summary: profSummary }
    );

    const servicePick = await pickOptionsInMultiFilter(page, "Servico", 2);
    const serviceSummary = await readMultiFilterSummary(page, "Servico");
    const serviceTarget = Math.min(2, Math.max(1, servicePick.available || 0));
    pushCheck(
      "multi-selecao servico funciona",
      servicePick.opened &&
        servicePick.selected >= serviceTarget &&
        !serviceSummary.toLowerCase().includes("todos os servicos"),
      { available: servicePick.available, selected: servicePick.selected, summary: serviceSummary }
    );

    const statusPick = await pickOptionsInMultiFilter(page, "Status", 2);
    const statusSummary = await readMultiFilterSummary(page, "Status");
    const statusTarget = Math.min(2, Math.max(1, statusPick.available || 0));
    pushCheck(
      "multi-selecao status funciona",
      statusPick.opened &&
        statusPick.selected >= statusTarget &&
        !statusSummary.toLowerCase().includes("todos os status"),
      { available: statusPick.available, selected: statusPick.selected, summary: statusSummary }
    );

    const auxPanelClicked = await clickButtonByText(page, "Painel auxiliar");
    pushCheck("toggle do painel auxiliar funciona", auxPanelClicked, null);
    await sleep(500);
    const pageTextWithPanel = (await page.content()).toLowerCase();
    pushCheck("legenda de cores visivel", pageTextWithPanel.includes("legenda de cores"), null);
    pushCheck(
      "painel pendentes da triagem visivel",
      pageTextWithPanel.includes("pendentes de agendamento"),
      null
    );

    const openedCreatePanel = await clickButtonByText(page, "Novo agendamento");
    pushCheck("botao Novo agendamento clicado", openedCreatePanel, null);
    await sleep(300);
    pushCheck(
      "painel de criacao visivel",
      (await page.content()).toLowerCase().includes("criar agendamento"),
      null
    );
    const patientIdFilled = await typeBySelector(page, "input[placeholder='ID do assistido']", String(triagePatient.patient_id));
    pushCheck("patient id preenchido", patientIdFilled, null);
    const selectProfessionalOk = await selectComboboxFromEnd(
      page,
      2,
      String(professional.user_name || professional.professional_name || professional.id)
    );
    pushCheck("selecao de profissional funcionando", selectProfessionalOk, null);
    const selectServiceOk = await selectComboboxFromEnd(page, 1, String(service.name));
    pushCheck("selecao de servico funcionando", selectServiceOk, null);
    const dateFilled = await setNativeValueBySelector(page, "input[type='date']", createDate);
    pushCheck("data preenchida", dateFilled, null);
    const timeFilled = await typeBySelector(page, "input[placeholder='HH:MM']", createTime);
    pushCheck("horario preenchido", timeFilled, null);
    const notesFilled = await typeBySelector(page, "textarea[placeholder='Detalhes do agendamento']", `SMOKE AGENDA ${runId}`);
    pushCheck("observacoes preenchidas", notesFilled, null);

    const createResponsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/api/profissionais/") &&
          response.url().includes("/agenda") &&
          !response.url().includes("/status"),
        { timeout: 30000 }
      )
      .catch(() => null);
    const clickedCreateLabel = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button")).reverse();
      const target = buttons.find((button) =>
        (button.textContent || "").trim().toLowerCase().includes("criar agendamento")
      );
      if (!target || target.disabled) return null;
      target.click();
      return (target.textContent || "").trim();
    });
    pushCheck("botao criar agendamento clicado", Boolean(clickedCreateLabel), {
      button: clickedCreateLabel,
    });
    const createResponse = await createResponsePromise;
    let createPayload = null;
    if (createResponse) {
      try {
        createPayload = await createResponse.json();
      } catch {
        createPayload = null;
      }
      recordApi(createResponse.url(), createResponse.status());
    }
    await sleep(1500);
    const toastsAfterCreate = await readToastMessages(page);
    const createApiOk =
      Boolean(createResponse) &&
      (createResponse.status() === 200 || createResponse.status() === 201) &&
      (createPayload?.success === true || createPayload?.persisted === true);
    pushCheck(
      "criar agendamento funciona",
      createApiOk ||
        toastsAfterCreate.some((text) => text.toLowerCase().includes("agendamento criado")),
      {
        api_status: createResponse ? createResponse.status() : null,
        api_success: createPayload?.success ?? null,
        api_message: createPayload?.message ?? null,
        toasts: toastsAfterCreate,
      }
    );
    await saveScreenshot(page, "05-agendamento-criado");

    let detailModalVisible = (await page.content()).toLowerCase().includes("detalhes do agendamento");
    if (!detailModalVisible) {
      await clickButtonByText(page, "Lista");
      await sleep(800);
      const hasDetailsButton = await clickButtonByText(page, "Detalhes");
      pushCheck("detalhe do evento abre", hasDetailsButton, null);
      await sleep(800);
      detailModalVisible = (await page.content()).toLowerCase().includes("detalhes do agendamento");
    } else {
      pushCheck("detalhe do evento abre", true, { source: "modal-pos-criacao" });
    }
    pushCheck(
      "modal de detalhes visivel",
      detailModalVisible,
      null
    );

    const confirmResponsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/api/profissionais/") &&
          response.url().includes("/agenda/") &&
          response.url().includes("/status"),
        { timeout: 30000 }
      )
      .catch(() => null);
    const confirmClicked = await clickEnabledButtonByText(page, "Confirmar");
    pushCheck("acao confirmar disponivel", confirmClicked, null);
    const confirmResponse = await confirmResponsePromise;
    let confirmPayload = null;
    if (confirmResponse) {
      try {
        confirmPayload = await confirmResponse.json();
      } catch {
        confirmPayload = null;
      }
      recordApi(confirmResponse.url(), confirmResponse.status());
    }
    await sleep(1200);
    const confirmToasts = await readToastMessages(page);
    pushCheck(
      "confirmar continua funcionando",
      (Boolean(confirmResponse) &&
        confirmResponse.status() === 200 &&
        (confirmPayload?.success === true || confirmPayload?.persisted === true)) ||
        confirmToasts.some((text) => text.toLowerCase().includes("status atualizado")),
      {
        api_status: confirmResponse ? confirmResponse.status() : null,
        api_success: confirmPayload?.success ?? null,
        api_message: confirmPayload?.message ?? null,
        toasts: confirmToasts,
      }
    );

    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });
    const cancelResponsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/api/profissionais/") &&
          response.url().includes("/agenda/") &&
          response.url().includes("/status"),
        { timeout: 30000 }
      )
      .catch(() => null);
    const cancelClicked = await clickEnabledButtonByText(page, "Cancelar");
    pushCheck("acao cancelar disponivel", cancelClicked, null);
    const cancelResponse = await cancelResponsePromise;
    let cancelPayload = null;
    if (cancelResponse) {
      try {
        cancelPayload = await cancelResponse.json();
      } catch {
        cancelPayload = null;
      }
      recordApi(cancelResponse.url(), cancelResponse.status());
    }
    await sleep(1200);
    const cancelToasts = await readToastMessages(page);
    pushCheck(
      "cancelar continua funcionando",
      (Boolean(cancelResponse) &&
        cancelResponse.status() === 200 &&
        (cancelPayload?.success === true || cancelPayload?.persisted === true)) ||
        cancelToasts.some((text) => text.toLowerCase().includes("status atualizado")),
      {
        api_status: cancelResponse ? cancelResponse.status() : null,
        api_success: cancelPayload?.success ?? null,
        api_message: cancelPayload?.message ?? null,
        toasts: cancelToasts,
      }
    );
    await saveScreenshot(page, "06-detalhe-confirmar-cancelar");

    await page.goto(`${FRONTEND_URL}/triagem-social`, { waitUntil: "networkidle2" });
    await page.waitForFunction(
      () => (document.body.textContent || "").toLowerCase().includes("triagem social")
    );
    await saveScreenshot(page, "07-triagem-social");
    const clickedScheduleFromTriage = await clickButtonByText(page, "Agendar entrevista");
    pushCheck(
      "botao Agendar entrevista na Triagem clicavel",
      clickedScheduleFromTriage,
      null
    );
    await sleep(2200);
    const currentUrl = page.url();
    pushCheck("navegacao triagem -> agenda ok", currentUrl.includes("/agenda"), {
      url: currentUrl,
    });
    pushCheck(
      "contexto de entrada triagem no URL",
      currentUrl.includes("entry=triagem_social"),
      { url: currentUrl }
    );
    pushCheck(
      "agenda continua visivel apos entrada pela triagem",
      (await page.content()).toLowerCase().includes("visualizacao"),
      null
    );
    const triageContextPatientId = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll("label"));
      const label = labels.find((entry) =>
        (entry.textContent || "").trim().toLowerCase().includes("patient id")
      );
      if (!label) return null;
      const container = label.closest("div");
      if (!container) return null;
      const input = container.querySelector("input");
      return input ? (input.value || "").trim() : null;
    });
    pushCheck(
      "agenda abre com patient_id preenchido vindo da triagem",
      Boolean(triageContextPatientId && triageContextPatientId.length > 0),
      { patient_id: triageContextPatientId }
    );
    await saveScreenshot(page, "08-agenda-contexto-triagem");

    const manualInvalidUrl = `${FRONTEND_URL}/agenda?patient_id=${encodeURIComponent(
      String(triagePatient.patient_id)
    )}&entry=triagem_social&service_id=servico_invalido_smoke`;
    await page.goto(manualInvalidUrl, { waitUntil: "networkidle2" });
    await sleep(1800);
    const invalidServiceText = ((await page.content()) || "").toLowerCase();
    const invalidServiceToasts = await readToastMessages(page);
    const currentUrlAfterInvalid = page.url();
    const hasFriendlyToast =
      invalidServiceText.includes("servico informado pela triagem social nao foi encontrado") ||
      invalidServiceToasts.some((text) =>
        text.toLowerCase().includes("servico informado pela triagem social nao foi encontrado")
      );
    pushCheck(
      "integracao trata servico invalido sem quebrar experiencia",
      (hasFriendlyToast || !currentUrlAfterInvalid.includes("service_id=")) &&
        (await page.content()).toLowerCase().includes("agenda") &&
        (await page.content()).toLowerCase().includes("visualizacao"),
      {
        url: currentUrlAfterInvalid,
        toast_count: invalidServiceToasts.length,
      }
    );
    await saveScreenshot(page, "09-servico-invalido-friendly");

    report.status = "ok";
  } catch (error) {
    report.status = "failed";
    report.error = {
      message: error?.message || String(error),
      stack: error?.stack || null,
    };
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.summary = {
      total: report.checks.length,
      passed: report.checks.filter((entry) => entry.ok).length,
      failed: report.checks.filter((entry) => !entry.ok).length,
    };
    const reportPath = path.join(reportDir, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`REPORT_PATH=${reportPath}`);
    if (browser) {
      await browser.close();
    }
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
