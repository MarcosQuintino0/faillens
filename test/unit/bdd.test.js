"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildReportModel } = require("../../dist");

function request(id, overrides = {}) {
  return {
    id,
    order: 1,
    phase: "chamada",
    method: "POST",
    url: "http://localhost:3333/usuarios",
    originalUrl: "/usuarios",
    requestHeaders: {},
    requestBody: { nome: "Ana" },
    responseHeaders: {},
    responseBody: { id: 42, nome: "Ana" },
    receivedStatus: 201,
    durationMs: 10,
    curl: "curl ...",
    ...overrides,
  };
}

function rule(overrides = {}) {
  return {
    id: "nome-obrigatorio",
    attributes: { operation: "POST", field: "nome", condition: "missing" },
    status: 400,
    raw: "",
    ...overrides,
  };
}

function contract(rules = [rule()]) {
  return {
    id: "usuarios",
    api: ["POST /usuarios", "GET /usuarios/{id}"],
    fields: [{ name: "nome", type: "string", attributes: { required: true }, raw: "" }],
    rules,
    cobertura: [],
    sourceFiles: ["api/crud.cy.js"],
    legacy: false,
    warnings: [],
  };
}

function failedTest(overrides = {}) {
  return {
    id: "t1",
    title: "deve rejeitar usuário sem nome",
    state: "failed",
    durationMs: 10,
    error: { name: "AssertionError", message: "expected 201 to equal 400", expected: 400, actual: 201 },
    ruleRefs: [{ ruleId: "nome-obrigatorio", resolved: false }],
    requests: [request("main", { requestBody: { email: "ana@example.test" } })],
    ...overrides,
  };
}

function build(testObject, rules = [rule()]) {
  const report = buildReportModel([
    { specPath: "api/crud.cy.js", durationMs: 0, tests: [], contract: contract(rules) },
    { specPath: "api/validacoes.cy.js", durationMs: 0, tests: [testObject] },
  ]);
  return report.specs.find((item) => item.specPath.endsWith("validacoes.cy.js")).tests[0];
}

test("BDD — campo obrigatório ausente usa contrato, execução e assertion concordante", () => {
  const result = build(failedTest());
  assert.equal(result.bddScenario.text, [
    'DADO que o payload não continha o campo obrigatório "nome"',
    "QUANDO foi executado POST /usuarios",
    "ENTÃO a API retornou HTTP 201 Created",
    "MAS o teste e o contrato esperavam HTTP 400 Bad Request",
  ].join("\n"));
  assert.equal(result.bddScenario.lines.length, 4);
  assert.ok(result.bddScenario.lines.every((line) => line.sources.length > 0));
});

test("BDD — conflito entre assertion e contrato é apresentado sem escolher uma fonte", () => {
  const result = build(failedTest({
    error: { name: "AssertionError", message: "expected 201 to equal 422", expected: 422, actual: 201 },
  }));
  assert.match(result.bddScenario.text, /MAS o teste esperava HTTP 422 Unprocessable Entity e o contrato declara HTTP 400 Bad Request/);
});

test("BDD — contrato escolhe a última operação correspondente quando setup e ação têm o mesmo método", () => {
  const duplicate = rule({
    id: "codigo-duplicado",
    attributes: { operation: "POST", field: "codigo", condition: "duplicate" },
    status: 409,
  });
  const result = build(failedTest({
    ruleRefs: [{ ruleId: "codigo-duplicado", resolved: false }],
    error: { name: "AssertionError", message: "expected 201 to equal 409", expected: 409, actual: 201 },
    requests: [
      request("setup", { order: 1, requestBody: { codigo: 42 }, responseBody: { id: 1, codigo: 42 } }),
      request("action", { order: 2, requestBody: { codigo: 42 }, responseBody: { id: 2, codigo: 42 } }),
    ],
  }), [duplicate]);
  assert.equal(result.mainRequestId, "action");
  assert.match(result.bddScenario.text, /DADO que o valor 42 do campo "codigo" já estava associado a outro recurso/);
  assert.match(result.bddScenario.text, /MAS o teste e o contrato esperavam HTTP 409 Conflict/);
});

test("BDD — timeout explícito não inventa expectativa", () => {
  const timeout = failedTest({
    ruleRefs: [],
    error: { name: "Error", message: "cy.request timed out after 30000ms" },
    requests: [request("main", { method: "GET", url: "http://localhost:3333/usuarios/42", originalUrl: "/usuarios/42", receivedStatus: undefined })],
  });
  const report = buildReportModel([{ specPath: "timeout.cy.js", durationMs: 0, tests: [timeout] }]);
  assert.equal(report.specs[0].tests[0].bddScenario.text, [
    "QUANDO foi executado GET /usuarios/42",
    "ENTÃO a requisição excedeu o tempo limite configurado",
    "E não houve resposta HTTP",
  ].join("\n"));
});

test("BDD — ausência de Authorization é descrita apenas com expectativa de bloqueio", () => {
  const source = failedTest({
    ruleRefs: [],
    error: { name: "AssertionError", message: "expected 200 to equal 403", expected: 403, actual: 200 },
    requests: [request("main", { method: "GET", requestHeaders: {}, receivedStatus: 200 })],
  });
  const report = buildReportModel([{ specPath: "auth.cy.js", durationMs: 0, tests: [source] }]);
  assert.match(report.specs[0].tests[0].bddScenario.text, /DADO que a requisição foi enviada sem o header Authorization/);
});

test("BDD — erro de rede usa somente erro e ausência de resposta observados", () => {
  const source = failedTest({
    ruleRefs: [],
    error: { name: "Error", message: "ECONNREFUSED connect failed" },
    requests: [request("main", { method: "GET", receivedStatus: undefined })],
  });
  const report = buildReportModel([{ specPath: "network.cy.js", durationMs: 0, tests: [source] }]);
  assert.equal(report.specs[0].tests[0].bddScenario.text, [
    "QUANDO foi executado GET /usuarios",
    "ENTÃO a requisição terminou sem resposta HTTP",
    "E o Cypress registrou um erro de conexão",
  ].join("\n"));
});

test("BDD — consequência de persistência só aparece quando confirmada", () => {
  const result = build(failedTest({
    requests: [
      request("main", { requestBody: { email: "ana@example.test" } }),
      request("verify", {
        order: 2, method: "GET", url: "http://localhost:3333/usuarios/42", originalUrl: "/usuarios/42",
        requestBody: null, responseBody: { id: 42, email: "ana@example.test" }, receivedStatus: 200,
      }),
    ],
  }));
  assert.equal(result.persistenceEvidence.state, "confirmed-created");
  assert.match(result.bddScenario.text, /E uma consulta posterior confirmou que o recurso foi criado com os dados enviados/);
});

test("BDD — teste aprovado não recebe cenário", () => {
  const result = build(failedTest({ state: "passed", error: undefined }));
  assert.equal(result.bddScenario, undefined);
});

test("BDD — nenhuma frase proibida é gerada", () => {
  const serialized = build(failedTest()).bddScenario.text;
  assert.doesNotMatch(serialized, /backend esqueceu|banco salvou|controller|Bean Validation|segurança crítica/i);
});
