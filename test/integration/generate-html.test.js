"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { buildReportModel, generateHtml } = require("../../dist");

async function buildAndGenerate(specs = [], config = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-html-"));
  const report = buildReportModel(specs, { config });
  const file = await generateHtml(report, dir);
  const html = await fs.readFile(file, "utf8");
  return { dir, file, html, report };
}

function makeSpec(tests) {
  return {
    specPath: "cypress/e2e/users.cy.js",
    durationMs: 500,
    tests,
  };
}

function makeTest(id, state = "failed") {
  return {
    id,
    title: "Deve retornar 400",
    titlePath: ["Suite", "Deve retornar 400"],
    state,
    durationMs: 150,
    error: state === "failed"
      ? { name: "AssertionError", message: "expected 201 to equal 400", expected: 400, actual: 201 }
      : undefined,
    requests: [{
      id: "req-1",
      order: 1,
      phase: "chamada",
      method: "POST",
      url: "http://localhost:3333/users",
      originalUrl: "/users",
      requestHeaders: { authorization: "Bearer segredo-header" },
      requestBody: { password: "segredo-body", name: "Ana" },
      responseHeaders: {},
      responseBody: { id: 1, accessToken: "segredo-response" },
      receivedStatus: 201,
      durationMs: 100,
      curl: "",
    }],
  };
}

test("arquivo HTML é criado no outputDir", async () => {
  const { dir, file } = await buildAndGenerate();
  assert.ok(file.startsWith(dir));
  assert.ok(file.endsWith(".html"));
  const stat = await fs.stat(file);
  assert.ok(stat.size > 0);
});

test("HTML começa com doctype", async () => {
  const { html } = await buildAndGenerate();
  assert.match(html, /^<!doctype html>/i);
});

