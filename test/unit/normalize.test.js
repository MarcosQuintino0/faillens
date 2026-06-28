"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeCyRequestArgs } = require("../../dist");

// Cobertura adicional à de core.test.js
// Foco: edge cases de resolução de URL, failOnStatusCode, body, headers

test("url-only sem baseUrl — url e originalUrl são iguais", () => {
  const result = normalizeCyRequestArgs(["/health"]);
  assert.equal(result.url, "/health");
  assert.equal(result.originalUrl, "/health");
  assert.equal(result.method, "GET");
  assert.equal(result.originalArgsShape, "url");
});

test("url-only com baseUrl sem barra final — resolve corretamente sem double-slash", () => {
  const result = normalizeCyRequestArgs(["/health"], "http://localhost:3000");
  assert.equal(result.url, "http://localhost:3000/health");
  assert.equal(result.originalUrl, "/health");
});

test("url-only com baseUrl com barra final — resolve sem double-slash", () => {
  const result = normalizeCyRequestArgs(["/health"], "http://localhost:3000/");
  assert.equal(result.url, "http://localhost:3000/health");
});

test("url absoluta com baseUrl — URL absoluta prevalece sobre baseUrl", () => {
  const result = normalizeCyRequestArgs(["https://external.com/api"], "http://localhost:3000");
  assert.equal(result.url, "https://external.com/api");
});

test("method+url — originalArgsShape é method-url", () => {
  const result = normalizeCyRequestArgs(["DELETE", "/users/1"]);
  assert.equal(result.method, "DELETE");
  assert.equal(result.originalArgsShape, "method-url");
  assert.equal(result.body, null);
  assert.equal(result.failOnStatusCode, undefined);
});

test("method+url+body — originalArgsShape é method-url-body", () => {
  const result = normalizeCyRequestArgs(["POST", "/users", { name: "Ana" }]);
  assert.equal(result.originalArgsShape, "method-url-body");
  assert.deepEqual(result.body, { name: "Ana" });
});

test("options — method em lowercase é uppercased", () => {
  const result = normalizeCyRequestArgs([{ method: "delete", url: "/users/1" }]);
  assert.equal(result.method, "DELETE");
});

test("options — method ausente defaults para GET", () => {
  const result = normalizeCyRequestArgs([{ url: "/health" }]);
  assert.equal(result.method, "GET");
});

test("options — failOnStatusCode false preservado", () => {
  const result = normalizeCyRequestArgs([{ url: "/users", failOnStatusCode: false }]);
  assert.equal(result.failOnStatusCode, false);
});

test("options — failOnStatusCode true preservado", () => {
  const result = normalizeCyRequestArgs([{ url: "/users", failOnStatusCode: true }]);
  assert.equal(result.failOnStatusCode, true);
});

test("options — failOnStatusCode ausente é undefined (não false)", () => {
  const result = normalizeCyRequestArgs([{ url: "/users" }]);
  assert.equal(result.failOnStatusCode, undefined);
});

test("options — headers ausente retorna objeto vazio, não undefined", () => {
  const result = normalizeCyRequestArgs([{ url: "/users" }]);
  assert.deepEqual(result.headers, {});
});

test("options — headers preservados", () => {
  const result = normalizeCyRequestArgs([{ url: "/users", headers: { "X-Custom": "valor" } }]);
  assert.deepEqual(result.headers, { "X-Custom": "valor" });
});

test("options — body null preservado como null", () => {
  const result = normalizeCyRequestArgs([{ url: "/users", body: null }]);
  assert.equal(result.body, null);
});

test("options — body ausente (sem propriedade) retorna null", () => {
  const result = normalizeCyRequestArgs([{ url: "/users" }]);
  assert.equal(result.body, null);
});

test("options — body: 0 preservado (valor falsy mas não null)", () => {
  const result = normalizeCyRequestArgs([{ url: "/users", body: 0 }]);
  assert.equal(result.body, 0);
});

test("options — body string preservado", () => {
  const result = normalizeCyRequestArgs([{ url: "/users", body: "raw body" }]);
  assert.equal(result.body, "raw body");
});

test("argumentos inválidos — lança TypeError", () => {
  assert.throws(
    () => normalizeCyRequestArgs([42]),
    (error) => error instanceof TypeError,
  );
  assert.throws(
    () => normalizeCyRequestArgs([null]),
    (error) => error instanceof TypeError,
  );
});

test("originalArgsShape correto para options", () => {
  const result = normalizeCyRequestArgs([{ method: "GET", url: "/health" }]);
  assert.equal(result.originalArgsShape, "options");
});
