"use strict";
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");

const { maskSensitiveData, maskUrl } = require("../../dist");

const RUNS = 5;
const BUDGET = {
  mask100Fields: 5,
  mask1000Fields: 30,
  mask10000Fields: 150,
  maskUrl: 1,
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function log(label, value, limit) {
  const ok = value <= limit;
  const status = ok ? "✓" : "✗ FALHOU";
  console.log(`[BENCH] ${label.padEnd(50)} ${value.toFixed(2)}ms  ${status} (limite ${limit}ms)`);
  return ok;
}

function buildNestedObject(fieldCount) {
  const obj = {};
  for (let i = 0; i < fieldCount; i++) {
    const isSensitive = i % 10 === 0;
    const key = isSensitive ? (i % 30 === 0 ? "token" : i % 20 === 0 ? "password" : "apiKey") : `field_${i}`;
    if (i % 5 === 0) {
      obj[`group_${i}`] = {
        [key]: isSensitive ? "valor-secreto" : `valor-${i}`,
        nested: { value: i, label: `label-${i}` },
      };
    } else {
      obj[key] = isSensitive ? "valor-secreto" : `valor-${i}`;
    }
  }
  return obj;
}

function buildUrlWithParams(paramCount) {
  const params = Array.from({ length: paramCount }, (_, i) => {
    const isSensitive = i % 5 === 0;
    const key = isSensitive ? "token" : `param_${i}`;
    return `${key}=valor-${i}`;
  });
  return `/api/endpoint?${params.join("&")}`;
}

function measure(fn, runs = RUNS) {
  const times = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return median(times);
}

console.log("\n[BENCH] Benchmarks de mascaramento\n");

const obj100 = buildNestedObject(100);
const obj1000 = buildNestedObject(1000);
const obj10000 = buildNestedObject(10000);
const url20params = buildUrlWithParams(20);

const results = [
  log(
    "maskSensitiveData — 100 campos aninhados (mediana)",
    measure(() => maskSensitiveData(obj100)),
    BUDGET.mask100Fields,
  ),
  log(
    "maskSensitiveData — 1.000 campos aninhados (mediana)",
    measure(() => maskSensitiveData(obj1000)),
    BUDGET.mask1000Fields,
  ),
  log(
    "maskSensitiveData — 10.000 campos aninhados (mediana)",
    measure(() => maskSensitiveData(obj10000)),
    BUDGET.mask10000Fields,
  ),
  log(
    "maskUrl — URL com 20 query params (mediana)",
    measure(() => maskUrl(url20params), RUNS * 10),
    BUDGET.maskUrl,
  ),
];

console.log("");
const failed = results.filter((ok) => !ok).length;
if (failed > 0) {
  console.error(`[BENCH] ${failed} limite(s) ultrapassado(s). Leia PERFORMANCE_BUDGET.md.\n`);
} else {
  console.log("[BENCH] Todos os limites respeitados.\n");
}

const time100 = measure(() => maskSensitiveData(obj100));
const time1000 = measure(() => maskSensitiveData(obj1000));
const time10000 = measure(() => maskSensitiveData(obj10000));
const timeUrl = measure(() => maskUrl(url20params), RUNS * 10);

assert.ok(time100 < BUDGET.mask100Fields,
  `maskSensitiveData (100 campos): ${time100.toFixed(2)}ms excede limite de ${BUDGET.mask100Fields}ms`);
assert.ok(time1000 < BUDGET.mask1000Fields,
  `maskSensitiveData (1.000 campos): ${time1000.toFixed(2)}ms excede limite de ${BUDGET.mask1000Fields}ms`);
assert.ok(time10000 < BUDGET.mask10000Fields,
  `maskSensitiveData (10.000 campos): ${time10000.toFixed(2)}ms excede limite de ${BUDGET.mask10000Fields}ms`);
assert.ok(timeUrl < BUDGET.maskUrl,
  `maskUrl (20 params): ${timeUrl.toFixed(2)}ms excede limite de ${BUDGET.maskUrl}ms`);