test("HTML não tem links externos — sem CDN, fontes, scripts externos", async () => {
  const { html } = await buildAndGenerate([makeSpec([makeTest("t1")])]);
  assert.doesNotMatch(html, /<link[^>]+href="https?:/i);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/i);
  assert.doesNotMatch(html, /fonts\.googleapis/i);
  assert.doesNotMatch(html, /cdn\./i);
});

test("dados sensíveis não aparecem no HTML após mascaramento", async () => {
  const { html } = await buildAndGenerate([makeSpec([makeTest("t1")])]);
  assert.doesNotMatch(html, /segredo-header/);
  assert.doesNotMatch(html, /segredo-body/);
  assert.doesNotMatch(html, /segredo-response/);
});

test("HTML contém elemento faillens-data com JSON embutido", async () => {
  const { html } = await buildAndGenerate([makeSpec([makeTest("t1")])]);
  assert.match(html, /faillens-data/);
  assert.match(html, /application\/json/);
  assert.doesNotMatch(html, /Evidência de persistência/i);
  assert.match(html, /test\.persistenceEvidence && test\.persistenceEvidence\.summary/);
});

test("JSON embutido é válido e contém os dados do relatório", async () => {
  const { html } = await buildAndGenerate([makeSpec([makeTest("t1")])]);
  const match = html.match(/<script[^>]+id="faillens-data"[^>]*>([\s\S]+?)<\/script>/);
  assert.ok(match, "elemento faillens-data não encontrado");
  const data = JSON.parse(match[1]);
  assert.ok(data.specs);
  assert.ok(data.summary);
});

test("JavaScript interativo embutido é sintaticamente válido", async () => {
  const { html } = await buildAndGenerate([makeSpec([makeTest("t1")])]);
  const scripts = [...html.matchAll(/<script(?![^>]+type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0][1]));
});

test("HTML contém as seções principais do relatório", async () => {
  const { html } = await buildAndGenerate([makeSpec([makeTest("t1")])]);
  assert.match(html, /Sequência de chamadas|sequence-legend|request-row/);
  assert.match(html, /Motivo da falha|diagnosis/);
  assert.match(html, /Esperado vs\. recebido|diff-line/);
  assert.match(html, /Script de reprodução|data-detail-tab="script"/);
  assert.match(html, /Evidência para o dev|data-detail-tab="evidence"/);
  assert.match(html, /Copiado para a área de transferência/);
  assert.match(html, /redirect-badge/);
  assert.match(html, /redirect-trail/);
});

test("toolbar mantém as três abas na ordem, com ARIA e navegação por teclado", async () => {
  const { html } = await buildAndGenerate([makeSpec([makeTest("t1")])]);
  assert.match(html, /role="tablist"[\s\S]*data-detail-tab="call"[\s\S]*data-detail-tab="script"[\s\S]*data-detail-tab="evidence"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /aria-selected=/);
  assert.match(html, /ArrowRight|ArrowLeft/);
});

test("aba de evidência inclui resumo, cURL, ações e estado sem screenshot", async () => {
  const { html } = await buildAndGenerate([makeSpec([makeTest("t1")])]);
  assert.match(html, /Evidência para o desenvolvedor/);
  assert.match(html, /Copiar evidência/);
  assert.match(html, /Copiar cURL/);
  assert.match(html, /Abrir screenshot/);
  assert.match(html, /O Cypress não gerou screenshot para este teste/);
  assert.match(html, /Evidência completa copiada: texto, cURL e imagem/);
  assert.match(html, /Texto e cURL copiados\. O navegador bloqueou a cópia automática da imagem/);
  assert.match(html, /Evidência textual copiada\. Use “Abrir screenshot” para copiar a imagem/);
});

test("screenshot usa link relativo seguro e nunca embute bytes PNG", async () => {
  const test_ = makeTest("shot");
  test_.evidence = { screenshots: [{
    relativePath: "cypress/screenshots/usuários.cy.js/falha (failed).png",
    href: "../../cypress/screenshots/usu%C3%A1rios.cy.js/falha%20(failed).png",
    fileName: "falha (failed).png",
    size: 123,
    kind: "failure",
  }] };
  const { html } = await buildAndGenerate([makeSpec([test_])]);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /usu%C3%A1rios\.cy\.js/);
  assert.match(html, /class="evidence-preview"/);
  assert.match(html, /data-evidence-preview/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /Clique com o botão direito na imagem para copiá-la/);
  assert.match(html, /detail\.querySelector\("\[data-evidence-preview\]"\)/);
  assert.doesNotMatch(html, /data:image\/png;base64|iVBORw0KGgo|PNG\r?\n/);
});

test("preview do screenshot só é criado no conteúdo da aba de evidência", async () => {
  const { html } = await buildAndGenerate([makeSpec([makeTest("t1")])]);
  assert.match(html, /state\.view === "evidence"\) prepareEvidenceImage/);
  const staticMarkup = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  assert.doesNotMatch(staticMarkup, /<img[^>]+evidence-preview/i);
});

test("CSP continua offline e permite somente imagens relativas, data e blob", async () => {
  const { html } = await buildAndGenerate();
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /img-src 'self' data: blob:/);
  assert.doesNotMatch(html, /connect-src \*|<(?:script|link|img)[^>]+(?:src|href)="https?:\/\//i);
});

