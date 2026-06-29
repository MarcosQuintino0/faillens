"use strict";
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const { buildReportModel, generateHtml, generateJson } = require("../../dist");
const { RequestStore } = require("../../dist/collector/requestStore");
const { reportTemplate } = require("../../dist/templates/reportTemplate");
const { createLargeReportFixture, createReportFixture } = require("./fixtures/large-report");

const BUDGET = {
  capture: 300,
  build: 400,
  htmlSerialization: 200,
  jsonSerialization: 150,
  parallelWrite: 300,
  pipeline: 500,
  htmlMB: 5,
  jsonMB: 5,
  largePipeline: 8_000,
  rssMB: 1_200,
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function formatBytes(value) {
  return `${(value / 1024 / 1024).toFixed(2)}MB`;
}

function check(label, value, limit, unit = "ms", detail = "") {
  const ok = value <= limit;
  console.log(`[BENCH] ${label.padEnd(42)} entrada ${detail.padEnd(18)} mediana ${value.toFixed(2)}${unit}  limite ${limit}${unit}  ${ok ? "✓" : "✗ FALHOU"}`);
  assert.ok(ok, `${label}: ${value.toFixed(2)}${unit} excede ${limit}${unit}`);
}

async function measured(runs, operation) {
  await operation();
  const values = [];
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    await operation();
    values.push(performance.now() - started);
  }
  return median(values);
}

function captureFixture() {
  const store = new RequestStore([]);
  for (let testIndex = 0; testIndex < 100; testIndex += 1) {
    const specPath = "cypress/e2e/bench.cy.js";
    const testId = `test-${testIndex}`;
    store.setTest({ id: testId, title: `Test ${testIndex}`, titlePath: ["Suite", `Test ${testIndex}`], specPath });
    for (let requestIndex = 0; requestIndex < 5; requestIndex += 1) {
      const id = `request-${testIndex}-${requestIndex}`;
      store.addRequest({ id, testId, specPath, method: "POST", url: `http://localhost/items/${requestIndex}`, requestBody: { token: "secret", value: requestIndex } });
      store.finishRequest({ id, testId, specPath, receivedStatus: 201, responseBody: { id: requestIndex }, durationMs: 10 });
    }
    store.setTestResult({ testId, specPath, state: testIndex < 70 ? "failed" : "passed", durationMs: 50 });
  }
  return store.snapshot();
}

async function memoryChild() {
  const tests = Number(process.argv[3]);
  if (global.gc) global.gc();
  const before = process.memoryUsage();
  const specs = createReportFixture({ tests, requestsPerTest: 5, failureRate: 0.7, bodySize: 128 });
  const report = buildReportModel(specs, { config: { maskFields: [] } });
  const serialized = JSON.stringify(report);
  if (global.gc) global.gc();
  const after = process.memoryUsage();
  console.log(`MEMORY ${JSON.stringify({ tests, rss: after.rss, heap: after.heapUsed, rssDelta: after.rss - before.rss, heapDelta: after.heapUsed - before.heapUsed, bytes: Buffer.byteLength(serialized) })}`);
}

