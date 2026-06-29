"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildReportModel } = require("../../dist");
const { RequestStore } = require("../../dist/collector/requestStore");

function rule(overrides = {}) {
  return {
    id: "descricao-obrigatoria",
    attributes: { operation: "POST", field: "descricao", condition: "missing" },
    status: 400,
    message: "O campo Descrição é obrigatório e deve ser informado",
    raw: "",
    ...overrides,
  };
}

function contract(rules) {
  return {
    id: "alegacao-ans",
    api: ["POST /alegacao_ans"],
    resumo: "Cadastro de alegações ANS.",
    fields: [{ name: "descricao", type: "string", attributes: { required: true }, raw: "" }],
    rules,
    cobertura: [],
    sourceFiles: ["crud.cy.js"],
    legacy: false,
    warnings: [],
  };
}

function failingTest(ruleRefs, overrides = {}) {
  return {
    id: "t1",
    title: "deve retornar 400 quando descricao não for enviada",
    state: "failed",
    durationMs: 10,
    statusExpectation: { type: "exact", label: "400", expected: 400 },
    error: { name: "AssertionError", message: "expected 201 to equal 400", expected: 400, actual: 201 },
    ruleRefs,
    requests: [
      {
        id: "req-1",
        order: 1,
        phase: "chamada",
        method: "POST",
        url: "http://localhost/alegacao_ans",
        requestHeaders: {},
        requestBody: { codigo: 42, ativo: true },
        responseHeaders: {},
        responseBody: { id: 1842, codigo: 42 },
        receivedStatus: 201,
        durationMs: 10,
        curl: "curl ...",
      },
    ],
    ...overrides,
  };
}

function specWithContract(rules) {
  return { specPath: "crud.cy.js", durationMs: 0, tests: [], contract: contract(rules) };
}

function specWithTest(testObj) {
  return { specPath: "validacoes.cy.js", durationMs: 0, tests: [testObj] };
}

test("procedência — vínculo cross-spec resolve regra do crud para teste do validacoes", () => {
  const report = buildReportModel([
    specWithContract([rule()]),
    specWithTest(failingTest([{ ruleId: "descricao-obrigatoria", resolved: false }])),
  ]);
  assert.ok(report.contracts);
  assert.equal(report.contracts[0].id, "alegacao-ans");
  const t = report.specs.find((s) => s.specPath === "validacoes.cy.js").tests[0];
  assert.equal(t.contractId, "alegacao-ans");
  assert.equal(t.ruleRefs[0].resolved, true);
  assert.equal(t.ruleRefs[0].ruleId, "descricao-obrigatoria");
  // detalhes da regra ficam no contrato consolidado, mascarado
  assert.ok(report.contracts[0].rules.some((r) => r.id === "descricao-obrigatoria"));
});

test("procedência — facts carregam fonte observed, asserted e contract", () => {
  const report = buildReportModel([
    specWithContract([rule()]),
    specWithTest(failingTest([{ ruleId: "descricao-obrigatoria", resolved: false }])),
  ]);
  const t = report.specs.find((s) => s.specPath === "validacoes.cy.js").tests[0];
  const byKind = (kind) => t.facts.find((f) => f.kind === kind);

  assert.equal(byKind("received-status").source, "observed");
  assert.equal(byKind("received-status").value, 201);
  assert.equal(byKind("expected-status").source, "asserted");
  assert.equal(byKind("expected-status").value, 400);
  assert.equal(byKind("rule-status").source, "contract");
  assert.equal(byKind("rule-status").value, 400);
  // campo exigido pela regra ausente no request principal
  assert.equal(byKind("request-field-absent").source, "observed");
  assert.equal(byKind("request-field-absent").value, "descricao");
  assert.equal(byKind("rule-message").source, "contract");
});

test("procedência — asserted e contract divergentes geram conflito explícito", () => {
  const report = buildReportModel([
    specWithContract([rule({ status: 422 })]),
    specWithTest(failingTest([{ ruleId: "descricao-obrigatoria", resolved: false }])),
  ]);
  const t = report.specs.find((s) => s.specPath === "validacoes.cy.js").tests[0];
  const asserted = t.facts.find((f) => f.kind === "expected-status");
  const contractFact = t.facts.find((f) => f.kind === "rule-status");
  assert.ok(asserted.conflictsWith?.includes(contractFact.id));
  assert.ok(contractFact.conflictsWith?.includes(asserted.id));
  // observed não entra no conflito de fontes
  const observed = t.facts.find((f) => f.kind === "received-status");
  assert.equal(observed.conflictsWith, undefined);
});

