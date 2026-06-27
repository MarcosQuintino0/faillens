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
  assert.deepEqual(item.requests[0].generatedVariables, ["$USER_ID", "$TOKEN"]);
  assert.equal(item.diagnosis.category, "validation-not-applied");
  assert.doesNotMatch(JSON.stringify(report), /segredo|"123"/);
});

test("gera HTML offline autocontido e sem segredos", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-html-"));
  const report = buildReportModel(rawSpec());
  const file = await generateHtml(report, directory);
  const html = await fs.readFile(file, "utf8");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Sequência de chamadas/);
  assert.match(html, /faillens-data/);
  assert.doesNotMatch(html, /segredo|fonts\.googleapis|cdn\./i);
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
