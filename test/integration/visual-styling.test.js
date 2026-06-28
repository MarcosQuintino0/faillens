"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { buildReportModel, generateHtml } = require("../../dist");

// Trava o "visual geral" do relatório: a paleta unificada e a coloração ciente
// de estado (passou vs. falhou). O detalhe é renderizado pelo clientScript no
// browser, então aqui assertamos sobre o CSS e o script embutidos no HTML —
// que são estáticos e independem dos dados.

async function generateDefaultHtml() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "faillens-visual-"));
  const report = buildReportModel([], { config: {} });
  const file = await generateHtml(report, dir);
  return fs.readFile(file, "utf8");
}

let cachedHtml;
async function html() {
  if (!cachedHtml) cachedHtml = await generateDefaultHtml();
  return cachedHtml;
}

// ─── Paleta unificada ──────────────────────────────────────────────────────

test("paleta: variável --green-line definida (dark + light)", async () => {
  const doc = await html();
  const occurrences = (doc.match(/--green-line:/g) || []).length;
  assert.ok(occurrences >= 2, `esperava --green-line nos dois temas, achei ${occurrences}`);
});

test("paleta: verde-soft unificado em rgba(34,197,94)", async () => {
  const doc = await html();
  assert.match(doc, /--green-soft:\s*rgba\(34,\s*197,\s*94,\s*\.13\)/);
});

test("paleta: verde órfão de estado eliminado — sem rgba(53,209,126)", async () => {
  // rgba(74,222,128) ainda é permitido: é o próprio --green (#4ade80) em alpha,
  // usado nos flashes de "copiado" e no toast, igual à referência. O que foi
  // eliminado é o rgba(53,209,126) que não correspondia a nenhuma variável.
  const doc = await html();
  assert.doesNotMatch(doc, /rgba\(53\s*,\s*209\s*,\s*126/);
});

test("paleta: cores de método alinhadas à referência", async () => {
  const doc = await html();
  assert.match(doc, /\.request-method\.get\s*{[^}]*#5fd39a/);
  assert.match(doc, /\.request-method\.put[^{]*{[^}]*#fcd34d/);
  assert.match(doc, /\.request-method\s*{[^}]*rgba\(59,\s*130,\s*246,\s*\.16\)/);
});

// ─── CSS ciente de estado ──────────────────────────────────────────────────

test("estado: card Recebido não é mais vermelho fixo — tem variantes passed e failed", async () => {
  const doc = await html();
  assert.match(doc, /\.comparison-card\.received\.failed\s+\.comparison-head\s*{[^}]*var\(--red\)/);
  assert.match(doc, /\.comparison-card\.received\.passed\s+\.comparison-head\s*{[^}]*var\(--green\)/);
  // garante que NÃO existe mais a regra incondicional antiga
  assert.doesNotMatch(doc, /\.comparison-card\.received\s+\.comparison-head\s*{/);
});

test("estado: métrica 'Status atual' tem variante de sucesso verde", async () => {
  const doc = await html();
  assert.match(doc, /\.metric-card\.success\s*{[^}]*var\(--green-line\)/);
  assert.match(doc, /\.metric-card\.success\s+strong\s*{[^}]*var\(--green\)/);
});

test("estado: banner verde para teste aprovado", async () => {
  const doc = await html();
  assert.match(doc, /\.failure-banner\.passed\s*{[^}]*var\(--green-line\)/);
});

test("estado: nota de contrato (match-note) estilizada em verde", async () => {
  const doc = await html();
  assert.match(doc, /\.match-note\s*{[^}]*var\(--green\)/);
});

// ─── Tela de sucesso no clientScript ───────────────────────────────────────

test("sucesso: analysisSections substituiu failureSections", async () => {
  const doc = await html();
  assert.match(doc, /function analysisSections/);
  assert.doesNotMatch(doc, /function failureSections/);
});

test("sucesso: ramo de teste aprovado renderiza seção verde de validação", async () => {
  const doc = await html();
  assert.match(doc, /Resposta validada/);
  assert.match(doc, /contrato satisfeito/);
  assert.match(doc, /Todas as asserções passaram/);
  assert.match(doc, /received passed/);
});

test("sucesso: card métrico usa classe success quando o teste passa", async () => {
  const doc = await html();
  assert.match(doc, /state === "passed"\s*\?\s*'success'/);
});

test("sucesso: falha continua mostrando 'Esperado vs. recebido' e banner de assertion", async () => {
  const doc = await html();
  assert.match(doc, /Esperado vs\. recebido/);
  assert.match(doc, /Assertion falhou/);
  assert.match(doc, /received failed/);
});
