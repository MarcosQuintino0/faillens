const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const {
  normalizeCyRequestArgs,
  maskSensitiveData,
  maskUrl,
  generateCurl,
  buildReportModel,
  generateHtml,
} = require("../dist");
const { parseAssertionError } = require("../dist/reporter/diagnostics/parseAssertionError");
const { initCommand } = require("../dist/cli/init");
const { extractSourceAssertions } = require("../dist/collector/extractSourceAssertions");
const { normalizeRedirects } = require("../dist/cypress/support/autoCapture");

test("normaliza o rastro de redirects exposto pelo Cypress", () => {
  assert.deepEqual(normalizeRedirects([
    "302: http://localhost:3333/redirect/2",
    "302: http://localhost:3333/redirect/1",
    "302: http://localhost:3333/final",
  ]), [
    { statusCode: 302, location: "http://localhost:3333/redirect/2" },
    { statusCode: 302, location: "http://localhost:3333/redirect/1" },
    { statusCode: 302, location: "http://localhost:3333/final" },
  ]);
});

test("extrai o plano de assertions do spec sem executar o teste", () => {
  const source = `
    it('valida contrato', () => {
      expect(response.status, 'Status deve ser 400').to.eq(400);
      expect(
        response.body,
        'Body deve conter a chave error'
      ).to.have.property('error');
    });
  `;
  const planned = extractSourceAssertions(source, "api.cy.js");
  assert.equal(planned[0].title, "valida contrato");
  assert.deepEqual(planned[0].assertions.map((item) => item.title), [
    "Status deve ser 400",
    "Body deve conter a chave error",
  ]);
  assert.equal(planned[0].assertions[0].target, "status");
  assert.equal(planned[0].assertions[1].target, "body");
  assert.deepEqual(planned[0].statusExpectation, {
    type: "exact",
    label: "400",
    expected: 400,
  });
});

test("extrai conjunto e intervalo de status HTTP do source", () => {
  const source = `
    it('aceita erro controlado', () => {
      expect(response.status, 'Erro esperado (4xx/5xx)').to.be.oneOf([400, 500]);
    });
    it('aceita qualquer 4xx', () => {
      expect(response.status).to.be.gte(400).and.lt(500);
    });
  `;
  const planned = extractSourceAssertions(source, "status.cy.js");
  assert.deepEqual(planned[0].statusExpectation, {
    type: "set",
    label: "4xx/5xx",
    values: [400, 500],
  });
  assert.deepEqual(planned[1].statusExpectation, {
    type: "family",
    label: "4xx",
    min: 400,
    max: 499,
  });
});

test("normaliza as quatro assinaturas suportadas de cy.request", () => {
  assert.deepEqual(normalizeCyRequestArgs(["/health"], "http://localhost:3000"), {
    method: "GET",
    url: "http://localhost:3000/health",
    originalUrl: "/health",
    headers: {},
    body: null,
    failOnStatusCode: undefined,
    originalArgsShape: "url",
  });
  assert.equal(normalizeCyRequestArgs(["GET", "/users"]).method, "GET");
  assert.deepEqual(normalizeCyRequestArgs(["POST", "/users", { name: "Ana" }]).body, { name: "Ana" });
  const options = normalizeCyRequestArgs([{ method: "patch", url: "/users/1", headers: { a: "b" }, body: { ok: true }, failOnStatusCode: false }]);
  assert.equal(options.method, "PATCH");
  assert.equal(options.failOnStatusCode, false);
});

test("mascara dados sensíveis em objetos, URL e cURL", () => {
  const value = maskSensitiveData({
    authorization: "Bearer segredo-real",
    nested: { password: "123", accessToken: "abc", safe: "visível" },
  });
  assert.equal(value.authorization, "Bearer <TOKEN>");
  assert.equal(value.nested.password, "***");
  assert.equal(value.nested.accessToken, "***");
  assert.equal(value.nested.safe, "visível");
  assert.equal(maskUrl("/users?token=real&view=full"), "/users?token=***&view=full");
  const curl = generateCurl({ method: "POST", url: "/users?apiKey=real", headers: { Authorization: "Bearer real" }, body: { senha: "real" } });
  assert.doesNotMatch(curl, /Bearer real|apiKey=real|"real"/);
  assert.match(curl, /Bearer <TOKEN>/);
  assert.equal(
    maskSensitiveData("Login deve devolver um token: expected **fake-jwt-token** to be a string"),
    "Login deve devolver um token: expected *** to be a string",
  );
});

