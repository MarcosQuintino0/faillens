"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { buildReportModel, generateJson } = require("../../dist");

async function buildAndGenerateJson(specs = [], config = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-json-"));
  const report = buildReportModel(specs, { config });
  const file = await generateJson(report, dir);
  const content = await fs.readFile(file, "utf8");
  return { dir, file, content, report, parsed: JSON.parse(content) };
}

function makeSpec() {
  return {
    specPath: "cypress/e2e/users.cy.js",
    durationMs: 300,
    tests: [{
      id: "t-1",
      title: "Deve retornar 400",
      state: "failed",
      durationMs: 100,
      error: { name: "AssertionError", message: "expected 201 to equal 400", expected: 400, actual: 201 },
      requests: [{
        id: "req-1",
        order: 1,
        phase: "chamada",
        method: "POST",
        url: "http://localhost:3333/users",
        originalUrl: "/users",
        requestHeaders: { authorization: "Bearer segredo" },
        requestBody: { password: "senha-real" },
        responseHeaders: {},
        responseBody: { id: 1 },
        receivedStatus: 201,
        durationMs: 80,
        curl: "",
      }],
    }],
  };
}

test("arquivo JSON é criado no outputDir com nome correto", async () => {
  const { dir, file } = await buildAndGenerateJson();
  assert.ok(file.startsWith(dir));
  assert.ok(file.endsWith("faillens-report.json"));
  const stat = await fs.stat(file);
  assert.ok(stat.size > 0);
});

test("JSON é válido e parseável", async () => {
  const { content } = await buildAndGenerateJson([makeSpec()]);
  assert.doesNotThrow(() => JSON.parse(content));
});

test("JSON contém campos obrigatórios de nível raiz", async () => {
  const { parsed } = await buildAndGenerateJson([makeSpec()]);
  assert.ok(parsed.generatedAt);
  assert.ok(parsed.tool);
  assert.equal(parsed.tool.name, "FailLens");
  assert.ok(parsed.summary);
  assert.ok(Array.isArray(parsed.specs));
});

test("summary contém todos os campos esperados", async () => {
  const { parsed } = await buildAndGenerateJson([makeSpec()]);
  const s = parsed.summary;
  assert.ok(typeof s.tests === "number");
  assert.ok(typeof s.passed === "number");
  assert.ok(typeof s.failed === "number");
  assert.ok(typeof s.skipped === "number");
  assert.ok(typeof s.requests === "number");
  assert.ok(typeof s.durationMs === "number");
  assert.ok(typeof s.passRate === "number");
});

test("dados sensíveis não aparecem no JSON", async () => {
  const { content } = await buildAndGenerateJson([makeSpec()]);
  assert.doesNotMatch(content, /segredo/);
  assert.doesNotMatch(content, /senha-real/);
});

test("JSON sem specs — summary zerado", async () => {
  const { parsed } = await buildAndGenerateJson([]);
  assert.equal(parsed.summary.tests, 0);
  assert.equal(parsed.summary.failed, 0);
  assert.equal(parsed.specs.length, 0);
});

test("generatedAt é uma ISO 8601 válida", async () => {
  const { parsed } = await buildAndGenerateJson();
  const date = new Date(parsed.generatedAt);
  assert.ok(!isNaN(date.getTime()));
});

test("tool.packageName é faillens", async () => {
  const { parsed } = await buildAndGenerateJson();
  assert.equal(parsed.tool.packageName, "faillens");
  assert.ok(parsed.tool.version);
});

test("JSON persiste metadata de screenshot sem caminho absoluto, bytes ou base64", async () => {
  const spec = makeSpec();
  spec.tests[0].evidence = { screenshots: [{
    relativePath: "cypress/screenshots/users.cy.js/falha (failed).png",
    href: "../../cypress/screenshots/users.cy.js/falha%20(failed).png",
    fileName: "falha (failed).png",
    size: 2048,
    kind: "failure",
  }] };
  const { content, parsed } = await buildAndGenerateJson([spec]);
  assert.equal(parsed.specs[0].tests[0].evidence.screenshots[0].size, 2048);
  assert.doesNotMatch(content, /data:image\/png;base64|iVBORw0KGgo|[A-Z]:\\|\/home\//i);
});
