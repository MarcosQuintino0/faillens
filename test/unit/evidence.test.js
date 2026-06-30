"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildEvidenceText, buildEvidenceHtml, buildIssueContent } = require("../../dist/reporter/evidence");
const { copyEvidenceToClipboard } = require("../../dist/templates/evidenceClipboard");

function evidenceInput() {
  return {
    title: "deve rejeitar usuário sem e-mail",
    suggestedTitle: '[API] POST /users — falha em "deve rejeitar usuário sem e-mail"',
    specPath: "cypress/e2e/usuários.cy.js",
    context: "Falha observada no cadastro de usuários.",
    failure: "Esperava status 400, mas recebeu 500.",
    failureLocation: "cypress/e2e/usuários.cy.js:42:7",
    expected: "400",
    actual: "500",
    currentResult: "A API respondeu HTTP 500 Internal Server Error à requisição POST /users.",
    expectedResult: "O teste esperava HTTP 400 Bad Request.",
    request: {
      startLine: "POST /users",
      headers: { "content-type": "application/json", authorization: "Bearer <TOKEN>" },
      body: { nome: "Ana" },
    },
    response: {
      startLine: "HTTP/1.1 500 Internal Server Error",
      headers: { "content-type": "application/json" },
      body: { error: "Falha" },
      durationMs: 47,
    },
    comparison: [{ label: "Status HTTP", expected: "400 Bad Request", received: "500 Internal Server Error" }],
    curl: "curl -X POST 'https://api.test/users' -H 'authorization: Bearer <TOKEN>'",
    bdd: 'DADO que o payload não continha o campo "email"\nQUANDO foi executado POST /users',
    traceability: [
      { label: "API", value: "usuarios" },
      { label: "Operação", value: "POST /users" },
      { label: "Teste", value: "deve rejeitar usuário sem e-mail" },
      { label: "Spec", value: "cypress/e2e/usuários.cy.js" },
      { label: "Gerado por", value: "FailLens" },
    ],
    screenshot: {
      relativePath: "cypress/screenshots/usuários.cy.js/falha (failed).png",
      href: "../../cypress/screenshots/usu%C3%A1rios.cy.js/falha%20(failed).png",
    },
  };
}

