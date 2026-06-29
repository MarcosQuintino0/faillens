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
    config: { outputDir, theme: "dark", maskFields: [] },
  });

  handlers.task["faillens:setTest"]({ id: "test", title: "falha", specPath: "api.cy.js" });
  handlers.task["faillens:setTestResult"]({ testId: "test", specPath: "api.cy.js", state: "failed", durationMs: 1 });
  await handlers["after:spec"]({ relative: "api.cy.js" }, { tests: [{ title: ["falha"], state: "failed", attempts: [{ wallClockDuration: 1 }] }] });
  await handlers["after:run"]({});

  await assert.doesNotReject(fs.stat(path.join(outputDir, "index.html")));
  await assert.doesNotReject(fs.stat(path.join(outputDir, "faillens-report.json")));
});
