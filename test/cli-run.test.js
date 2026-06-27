const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { runCommand } = require("../dist/cli/run");

test("run instrumenta consumidor, gera os dois relatórios e preserva exit code", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-consumer-"));
  await fs.mkdir(path.join(root, "cypress", "support"), { recursive: true });
  await fs.mkdir(path.join(root, "cypress", "e2e"), { recursive: true });
  await fs.mkdir(path.join(root, "node_modules", "cypress", "bin"), { recursive: true });
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "fake-api",
    devDependencies: { cypress: "1.0.0" },
  }));
  await fs.writeFile(path.join(root, "node_modules", "cypress", "package.json"), JSON.stringify({
    name: "cypress", version: "1.0.0",
  }));
  await fs.writeFile(path.join(root, "cypress", "support", "e2e.js"), "globalThis.originalSupportLoaded = true;\n");
  await fs.writeFile(path.join(root, "cypress", "e2e", "api.cy.js"), "// fixture sintética\n");
  await fs.writeFile(path.join(root, "cypress.config.js"), `module.exports = {
    baseUrl: "http://localhost:3333",
    e2e: {
      setupNodeEvents(on, config) {
        on("task", { consumerTask() { return "preserved"; } });
        on("after:spec", () => { globalThis.consumerAfterSpec = true; });
        return config;
      }
    }
  };\n`);
  await fs.writeFile(path.join(root, "node_modules", "cypress", "bin", "cypress.js"), `
    const path = require("node:path");
    (async () => {
      const index = process.argv.indexOf("--config-file");
      const generated = require(path.resolve(process.argv[index + 1]));
      const handlers = {};
      const on = (name, handler) => { handlers[name] = handler; };
      await generated.e2e.setupNodeEvents(on, { baseUrl: generated.baseUrl, e2e: generated.e2e });
      if (handlers.task.consumerTask() !== "preserved") throw new Error("task do consumidor não preservada");
      const specPath = "cypress/e2e/api.cy.js";
      handlers.task["faillens:setTest"]({ id: "test-1", title: "Suite > falha", titlePath: ["Suite", "falha"], specPath });
      handlers.task["faillens:addRequest"]({ id: "req-1", testId: "test-1", specPath, method: "POST", url: "http://localhost:3333/users", originalUrl: "/users", requestHeaders: { authorization: "Bearer real" }, requestBody: { password: "real" } });
      handlers.task["faillens:finishRequest"]({ id: "req-1", testId: "test-1", specPath, receivedStatus: 201, responseHeaders: {}, responseBody: { id: 7 }, durationMs: 50 });
      handlers.task["faillens:setTestResult"]({ testId: "test-1", specPath, state: "failed", durationMs: 80, error: { name: "AssertionError", message: "expected 201 to equal 400", expected: 400, actual: 201 } });
      await handlers["after:spec"]({ relative: specPath, name: "api.cy.js" }, { stats: { duration: 80 }, tests: [{ title: ["Suite", "falha"], state: "failed", attempts: [{ wallClockDuration: 80 }] }] });
      if (!globalThis.consumerAfterSpec) throw new Error("after:spec do consumidor não preservado");
      await handlers["after:run"]({});
      process.exitCode = 7;
    })().catch((error) => { console.error(error); process.exitCode = 99; });
  `);

  const exitCode = await runCommand([], root);
  assert.equal(exitCode, 7);
  const jsonPath = path.join(root, "reports", "faillens", "faillens-report.json");
  const htmlPath = path.join(root, "reports", "faillens", "index.html");
  const report = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  const html = await fs.readFile(htmlPath, "utf8");
  assert.equal(report.summary.failed, 1);
  assert.equal(report.summary.requests, 1);
  assert.equal(report.specs[0].tests[0].diagnosis.category, "validation-not-applied");
  assert.doesNotMatch(JSON.stringify(report), /Bearer real|password":"real/);
  assert.match(html, /FailLens/);
});
