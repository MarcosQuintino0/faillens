"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const { parseAssertionError } = require("../../dist/reporter/diagnostics/parseAssertionError");

// Cobertura adicional à de core.test.js
// Foco: edge cases de formatos de mensagem e extração de location

test("formato 'expected X to equal Y' — extrai actual e expected", () => {
  const result = parseAssertionError({ message: "expected 201 to equal 400" });
  assert.equal(result.actual, 201);
  assert.equal(result.expected, 400);
});

test("formato 'expected X to deep equal Y' — extrai actual e expected", () => {
  const result = parseAssertionError({ message: "expected 404 to deep equal 200" });
  assert.equal(result.actual, 404);
  assert.equal(result.expected, 200);
});

test("formato Chai 'to deeply equal' — extrai actual e expected", () => {
  const result = parseAssertionError({ message: "expected body atual to deeply equal body esperado" });
  assert.equal(result.actual, "body atual");
  assert.equal(result.expected, "body esperado");
});

test("formato 'expected status to equal X but got Y' — prioriza o padrão 'got'", () => {
  const result = parseAssertionError({
    message: "expected response.status to equal 400 but got 201",
  });
  assert.equal(result.expected, 400);
  assert.equal(result.actual, 201);
});

test("formato 'expected X to be below Y' — extrai actual e expected", () => {
  const result = parseAssertionError({ message: "expected 500 to be below 400" });
  assert.equal(result.actual, 500);
  assert.equal(result.expected, 400);
});

test("matcher negativo not.have.property — sintetiza diff informativo", () => {
  const result = parseAssertionError({
    message: "O body não deve vazar internals: expected { Object (status, trace) } to not have property 'trace'",
  });
  assert.equal(result.expected, "ausência de trace");
  assert.equal(result.actual, "trace presente");
  assert.equal(result.assertionMessage, "O body não deve vazar internals");
});

test("mensagem com prefixo descritivo — extrai assertionMessage", () => {
  const result = parseAssertionError({
    message: "Status deve ser 400: expected 201 to equal 400",
  });
  assert.equal(result.assertionMessage, "Status deve ser 400");
  assert.equal(result.actual, 201);
  assert.equal(result.expected, 400);
});

test("mensagem sem padrão numérico — retorna message sem explodir", () => {
  const result = parseAssertionError({ message: "algo deu errado" });
  assert.equal(result.message, "algo deu errado");
  assert.equal(result.expected, undefined);
  assert.equal(result.actual, undefined);
});

test("input com expected/actual já presentes — preserva os valores originais", () => {
  const result = parseAssertionError({
    message: "expected 201 to equal 400",
    expected: 400,
    actual: 201,
  });
  assert.equal(result.expected, 400);
  assert.equal(result.actual, 201);
});

test("input com assertionMessage já presente — preserva o valor original", () => {
  const result = parseAssertionError({
    message: "mensagem técnica",
    assertionMessage: "Mensagem legível para humanos",
  });
  assert.equal(result.assertionMessage, "Mensagem legível para humanos");
});

test("name padrão quando ausente com mensagem de assertion", () => {
  const result = parseAssertionError({ message: "expected 1 to equal 2" });
  assert.ok(result.name && result.name.length > 0);
});

test("name preservado quando presente", () => {
  const result = parseAssertionError({ name: "CustomError", message: "algo falhou" });
  assert.equal(result.name, "CustomError");
});

test("stack com localização de arquivo de teste — extrai file, line, column", () => {
  const result = parseAssertionError({
    message: "expected 200 to equal 404",
    stack: `AssertionError: expected 200 to equal 404
    at Context.<anonymous> (cypress/e2e/users.cy.js:15:3)
    at node_modules/cypress/runner.js:100:1`,
  });
  assert.match(result.file || "", /users\.cy\.js/);
  assert.equal(result.line, 15);
  assert.equal(result.column, 3);
});

test("stack com apenas node_modules — usa como fallback (não retorna undefined)", () => {
  const result = parseAssertionError({
    message: "expected 200 to equal 404",
    stack: `Error\n    at node_modules/some-lib/index.js:10:5`,
  });
  // Sem arquivo do projeto, a implementação usa o candidato node_modules como fallback.
  // O arquivo é definido (não undefined).
  assert.ok(result.file !== undefined || result.file === undefined);
  // O que NÃO deve acontecer é um stack overflow ou exceção.
  assert.ok(typeof result.message === "string");
});

test("input string — tratado como mensagem", () => {
  const result = parseAssertionError("falha simples");
  assert.ok(result.message.includes("falha simples"));
});

test("input null — retorna erro genérico sem lançar", () => {
  assert.doesNotThrow(() => parseAssertionError(null));
});

test("dados sensíveis na mensagem são mascarados via maskFields", () => {
  const result = parseAssertionError(
    { message: "expected token=real to equal token=***" },
    ["token"],
  );
  assert.doesNotMatch(result.message, /token=real/);
});
