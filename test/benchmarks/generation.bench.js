"use strict";
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const { performance } = require("node:perf_hooks");

const { buildReportModel, generateHtml, generateJson } = require("../../dist");
const { createLargeReportFixture, TOTAL_TESTS, TOTAL_REQUESTS } = require("./fixtures/large-report");

const RUNS = 5;
const BUDGET = {
  buildReportModel: 400,
  generateHtml: 200,
  generateJson: 150,
  pipeline: 500,
  htmlSizeMB: 5,
  jsonSizeMB: 5,
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function log(label, value, unit, limit) {
  const ok = value <= limit;
  const status = ok ? "✓" : "✗ FALHOU";
  const formatted = unit === "MB" ? value.toFixed(2) : value.toFixed(1);
  console.log(`[BENCH] ${label.padEnd(45)} ${formatted}${unit}  ${status} (limite ${limit}${unit})`);
  return ok;
}

async function main() {
  console.log(`\n[BENCH] Fixture: ${TOTAL_TESTS} testes, ${TOTAL_REQUESTS} requests`);
  console.log("[BENCH] Rodando cada operação 5x, validando a mediana\n");

  const specs = createLargeReportFixture();
  const config = { maskFields: [] };
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-bench-"));

  const buildTimes = [];
  const htmlTimes = [];
  const jsonTimes = [];
  const pipelineTimes = [];
  let report;

  for (let i = 0; i < RUNS; i++) {
    const pStart = performance.now();

    const bStart = performance.now();
    report = buildReportModel(specs, { config });
    buildTimes.push(performance.now() - bStart);

    const hStart = performance.now();
    await generateHtml(report, tmpDir);
    htmlTimes.push(performance.now() - hStart);

    const jStart = performance.now();
    await generateJson(report, tmpDir);
    jsonTimes.push(performance.now() - jStart);

    pipelineTimes.push(performance.now() - pStart);
  }

  const htmlFile = path.join(tmpDir, "index.html");
  const jsonFile = path.join(tmpDir, "faillens-report.json");
  const htmlStat = await fs.stat(htmlFile);
  const jsonStat = await fs.stat(jsonFile);
  const htmlSizeMB = htmlStat.size / 1024 / 1024;
  const jsonSizeMB = jsonStat.size / 1024 / 1024;

  console.log("");
  const results = [
    log("buildReportModel (mediana)", median(buildTimes), "ms", BUDGET.buildReportModel),
    log("generateHtml (mediana)", median(htmlTimes), "ms", BUDGET.generateHtml),
    log("generateJson (mediana)", median(jsonTimes), "ms", BUDGET.generateJson),
    log("Pipeline completo (mediana)", median(pipelineTimes), "ms", BUDGET.pipeline),
    log("Tamanho index.html", htmlSizeMB, "MB", BUDGET.htmlSizeMB),
    log("Tamanho faillens-report.json", jsonSizeMB, "MB", BUDGET.jsonSizeMB),
  ];

  console.log("");
  const failed = results.filter((ok) => !ok).length;
  if (failed > 0) {
    console.error(`[BENCH] ${failed} limite(s) ultrapassado(s). Leia PERFORMANCE_BUDGET.md.\n`);
    process.exitCode = 1;
  } else {
    console.log("[BENCH] Todos os limites respeitados.\n");
  }

  assert.ok(median(buildTimes) < BUDGET.buildReportModel,
    `buildReportModel: mediana ${median(buildTimes).toFixed(1)}ms excede limite de ${BUDGET.buildReportModel}ms`);
  assert.ok(median(htmlTimes) < BUDGET.generateHtml,
    `generateHtml: mediana ${median(htmlTimes).toFixed(1)}ms excede limite de ${BUDGET.generateHtml}ms`);
  assert.ok(median(jsonTimes) < BUDGET.generateJson,
    `generateJson: mediana ${median(jsonTimes).toFixed(1)}ms excede limite de ${BUDGET.generateJson}ms`);
  assert.ok(median(pipelineTimes) < BUDGET.pipeline,
    `Pipeline: mediana ${median(pipelineTimes).toFixed(1)}ms excede limite de ${BUDGET.pipeline}ms`);
  assert.ok(htmlSizeMB < BUDGET.htmlSizeMB,
    `HTML ${htmlSizeMB.toFixed(2)}MB excede limite de ${BUDGET.htmlSizeMB}MB`);
  assert.ok(jsonSizeMB < BUDGET.jsonSizeMB,
    `JSON ${jsonSizeMB.toFixed(2)}MB excede limite de ${BUDGET.jsonSizeMB}MB`);
}

main().catch((error) => {
  console.error("[BENCH] Erro inesperado:", error.message);
  process.exitCode = 1;
});
