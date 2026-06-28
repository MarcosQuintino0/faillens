"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const { generateCurl } = require("../../dist");

test("GET sem body — sem flag -d", () => {
  const result = generateCurl({ method: "GET", url: "http://api.example.com/health" });
  assert.match(result, /curl -X GET/);
  assert.doesNotMatch(result, /-d /);
});

test("POST com body objeto — body serializado como JSON com -d", () => {
  const result = generateCurl({
    method: "POST",
    url: "http://api.example.com/users",
    body: { name: "Ana", age: 30 },
  });
  assert.match(result, /-d /);
  assert.match(result, /"name"/);
  assert.match(result, /"Ana"/);
});

test("POST com body string — body passado diretamente", () => {
  const result = generateCurl({
    method: "POST",
    url: "http://api.example.com/users",
    body: "raw text body",
  });
  assert.match(result, /raw text body/);
});

test("body null — sem flag -d", () => {
  const result = generateCurl({ method: "POST", url: "/users", body: null });
  assert.doesNotMatch(result, /-d /);
});

test("body undefined — sem flag -d", () => {
  const result = generateCurl({ method: "PUT", url: "/users/1", body: undefined });
  assert.doesNotMatch(result, /-d /);
});

test("headers múltiplos — cada header tem flag -H própria", () => {
  const result = generateCurl({
    method: "GET",
    url: "/users",
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "abc-123",
    },
  });
  assert.match(result, /-H 'Content-Type: application\/json'/);
  assert.match(result, /-H 'X-Request-ID: abc-123'/);
});

test("URL é colocada entre single quotes", () => {
  const result = generateCurl({ method: "GET", url: "http://api.example.com/health" });
  assert.match(result, /curl -X GET 'http:\/\/api\.example\.com\/health'/);
});

test("URL com single quote interna é corretamente escaped", () => {
  const result = generateCurl({ method: "GET", url: "http://api.example.com/it's" });
  assert.match(result, /curl -X GET/);
  assert.doesNotMatch(result, /curl -X GET 'http:\/\/api\.example\.com\/it's'/);
});

test("headers sensíveis são mascarados pelo maskSensitiveData", () => {
  const result = generateCurl({
    method: "GET",
    url: "/users",
    headers: { Authorization: "Bearer real-token" },
  });
  assert.doesNotMatch(result, /real-token/);
  assert.match(result, /Bearer <TOKEN>/);
});

test("URL com query param sensível é mascarada", () => {
  const result = generateCurl({
    method: "GET",
    url: "/users?apiKey=real&page=1",
  });
  assert.doesNotMatch(result, /apiKey=real/);
  assert.match(result, /apiKey=\*\*\*/);
  assert.match(result, /page=1/);
});

test("body com campo sensível é mascarado", () => {
  const result = generateCurl({
    method: "POST",
    url: "/auth/login",
    body: { email: "user@example.com", password: "segredo" },
  });
  assert.doesNotMatch(result, /segredo/);
  assert.match(result, /\*\*\*/);
  assert.match(result, /user@example\.com/);
});

test("extraFields adicionais são mascarados", () => {
  const result = generateCurl(
    { method: "GET", url: "/users?sessionId=real", headers: { sessionId: "real" } },
    ["sessionId"],
  );
  assert.doesNotMatch(result, /real/);
});

test("método sempre em uppercase", () => {
  const result = generateCurl({ method: "post", url: "/users" });
  assert.match(result, /curl -X POST/);
});

test("saída tem formatação multi-linha com \\", () => {
  const result = generateCurl({
    method: "POST",
    url: "/users",
    headers: { "Content-Type": "application/json" },
    body: { name: "Ana" },
  });
  assert.match(result, /\\\n/);
});
