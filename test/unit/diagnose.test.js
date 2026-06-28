"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const { diagnoseFailure } = require("../../dist/reporter/diagnostics/diagnoseFailure");

function makeRequest(overrides = {}) {
  return {
    id: "req-1",
    order: 1,
    phase: "validacao",
    method: "POST",
    url: "http://localhost:3333/users",
    originalUrl: "/users",
    requestHeaders: {},
    requestBody: { name: "Ana" },
    responseHeaders: {},
    responseBody: null,
    durationMs: 100,
    curl: "",
    receivedStatus: 200,
    ...overrides,
  };
}

function makeTest(overrides = {}, requests = [makeRequest()]) {
  return {
    id: "test-1",
    title: "cenário de teste",
    state: "failed",
    durationMs: 150,
    requests,
    ...overrides,
  };
}

test("teste passado sem erro → diagnóstico undefined", () => {
  const test_ = makeTest({ state: "passed", error: undefined });
  const result = diagnoseFailure({ test: test_ });
  assert.equal(result, undefined);
});

test("categoria: timeout — mensagem contém 'timeout'", () => {
  const test_ = makeTest({ error: { name: "Error", message: "Request timeout after 30000ms" } });
  const result = diagnoseFailure({ test: test_ });
  assert.equal(result.category, "timeout");
});

test("categoria: timeout — mensagem contém 'timed out'", () => {
  const test_ = makeTest({ error: { name: "Error", message: "cy.request timed out waiting" } });
  const result = diagnoseFailure({ test: test_ });
  assert.equal(result.category, "timeout");
});

test("categoria: network-error — sem receivedStatus e erro de conexão", () => {
  const req = makeRequest({ receivedStatus: undefined, error: { name: "Error", message: "ECONNREFUSED" } });
  const test_ = makeTest({ error: { name: "Error", message: "ECONNREFUSED connect ECONNREFUSED" } }, [req]);
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.equal(result.category, "network-error");
});

test("categoria: schema-contract-mismatch — mensagem contém 'schema'", () => {
  const test_ = makeTest({ error: { name: "AssertionError", message: "expected response to match schema" } });
  const result = diagnoseFailure({ test: test_, mainRequest: makeRequest() });
  assert.equal(result.category, "schema-contract-mismatch");
});

test("categoria: schema-contract-mismatch — mensagem contém 'property'", () => {
  const test_ = makeTest({ error: { name: "AssertionError", message: "expected object to have property 'id'" } });
  const result = diagnoseFailure({ test: test_, mainRequest: makeRequest() });
  assert.equal(result.category, "schema-contract-mismatch");
});

test("categoria: persistence-mismatch — POST 2xx + GET 404 depois", () => {
  const mainReq = makeRequest({ id: "req-1", method: "POST", receivedStatus: 201, responseBody: { id: 42 } });
  const verifyReq = makeRequest({ id: "req-2", order: 2, method: "GET", url: "/users/42", receivedStatus: 404 });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 404 to equal 200", expected: 200, actual: 404 } },
    [mainReq, verifyReq],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: mainReq });
  assert.equal(result.category, "persistence-mismatch");
  assert.equal(result.confidence, "high");
});

test("categoria: persistence-mismatch — POST 2xx + GET 2xx com campos divergentes", () => {
  const mainReq = makeRequest({
    id: "req-1",
    method: "POST",
    receivedStatus: 200,
    requestBody: { name: "Ana" },
  });
  const verifyReq = makeRequest({
    id: "req-2",
    order: 2,
    method: "GET",
    receivedStatus: 200,
    responseBody: { name: "OutroNome" },
  });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 'OutroNome' to equal 'Ana'" } },
    [mainReq, verifyReq],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: mainReq });
  assert.equal(result.category, "persistence-mismatch");
});

test("categoria: unexpected-persistence — payload inválido gerou id + GET encontrou recurso", () => {
  const mainReq = makeRequest({
    id: "req-1",
    method: "POST",
    receivedStatus: 201,
    responseBody: { id: 99 },
  });
  const verifyReq = makeRequest({ id: "req-2", order: 2, method: "GET", receivedStatus: 200 });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 201 to equal 400", expected: 400, actual: 201 } },
    [mainReq, verifyReq],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: mainReq });
  assert.equal(result.category, "unexpected-persistence");
  assert.equal(result.confidence, "high");
});

