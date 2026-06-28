"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildReportModel } = require("../../dist");

function makeRequest(id, overrides = {}) {
  return {
    id,
    order: 1,
    phase: "chamada",
    method: "POST",
    url: "http://localhost:3333/users",
    originalUrl: "/users",
    requestHeaders: { authorization: "Bearer segredo-real" },
    requestBody: { password: "senha-real", name: "Ana" },
    responseHeaders: { "set-cookie": "sid=cookie-real" },
    responseBody: { id: 42, accessToken: "token-real" },
    receivedStatus: 201,
    durationMs: 100,
    curl: "",
    ...overrides,
  };
}

function makeSpec(specPath, tests) {
  return { specPath, durationMs: 500, tests };
}

function makeFailedTest(id, overrides = {}) {
  return {
    id,
    title: "Criar usuário sem e-mail deve retornar 400",
    titlePath: ["Suite API", "Criar usuário sem e-mail deve retornar 400"],
    state: "failed",
    durationMs: 150,
    error: {
      name: "AssertionError",
      message: "expected 201 to equal 400",
      expected: 400,
      actual: 201,
    },
    requests: [makeRequest("req-1")],
    ...overrides,
  };
}

test("relatório vazio — summary zerado e sem specs", () => {
  const report = buildReportModel([]);
  assert.equal(report.summary.tests, 0);
  assert.equal(report.summary.passed, 0);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.requests, 0);
  assert.equal(report.summary.passRate, 0);
  assert.deepEqual(report.specs, []);
});

test("summary contabiliza corretamente passed, failed, skipped", () => {
  const specs = [
    makeSpec("spec-a.cy.js", [
      makeFailedTest("t1"),
      { ...makeFailedTest("t2"), state: "passed", error: undefined },
      { ...makeFailedTest("t3"), state: "skipped", error: undefined },
    ]),
  ];
  const report = buildReportModel(specs);
  assert.equal(report.summary.tests, 3);
  assert.equal(report.summary.failed, 1);
  assert.equal(report.summary.passed, 1);
  assert.equal(report.summary.skipped, 1);
});

test("passRate calculado corretamente", () => {
  const specs = [
    makeSpec("spec.cy.js", [
      makeFailedTest("t1"),
      { ...makeFailedTest("t2"), state: "passed", error: undefined },
    ]),
  ];
  const report = buildReportModel(specs);
  assert.equal(report.summary.passRate, 50);
});

test("mascaramento aplicado a headers, body e URL do request", () => {
  const specs = [makeSpec("spec.cy.js", [makeFailedTest("t1")])];
  const report = buildReportModel(specs, { config: { maskFields: [] } });
  const req = report.specs[0].tests[0].requests[0];
  assert.doesNotMatch(JSON.stringify(req.requestHeaders), /segredo-real/);
  assert.doesNotMatch(JSON.stringify(req.requestBody), /senha-real/);
  assert.doesNotMatch(JSON.stringify(req.responseHeaders), /cookie-real/);
  assert.doesNotMatch(JSON.stringify(req.responseBody), /token-real/);
});

test("mascaramento com extraFields aplicado", () => {
  const test_ = makeFailedTest("t1");
  test_.requests[0].requestBody = { sessionId: "real", name: "Ana" };
  const report = buildReportModel(
    [makeSpec("spec.cy.js", [test_])],
    { config: { maskFields: ["sessionId"] } },
  );
  const body = report.specs[0].tests[0].requests[0].requestBody;
  assert.equal(body.sessionId, "***");
  assert.equal(body.name, "Ana");
});

test("titlePath definido — title usa último elemento", () => {
  const report = buildReportModel([makeSpec("spec.cy.js", [makeFailedTest("t1")])]);
  assert.equal(report.specs[0].tests[0].title, "Criar usuário sem e-mail deve retornar 400");
});

test("titlePath ausente — title é preservado como está", () => {
  const test_ = makeFailedTest("t1");
  test_.titlePath = undefined;
  const report = buildReportModel([makeSpec("spec.cy.js", [test_])]);
  assert.equal(report.specs[0].tests[0].title, test_.title);
});

