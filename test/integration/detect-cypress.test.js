"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { detectCypress, CYPRESS_NOT_FOUND_MESSAGE } = require("../../dist/cli/detectCypress");

async function makeProjectDir(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-detect-"));
  const {
    withPackageJson = true,
    withCypress = true,
    withConfig = true,
    withCypressDir = true,
    supportFile = null,
    configuredFile = null,
  } = options;

  if (withPackageJson) {
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "test-project",
        devDependencies: withCypress ? { cypress: "13.0.0" } : {},
      }),
    );
  }

  if (withCypressDir) {
    await fs.mkdir(path.join(root, "cypress", "e2e"), { recursive: true });
  }

  if (withConfig) {
    const configName = configuredFile || "cypress.config.js";
    await fs.writeFile(
      path.join(root, configName),
      "module.exports = { e2e: {} };\n",
    );
  }

  if (supportFile === "e2e") {
    await fs.mkdir(path.join(root, "cypress", "support"), { recursive: true });
    await fs.writeFile(path.join(root, "cypress", "support", "e2e.js"), "");
  } else if (supportFile === "index") {
    await fs.mkdir(path.join(root, "cypress", "support"), { recursive: true });
    await fs.writeFile(path.join(root, "cypress", "support", "index.js"), "");
  }

  return root;
}

test("detecção bem-sucedida — retorna campos obrigatórios", async () => {
  const root = await makeProjectDir();
  const result = await detectCypress(root);
  assert.equal(result.projectRoot, root);
  assert.ok(result.configPath.endsWith("cypress.config.js"));
  assert.ok(result.packageJsonPath.endsWith("package.json"));
  assert.ok(result.cypressDir.endsWith("cypress"));
  assert.equal(result.supportPath, undefined);
});

test("sem package.json — lança CYPRESS_NOT_FOUND_MESSAGE", async () => {
  const root = await makeProjectDir({ withPackageJson: false });
  await assert.rejects(
    () => detectCypress(root),
    (error) => error.message === CYPRESS_NOT_FOUND_MESSAGE,
  );
});

test("cypress não declarado nas deps — lança CYPRESS_NOT_FOUND_MESSAGE", async () => {
  const root = await makeProjectDir({ withCypress: false });
  await assert.rejects(
    () => detectCypress(root),
    (error) => error.message === CYPRESS_NOT_FOUND_MESSAGE,
  );
});

test("sem cypress.config.js — lança CYPRESS_NOT_FOUND_MESSAGE", async () => {
  const root = await makeProjectDir({ withConfig: false });
  await assert.rejects(
    () => detectCypress(root),
    (error) => error.message === CYPRESS_NOT_FOUND_MESSAGE,
  );
});

test("sem diretório cypress/ — lança CYPRESS_NOT_FOUND_MESSAGE", async () => {
  const root = await makeProjectDir({ withCypressDir: false });
  await assert.rejects(
    () => detectCypress(root),
    (error) => error.message === CYPRESS_NOT_FOUND_MESSAGE,
  );
});

test("support file e2e.js detectado", async () => {
  const root = await makeProjectDir({ supportFile: "e2e" });
  const result = await detectCypress(root);
  assert.ok(result.supportPath?.endsWith("e2e.js"));
});

test("support file index.js detectado como fallback", async () => {
  const root = await makeProjectDir({ supportFile: "index" });
  const result = await detectCypress(root);
  assert.ok(result.supportPath?.endsWith("index.js"));
});

test("e2e.js tem prioridade sobre index.js", async () => {
  const root = await makeProjectDir({ supportFile: "e2e" });
  await fs.mkdir(path.join(root, "cypress", "support"), { recursive: true });
  await fs.writeFile(path.join(root, "cypress", "support", "index.js"), "");
  const result = await detectCypress(root);
  assert.ok(result.supportPath?.endsWith("e2e.js"));
});

test("configuredFile personalizado aceito", async () => {
  const root = await makeProjectDir({ withConfig: false, configuredFile: "cypress.custom.js" });
  await fs.writeFile(path.join(root, "cypress.custom.js"), "module.exports = {};\n");
  const result = await detectCypress(root, "cypress.custom.js");
  assert.ok(result.configPath.endsWith("cypress.custom.js"));
});

test("cypress em dependencies (não só devDependencies) — detectado", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-detect-"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "proj", dependencies: { cypress: "13.0.0" } }),
  );
  await fs.mkdir(path.join(root, "cypress", "e2e"), { recursive: true });
  await fs.writeFile(path.join(root, "cypress.config.js"), "module.exports = {};\n");
  const result = await detectCypress(root);
  assert.equal(result.projectRoot, root);
});

test("outputDir padrão é reports/faillens relativo ao projectRoot", async () => {
  const root = await makeProjectDir();
  const result = await detectCypress(root);
  assert.equal(result.outputDir, path.join(root, "reports", "faillens"));
});
