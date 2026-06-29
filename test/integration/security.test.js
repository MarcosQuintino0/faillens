const test = require("node:test");
const assert = require("node:assert/strict");
const { generateCurl } = require("../../dist/collector/curlGenerator");
const { maskSensitiveData } = require("../../dist/collector/sensitiveMask");
const { buildReportModel } = require("../../dist/reporter/buildReportModel");
const { reportTemplate } = require("../../dist/templates/reportTemplate");

function request(overrides = {}) {
  return {
    id: "req-1",
    order: 1,
    phase: "chamada",
    method: "POST",
    url: "https://api.example.test/items",
    requestHeaders: {},
    requestBody: null,
    receivedStatus: 201,
    responseHeaders: {},
    responseBody: {},
    durationMs: 10,
    curl: "",
    ...overrides,
  };
}

function failedTest(overrides = {}) {
  return {
    id: "test-1",
    title: "cria item",
    state: "failed",
    durationMs: 10,
    error: { name: "AssertionError", message: "expected 201 to equal 400", actual: 201, expected: 400 },
    requests: [request()],
    ...overrides,
  };
}

test("cURL neutraliza metacaracteres de shell em método HTTP não convencional", () => {
  const curl = generateCurl({
    method: "GET; echo PWNED",
    url: "https://api.example.test/health",
  });

  assert.match(curl, /curl -X 'GET; ECHO PWNED'/);
  assert.doesNotMatch(curl, /curl -X GET; echo/i);
});

test("script de reprodução mantém metadados em comentários e ignora paths inseguros para jq", () => {
  const first = request({
    responseBody: { "id'); echo PWNED; #": "abc-123" },
  });
  const second = request({
    id: "req-2",
    order: 2,
    method: "GET",
    url: "https://api.example.test/items/abc-123\necho URL_PWNED",
    receivedStatus: 404,
  });
  const report = buildReportModel([{ specPath: "api.cy.js", durationMs: 10, tests: [failedTest({
    title: "falha\necho TITLE_PWNED",
    requests: [first, second],
  })] }]);
  const script = report.specs[0].tests[0].reproductionScript;

  assert.match(script, /# Teste: falha echo TITLE_PWNED/);
  assert.doesNotMatch(script, /\necho TITLE_PWNED/);
  assert.doesNotMatch(script, /\necho URL_PWNED/);
  assert.doesNotMatch(script, /jq -r .*PWNED/);
});

test("mascaramento preserva chaves especiais como propriedades próprias sem alterar o protótipo", () => {
  const source = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"token":"secret"}}');
  const masked = maskSensitiveData(source);

  assert.equal(Object.getPrototypeOf(masked), Object.prototype);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(masked, "__proto__"), true);
  assert.deepEqual(masked.__proto__, { polluted: true });
  assert.deepEqual(masked.constructor, { token: "***" });
});

test("cliente usa mapas sem protótipo para caminhos de spec controlados pelo relatório", () => {
  const report = buildReportModel([{ specPath: "__proto__", durationMs: 0, tests: [failedTest()] }]);
  const html = reportTemplate(report);

  assert.match(html, /collapsedSpecs: Object\.create\(null\)/);
  assert.match(html, /var groups = Object\.create\(null\)/);
  assert.match(html, /__proto__/);
});

test("tema não confiável não injeta atributos no HTML e o relatório bloqueia conexões externas", () => {
  const report = buildReportModel([], {
    config: { theme: 'dark" onload="globalThis.PWNED=true' },
  });
  const html = reportTemplate(report);

  assert.equal(report.theme, "dark");
  assert.match(html, /<html lang="pt-BR" data-theme="dark">/);
  assert.doesNotMatch(html, /onload=/i);
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /img-src 'self' data: blob:/);
  assert.doesNotMatch(html, /connect-src \*/);
});

test("evidence rejeita hrefs executáveis, traversal e caminhos absolutos", () => {
  const source = failedTest({
    evidence: { screenshots: [
      { relativePath: "../../secret.png", href: "javascript:alert(1)", fileName: "secret.png", size: 1, kind: "failure" },
      { relativePath: "C:/secret.png", href: "file:///C:/secret.png", fileName: "secret.png", size: 1, kind: "failure" },
    ] },
  });
  const report = buildReportModel([{ specPath: "api.cy.js", durationMs: 10, tests: [source] }]);
  const html = reportTemplate(report);
  assert.equal(report.specs[0].tests[0].evidence, undefined);
  assert.doesNotMatch(html, /javascript:|file:\/\/|C:\/secret|\.\.\/\.\.\/secret/);
});

test("BDD malicioso permanece dado inerte no HTML e não vira markup executável", () => {
  const source = failedTest({
    requests: [request({
      method: "GET",
      url: "https://api.example.test/items/%3Cimg%20src=x%20onerror=PWNED%3E",
      receivedStatus: 500,
    })],
    error: { name: "AssertionError", message: "expected 500 to equal 404", actual: 500, expected: 404 },
  });
  const report = buildReportModel([{ specPath: "api.cy.js", durationMs: 10, tests: [source] }]);
  const html = reportTemplate(report);
  assert.match(report.specs[0].tests[0].bddScenario.text, /%3Cimg%20src=x%20onerror=PWNED%3E/);
  assert.doesNotMatch(html, /<img src=x onerror=PWNED>/i);
  assert.match(html, /%3Cimg%20src=x%20onerror=PWNED%3E/);
});
