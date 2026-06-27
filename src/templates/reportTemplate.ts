import type { FailLensReport } from "../types/report";
import { clientScript } from "./clientScript";
import { styles } from "./styles";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function safeEmbeddedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function duration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function reportTemplate(report: FailLensReport): string {
  const project = report.project?.name || report.specs[0]?.specPath || "Projeto Cypress";
  const context = [report.project?.runId && `Run ${report.project.runId}`, report.project?.branch]
    .filter(Boolean)
    .join(" · ");
  return `<!doctype html>
<html lang="pt-BR" data-theme="${report.theme || "dark"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="generator" content="FailLens ${report.tool.version}">
  <title>${escapeHtml(project)} · FailLens</title>
  <style>${styles}</style>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">F</div><div><h1>${escapeHtml(project)}</h1><p>${escapeHtml(context || "Relatório local FailLens")}</p></div></div>
      <div class="run-stats">
        <div class="run-stat"><strong>${report.summary.passRate}%</strong><span>Sucesso</span></div>
        <div class="run-stat"><strong>${report.summary.failed}</strong><span>Erros</span></div>
        <div class="run-stat"><strong>${report.summary.requests}</strong><span>Requests</span></div>
        <div class="run-stat"><strong>${duration(report.summary.durationMs)}</strong><span>Tempo</span></div>
      </div>
      <div class="top-actions"><button id="export-report" class="button">Exportar</button><button id="theme-toggle" class="button" aria-label="Alternar tema">◐</button></div>
    </header>
    <div class="workspace">
      <aside class="sidebar">
        <input id="filter" class="search" type="search" placeholder="Filtrar testes ou specs…" aria-label="Filtrar testes">
        <div class="chips"><button class="chip" data-mode="failed">Falhas</button><button class="chip" data-mode="all">Tudo</button></div>
        <div id="test-list"></div>
      </aside>
      <main id="detail" class="main"></main>
    </div>
  </div>
  <div id="toast" class="toast" role="status"></div>
  <script id="faillens-data" type="application/json">${safeEmbeddedJson(report)}</script>
  <script>${clientScript}</script>
</body>
</html>\n`;
}