test("evidência textual é determinística e usa somente cURL sanitizado/path relativo", () => {
  const text = buildEvidenceText(evidenceInput());
  const headings = ["# [API]", "## Contexto", "## Cenário", "## Resultado atual", "## Resultado esperado",
    "## Requisição enviada", "## Resposta recebida", "## Comparação", "## Falha registrada pelo teste",
    "## Passos para reprodução", "## Evidência visual", "## Rastreabilidade"];
  let cursor = -1;
  for (const heading of headings) {
    const next = text.indexOf(heading);
    assert.ok(next > cursor, `${heading} deve respeitar a ordem aprovada`);
    cursor = next;
  }
  assert.match(text, /```gherkin[\s\S]*DADO que o payload/);
  assert.match(text, /\| Status HTTP \| `400 Bad Request` \| `500 Internal Server Error` \|/);
  assert.match(text, /Bearer <TOKEN>/);
  assert.match(text, /cypress\/screenshots\/usuários\.cy\.js/);
  assert.doesNotMatch(text, /Bearer real-token|[A-Z]:\\|\/home\//);
  assert.doesNotMatch(text, /Evidência de persistência|backend esqueceu|severidade|responsável/i);
});

test("HTML rico escapa conteúdo e só aceita data URL PNG em memória", () => {
  const input = evidenceInput();
  input.failure = '<img src=x onerror="PWNED">';
  const html = buildEvidenceHtml(input, "data:image/png;base64,AAA=");
  assert.match(html, /&lt;img src=x onerror=&quot;PWNED&quot;&gt;/);
  assert.match(html, /data:image\/png;base64,AAA=/);
  assert.match(html, /<h2>Cenário<\/h2>/);
  assert.match(html, /<table>[\s\S]*Status HTTP[\s\S]*<\/table>/);
  assert.match(html, /<h2>Rastreabilidade<\/h2>/);
  assert.doesNotMatch(buildEvidenceHtml(input, "javascript:alert(1)"), /javascript:/);
});

test("montagem do chamado degrada sem contrato ou metadata opcional", () => {
  const issue = buildIssueContent({
    id: "t1",
    title: "deve retornar 404",
    state: "failed",
    durationMs: 10,
    error: { name: "AssertionError", message: "expected 200 to equal 404", expected: 404, actual: 200 },
    statusExpectation: { type: "exact", label: "404", expected: 404, actual: 200, source: "asserted" },
    requests: [{
      id: "r1", order: 1, phase: "validacao", method: "GET", url: "https://api.test/items/999",
      requestHeaders: {}, requestBody: null, responseHeaders: {}, responseBody: { id: 999 },
      receivedStatus: 200, durationMs: 12, curl: "curl 'https://api.test/items/999'",
    }],
    mainRequestId: "r1",
  }, "cypress/e2e/items.cy.js", []);
  assert.ok(issue);
  assert.equal(issue.context, "Falha observada na operação GET /items/999.");
  assert.equal(issue.traceability.some((row) => row.label === "API"), false);
  assert.equal(issue.traceability.some((row) => row.label === "Gerado por" && row.value === "FailLens"), true);
  assert.match(buildEvidenceText(issue), /## Evidência visual\n\nScreenshot não disponível\./);
});

test("montagem usa somente mensagem e contexto da regra contratual vinculada", () => {
  const issue = buildIssueContent({
    id: "t1", title: "deve exigir nome", state: "failed", durationMs: 10,
    error: { name: "AssertionError", message: "expected 201 to equal 400", expected: 400, actual: 201 },
    statusExpectation: { type: "exact", label: "400", expected: 400, actual: 201, source: "asserted" },
    ruleRefs: [{ ruleId: "nome-obrigatorio", contractId: "usuarios", resolved: true }],
    contractId: "usuarios",
    requests: [{ id: "r1", order: 1, phase: "validacao", method: "POST", url: "https://api.test/usuarios",
      requestHeaders: {}, requestBody: {}, responseHeaders: {}, responseBody: { id: 1 }, receivedStatus: 201,
      durationMs: 9, curl: "curl ..." }], mainRequestId: "r1",
  }, "validacoes.cy.js", [{
    id: "usuarios", api: ["POST /usuarios"], resumo: "Cadastro de usuários.", fields: [], cobertura: [],
    sourceFiles: ["crud.cy.js"], legacy: false, warnings: [],
    rules: [{ id: "nome-obrigatorio", attributes: { operation: "POST" }, status: 400,
      message: "Nome é obrigatório", raw: "" }],
  }]);
  assert.equal(issue.context, "Cadastro de usuários.\nRegra contratual relacionada: nome-obrigatorio.");
  assert.match(issue.expectedResult, /Mensagem declarada pela regra "nome-obrigatorio": Nome é obrigatório/);
  assert.equal(issue.traceability.some((row) => row.label === "Regra" && row.value === "nome-obrigatorio"), true);
});

function clipboardEnvironment(overrides = {}) {
  const writes = [];
  class ClipboardItem {
    constructor(data) { this.data = data; }
    static supports(type) { return type === "image/png"; }
  }
  return {
    writes,
    environment: {
      isSecureContext: true,
      clipboard: {
        async write(items) { writes.push(items); },
        async writeText(value) { writes.push(value); },
      },
      ClipboardItem,
      Blob,
      async fallbackCopy(value) { writes.push(value); return true; },
      ...overrides,
    },
  };
}

test("clipboard rico confirma texto, HTML e PNG somente após write resolver", async () => {
  const { environment, writes } = clipboardEnvironment();
  const result = await copyEvidenceToClipboard({
    text: "texto",
    html: "<p>texto</p>",
    imageBlob: new Blob(["png"], { type: "image/png" }),
    hasScreenshot: true,
  }, environment);

  assert.equal(result, "complete");
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0][0].data).sort(), ["image/png", "text/html", "text/plain"]);
});

test("clipboard cai para texto quando imagem é bloqueada", async () => {
  const { environment, writes } = clipboardEnvironment();
  const result = await copyEvidenceToClipboard({
    text: "texto + curl + caminho",
    html: "<p>texto</p>",
    hasScreenshot: true,
  }, environment);

  assert.equal(result, "without-image");
  assert.equal(writes.length, 1);
});

test("clipboard sem API moderna usa fallback textual existente", async () => {
  const { environment, writes } = clipboardEnvironment({
    isSecureContext: false,
    clipboard: undefined,
    ClipboardItem: undefined,
  });
  const result = await copyEvidenceToClipboard({
    text: "evidência textual",
    html: "<p>evidência</p>",
    hasScreenshot: true,
  }, environment);

  assert.equal(result, "text-only");
  assert.deepEqual(writes, ["evidência textual"]);
});

test("falha de write e writeText ainda tenta fallback", async () => {
  const { environment, writes } = clipboardEnvironment({
    clipboard: {
      async write() { throw new Error("blocked"); },
      async writeText() { throw new Error("blocked"); },
    },
  });
  const result = await copyEvidenceToClipboard({ text: "fallback", html: "<p>x</p>", hasScreenshot: false }, environment);
  assert.equal(result, "text-only");
  assert.deepEqual(writes, ["fallback"]);
});