test("mainRequestId é definido quando há requests", () => {
  const report = buildReportModel([makeSpec("spec.cy.js", [makeFailedTest("t1")])]);
  assert.ok(report.specs[0].tests[0].mainRequestId);
});

test("request sem fases explícitas recebe fase inferida", () => {
  const report = buildReportModel([makeSpec("spec.cy.js", [makeFailedTest("t1")])]);
  const req = report.specs[0].tests[0].requests[0];
  assert.ok(["preparacao", "validacao", "verificacao", "limpeza", "chamada"].includes(req.phase));
});

test("diagnóstico gerado para teste falho", () => {
  const report = buildReportModel([makeSpec("spec.cy.js", [makeFailedTest("t1")])]);
  const diagnosis = report.specs[0].tests[0].diagnosis;
  assert.ok(diagnosis);
  assert.ok(diagnosis.category);
  assert.ok(diagnosis.title);
});

test("teste passado — diagnosis undefined ou não tem falha", () => {
  const passedTest = { ...makeFailedTest("t1"), state: "passed", error: undefined };
  const report = buildReportModel([makeSpec("spec.cy.js", [passedTest])]);
  assert.equal(report.specs[0].tests[0].diagnosis, undefined);
});

test("reproductionScript gerado quando há requests", () => {
  const report = buildReportModel([makeSpec("spec.cy.js", [makeFailedTest("t1")])]);
  const script = report.specs[0].tests[0].reproductionScript;
  assert.ok(typeof script === "string" && script.length > 0);
  assert.match(script, /curl/);
});

test("teste passado não gera reproductionScript", () => {
  const passedTest = { ...makeFailedTest("t1"), state: "passed", error: undefined };
  const report = buildReportModel([makeSpec("spec.cy.js", [passedTest])]);
  assert.equal(report.specs[0].tests[0].reproductionScript, undefined);
});

test("reproductionScript inclui o fluxo completo — todos os requests, sem cortar nada", () => {
  const login = makeRequest("login", {
    url: "http://localhost:3333/auth/login",
    originalUrl: "/auth/login",
    requestHeaders: {},
    responseBody: { token: "token-gerado" },
  });
  const main = makeRequest("main", {
    order: 2,
    url: "http://localhost:3333/api/v2/users/register",
    originalUrl: "/api/v2/users/register",
    requestHeaders: {},
    responseBody: { fieldErrors: [] },
    receivedStatus: 422,
  });
  const test_ = makeFailedTest("t1", {
    requests: [login, main],
    error: { name: "AssertionError", message: "expected 422 to equal 201", expected: 201, actual: 422 },
  });
  const report = buildReportModel([makeSpec("spec.cy.js", [test_])]);
  const script = report.specs[0].tests[0].reproductionScript;
  // Sem suposição de domínio: o login não é mais cortado — o fluxo é completo.
  assert.match(script, /auth\/login/);
  assert.match(script, /api\/v2\/users\/register/);
});

test("login permanece no reproductionScript quando request posterior usa Authorization", () => {
  const login = makeRequest("login", {
    url: "http://localhost:3333/auth/login",
    originalUrl: "/auth/login",
    requestHeaders: {},
    responseBody: { token: "token-gerado" },
  });
  const main = makeRequest("main", {
    order: 2,
    requestHeaders: { authorization: "Bearer token-gerado" },
  });
  const report = buildReportModel([makeSpec("spec.cy.js", [makeFailedTest("t1", { requests: [login, main] })])]);
  assert.match(report.specs[0].tests[0].reproductionScript, /auth\/login/);
});

