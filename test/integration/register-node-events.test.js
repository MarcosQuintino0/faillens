"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { registerNodeEvents } = require("../../dist/cypress/registerNodeEvents");

test("uso direto de registerNodeEvents mantém geração no after:run", async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-register-"));
  const resultsDir = path.join(projectRoot, ".faillens", "results");
  const outputDir = path.join(projectRoot, "reports", "faillens");
  await fs.mkdir(resultsDir, { recursive: true });
  const handlers = {};
  registerNodeEvents((name, handler) => { handlers[name] = handler; }, {}, {
    projectRoot,
    resultsDir,
    outputDir,
    config: { outputDir, theme: "dark", maskFields: [], maskPatterns: [] },
  });

  handlers.task["faillens:setTest"]({ id: "test", title: "falha", specPath: "api.cy.js" });
  handlers.task["faillens:setTestResult"]({ testId: "test", specPath: "api.cy.js", state: "failed", durationMs: 1 });
  await handlers["after:spec"]({ relative: "api.cy.js" }, { tests: [{ title: ["falha"], state: "failed", attempts: [{ wallClockDuration: 1 }] }] });
  await handlers["after:run"]({});

  await assert.doesNotReject(fs.stat(path.join(outputDir, "index.html")));
  await assert.doesNotReject(fs.stat(path.join(outputDir, "faillens-report.json")));
});

test("RequestStore via registerNodeEvents aplica maskPatterns antes do parcial", async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-register-mask-"));
  const resultsDir = path.join(projectRoot, ".faillens", "results");
  const outputDir = path.join(projectRoot, "reports", "faillens");
  await fs.mkdir(resultsDir, { recursive: true });
  const handlers = {};
  registerNodeEvents((name, handler) => { handlers[name] = handler; }, {}, {
    projectRoot,
    resultsDir,
    outputDir,
    config: { outputDir, theme: "dark", maskFields: [], maskPatterns: ["recovery-code=[A-Z0-9-]+"] },
    generateOnAfterRun: false,
  });

  handlers.task["faillens:setTest"]({ id: "test", title: "falha", specPath: "api.cy.js" });
  handlers.task["faillens:addRequest"]({
    id: "req",
    testId: "test",
    specPath: "api.cy.js",
    method: "POST",
    url: "/items?debug=recovery-code=ABC-123-SECRET",
    responseBody: { message: "recovery-code=ABC-123-SECRET" },
  });
  handlers.task["faillens:finishRequest"]({
    id: "req",
    testId: "test",
    specPath: "api.cy.js",
    receivedStatus: 500,
    responseBody: { message: "recovery-code=ABC-123-SECRET" },
    error: { message: "expected recovery-code=ABC-123-SECRET to equal ok" },
  });
  handlers.task["faillens:setTestResult"]({
    testId: "test",
    specPath: "api.cy.js",
    state: "failed",
    error: { message: "expected recovery-code=ABC-123-SECRET to equal ok" },
  });
  await handlers["after:spec"]({ relative: "api.cy.js" }, { tests: [{ title: ["falha"], state: "failed", attempts: [{ wallClockDuration: 1 }] }] });

  const partialFile = (await fs.readdir(resultsDir)).find((name) => name.endsWith(".json"));
  const partial = await fs.readFile(path.join(resultsDir, partialFile), "utf8");
  assert.doesNotMatch(partial, /ABC-123-SECRET/);
  assert.match(partial, /\*\*\*/);
});
