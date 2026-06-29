"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildEvidenceText, buildEvidenceHtml } = require("../../dist/reporter/evidence");
const { copyEvidenceToClipboard } = require("../../dist/templates/evidenceClipboard");

function evidenceInput() {
  return {
    title: "deve rejeitar usuário sem e-mail",
    specPath: "cypress/e2e/usuários.cy.js",
    failure: "Esperava status 400, mas recebeu 500.",
    expected: "400",
    actual: "500",
    curl: "curl -X POST 'https://api.test/users' -H 'authorization: Bearer <TOKEN>'",
    bdd: 'DADO que o payload não continha o campo "email"\nQUANDO foi executado POST /users',
    screenshot: {
      relativePath: "cypress/screenshots/usuários.cy.js/falha (failed).png",
      href: "../../cypress/screenshots/usu%C3%A1rios.cy.js/falha%20(failed).png",
    },
  };
}

test("evidência textual é determinística e usa somente cURL sanitizado/path relativo", () => {
  const text = buildEvidenceText(evidenceInput());
  assert.equal(text, [
    "Evidência FailLens",
    "",
    "Teste: deve rejeitar usuário sem e-mail",
    "Spec: cypress/e2e/usuários.cy.js",
    "Falha: Esperava status 400, mas recebeu 500.",
    "Esperado: 400",
    "Recebido: 500",
    "",
    "Cenário BDD:",
    'DADO que o payload não continha o campo "email"',
    "QUANDO foi executado POST /users",
    "",
    "cURL:",
    "curl -X POST 'https://api.test/users' -H 'authorization: Bearer <TOKEN>'",
    "",
    "Screenshot:",
    "cypress/screenshots/usuários.cy.js/falha (failed).png",
  ].join("\n"));
  assert.doesNotMatch(text, /Bearer real-token|[A-Z]:\\|\/home\//);
});

test("HTML rico escapa conteúdo e só aceita data URL PNG em memória", () => {
  const input = evidenceInput();
  input.failure = '<img src=x onerror="PWNED">';
  const html = buildEvidenceHtml(input, "data:image/png;base64,AAA=");
  assert.match(html, /&lt;img src=x onerror=&quot;PWNED&quot;&gt;/);
  assert.match(html, /data:image\/png;base64,AAA=/);
  assert.match(html, /<h2>Cenário BDD<\/h2>/);
  assert.doesNotMatch(buildEvidenceHtml(input, "javascript:alert(1)"), /javascript:/);
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
