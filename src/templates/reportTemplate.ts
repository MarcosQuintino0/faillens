import type { FailLensReport } from "../types/report";
import { clientScript } from "./clientScript";
import { embeddedFont } from "./embeddedFont";
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
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function duration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2).replace(/0$/, "")}s` : `${Math.round(ms)}ms`;
}

export function reportTemplate(report: FailLensReport): string {
  const project = report.project?.name || report.specs[0]?.specPath || "Projeto Cypress";
  const theme = report.theme === "light" ? "light" : "dark";
  const passedText = `${report.summary.passed} de ${report.summary.tests} testes passaram`;
  return `<!doctype html>
<html lang="pt-BR" data-theme="${theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; font-src data:; img-src 'self' data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'">
  <meta name="generator" content="FailLens ${escapeHtml(String(report.tool.version))}">
  <title>${escapeHtml(project)} · FailLens</title>
  <style>${embeddedFont}</style>
  <style>${styles}</style>
</head>
<body>
  <div class="page">
    <div class="report-shell">
      <header class="topbar">
        <div class="run-summary">
          <div class="summary-item success-summary">
            <div class="summary-ring" style="--progress:${Math.max(0, Math.min(100, report.summary.passRate)) * 3.6}deg"><span></span></div>
            <div><strong>${Math.round(report.summary.passRate)}% <small>passou</small></strong><p>${escapeHtml(passedText)}</p></div>
          </div>
          <div class="summary-item error-summary"><div class="summary-icon">!</div><div><strong>${report.summary.failed} ${report.summary.failed === 1 ? "erro" : "erros"}</strong><p>${report.summary.failed} ${report.summary.failed === 1 ? "falha geral" : "falhas gerais"}</p></div></div>
          <div class="summary-item time-summary"><div class="summary-icon clock-icon"></div><div><strong>${duration(report.summary.durationMs)}</strong><p>Tempo geral</p></div></div>
        </div>
        <div class="top-actions">
          <button id="theme-toggle" class="button subtle" aria-label="Alternar tema"><span class="theme-symbol">◐</span><span id="theme-label">Tema claro</span></button>
          <button id="export-report" class="button export-button"><span>↓</span> Exportar relatório</button>
        </div>
      </header>
      <div class="workspace">
        <aside class="sidebar">
          <div class="search-wrap"><span>⌕</span><input id="filter" class="search" type="search" placeholder="Filtrar testes…" aria-label="Filtrar testes"></div>
          <div class="chips"><button class="chip" data-mode="failed">Falhas · ${report.summary.failed}</button><button class="chip" data-mode="all">Tudo · ${report.summary.tests}</button></div>
          <div id="test-list"></div>
        </aside>
        <main id="detail" class="main"></main>
      </div>
    </div>
  </div>
  <div id="toast" class="toast" role="status"></div>
  <script id="faillens-data" type="application/json">${safeEmbeddedJson(report)}</script>
  <script>${clientScript}</script>
</body>
</html>\n`;
}
