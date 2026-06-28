"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { buildReportModel, generateHtml } = require("../../dist");

// Trava as features de UI portadas do protótipo. O detalhe é renderizado pelo
// clientScript no browser, então assertamos sobre o CSS e o script embutidos
// (estáticos) no HTML gerado.

let cached;
async function html() {
  if (cached) return cached;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-feat-"));
  const report = buildReportModel([], { config: {} });
  const file = await generateHtml(report, dir);
  cached = await fs.readFile(file, "utf8");
  return cached;
}

// ─── Fonte Geist embutida (standalone) ──────────────────────────────────────

test("fonte: Geist embutida em base64, sem links externos", async () => {
  const doc = await html();
  assert.match(doc, /@font-face/);
  assert.match(doc, /font-family:\s*'Geist'/);
  assert.match(doc, /data:font\/woff2;base64,/);
  assert.doesNotMatch(doc, /fonts\.googleapis/i);
  assert.doesNotMatch(doc, /src:\s*url\(["']?https?:/i);
});

test("fonte: body e mono usam Geist", async () => {
  const doc = await html();
  assert.match(doc, /font:\s*14px\/1\.5\s*'Geist'/);
  assert.match(doc, /'Geist Mono'/);
});

// ─── Sequência: tubo por status, tempo no tubo, métodos, redirects ──────────

test("sequência: tubo colorido por status HTTP", async () => {
  const doc = await html();
  assert.match(doc, /function statusBarClass/);
  assert.match(doc, /\.request-bar\.s2\s*{[^}]*var\(--green\)/);
  assert.match(doc, /\.request-bar\.s3\s*{[^}]*var\(--amber\)/);
  assert.match(doc, /\.request-bar\.s45\s*{[^}]*var\(--red\)/);
  assert.match(doc, /\.request-bar\.snone\s*{[^}]*var\(--faint\)/);
});

test("sequência: legenda é 2xx / 3xx / 4xx-5xx", async () => {
  const doc = await html();
  assert.match(doc, /legend-dot s2"><\/i>2xx/);
  assert.match(doc, /legend-dot s45"><\/i>4xx \/ 5xx/);
});

test("sequência: métodos OPTIONS e HEAD têm cor própria", async () => {
  const doc = await html();
  assert.match(doc, /\.request-method\.options\s*{[^}]*#c4b5fd/);
  assert.match(doc, /\.request-method\.head\s*{[^}]*#f3a6c4/);
});

test("sequência: tempo posicionado dentro/fora do tubo", async () => {
  const doc = await html();
  assert.match(doc, /function positionBarTimes/);
  assert.match(doc, /\.request-time\.inside/);
});

test("sequência: saltos de redirect inline + limite com 'mostrar mais'", async () => {
  const doc = await html();
  assert.match(doc, /seq-hop-code/);
  assert.match(doc, /data-seq-toggle/);
  assert.match(doc, /Mostrar mais/);
});

// ─── Menu lateral: contadores, colapso de suite e dos que passaram ──────────

test("menu lateral: contadores ✕ / ✓ e colapso de suite", async () => {
  const doc = await html();
  assert.match(doc, /data-spec-toggle/);
  assert.match(doc, /data-passed-toggle/);
  assert.match(doc, /spec-counts/);
  assert.match(doc, /\.cnt-f\s*{[^}]*var\(--red\)/);
  assert.match(doc, /\.cnt-p\s*{[^}]*var\(--green\)/);
  assert.match(doc, /\.cnt-p\.zero\s*{[^}]*var\(--muted\)/);
  assert.match(doc, /\.spec-group\.collapsed/);
});

// ─── Tela de sucesso: largura total + 2 colunas + resumo ────────────────────

test("sucesso: asserções em 2 colunas com resumo e 'mostrar mais'", async () => {
  const doc = await html();
  assert.match(doc, /function successAssertions/);
  assert.match(doc, /assertion-list two-col/);
  assert.match(doc, /assert-summary/);
  assert.match(doc, /\.analysis-grid\.pass-layout\s*{[^}]*1fr/);
  assert.match(doc, /data-assert-toggle/);
});

// ─── Cards Esperado/Recebido: ampliar + modal + rolagem ─────────────────────

test("comparação: botão ampliar, modal e rolagem", async () => {
  const doc = await html();
  assert.match(doc, /function openModal/);
  assert.match(doc, /expand-btn/);
  assert.match(doc, /fl-modal-backdrop/);
  assert.match(doc, /\.comparison-card \.json-lines\s*{[^}]*max-height:\s*340px/);
});

// ─── Sem regressão de invariante ────────────────────────────────────────────

test("standalone preservado: sem CDN, sem script/link externo", async () => {
  const doc = await html();
  assert.doesNotMatch(doc, /<link[^>]+href="https?:/i);
  assert.doesNotMatch(doc, /<script[^>]+src="https?:/i);
  assert.doesNotMatch(doc, /cdn\./i);
});
