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
  await fs.writeFile(path.join(root, "cypress", "e2e", "api.cy.js"), `
    it("falha", () => {
      expect(response.status, "Status deve ser 400").to.eq(400);
      expect(response.body, "Body deve conter erro").to.have.property("error");
      cy.request("/verify");
      expect(response.body.id, "Recurso não deveria existir").to.be.undefined;
    });
  `);
  await fs.writeFile(path.join(root, "cypress.config.js"), `module.exports = {
    baseUrl: "http://localhost:3333",
    e2e: {
      setupNodeEvents(on, config) {
        on("task", { consumerTask() { return "preserved"; } });
        on("after:spec", () => { globalThis.consumerAfterSpec = true; });
        on("after:screenshot", async () => { globalThis.consumerAfterScreenshot = true; return { size: 999 }; });
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
      handlers.task["faillens:finishRequest"]({
        id: "req-1",
        testId: "test-1",
        specPath,
        receivedStatus: 201,
        responseHeaders: {},
        responseBody: { id: 7 },
        durationMs: 50,
        redirects: [{ statusCode: 302, location: "http://localhost:3333/next?token=real" }],
      });
      handlers.task["faillens:setTestResult"]({
        testId: "test-1",
        specPath,
        state: "failed",
        durationMs: 80,
        error: { name: "AssertionError", message: "expected 201 to equal 400", expected: 400, actual: 201 },
        assertions: [
          { id: "hook-login", title: "Login deve retornar 200", state: "passed", expected: 200, actual: 200 },
          { id: "a-1", title: "Status deve ser 400", state: "failed", expected: 400, actual: 201 },
        ],
      });
      const screenshotResult = await handlers["after:screenshot"]({
        path: path.join(process.cwd(), "cypress", "screenshots", "api.cy.js", "Suite -- falha (failed).png"),
        specName: specPath,
        size: 321,
        dimensions: { width: 1280, height: 720 },
        takenAt: "2026-06-28T10:00:00.000Z",
      });
      if (!globalThis.consumerAfterScreenshot || screenshotResult.size !== 999) throw new Error("after:screenshot do consumidor não preservado");
      await handlers["after:spec"]({ relative: specPath, name: "api.cy.js" }, { stats: { duration: 80 }, tests: [{ title: ["Suite", "falha"], state: "failed", attempts: [{ state: "failed", wallClockStartedAt: "2026-06-28T09:59:59.000Z", wallClockDuration: 2000 }] }] });
      if (!globalThis.consumerAfterSpec) throw new Error("after:spec do consumidor não preservado");
      await handlers["after:run"]({});
      const output = path.join(process.cwd(), "reports", "faillens");
      if (require("node:fs").existsSync(path.join(output, "index.html"))) throw new Error("geração duplicada em after:run");
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
  assert.equal(report.specs[0].tests[0].title, "falha");
  assert.deepEqual(report.specs[0].tests[0].titlePath, ["Suite", "falha"]);
  assert.deepEqual(report.specs[0].tests[0].assertions.map((item) => item.state), ["failed", "pending", "skipped"]);
  assert.doesNotMatch(JSON.stringify(report.specs[0].tests[0].assertions), /Login deve retornar 200/);
  assert.equal(report.specs[0].tests[0].diagnosis.category, "validation-not-applied");
  assert.deepEqual(report.specs[0].tests[0].requests[0].redirects, [
    { statusCode: 302, location: "http://localhost:3333/next?token=***" },
  ]);
  assert.deepEqual(report.specs[0].tests[0].evidence.screenshots[0], {
    relativePath: "cypress/screenshots/api.cy.js/Suite -- falha (failed).png",
    href: "../../cypress/screenshots/api.cy.js/Suite%20--%20falha%20(failed).png",
    fileName: "Suite -- falha (failed).png",
    size: 321,
    width: 1280,
    height: 720,
    takenAt: "2026-06-28T10:00:00.000Z",
    attempt: 1,
    kind: "failure",
  });
  assert.doesNotMatch(JSON.stringify(report.specs[0].tests[0].evidence), /faillens-consumer-|[A-Z]:\\/i);
  assert.doesNotMatch(JSON.stringify(report), /Bearer real|password":"real/);
  assert.match(html, /FailLens/);
});