function measureMemory(tests) {
  const result = spawnSync(process.execPath, ["--expose-gc", __filename, "--memory", String(tests)], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const match = result.stdout.match(/MEMORY (\{.*\})/);
  assert.ok(match, `medição de memória ausente para ${tests} testes`);
  return JSON.parse(match[1]);
}

async function main() {
  if (process.argv[2] === "--memory") return memoryChild();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-bench-"));
  try {
    console.log("\n[BENCH] Pipeline real — warm-up + mediana; 5 execuções até 1.000 testes, 2 nas fixtures maiores\n");
    const capture = await measured(5, async () => captureFixture());
    check("Captura / RequestStore", capture, BUDGET.capture, "ms", "100t / 500r");

    const specs = createLargeReportFixture();
    let report = buildReportModel(specs, { config: { maskFields: [] } });
    const build = await measured(5, async () => { report = buildReportModel(specs, { config: { maskFields: [] } }); });
    const htmlSerialization = await measured(5, async () => reportTemplate(report));
    const jsonSerialization = await measured(5, async () => JSON.stringify(report, null, 2));
    const parallelWrite = await measured(5, async () => Promise.all([generateHtml(report, tmpDir), generateJson(report, tmpDir)]));
    const pipeline = await measured(5, async () => {
      const value = buildReportModel(specs, { config: { maskFields: [] } });
      await Promise.all([generateHtml(value, tmpDir), generateJson(value, tmpDir)]);
    });
    check("buildReportModel", build, BUDGET.build, "ms", "100t / 500r");
    check("Serialização HTML", htmlSerialization, BUDGET.htmlSerialization, "ms", "100t / 500r");
    check("Serialização JSON", jsonSerialization, BUDGET.jsonSerialization, "ms", "100t / 500r");
    check("Escrita HTML + JSON paralela", parallelWrite, BUDGET.parallelWrite, "ms", "100t / 500r");
    check("Pipeline real completo", pipeline, BUDGET.pipeline, "ms", "100t / 500r");

    const htmlStat = await fs.stat(path.join(tmpDir, "index.html"));
    const jsonStat = await fs.stat(path.join(tmpDir, "faillens-report.json"));
    check("Tamanho HTML", htmlStat.size / 1024 / 1024, BUDGET.htmlMB, "MB", "100t / 500r");
    check("Tamanho JSON", jsonStat.size / 1024 / 1024, BUDGET.jsonMB, "MB", "100t / 500r");

    console.log("\n[BENCH] Taxa de falhas e escala total\n");
    for (const failureRate of [0.1, 0.7, 0.8]) {
      const fixture = createReportFixture({ tests: 1000, requestsPerTest: 5, failureRate, bodySize: 128 });
      const elapsed = await measured(5, async () => buildReportModel(fixture, { config: { maskFields: [] } }));
      check(`Falhas ${Math.round(failureRate * 100)}%`, elapsed, 3_000, "ms", "1000t / 5000r");
    }

    const scale = new Map();
    const artifactBytes = new Map();
    for (const tests of [100, 1000, 2000, 2500]) {
      const runs = tests <= 1000 ? 5 : 2;
      const fixture = createReportFixture({ tests, requestsPerTest: 5, failureRate: 0.7, bodySize: 128 });
      let value;
      const elapsed = await measured(runs, async () => {
        value = buildReportModel(fixture, { config: { maskFields: [] } });
        await Promise.all([generateHtml(value, tmpDir), generateJson(value, tmpDir)]);
      });
      scale.set(tests, elapsed);
      artifactBytes.set(tests, Buffer.byteLength(JSON.stringify(value)));
      check("Escala total", elapsed, BUDGET.largePipeline, "ms", `${tests}t / ${tests * 5}r`);
    }
    assert.ok(scale.get(2500) <= scale.get(1000) * 3, `2.500 testes (${scale.get(2500).toFixed(1)}ms) excederam 3x 1.000 (${scale.get(1000).toFixed(1)}ms)`);
    assert.ok(artifactBytes.get(2500) <= artifactBytes.get(1000) * 3, "artefatos cresceram acima da relação linear de 3x");

    console.log("\n[BENCH] Requests em um único teste\n");
    const requestScale = new Map();
    for (const requestsPerTest of [5, 20, 50, 100, 200]) {
      const fixture = createReportFixture({ tests: 1, requestsPerTest, failureRate: 1, bodySize: 128, testsPerSpec: 1 });
      const elapsed = await measured(5, async () => buildReportModel(fixture, { config: { maskFields: [] } }));
      requestScale.set(requestsPerTest, elapsed);
      check("Requests / teste", elapsed, 1_000, "ms", `1t / ${requestsPerTest}r`);
    }
    assert.ok(requestScale.get(200) <= requestScale.get(100) * 3, `200 requests (${requestScale.get(200).toFixed(1)}ms) indicam crescimento quadrático vs 100 (${requestScale.get(100).toFixed(1)}ms)`);

    console.log("\n[BENCH] Metadata de screenshots (sem PNG/base64)\n");
    const screenshotScenarios = [
      ["zero", 0, false],
      ["70%", 0.7, false],
      ["80%", 0.8, false],
      ["múltiplos/retries", 0.8, true],
    ];
    const screenshotResults = new Map();
    for (const [label, screenshotRate, multipleScreenshots] of screenshotScenarios) {
      const fixture = createReportFixture({ tests: 1000, requestsPerTest: 5, failureRate: 0.8, screenshotRate, multipleScreenshots, bodySize: 128 });
      let value;
      const elapsed = await measured(5, async () => { value = buildReportModel(fixture, { config: { maskFields: [] } }); });
      const serialized = JSON.stringify(value);
      assert.doesNotMatch(serialized, /data:image\/png;base64|iVBORw0KGgo/);
      screenshotResults.set(label, { elapsed, bytes: Buffer.byteLength(serialized) });
      check(`Screenshots ${label}`, elapsed, 3_000, "ms", "1000t / metadata");
    }
    const noShots = screenshotResults.get("zero");
    const manyShots = screenshotResults.get("80%");
    assert.ok(manyShots.elapsed <= Math.max(noShots.elapsed * 1.10, noShots.elapsed + 10), `metadata aumentou tempo em mais de 10%: ${noShots.elapsed.toFixed(1)}ms -> ${manyShots.elapsed.toFixed(1)}ms`);
    const bytesPerFailedTest = (manyShots.bytes - noShots.bytes) / 800;
    assert.ok(bytesPerFailedTest <= 1024, `metadata usa ${bytesPerFailedTest.toFixed(0)} bytes/teste falho, limite 1024`);
    console.log(`[BENCH] Overhead screenshots: ${bytesPerFailedTest.toFixed(0)} bytes/teste falho; tempo ${noShots.elapsed.toFixed(1)}ms -> ${manyShots.elapsed.toFixed(1)}ms`);

    console.log("\n[BENCH] Memória isolada por processo\n");
    const memory = [1000, 2000, 2500].map(measureMemory);
    for (const item of memory) {
      console.log(`[BENCH] Memória ${String(item.tests).padEnd(5)} testes  RSS ${formatBytes(item.rss).padEnd(10)} ΔRSS ${formatBytes(item.rssDelta).padEnd(10)} heap ${formatBytes(item.heap)} Δheap ${formatBytes(item.heapDelta)}`);
      assert.ok(item.rss / 1024 / 1024 <= BUDGET.rssMB, `RSS ${formatBytes(item.rss)} excede ${BUDGET.rssMB}MB`);
    }
    assert.ok(memory[2].heapDelta <= memory[0].heapDelta * 3, "heap de 2.500 testes cresceu acima de 3x o cenário de 1.000");
    console.log("\n[BENCH] Todos os limites e relações de escala foram respeitados.\n");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[BENCH] FALHOU: ${error.message}`);
  process.exitCode = 1;
});
