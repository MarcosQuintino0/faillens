"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { resolveReportLocation } = require("../../dist/cli/open");

test("open encontra o relatório padrão e infere a raiz do projeto", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-open-"));
  const reportDir = path.join(root, "reports", "faillens");
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, "index.html"), "<!doctype html>");
  await fs.writeFile(path.join(reportDir, "faillens-report.json"), '{"specs":[]}');

  const location = await resolveReportLocation(undefined, root);
  assert.equal(location.reportDir, reportDir);
  assert.equal(location.projectRoot, root);
});

test("open rejeita diretório sem os dois artefatos obrigatórios", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-open-invalid-"));
  await assert.rejects(() => resolveReportLocation(root, root), /relatório FailLens válido/i);
});