test("repro é genérico e determinístico em API de domínio arbitrário (sem PT/EN, sem /login)", () => {
  const base = "https://api.acme.io";
  const sessions = makeRequest("r0", {
    order: 1, method: "POST", url: base + "/sessions", originalUrl: "/sessions",
    requestHeaders: {}, requestBody: { user: "qa" }, responseBody: { accessToken: "JWT" }, receivedStatus: 200,
  });
  const create = makeRequest("r1", {
    order: 2, method: "POST", url: base + "/widgets", originalUrl: "/widgets",
    requestHeaders: { Authorization: "Bearer JWT" }, requestBody: { label: "A" },
    responseBody: { widgetId: "wgt_8a2f" }, receivedStatus: 201,
  });
  const verify = makeRequest("r2", {
    order: 3, method: "GET", url: base + "/widgets/wgt_8a2f", originalUrl: "/widgets/wgt_8a2f",
    requestHeaders: { Authorization: "Bearer JWT" }, responseBody: { widgetId: "wgt_8a2f" }, receivedStatus: 200,
  });
  const test_ = makeFailedTest("t1", {
    title: "deve recusar widget sem label e retornar 400",
    requests: [sessions, create, verify],
    error: { name: "AssertionError", message: "expected 201 to equal 400", expected: 400, actual: 201 },
  });
  const t = buildReportModel([makeSpec("widgets.cy.js", [test_])], { config: { maskFields: [] } }).specs[0].tests[0];

  // chamada principal escolhida pelo status (201 == actual), não por título/endpoint
  assert.equal(t.mainRequestId, "r1");
  // nomes derivados da CHAVE real do campo (camelCase -> SNAKE), nada de $USER_ID chumbado
  assert.deepEqual(t.requests[0].generatedVariables, ["$TOKEN"]);
  assert.deepEqual(t.requests[1].generatedVariables, ["$WIDGET_ID"]);
  assert.equal(t.requests[0].phase, "preparacao");
  assert.equal(t.requests[1].phase, "validacao");
  assert.equal(t.requests[2].phase, "verificacao");

  const script = t.reproductionScript;
  assert.match(script, /TOKEN=\$\(curl -s.*jq -r '\.accessToken'/s);
  assert.match(script, /WIDGET_ID=\$\(curl -s.*jq -r '\.widgetId'/s);
  assert.match(script, /Bearer \$TOKEN/);
  assert.match(script, /\$WIDGET_ID/);
  assert.match(script, /chamada validada pelo teste \(esperado 400, recebido 201\)/);
});

test("múltiplos specs — durationMs total somado", () => {
  const specs = [
    makeSpec("spec-a.cy.js", [makeFailedTest("t1")]),
    makeSpec("spec-b.cy.js", [makeFailedTest("t2")]),
  ];
  const report = buildReportModel(specs);
  assert.equal(report.summary.durationMs, 1000);
});

test("metadados do projeto aplicados a partir da config", () => {
  const report = buildReportModel([], {
    config: { projectName: "meu-projeto", branch: "main", runId: "build-42", theme: "light" },
  });
  assert.equal(report.project.name, "meu-projeto");
  assert.equal(report.project.branch, "main");
  assert.equal(report.project.runId, "build-42");
  assert.equal(report.theme, "light");
});

test("cURL gerado no request não contém segredos", () => {
  const report = buildReportModel([makeSpec("spec.cy.js", [makeFailedTest("t1")])]);
  const curl = report.specs[0].tests[0].requests[0].curl;
  assert.doesNotMatch(curl, /segredo-real/);
  assert.doesNotMatch(curl, /senha-real/);
  assert.doesNotMatch(curl, /cookie-real/);
});

test("redirects são preservados e URLs sensíveis são mascaradas", () => {
  const test_ = makeFailedTest("t1");
  test_.requests[0].redirects = [
    { statusCode: 302, location: "http://localhost:3333/next?token=segredo" },
  ];
  const report = buildReportModel([makeSpec("spec.cy.js", [test_])]);
  assert.deepEqual(report.specs[0].tests[0].requests[0].redirects, [
    { statusCode: 302, location: "http://localhost:3333/next?token=***" },
  ]);
});

test("assertions sintetizadas quando erro presente mas assertions ausentes", () => {
  const test_ = makeFailedTest("t1");
  test_.assertions = undefined;
  const report = buildReportModel([makeSpec("spec.cy.js", [test_])]);
  const assertions = report.specs[0].tests[0].assertions;
  assert.ok(Array.isArray(assertions) && assertions.length > 0);
  assert.equal(assertions[0].state, "failed");
});

test("assertions explícitas preservadas e mascaradas", () => {
  const test_ = makeFailedTest("t1");
  test_.assertions = [
    { id: "a-1", title: "Status deve ser 400", state: "failed", expected: 400, actual: 201 },
    { id: "a-2", title: "Body deve ter campo error", state: "pending" },
  ];
  const report = buildReportModel([makeSpec("spec.cy.js", [test_])]);
  assert.equal(report.specs[0].tests[0].assertions.length, 2);
  assert.equal(report.specs[0].tests[0].assertions[0].state, "failed");
  assert.equal(report.specs[0].tests[0].assertions[1].state, "pending");
});

test("assertion de body não contamina a expectativa de status HTTP", () => {
  const test_ = makeFailedTest("t1", {
    title: "Não deve vazar internals do backend ao ocorrer erro interno",
    error: {
      name: "AssertionError",
      message: "expected response body to not have property 'trace'",
      expected: "ausência de trace",
      actual: "trace presente",
    },
    statusExpectation: {
      type: "set",
      label: "4xx/5xx",
      values: [400, 500],
    },
    assertions: [{
      id: "body-trace",
      title: "O corpo de erro não deve vazar internals",
      target: "body",
      state: "failed",
      message: "expected response body to not have property 'trace'",
      expected: "ausência de trace",
      actual: "trace presente",
    }],
    requests: [makeRequest("req-1", {
      receivedStatus: 500,
      responseBody: { status: 500, trace: ["TypeError", "at route.js:10"] },
    })],
  });
  const result = buildReportModel([makeSpec("falhas.cy.js", [test_])]).specs[0].tests[0];
  assert.deepEqual(result.statusExpectation, {
    type: "set",
    label: "4xx/5xx",
    values: [400, 500],
    actual: 500,
    matched: true,
  });
  assert.deepEqual(result.payloadDiff, [{
    path: "$.trace",
    kind: "array",
    reason: "A propriedade trace deveria estar ausente.",
  }]);
});

test("resposta inteira é marcada quando assertion pendente rejeita um array", () => {
  const test_ = makeFailedTest("t1", {
    title: "Buscar pedido inexistente deve retornar 404, não um array de objetos",
    error: {
      name: "AssertionError",
      message: "expected 200 to equal 404",
      expected: 404,
      actual: 200,
    },
    assertions: [
      { id: "status", title: "Buscar pedido inexistente deve retornar 404", target: "status", state: "failed", expected: 404, actual: 200 },
      { id: "body", title: "Não deve retornar um array de objetos", target: "body", state: "pending" },
    ],
    requests: [makeRequest("req-1", {
      method: "GET",
      receivedStatus: 200,
      responseBody: [{ id: "order-1" }, { id: "order-2" }],
    })],
  });
  const result = buildReportModel([makeSpec("falhas.cy.js", [test_])]).specs[0].tests[0];
  assert.equal(result.statusExpectation.label, "404");
  assert.equal(result.statusExpectation.actual, 200);
  assert.deepEqual(result.payloadDiff, [{
    path: "$",
    kind: "whole-response",
    reason: "A resposta retornou uma coleção quando o cenário esperava uma resposta de erro.",
  }]);
});

test("falha de status preserva destaque observacional para campo nulo da resposta", () => {
  const test_ = makeFailedTest("t1", {
    title: "Criar usuário sem e-mail deve retornar 400",
    assertions: [{
      id: "status",
      title: "Deve retornar 400 quando email não for informado",
      target: "status",
      state: "failed",
      expected: 400,
      actual: 201,
    }],
    requests: [makeRequest("req-1", {
      receivedStatus: 201,
      responseBody: { id: "usr-1", email: null, createdAt: "2026-01-01" },
    })],
  });
  const result = buildReportModel([makeSpec("usuarios.cy.js", [test_])]).specs[0].tests[0];
  assert.deepEqual(result.payloadDiff, [{
    path: "$.email",
    kind: "value",
    reason: "Valor nulo observado no campo email da resposta.",
    evidenceOnly: true,
  }]);
});