test("procedência — referência a regra inexistente não resolve e não inventa contract fact", () => {
  const report = buildReportModel([
    specWithContract([rule()]),
    specWithTest(failingTest([{ ruleId: "regra-fantasma", resolved: false }])),
  ]);
  const t = report.specs.find((s) => s.specPath === "validacoes.cy.js").tests[0];
  assert.equal(t.ruleRefs[0].resolved, false);
  assert.equal(t.contractId, undefined);
  assert.equal(t.facts.some((f) => f.source === "contract"), false);
});

test("procedência — sem contrato e sem tags, relatório segue sem facts de contrato", () => {
  const report = buildReportModel([specWithTest(failingTest([]))]);
  assert.equal(report.contracts, undefined);
  const t = report.specs[0].tests[0];
  assert.equal((t.ruleRefs || []).length, 0);
  // ainda há facts observados/assertados
  assert.ok(t.facts.some((f) => f.source === "observed"));
  assert.ok(t.facts.some((f) => f.source === "asserted"));
  assert.equal(t.facts.some((f) => f.source === "contract"), false);
});

test("procedência — mensagem de regra é mascarada antes de virar fact", () => {
  const report = buildReportModel([
    specWithContract([rule({ message: "use Bearer abc123def456ghi789 para autorizar" })]),
    specWithTest(failingTest([{ ruleId: "descricao-obrigatoria", resolved: false }])),
  ]);
  const t = report.specs.find((s) => s.specPath === "validacoes.cy.js").tests[0];
  const message = t.facts.find((f) => f.kind === "rule-message").value;
  assert.ok(!message.includes("abc123def456ghi789"), "token removido do fact");
  assert.ok(message.includes("Bearer <TOKEN>"), "token substituído por placeholder");
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes("abc123def456ghi789"), "segredo ausente do JSON");
});

test("procedência — id de regra ambíguo (dois contratos) não resolve", () => {
  const other = {
    specPath: "outro/crud.cy.js",
    durationMs: 0,
    tests: [],
    contract: { ...contract([rule()]), id: "outra-api", sourceFiles: ["outro/crud.cy.js"] },
  };
  const report = buildReportModel([
    { ...specWithContract([rule()]), specPath: "primeiro/crud.cy.js",
      contract: { ...contract([rule()]), sourceFiles: ["primeiro/crud.cy.js"] } },
    other,
    { ...specWithTest(failingTest([{ ruleId: "descricao-obrigatoria", resolved: false }])),
      specPath: "terceiro/validacoes.cy.js" },
  ]);
  const t = report.specs.find((s) => s.specPath === "terceiro/validacoes.cy.js").tests[0];
  assert.equal(t.ruleRefs[0].resolved, false);
});

test("persistência — GET 2xx não relacionado mantém evidência como not-verified", () => {
  const source = failingTest([], {
    requests: [
      ...failingTest([]).requests,
      {
        id: "req-2", order: 2, phase: "chamada", method: "GET",
        url: "http://localhost/health", requestHeaders: {}, requestBody: null,
        responseHeaders: {}, responseBody: { ok: true }, receivedStatus: 200,
        durationMs: 1, curl: "curl ...",
      },
    ],
  });
  const report = buildReportModel([specWithTest(source)]);
  const result = report.specs[0].tests[0];
  assert.equal(result.persistenceExpectation.state, "not-specified");
  assert.deepEqual(result.persistenceEvidence, {
    state: "not-verified",
    mutationRequestId: "req-1",
  });
});

