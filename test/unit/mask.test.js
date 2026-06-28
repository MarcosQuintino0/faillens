"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const { maskSensitiveData, maskUrl } = require("../../dist");
const { isSensitiveField, maskSensitiveText } = require("../../dist/collector/sensitiveMask");

// Cobertura adicional à de core.test.js
// Foco: edge cases de mascaramento não cobertos nos testes base

test("maskSensitiveData — valores primitivos passam sem alteração", () => {
  assert.equal(maskSensitiveData(null), null);
  assert.equal(maskSensitiveData(undefined), undefined);
  assert.equal(maskSensitiveData(42), 42);
  assert.equal(maskSensitiveData(true), true);
  assert.equal(maskSensitiveData("texto normal"), "texto normal");
});

test("maskSensitiveData — objeto vazio retorna objeto vazio", () => {
  assert.deepEqual(maskSensitiveData({}), {});
  assert.deepEqual(maskSensitiveData([]), []);
});

test("maskSensitiveData — aninhamento de 3+ níveis", () => {
  const input = {
    level1: {
      level2: {
        level3: {
          token: "segredo-profundo",
          safe: "visível",
        },
      },
    },
  };
  const result = maskSensitiveData(input);
  assert.equal(result.level1.level2.level3.token, "***");
  assert.equal(result.level1.level2.level3.safe, "visível");
});

test("maskSensitiveData — array com objetos sensíveis", () => {
  const input = [
    { password: "abc", name: "Ana" },
    { senha: "xyz", role: "admin" },
  ];
  const result = maskSensitiveData(input);
  assert.equal(result[0].password, "***");
  assert.equal(result[0].name, "Ana");
  assert.equal(result[1].senha, "***");
  assert.equal(result[1].role, "admin");
});

test("maskSensitiveData — referência circular retorna [Circular] sem explodir", () => {
  const obj = { a: 1 };
  obj.self = obj;
  const result = maskSensitiveData(obj);
  assert.equal(result.a, 1);
  assert.equal(result.self, "[Circular]");
});

test("maskSensitiveData — string que é JWT válido (3 segmentos) vira <TOKEN>", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.SomeSignatureHere123";
  assert.equal(maskSensitiveData(jwt), "<TOKEN>");
});

test("maskSensitiveData — string que parece JWT mas tem só 2 segmentos não é mascarada", () => {
  const notJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9";
  const result = maskSensitiveData(notJwt);
  assert.notEqual(result, "<TOKEN>");
});

test("maskSensitiveData — string com JSON embutido contendo campo sensível", () => {
  const input = { body: '{"token":"segredo","safe":"ok"}' };
  const result = maskSensitiveData(input);
  const parsed = JSON.parse(result.body);
  assert.equal(parsed.token, "***");
  assert.equal(parsed.safe, "ok");
});

test("maskSensitiveData — campo Authorization Bearer vira Bearer <TOKEN>", () => {
  const input = { authorization: "Bearer meu-token-real" };
  const result = maskSensitiveData(input);
  assert.equal(result.authorization, "Bearer <TOKEN>");
});

test("maskSensitiveData — nomes de campos com capitalização variada são mascarados (canonicalKey)", () => {
  const result = maskSensitiveData({
    Authorization: "Bearer x",
    AUTHORIZATION: "Bearer y",
    "access-token": "abc",
    Access_Token: "def",
  });
  assert.equal(result.Authorization, "Bearer <TOKEN>");
  assert.equal(result.AUTHORIZATION, "Bearer <TOKEN>");
  assert.equal(result["access-token"], "***");
  assert.equal(result.Access_Token, "***");
});

test("maskSensitiveData — extraFields complementam campos padrão", () => {
  const result = maskSensitiveData(
    { sessionId: "valor-real", token: "outro", safe: "ok" },
    ["sessionId"],
  );
  assert.equal(result.sessionId, "***");
  assert.equal(result.token, "***");
  assert.equal(result.safe, "ok");
});

test("maskSensitiveData — cpf e cnpj são mascarados por padrão", () => {
  const result = maskSensitiveData({ cpf: "123.456.789-00", cnpj: "12.345.678/0001-90" });
  assert.equal(result.cpf, "***");
  assert.equal(result.cnpj, "***");
});

test("maskUrl — query params sensíveis mascarados, seguros preservados", () => {
  assert.equal(maskUrl("/users?token=real&page=2"), "/users?token=***&page=2");
  assert.equal(maskUrl("/health?view=full"), "/health?view=full");
  assert.equal(maskUrl("/search?apiKey=abc&q=query"), "/search?apiKey=***&q=query");
});

test("maskUrl — URL absoluta tem scheme e host preservados", () => {
  const result = maskUrl("https://api.example.com/users?password=real");
  assert.match(result, /^https:\/\/api\.example\.com/);
  assert.match(result, /password=\*\*\*/);
  assert.doesNotMatch(result, /password=real/);
});

test("maskUrl — URL relativa sem params retorna igual", () => {
  assert.equal(maskUrl("/users/1"), "/users/1");
  assert.equal(maskUrl("/health"), "/health");
});

test("maskUrl — string sem protocolo é tratada como URL relativa sem lançar", () => {
  assert.doesNotThrow(() => maskUrl("nao-e-url-valida"));
  assert.doesNotThrow(() => maskUrl(""));
});

test("maskUrl — extraFields aplicados em query params", () => {
  const result = maskUrl("/users?sessionId=real&page=1", ["sessionId"]);
  assert.equal(result, "/users?sessionId=***&page=1");
});

test("isSensitiveField — campos padrão reconhecidos", () => {
  assert.equal(isSensitiveField("authorization"), true);
  assert.equal(isSensitiveField("password"), true);
  assert.equal(isSensitiveField("token"), true);
  assert.equal(isSensitiveField("apiKey"), true);
  assert.equal(isSensitiveField("safe-field"), false);
  assert.equal(isSensitiveField("name"), false);
});

test("isSensitiveField — case insensitive", () => {
  assert.equal(isSensitiveField("Authorization"), true);
  assert.equal(isSensitiveField("PASSWORD"), true);
  assert.equal(isSensitiveField("Token"), true);
});

test("maskSensitiveText — Bearer em texto livre mascarado", () => {
  const result = maskSensitiveText("Usando Bearer meu-token-secreto agora");
  assert.match(result, /Bearer <TOKEN>/);
  assert.doesNotMatch(result, /meu-token-secreto/);
});

test("maskSensitiveText — cookie header em texto mascarado", () => {
  const result = maskSensitiveText("set-cookie: sessionid=abc123; Path=/");
  assert.doesNotMatch(result, /abc123/);
});

test("maskSensitiveText — texto sem dados sensíveis não é alterado", () => {
  const safe = "GET /users HTTP/1.1 returned 200 in 45ms";
  assert.equal(maskSensitiveText(safe), safe);
});