test("extrai expected, actual e mensagem descritiva de AssertionError", () => {
  const simple = parseAssertionError({ message: "expected 201 to equal 400" });
  assert.equal(simple.actual, 201);
  assert.equal(simple.expected, 400);
  const descriptive = parseAssertionError({ message: "Deve retornar 400 quando email não for informado: expected 201 to equal 400" });
  assert.equal(descriptive.assertionMessage, "Deve retornar 400 quando email não for informado");
  const got = parseAssertionError({ message: "expected response.status to equal 400 but got 201" });
  assert.equal(got.expected, 400);
  assert.equal(got.actual, 201);
  const below = parseAssertionError({ message: "expected 500 to be below 400" });
  assert.equal(below.actual, 500);
  assert.equal(below.expected, 400);
});

function rawSpec() {
  return [{
    specPath: "cypress/e2e/users.cy.js",
    durationMs: 550,
    tests: [{
      id: "test-1",
      title: "Criar usuário sem e-mail deve retornar 400",
      state: "failed",
      durationMs: 550,
      error: { name: "AssertionError", message: "expected 201 to equal 400", expected: 400, actual: 201 },
      requests: [{
        id: "req-1", order: 1, phase: "chamada", method: "POST", url: "http://localhost:3333/usuarios?token=segredo",
        originalUrl: "/usuarios?token=segredo", requestHeaders: { Authorization: "Bearer segredo" },
        requestBody: { name: "Ana", password: "123" }, receivedStatus: 201,
        responseHeaders: { "set-cookie": "sid=segredo" }, responseBody: { id: 42, accessToken: "segredo" },
        durationMs: 142, curl: "",
      }],
    }],
  }];
}

test("monta relatório, infere request principal, fase, variável e diagnóstico", () => {
  const report = buildReportModel(rawSpec(), { config: { theme: "dark", maskFields: [] } });
  const item = report.specs[0].tests[0];
  assert.equal(report.summary.failed, 1);
  assert.equal(report.summary.requests, 1);
  assert.equal(item.mainRequestId, "req-1");
  assert.equal(item.requests[0].phase, "validacao");
  // Encadeamento é determinístico: um valor só vira variável se for reusado por
  // um request POSTERIOR. Com um único request, nada encadeia.
  assert.deepEqual(item.requests[0].generatedVariables, []);
  assert.equal(item.diagnosis.category, "validation-not-applied");
  assert.equal(item.assertions.length, 1);
  assert.equal(item.assertions[0].state, "failed");
  assert.equal(item.assertions[0].expected, 400);
  assert.doesNotMatch(JSON.stringify(report), /segredo|"123"/);
});

test("gera HTML offline autocontido e sem segredos", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-html-"));
  const report = buildReportModel(rawSpec());
  const file = await generateHtml(report, directory);
  const html = await fs.readFile(file, "utf8");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Sequência de chamadas/);
  assert.match(html, /Motivo da falha/);
  assert.match(html, /Esperado vs\. recebido/);
  assert.match(html, /Script de reprodução/);
  assert.match(html, /data-detail-tab="script"/);
  assert.match(html, /diff-line/);
  assert.match(html, /Copiado para a área de transferência/);
  assert.match(html, /sequence-legend/);
  assert.match(html, /request-row/);
  assert.doesNotMatch(html, /request-variable/);
  assert.match(html, /faillens-data/);
  assert.doesNotMatch(html, /segredo|fonts\.googleapis|cdn\.|<link[^>]+stylesheet|<script[^>]+src=/i);
});

test("init adiciona script e não sobrescreve valor existente", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-init-"));
  const packageFile = path.join(directory, "package.json");
  await fs.writeFile(packageFile, JSON.stringify({ name: "consumer", scripts: {} }));
  assert.equal(await initCommand(directory), 0);
  let manifest = JSON.parse(await fs.readFile(packageFile, "utf8"));
  assert.equal(manifest.scripts["test:report"], "faillens run");
  manifest.scripts["test:report"] = "custom";
  await fs.writeFile(packageFile, JSON.stringify(manifest));
  await initCommand(directory);
  manifest = JSON.parse(await fs.readFile(packageFile, "utf8"));
  assert.equal(manifest.scripts["test:report"], "custom");
});