test("persistência — POST 2xx + GET correlacionado e payload compatível confirma criação", () => {
  const createRule = rule({
    id: "criar",
    attributes: { operation: "POST" },
    status: 201,
    persistence: "required",
  });
  const source = failingTest([{ ruleId: "criar", resolved: false }], {
    state: "passed",
    error: undefined,
    statusExpectation: { type: "exact", label: "201", expected: 201 },
    requests: [
      ...failingTest([]).requests,
      {
        id: "req-2", order: 2, phase: "chamada", method: "GET",
        url: "http://localhost/alegacao_ans/1842", requestHeaders: {}, requestBody: null,
        responseHeaders: {}, responseBody: { id: 1842, codigo: 42, ativo: true }, receivedStatus: 200,
        durationMs: 1, curl: "curl ...",
      },
    ],
  });
  const report = buildReportModel([specWithContract([createRule]), specWithTest(source)]);
  const result = report.specs.find((item) => item.specPath === "validacoes.cy.js").tests[0];
  assert.deepEqual(result.persistenceExpectation, {
    state: "required", contractId: "alegacao-ans", ruleId: "criar",
  });
  assert.deepEqual(result.persistenceEvidence, {
    state: "confirmed-created", mutationRequestId: "req-1", verificationRequestId: "req-2",
    summary: "Uma consulta posterior encontrou o recurso criado com os dados enviados.",
  });
  assert.equal(result.facts.find((item) => item.kind === "persistence-evidence").source, "verified");
});

test("persistência — ID na resposta sem consulta posterior não comprova criação", () => {
  const createRule = rule({ id: "criar", persistence: "required" });
  const source = failingTest([{ ruleId: "criar", resolved: false }]);
  const report = buildReportModel([specWithContract([createRule]), specWithTest(source)]);
  const result = report.specs.find((item) => item.specPath === "validacoes.cy.js").tests[0];
  assert.equal(result.persistenceEvidence.state, "not-verified");
});

test("persistência — estado fornecido na entrada não substitui evidência calculada", () => {
  const source = failingTest([], {
    persistenceExpectation: { state: "required", ruleId: "forjada" },
    persistenceEvidence: { state: "confirmed-created", mutationRequestId: "req-1", verificationRequestId: "inexistente" },
  });
  const result = buildReportModel([specWithTest(source)]).specs[0].tests[0];
  assert.deepEqual(result.persistenceExpectation, { state: "not-specified" });
  assert.deepEqual(result.persistenceEvidence, { state: "not-verified", mutationRequestId: "req-1" });
});

test("persistência — GET correlacionado com payload divergente não comprova criação", () => {
  const source = failingTest([], {
    requests: [
      ...failingTest([]).requests,
      {
        id: "req-2", order: 2, phase: "chamada", method: "GET",
        url: "http://localhost/alegacao_ans/1842", requestHeaders: {}, requestBody: null,
        responseHeaders: {}, responseBody: { id: 1842, codigo: 99, ativo: true }, receivedStatus: 200,
        durationMs: 1, curl: "curl ...",
      },
    ],
  });
  const result = buildReportModel([specWithTest(source)]).specs[0].tests[0];
  assert.equal(result.persistenceEvidence.state, "not-verified");
});

test("persistência — POST rejeitado + GET 404 do mesmo recurso confirma ausência", () => {
  const rejectRule = rule({ id: "rejeitar", status: 400, persistence: "forbidden" });
  const source = failingTest([{ ruleId: "rejeitar", resolved: false }], {
    error: { name: "AssertionError", message: "expected 400 to equal 201", expected: 201, actual: 400 },
    requests: [
      { ...failingTest([]).requests[0], url: "http://localhost/alegacao_ans/1842", receivedStatus: 400, responseBody: {} },
      {
        id: "req-2", order: 2, phase: "chamada", method: "GET",
        url: "http://localhost/alegacao_ans/1842", requestHeaders: {}, requestBody: null,
        responseHeaders: {}, responseBody: {}, receivedStatus: 404,
        durationMs: 1, curl: "curl ...",
      },
    ],
  });
  const report = buildReportModel([specWithContract([rejectRule]), specWithTest(source)]);
  const result = report.specs.find((item) => item.specPath === "validacoes.cy.js").tests[0];
  assert.equal(result.persistenceExpectation.state, "forbidden");
  assert.deepEqual(result.persistenceEvidence, {
    state: "confirmed-absent", mutationRequestId: "req-1", verificationRequestId: "req-2",
    summary: "Uma consulta posterior confirmou a ausência do recurso.",
  });
});

