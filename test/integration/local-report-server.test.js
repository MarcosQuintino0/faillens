"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { startReportServer } = require("../../dist/server/localReportServer");

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-server-"));
  const reportDir = path.join(root, "reports", "faillens");
  const screenshot = "cypress/screenshots/api.cy.js/failure.png";
  await fs.mkdir(path.join(root, path.dirname(screenshot)), { recursive: true });
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(root, screenshot), Buffer.from("fake-png"));
  await fs.writeFile(path.join(reportDir, "index.html"), [
    "<!doctype html><html><head>",
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; connect-src 'none'; img-src 'self' data: blob:\">",
    "</head><body>FailLens</body></html>",
  ].join(""));
  await fs.writeFile(path.join(reportDir, "faillens-report.json"), JSON.stringify({
    specs: [{ tests: [{ evidence: { screenshots: [{ relativePath: screenshot }] } }] }],
  }));
  return { root, reportDir, screenshot };
}

test("servidor local entrega HTML e somente screenshots permitidos pelo relatório", async (t) => {
  const { root, reportDir, screenshot } = await fixture();
  const server = await startReportServer({ reportDir, projectRoot: root, idleTimeoutMs: 60_000 });
  t.after(() => server.close());

  assert.equal(new URL(server.url).hostname, "127.0.0.1");
  const html = await fetch(server.url).then((response) => response.text());
  assert.match(html, /connect-src 'self'/);
  assert.doesNotMatch(html, /connect-src 'none'/);

  const jsonUrl = new URL("/faillens-report.json", server.url);
  jsonUrl.searchParams.set("token", server.token);
  const json = await fetch(jsonUrl);
  assert.equal(json.status, 200);
  assert.match(await json.text(), /cypress\/screenshots/);

  const imageUrl = new URL("/__faillens/evidence", server.url);
  imageUrl.searchParams.set("token", server.token);
  imageUrl.searchParams.set("path", screenshot);
  const image = await fetch(imageUrl);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal(await image.text(), "fake-png");

  imageUrl.searchParams.set("path", "../../secret.png");
  assert.equal((await fetch(imageUrl)).status, 404);
  imageUrl.searchParams.set("token", "invalid");
  assert.equal((await fetch(imageUrl)).status, 403);
});

test("servidor rejeita Host inesperado e encerra após a última aba desconectar", async () => {
  const { root, reportDir } = await fixture();
  const server = await startReportServer({
    reportDir,
    projectRoot: root,
    closeGraceMs: 20,
    idleTimeoutMs: 60_000,
  });

  const rejected = await new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port: server.port, path: "/", headers: { host: "evil.test" } }, resolve);
    request.on("error", reject);
  });
  assert.equal(rejected.statusCode, 403);
  rejected.resume();

  await new Promise((resolve, reject) => {
    const request = http.get({
      hostname: "127.0.0.1",
      port: server.port,
      path: `/__faillens/events?token=${server.token}`,
    }, (response) => {
      response.once("data", () => {
        response.destroy();
        resolve();
      });
    });
    request.on("error", reject);
  });
  await server.closed;
});