test("categoria: validation-not-applied — POST esperava 400, recebeu 201", () => {
  const req = makeRequest({ method: "POST", receivedStatus: 201 });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 201 to equal 400", expected: 400, actual: 201 } },
    [req],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.equal(result.category, "validation-not-applied");
});

test("categoria: validation-not-applied — PUT esperava 422, recebeu 200", () => {
  const req = makeRequest({ method: "PUT", receivedStatus: 200 });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 200 to equal 422", expected: 422, actual: 200 } },
    [req],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.equal(result.category, "validation-not-applied");
});

test("categoria: duplicate-conflict — esperava 409, criação retornou 201", () => {
  const req = makeRequest({ method: "POST", receivedStatus: 201, responseBody: { id: "usr-1" } });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 201 to equal 409", expected: 409, actual: 201 } },
    [req],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.equal(result.category, "duplicate-conflict");
});

test("categoria: schema-contract-mismatch — assertion deeply equal sobre response body", () => {
  const req = makeRequest({ method: "POST", receivedStatus: 201, responseBody: { id: "usr-1", email: null } });
  const test_ = makeTest({
    error: {
      name: "AssertionError",
      message: "expected { Object (id, email) } to deeply equal { error: 'email é obrigatório' }",
      expected: "{ error: 'email é obrigatório' }",
      actual: "{ Object (id, email) }",
    },
  }, [req]);
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.equal(result.category, "schema-contract-mismatch");
});

test("categoria: unhandled-validation-error — esperava 400, recebeu 500", () => {
  const req = makeRequest({ method: "POST", receivedStatus: 500 });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 500 to equal 400", expected: 400, actual: 500 } },
    [req],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.equal(result.category, "unhandled-validation-error");
});

test("categoria: authorization-not-enforced — esperava 403, recebeu 200", () => {
  const req = makeRequest({ method: "DELETE", receivedStatus: 200 });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 200 to equal 403", expected: 403, actual: 200 } },
    [req],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.equal(result.category, "authorization-not-enforced");
});

test("categoria: authentication-not-enforced — esperava 401, recebeu 200", () => {
  const req = makeRequest({ method: "GET", receivedStatus: 200 });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 200 to equal 401", expected: 401, actual: 200 } },
    [req],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.equal(result.category, "authentication-not-enforced");
});

test("categoria: resource-not-found-mismatch — esperava 404, recebeu 200", () => {
  const req = makeRequest({ method: "GET", receivedStatus: 200 });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 200 to equal 404", expected: 404, actual: 200 } },
    [req],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.equal(result.category, "resource-not-found-mismatch");
});

test("categoria: success-expected-but-client-error — esperava 200, recebeu 400", () => {
  const req = makeRequest({ method: "POST", receivedStatus: 400 });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 400 to equal 200", expected: 200, actual: 400 } },
    [req],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.equal(result.category, "success-expected-but-client-error");
});

test("categoria: success-expected-but-server-error — esperava 201, recebeu 500", () => {
  const req = makeRequest({ method: "POST", receivedStatus: 500 });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 500 to equal 201", expected: 201, actual: 500 } },
    [req],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.equal(result.category, "success-expected-but-server-error");
});

test("categoria: unknown — sem padrão reconhecido", () => {
  const req = makeRequest({ method: "GET", receivedStatus: 418 });
  const test_ = makeTest(
    { error: { name: "Error", message: "I'm a teapot" } },
    [req],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.equal(result.category, "unknown");
});

test("diagnóstico sempre tem evidence, title, summary e suggestedAction", () => {
  const req = makeRequest({ method: "POST", receivedStatus: 500 });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 500 to equal 201", expected: 201, actual: 500 } },
    [req],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.ok(typeof result.title === "string" && result.title.length > 0);
  assert.ok(typeof result.summary === "string" && result.summary.length > 0);
  assert.ok(typeof result.suggestedAction === "string" && result.suggestedAction.length > 0);
  assert.ok(Array.isArray(result.evidence) && result.evidence.length > 0);
});

test("confidence é high, medium ou low", () => {
  const req = makeRequest({ method: "POST", receivedStatus: 201 });
  const test_ = makeTest(
    { error: { name: "AssertionError", message: "expected 201 to equal 400", expected: 400, actual: 201 } },
    [req],
  );
  const result = diagnoseFailure({ test: test_, mainRequest: req });
  assert.ok(["high", "medium", "low"].includes(result.confidence));
});