test("persistência — PUT rejeitado + releitura idêntica confirma preservação", () => {
  const preserveRule = rule({ id: "manter", attributes: { operation: "PUT" }, status: 400, persistence: "preserve" });
  const original = { id: 10, nome: "Original" };
  const source = failingTest([{ ruleId: "manter", resolved: false }], {
    error: { name: "AssertionError", message: "expected 400 to equal 200", expected: 200, actual: 400 },
    requests: [
      { id: "req-0", order: 1, phase: "chamada", method: "GET", url: "http://localhost/recursos/10",
        requestHeaders: {}, requestBody: null, responseHeaders: {}, responseBody: original,
        receivedStatus: 200, durationMs: 1, curl: "curl ..." },
      { id: "req-1", order: 2, phase: "chamada", method: "PUT", url: "http://localhost/recursos/10",
        requestHeaders: {}, requestBody: { nome: "Alterado" }, responseHeaders: {}, responseBody: {},
        receivedStatus: 400, durationMs: 1, curl: "curl ..." },
      { id: "req-2", order: 3, phase: "chamada", method: "GET", url: "http://localhost/recursos/10",
        requestHeaders: {}, requestBody: null, responseHeaders: {}, responseBody: { ...original },
        receivedStatus: 200, durationMs: 1, curl: "curl ..." },
    ],
  });
  const report = buildReportModel([specWithContract([preserveRule]), specWithTest(source)]);
  const result = report.specs.find((item) => item.specPath === "validacoes.cy.js").tests[0];
  assert.deepEqual(result.persistenceEvidence, {
    state: "confirmed-preserved", mutationRequestId: "req-1",
    baselineRequestId: "req-0", verificationRequestId: "req-2",
    summary: "A releitura posterior encontrou o mesmo estado observado antes da operação rejeitada.",
  });
});

test("persistência — PUT rejeitado com estado posterior diferente não confirma preservação", () => {
  const preserveRule = rule({ id: "manter", attributes: { operation: "PUT" }, status: 400, persistence: "preserve" });
  const source = failingTest([{ ruleId: "manter", resolved: false }], {
    error: { name: "AssertionError", message: "expected 400 to equal 200", expected: 200, actual: 400 },
    requests: [
      { id: "req-0", order: 1, phase: "chamada", method: "GET", url: "http://localhost/recursos/10",
        requestHeaders: {}, requestBody: null, responseHeaders: {}, responseBody: { id: 10, nome: "Original" },
        receivedStatus: 200, durationMs: 1, curl: "curl ..." },
      { id: "req-1", order: 2, phase: "chamada", method: "PUT", url: "http://localhost/recursos/10",
        requestHeaders: {}, requestBody: { nome: "Alterado" }, responseHeaders: {}, responseBody: {},
        receivedStatus: 400, durationMs: 1, curl: "curl ..." },
      { id: "req-2", order: 3, phase: "chamada", method: "GET", url: "http://localhost/recursos/10",
        requestHeaders: {}, requestBody: null, responseHeaders: {}, responseBody: { id: 10, nome: "Alterado" },
        receivedStatus: 200, durationMs: 1, curl: "curl ..." },
    ],
  });
  const report = buildReportModel([specWithContract([preserveRule]), specWithTest(source)]);
  const result = report.specs.find((item) => item.specPath === "validacoes.cy.js").tests[0];
  assert.equal(result.persistenceEvidence.state, "not-verified");
});

test("persistência — DELETE + GET 404 correlacionado confirma remoção", () => {
  const removeRule = rule({ id: "excluir", attributes: { operation: "DELETE" }, status: 204, persistence: "remove" });
  const source = failingTest([{ ruleId: "excluir", resolved: false }], {
    state: "passed", error: undefined,
    requests: [
      { id: "req-setup", order: 1, phase: "chamada", method: "POST", url: "http://localhost/recursos",
        requestHeaders: {}, requestBody: { nome: "Temporário" }, responseHeaders: {}, responseBody: { id: 10 },
        receivedStatus: 201, durationMs: 1, curl: "curl ..." },
      { id: "req-1", order: 2, phase: "chamada", method: "DELETE", url: "http://localhost/recursos/10",
        requestHeaders: {}, requestBody: null, responseHeaders: {}, responseBody: null,
        receivedStatus: 204, durationMs: 1, curl: "curl ..." },
      { id: "req-2", order: 3, phase: "chamada", method: "GET", url: "http://localhost/recursos/10",
        requestHeaders: {}, requestBody: null, responseHeaders: {}, responseBody: {},
        receivedStatus: 404, durationMs: 1, curl: "curl ..." },
    ],
  });
  const report = buildReportModel([specWithContract([removeRule]), specWithTest(source)]);
  const result = report.specs.find((item) => item.specPath === "validacoes.cy.js").tests[0];
  assert.equal(result.persistenceExpectation.state, "remove");
  assert.equal(result.persistenceEvidence.state, "confirmed-removed");
  assert.equal(result.persistenceEvidence.mutationRequestId, "req-1");
});