test("cliente ativa transporte local, lifecycle e leitura direta do PNG somente em localhost", async () => {
  const { html } = await buildAndGenerate([makeSpec([makeTest("t1")])]);
  assert.match(html, /localToken = \/\^https\?:\$\//);
  assert.match(html, /\/__faillens\/evidence\?token=/);
  assert.match(html, /fetch\(evidenceUrl\(screenshot\)/);
  assert.match(html, /new EventSource\("\/__faillens\/events\?token=/);
  assert.match(html, /window\.addEventListener\("pagehide"/);
});

test("tema dark aplicado por padrão", async () => {
  const { html } = await buildAndGenerate();
  assert.match(html, /data-theme="dark"/);
});

test("tema light aplicado quando configurado", async () => {
  const { html } = await buildAndGenerate([], { theme: "light" });
  assert.match(html, /data-theme="light"/);
});

test("FailLens mencionado no HTML", async () => {
  const { html } = await buildAndGenerate();
  assert.match(html, /FailLens/);
});

test("relatório sem testes — HTML gerado sem erros", async () => {
  const { html } = await buildAndGenerate([]);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /FailLens/);
});

test("botão de exportação presente", async () => {
  const { html } = await buildAndGenerate();
  assert.match(html, /export-report|Exportar relatório/);
});

test("filtro de busca presente", async () => {
  const { html } = await buildAndGenerate();
  assert.match(html, /filter|Filtrar testes/);
});

test("HTML escapa caracteres especiais no nome do projeto", async () => {
  const { html } = await buildAndGenerate([], { projectName: 'Projeto <"especial">' });
  assert.doesNotMatch(html, /<"especial">/);
  assert.match(html, /&lt;|&quot;/);
});

test("HTML usa expectativa HTTP separada e suporta destaque de blocos", async () => {
  const test_ = makeTest("t1");
  test_.statusExpectation = { type: "range", label: "4xx/5xx", min: 400, max: 599 };
  test_.error = {
    name: "AssertionError",
    message: "expected body to not have property 'trace'",
    expected: "ausência de trace",
    actual: "trace presente",
  };
  test_.assertions = [{
    id: "a1",
    title: "Body não deve conter trace",
    target: "body",
    state: "failed",
    message: "expected body to not have property 'trace'",
  }];
  test_.requests[0].receivedStatus = 500;
  test_.requests[0].responseBody = { status: 500, trace: ["erro", "stack"] };
  const { html, report } = await buildAndGenerate([makeSpec([test_])]);
  assert.equal(report.specs[0].tests[0].statusExpectation.label, "4xx/5xx");
  assert.equal(report.specs[0].tests[0].statusExpectation.actual, 500);
  assert.match(html, /payloadDiff|diff-block-start|statusExpectation/);
});

test("HTML preserva evidência visual para campo nulo em resposta de teste falho", async () => {
  const test_ = makeTest("null-field");
  test_.title = "Criar usuário sem e-mail deve retornar 400";
  test_.titlePath = ["Usuários", test_.title];
  test_.error = {
    name: "AssertionError",
    message: "Deve retornar 400 quando email não for informado: expected 201 to equal 400",
    expected: 400,
    actual: 201,
  };
  test_.assertions = [{
    id: "status",
    title: "Deve retornar 400 quando email não for informado",
    target: "status",
    state: "failed",
    expected: 400,
    actual: 201,
  }];
  test_.requests[0].receivedStatus = 201;
  test_.requests[0].responseBody = { id: "usr-1", email: null, createdAt: "2026-01-01" };

  const { html } = await buildAndGenerate([makeSpec([test_])]);
  const match = html.match(/<script[^>]+id="faillens-data"[^>]*>([\s\S]+?)<\/script>/);
  assert.ok(match, "JSON embutido não encontrado");
  const embedded = JSON.parse(match[1]);
  assert.deepEqual(embedded.specs[0].tests[0].payloadDiff, [{
    path: "$.email",
    kind: "value",
    reason: "Valor nulo observado no campo email da resposta.",
    evidenceOnly: true,
  }]);
  assert.match(html, /diffRanges\(lines, test\.payloadDiff/);
  assert.match(html, /diff-block-start/);
});

test("teste aprovado não marca campo nulo como evidência de falha", async () => {
  const test_ = makeTest("passed-null", "passed");
  test_.requests[0].responseBody = { optionalField: null };
  const { report } = await buildAndGenerate([makeSpec([test_])]);
  assert.deepEqual(report.specs[0].tests[0].payloadDiff, []);
});
