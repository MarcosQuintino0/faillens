"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { loadFailLensConfig } = require("../../dist/cli/config");
const { DEFAULT_MASK_FIELDS } = require("../../dist/collector/sensitiveMask");

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "faillens-config-"));
}

async function writeConfig(dir, content) {
  await fs.writeFile(path.join(dir, "faillens.config.js"), content);
}

async function writePackageJson(dir, name) {
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name }));
}

test("sem faillens.config.js — usa defaults", async () => {
  const dir = await makeTmpDir();
  const config = await loadFailLensConfig(dir);
  assert.ok(config.outputDir.endsWith(path.join("reports", "faillens")));
  assert.equal(config.theme, "dark");
  assert.ok(Array.isArray(config.maskFields) && config.maskFields.length > 0);
  assert.equal(config.projectName, undefined);
  assert.equal(config.runId, undefined);
  assert.equal(config.branch, undefined);
});

test("outputDir default resolve relativo ao projectRoot", async () => {
  const dir = await makeTmpDir();
  const config = await loadFailLensConfig(dir);
  assert.ok(path.isAbsolute(config.outputDir));
  assert.ok(config.outputDir.startsWith(dir));
});

test("outputDir customizado é resolvido para absoluto", async () => {
  const dir = await makeTmpDir();
  await writeConfig(dir, 'module.exports = { outputDir: "custom/reports" };\n');
  const config = await loadFailLensConfig(dir);
  assert.ok(path.isAbsolute(config.outputDir));
  assert.ok(config.outputDir.endsWith(path.join("custom", "reports")));
});

test("theme light preservado", async () => {
  const dir = await makeTmpDir();
  await writeConfig(dir, 'module.exports = { theme: "light" };\n');
  const config = await loadFailLensConfig(dir);
  assert.equal(config.theme, "light");
});

test("theme inválido resulta em dark", async () => {
  const dir = await makeTmpDir();
  await writeConfig(dir, 'module.exports = { theme: "blue" };\n');
  const config = await loadFailLensConfig(dir);
  assert.equal(config.theme, "dark");
});

test("maskFields customizados são MERGEADOS com os padrão (sem duplicatas)", async () => {
  const dir = await makeTmpDir();
  await writeConfig(dir, 'module.exports = { maskFields: ["sessionId", "privateKey"] };\n');
  const config = await loadFailLensConfig(dir);
  assert.ok(config.maskFields.includes("sessionId"));
  assert.ok(config.maskFields.includes("privateKey"));
  for (const field of DEFAULT_MASK_FIELDS) {
    assert.ok(config.maskFields.includes(field), `Campo padrão ${field} deve estar presente`);
  }
  const unique = new Set(config.maskFields);
  assert.equal(unique.size, config.maskFields.length, "Não deve ter campos duplicados");
});

test("projectName lido do faillens.config.js", async () => {
  const dir = await makeTmpDir();
  await writeConfig(dir, 'module.exports = { projectName: "meu-servico" };\n');
  const config = await loadFailLensConfig(dir);
  assert.equal(config.projectName, "meu-servico");
});

test("projectName lido do package.json quando ausente no faillens.config.js", async () => {
  const dir = await makeTmpDir();
  await writePackageJson(dir, "checkout-api");
  const config = await loadFailLensConfig(dir);
  assert.equal(config.projectName, "checkout-api");
});

test("projectName do faillens.config.js tem prioridade sobre package.json", async () => {
  const dir = await makeTmpDir();
  await writePackageJson(dir, "checkout-api");
  await writeConfig(dir, 'module.exports = { projectName: "checkout-service" };\n');
  const config = await loadFailLensConfig(dir);
  assert.equal(config.projectName, "checkout-service");
});

test("runId e branch preservados", async () => {
  const dir = await makeTmpDir();
  await writeConfig(dir, 'module.exports = { runId: "build-42", branch: "main" };\n');
  const config = await loadFailLensConfig(dir);
  assert.equal(config.runId, "build-42");
  assert.equal(config.branch, "main");
});

test("cypressConfigFile customizado preservado", async () => {
  const dir = await makeTmpDir();
  await writeConfig(dir, 'module.exports = { cypressConfigFile: "cypress.custom.js" };\n');
  const config = await loadFailLensConfig(dir);
  assert.equal(config.cypressConfigFile, "cypress.custom.js");
});

test("faillens.config.js com sintaxe inválida — lança erro com mensagem útil", async () => {
  const dir = await makeTmpDir();
  await writeConfig(dir, "module.exports = { invalid json };\n");
  await assert.rejects(
    () => loadFailLensConfig(dir),
    (error) => error.message.includes("faillens.config.js"),
  );
});

test("config com export default (ESM-style) — carregada corretamente", async () => {
  const dir = await makeTmpDir();
  await writeConfig(dir, 'module.exports = { default: { theme: "light", projectName: "esm-proj" } };\n');
  const config = await loadFailLensConfig(dir);
  assert.equal(config.theme, "light");
  assert.equal(config.projectName, "esm-proj");
});