test("persistência — POST duplicado + GET 200 do original permanece inconclusivo", () => {
  const duplicateRule = rule({ id: "codigo-duplicado", status: 409, persistence: "forbidden" });
  const source = failingTest([{ ruleId: "codigo-duplicado", resolved: false }], {
    error: { name: "AssertionError", message: "expected 409 to equal 201", expected: 201, actual: 409 },
    requests: [
      { ...failingTest([]).requests[0], receivedStatus: 409, responseBody: {} },
      { id: "req-2", order: 2, phase: "chamada", method: "GET", url: "http://localhost/alegacao_ans/42",
        requestHeaders: {}, requestBody: null, responseHeaders: {}, responseBody: { id: 7, codigo: 42 },
        receivedStatus: 200, durationMs: 1, curl: "curl ..." },
    ],
  });
  const report = buildReportModel([specWithContract([duplicateRule]), specWithTest(source)]);
  const result = report.specs.find((item) => item.specPath === "validacoes.cy.js").tests[0];
  assert.equal(result.persistenceExpectation.state, "forbidden");
  assert.equal(result.persistenceEvidence.state, "not-verified");
});

test("procedência — definições divergentes da mesma regra não resolvem silenciosamente", () => {
  const report = buildReportModel([
    specWithContract([rule({ status: 400 })]),
    { ...specWithContract([rule({ status: 422 })]), specPath: "outro.cy.js",
      contract: { ...contract([rule({ status: 422 })]), sourceFiles: ["outro.cy.js"] } },
    specWithTest(failingTest([{ ruleId: "descricao-obrigatoria", resolved: false }])),
  ]);
  const t = report.specs.find((s) => s.specPath === "validacoes.cy.js").tests[0];
  assert.equal(t.ruleRefs[0].resolved, false);
  assert.ok(report.contracts[0].warnings.some((w) => w.code === "conflicting-rule"));
});

test("procedência — mesmo ruleId em APIs diferentes resolve pelo diretório do contrato", () => {
  const primeiro = {
    ...specWithContract([rule()]),
    specPath: "apis/alegacao-ans/crud.cy.js",
    contract: { ...contract([rule()]), sourceFiles: ["apis/alegacao-ans/crud.cy.js"] },
  };
  const segundo = {
    ...specWithContract([rule({ status: 422 })]),
    specPath: "apis/usuarios/crud.cy.js",
    contract: {
      ...contract([rule({ status: 422 })]),
      id: "usuarios",
      sourceFiles: ["apis/usuarios/crud.cy.js"],
    },
  };
  const teste = {
    ...specWithTest(failingTest([{ ruleId: "descricao-obrigatoria", resolved: false }])),
    specPath: "apis/alegacao-ans/validacoes.cy.js",
  };
  const report = buildReportModel([primeiro, segundo, teste]);
  const resolved = report.specs.find((s) => s.specPath.endsWith("validacoes.cy.js")).tests[0];
  assert.equal(resolved.ruleRefs[0].resolved, true);
  assert.equal(resolved.ruleRefs[0].contractId, "alegacao-ans");
});

test("RequestStore mascara contrato antes do snapshot parcial", () => {
  const store = new RequestStore([]);
  store.mergeContract("spec.cy.js", contract([
    rule({ message: "use Bearer segredo123 para autorizar", raw: "message=Bearer segredo123" }),
  ]));
  const serialized = JSON.stringify(store.snapshotSpec("spec.cy.js"));
  assert.equal(serialized.includes("segredo123"), false);
  assert.equal(serialized.includes("Bearer <TOKEN>"), true);
});

test("RequestStore não associa tags quando títulos curtos são ambíguos", () => {
  const store = new RequestStore();
  store.setTest({ id: "a", title: "repete", titlePath: ["A", "repete"], specPath: "spec.cy.js" });
  store.setTest({ id: "b", title: "repete", titlePath: ["B", "repete"], specPath: "spec.cy.js" });
  store.mergeTestTags("spec.cy.js", [{ title: "repete", ruleRefs: ["r1"], tags: ["@bug"], catalogRefs: [] }]);
  assert.equal(store.snapshotSpec("spec.cy.js").tests.some((t) => t.ruleRefs?.length), false);
});
