"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  captureScreenshotMetadata,
  associateScreenshots,
} = require("../../dist/cypress/screenshotEvidence");

function context(style = "posix", overrides = {}) {
  return style === "windows"
    ? {
        projectRoot: "C:\\workspace\\app",
        screenshotsFolder: "C:\\workspace\\app\\artifacts\\screenshots",
        outputDir: "C:\\workspace\\app\\reports\\faillens",
        ...overrides,
      }
    : {
        projectRoot: "/workspace/app",
        screenshotsFolder: "/workspace/app/artifacts/screenshots",
        outputDir: "/workspace/app/reports/faillens",
        ...overrides,
      };
}

function details(path, overrides = {}) {
  return {
    path,
    specName: "cypress/e2e/api.cy.js",
    size: 1234,
    dimensions: { width: 1280, height: 720 },
    takenAt: "2026-06-28T10:00:00.000Z",
    ...overrides,
  };
}

function failed(id, specPath = "cypress/e2e/api.cy.js", title = "deve cadastrar usuário") {
  return {
    id,
    specPath,
    title,
    titlePath: ["Usuários especiais", title],
    state: "failed",
    attempts: [{ state: "failed", wallClockStartedAt: "2026-06-28T09:59:59.000Z", wallClockDuration: 2000 }],
  };
}

test("normaliza paths POSIX e codifica espaço, #, %, aspas e Unicode", () => {
  const capture = captureScreenshotMetadata(details(
    "/workspace/app/artifacts/screenshots/api.cy.js/Usuários #50% -- deve \"falhar\" (failed).png",
  ), context());

  assert.ok(capture);
  assert.equal(capture.screenshot.relativePath,
    "artifacts/screenshots/api.cy.js/Usuários #50% -- deve \"falhar\" (failed).png");
  assert.equal(capture.screenshot.href,
    "../../artifacts/screenshots/api.cy.js/Usu%C3%A1rios%20%2350%25%20--%20deve%20%22falhar%22%20(failed).png");
  assert.equal(capture.screenshot.fileName, 'Usuários #50% -- deve "falhar" (failed).png');
});

test("normaliza paths Windows sem persistir drive ou caminho absoluto", () => {
  const capture = captureScreenshotMetadata(details(
    "C:\\workspace\\app\\artifacts\\screenshots\\api.cy.js\\Suite -- falha (failed).png",
  ), context("windows"));

  assert.ok(capture);
  assert.equal(capture.screenshot.relativePath,
    "artifacts/screenshots/api.cy.js/Suite -- falha (failed).png");
  assert.equal(capture.screenshot.href,
    "../../artifacts/screenshots/api.cy.js/Suite%20--%20falha%20(failed).png");
  assert.doesNotMatch(JSON.stringify(capture.screenshot), /C:\\|workspace\\app/i);
});

test("aceita screenshotsFolder customizado e persiste somente metadata", () => {
  const capture = captureScreenshotMetadata(details(
    "/workspace/app/test-output/shots/api.cy.js/Suite -- falha (failed).png",
  ), context("posix", { screenshotsFolder: "/workspace/app/test-output/shots" }));

  assert.deepEqual(capture.screenshot, {
    relativePath: "test-output/shots/api.cy.js/Suite -- falha (failed).png",
    href: "../../test-output/shots/api.cy.js/Suite%20--%20falha%20(failed).png",
    fileName: "Suite -- falha (failed).png",
    size: 1234,
    width: 1280,
    height: 720,
    takenAt: "2026-06-28T10:00:00.000Z",
    attempt: 1,
    kind: "failure",
  });
  assert.doesNotMatch(JSON.stringify(capture.screenshot), /base64|data:image|iVBORw0KGgo/);
});

test("rejeita traversal, extensões não suportadas e arquivos fora da pasta oficial", () => {
  assert.equal(captureScreenshotMetadata(details(
    "/workspace/app/artifacts/screenshots/../secret.png",
  ), context()), undefined);
  assert.equal(captureScreenshotMetadata(details(
    "/workspace/app/artifacts/screenshots/api.cy.js/falha.jpg",
  ), context()), undefined);
  assert.equal(captureScreenshotMetadata(details(
    "/workspace/app/private/secret.png",
  ), context()), undefined);
});

test("associa por spec + titlePath sem confundir títulos iguais em specs diferentes", () => {
  const first = captureScreenshotMetadata(details(
    "/workspace/app/artifacts/screenshots/a.cy.js/Suite -- deve cadastrar usuário (failed).png",
    { specName: "cypress/e2e/a.cy.js" },
  ), context());
  const second = captureScreenshotMetadata(details(
    "/workspace/app/artifacts/screenshots/b.cy.js/Suite -- deve cadastrar usuário (failed).png",
    { specName: "cypress/e2e/b.cy.js" },
  ), context());
  const matches = associateScreenshots([
    failed("a", "cypress/e2e/a.cy.js"),
    failed("b", "cypress/e2e/b.cy.js"),
  ], [first, second].filter(Boolean));

  assert.equal(matches.get("a").length, 1);
  assert.match(matches.get("a")[0].relativePath, /a\.cy\.js/);
  assert.equal(matches.get("b").length, 1);
  assert.match(matches.get("b")[0].relativePath, /b\.cy\.js/);
});

test("retries preferem a última imagem automática da última tentativa falha", () => {
  const paths = [
    "Suite -- deve cadastrar usuário (failed).png",
    "Suite -- deve cadastrar usuário.png",
    "Suite -- deve cadastrar usuário (failed) (attempt 2).png",
  ];
  const captures = paths.map((name, index) => captureScreenshotMetadata(details(
    `/workspace/app/artifacts/screenshots/api.cy.js/${name}`,
    { takenAt: `2026-06-28T10:00:0${index}.000Z` },
  ), context())).filter(Boolean);
  const candidate = failed("retry");
  candidate.attempts.push({
    state: "failed",
    wallClockStartedAt: "2026-06-28T10:00:01.000Z",
    wallClockDuration: 2000,
  });
  const screenshots = associateScreenshots([candidate], captures).get("retry");

  assert.equal(screenshots.length, 3);
  assert.equal(screenshots[0].attempt, 2);
  assert.equal(screenshots[0].kind, "failure");
  assert.equal(screenshots[1].kind, "failure");
  assert.equal(screenshots[2].kind, "manual");
});

test("screenshot manual usa título completo ou janela da tentativa, nunca substring curta", () => {
  const titled = captureScreenshotMetadata(details(
    "/workspace/app/artifacts/screenshots/api.cy.js/Usuários especiais -- deve cadastrar usuário.png",
  ), context());
  const timed = captureScreenshotMetadata(details(
    "/workspace/app/artifacts/screenshots/api.cy.js/evidencia-manual.png",
    { name: "evidencia-manual", takenAt: "2026-06-28T10:00:00.500Z" },
  ), context());
  const short = captureScreenshotMetadata(details(
    "/workspace/app/artifacts/screenshots/api.cy.js/usuário.png",
    { takenAt: "2026-06-28T11:00:00.000Z" },
  ), context());
  const screenshots = associateScreenshots([failed("manual")], [titled, timed, short].filter(Boolean)).get("manual");

  assert.equal(screenshots.length, 2);
  assert.ok(screenshots.every((item) => item.kind === "manual"));
  assert.ok(screenshots.every((item) => !item.fileName.startsWith("usuário.png")));
});

test("screenshot ausente produz associação vazia", () => {
  assert.equal(associateScreenshots([failed("none")], []).has("none"), false);
});
