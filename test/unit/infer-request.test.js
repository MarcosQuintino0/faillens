"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const { inferMainRequest } = require("../../dist/reporter/buildReportModel");

function makeRequest(id, method, url, receivedStatus = 200) {
  return {
    id,
    order: 1,
    phase: "chamada",
    method,
    url,
    originalUrl: url,
    requestHeaders: {},
    requestBody: null,
    responseHeaders: {},
    responseBody: null,
    durationMs: 100,
    curl: "",
    receivedStatus,
  };
}

function makeTest(title, requests, errorActual) {
  return {
    id: "test-1",
    title,
    state: "failed",
    durationMs: 200,
    requests,
    error: errorActual !== undefined
      ? { name: "AssertionError", message: `expected ${errorActual}`, actual: errorActual }
      : undefined,
  };
}

test("sem requests → undefined", () => {
  const test_ = makeTest("qualquer título", []);
  assert.equal(inferMainRequest(test_), undefined);
});

test("um único request não-auth → retorna ele", () => {
  const req = makeRequest("req-1", "POST", "/users");
  const test_ = makeTest("cria usuário", [req]);
  assert.equal(inferMainRequest(test_).id, "req-1");
});

test("login NÃO é mais tratado como especial — sem sinal de status, a 1ª mutação vence", () => {
  const auth = makeRequest("req-auth", "POST", "http://localhost:3333/auth/login");
  const main = makeRequest("req-main", "POST", "/users");
  const test_ = makeTest("cria usuário sem e-mail", [auth, main]);
  // ambos POST, sem error.actual: desempate de ordem favorece o primeiro.
  // O importante: a detecção é genérica, não depende do nome '/login'.
  assert.equal(inferMainRequest(test_).id, "req-auth");
});

test("com sinal de status, a chamada validada vence mesmo havendo login antes", () => {
  const auth = makeRequest("req-auth", "POST", "http://localhost:3333/auth/login", 200);
  const main = makeRequest("req-main", "POST", "/users", 400);
  const test_ = makeTest("cria usuário sem e-mail", [auth, main], 400);
  assert.equal(inferMainRequest(test_).id, "req-main");
});

test("request único → retorna ele (qualquer endpoint, sem caso especial)", () => {
  const only = makeRequest("req-only", "POST", "http://localhost/auth/login");
  const test_ = makeTest("login deve retornar 401", [only], 401);
  assert.equal(inferMainRequest(test_).id, "req-only");
});

test("método de mutação vence GET — o título não influencia", () => {
  const get = makeRequest("req-get", "GET", "/users");
  const post = makeRequest("req-post", "POST", "/users");
  const test_ = makeTest("buscar usuário por id", [get, post]);
  assert.equal(inferMainRequest(test_).id, "req-post");
});

test("status que bate com o erro vence a mutação", () => {
  const post = makeRequest("req-post", "POST", "/users", 201);
  const get = makeRequest("req-get", "GET", "/users/abc", 404);
  const test_ = makeTest("busca recurso inexistente", [post, get], 404);
  assert.equal(inferMainRequest(test_).id, "req-get");
});

test("status recebido igual ao actual do erro tem score mais alto", () => {
  const req200 = makeRequest("req-200", "GET", "/users", 200);
  const req400 = makeRequest("req-400", "POST", "/users", 400);
  const test_ = makeTest("cria usuário", [req200, req400], 400);
  assert.equal(inferMainRequest(test_).id, "req-400");
});

test("múltiplos POSTs — escolhe o com status matching o erro", () => {
  const post1 = makeRequest("req-post-1", "POST", "/tokens", 200);
  const post2 = makeRequest("req-post-2", "POST", "/users", 201);
  const test_ = makeTest("cria usuário", [post1, post2], 201);
  assert.equal(inferMainRequest(test_).id, "req-post-2");
});

test("operação de regra resolvida desempata setup e ação pelo último método correspondente", () => {
  const setup = makeRequest("req-setup", "POST", "/users", 201);
  const action = makeRequest("req-action", "POST", "/users", 201);
  const test_ = makeTest("rejeita duplicidade", [setup, action], 201);
  const refs = [{
    ruleId: "codigo-duplicado",
    resolved: true,
    contractId: "users",
    rule: { id: "codigo-duplicado", attributes: { operation: "POST" }, raw: "" },
  }];
  assert.equal(inferMainRequest(test_, refs).id, "req-action");
});

test("sem erro e sem título com palavra-chave — mutação (DELETE) vence GET pelo score de método", () => {
  const req1 = makeRequest("req-1", "GET", "/users");
  const req2 = makeRequest("req-2", "DELETE", "/users/1");
  const test_ = makeTest("algum teste", [req1, req2]);
  test_.error = undefined;
  assert.equal(inferMainRequest(test_).id, "req-2");
});
