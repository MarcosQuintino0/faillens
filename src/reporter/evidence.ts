import type { FailLensContract, FailLensEvidence, FailLensScreenshot, FailLensTest } from "../types/report";

export interface IssueHttpContent {
  startLine: string;
  headers: Record<string, unknown>;
  body: unknown;
  durationMs?: number;
}

export interface IssueComparisonRow {
  label: string;
  expected: string;
  received: string;
}

export interface IssueTraceRow {
  label: string;
  value: string;
}

export interface EvidenceContent {
  title: string;
  suggestedTitle: string;
  specPath: string;
  context: string;
  failure: string;
  failureLocation?: string;
  expected: string;
  actual: string;
  currentResult: string;
  expectedResult: string;
  request: IssueHttpContent;
  response: IssueHttpContent;
  comparison: IssueComparisonRow[];
  curl: string;
  bdd?: string;
  traceability: IssueTraceRow[];
  screenshot?: Pick<FailLensScreenshot, "relativePath" | "href">;
}

function validRelativePath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || value.includes("\0") || value.includes("\\")) return undefined;
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value) || !/\.png$/i.test(value)) return undefined;
  const parts = value.split("/");
  return parts.some((part) => !part || part === "." || part === "..") ? undefined : value;
}

function validHref(value: unknown, relativePath: string): string | undefined {
  if (typeof value !== "string" || !value || value.includes("\0") || value.includes("\\")) return undefined;
  if (/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/|\/)/.test(value) || /[?#]/.test(value)) return undefined;
  const parts = value.split("/");
  const decoded: string[] = [];
  try {
    for (const part of parts) {
      const item = decodeURIComponent(part);
      if (!item || item === "." || item.includes("/") || item.includes("\\") || item.includes("\0")) return undefined;
      decoded.push(item);
    }
  } catch {
    return undefined;
  }
  const suffix = decoded.filter((part) => part !== "..").join("/");
  return suffix === relativePath ? value : undefined;
}

export function sanitizeEvidence(value: FailLensEvidence | undefined): FailLensEvidence | undefined {
  if (!Array.isArray(value?.screenshots)) return undefined;
  const screenshots: FailLensScreenshot[] = [];
  for (const source of value.screenshots) {
    const relativePath = validRelativePath(source?.relativePath);
    if (!relativePath) continue;
    const href = validHref(source.href, relativePath);
    const fileName = relativePath.split("/").at(-1);
    if (!href || source.fileName !== fileName || (source.kind !== "failure" && source.kind !== "manual")) continue;
    if (!Number.isFinite(source.size) || source.size < 0) continue;
    const screenshot: FailLensScreenshot = {
      relativePath,
      href,
      fileName,
      size: source.size,
      kind: source.kind,
    };
    if (Number.isFinite(source.width) && Number(source.width) > 0) screenshot.width = Math.round(Number(source.width));
    if (Number.isFinite(source.height) && Number(source.height) > 0) screenshot.height = Math.round(Number(source.height));
    if (source.takenAt && Number.isFinite(Date.parse(source.takenAt))) screenshot.takenAt = new Date(source.takenAt).toISOString();
    if (Number.isInteger(source.attempt) && Number(source.attempt) > 0) screenshot.attempt = Number(source.attempt);
    screenshots.push(screenshot);
  }
  return screenshots.length ? { screenshots } : undefined;
}

export function buildIssueContent(
  test: FailLensTest,
  specPath: string,
  contracts: FailLensContract[] = [],
): EvidenceContent | undefined {
  if (test.state !== "failed") return undefined;
  const main = test.requests.find((request) => request.id === test.mainRequestId) || test.requests[0];
  if (!main) return undefined;
  const reasons: Record<number, string> = {
    200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
    405: "Method Not Allowed", 409: "Conflict", 422: "Unprocessable Entity",
    429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway",
    503: "Service Unavailable", 504: "Gateway Timeout",
  };
  const status = (value: number): string => `${value}${reasons[value] ? ` ${reasons[value]}` : ""}`;
  const pathOf = (url: string): string => {
    try {
      const parsed = new URL(url, "http://faillens.invalid");
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return main.originalUrl || url;
    }
  };
  const contract = contracts.find((item) => item.id === test.contractId);
  const contractPaths = (contract?.api || []).map((entry) => entry.trim().match(/^(\S+)\s+(\S+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match && match[1].toUpperCase() === main.method));
  const operationPath = contractPaths.length === 1 ? contractPaths[0][2] : pathOf(main.url);
  const operation = `${main.method} ${operationPath}`;
  const ruleIds = (test.ruleRefs || []).filter((ref) => ref.resolved).map((ref) => ref.ruleId);
  const rules = ruleIds.map((id) => contract?.rules.find((rule) => rule.id === id)).filter(Boolean);
  const expectedLine = test.bddScenario?.lines.find((item) => item.keyword === "MAS")?.text;
  const actualStatus = main.receivedStatus === undefined ? "Sem resposta HTTP" : status(main.receivedStatus);
  const expectedStatus = test.statusExpectation?.type === "exact" && test.statusExpectation.expected !== undefined
    ? status(test.statusExpectation.expected)
    : test.statusExpectation?.label || (test.error?.expected !== undefined ? String(test.error.expected) : "Não especificado");
  const timeout = /\b(?:timeout|timed out)\b/i.test(test.error?.message || "");
  let currentResult = timeout
    ? `A requisição ${operation} excedeu o tempo limite configurado e terminou sem resposta HTTP.`
    : main.receivedStatus === undefined
      ? `A requisição ${operation} terminou sem resposta HTTP.`
      : `A API respondeu HTTP ${status(main.receivedStatus)} à requisição ${operation}.`;
  const responseRecord = main.responseBody && typeof main.responseBody === "object" && !Array.isArray(main.responseBody)
    ? main.responseBody as Record<string, unknown>
    : undefined;
  const identifier = responseRecord && Object.entries(responseRecord).find(([key, value]) =>
    /(^id$|id$)/i.test(key) && (typeof value === "string" || typeof value === "number"));
  if (identifier) currentResult += ` A resposta retornou o identificador ${JSON.stringify(identifier[1])}.`;
  if (test.persistenceEvidence?.state !== "not-verified" && test.persistenceEvidence?.summary) {
    currentResult += ` ${test.persistenceEvidence.summary}`;
  }

  const expectedParts = expectedLine ? [expectedLine.charAt(0).toUpperCase() + expectedLine.slice(1) + "."] : [];
  for (const rule of rules) {
    if (rule?.message) expectedParts.push(`Mensagem declarada pela regra "${rule.id}": ${rule.message}`);
    if (rule?.persistence === "forbidden") expectedParts.push("A regra contratual determina que a operação rejeitada não persista alterações.");
    if (rule?.persistence === "preserve") expectedParts.push("A regra contratual determina que o estado anterior seja preservado.");
    if (rule?.persistence === "remove") expectedParts.push("A regra contratual determina que o recurso seja removido.");
  }
  const expectedResult = expectedParts.length ? expectedParts.join("\n") : "O contrato não especifica um resultado adicional aplicável.";

  const comparison: IssueComparisonRow[] = [{
    label: "Status HTTP",
    expected: expectedStatus,
    received: actualStatus,
  }];
  for (const fact of test.facts || []) {
    if (fact.kind !== "request-field-absent" || typeof fact.value !== "string") continue;
    const field = contract?.fields.find((item) => item.name === fact.value);
    comparison.push({
      label: `Campo ${fact.value} no request`,
      expected: field?.attributes.required === true ? "Obrigatório" : "Conforme regra vinculada",
      received: "Ausente",
    });
  }
  for (const rule of rules) {
    if (!rule?.message) continue;
    comparison.push({
      label: "Mensagem de validação",
      expected: rule.message,
      received: JSON.stringify(main.responseBody).includes(rule.message) ? "Retornada" : "Não retornada",
    });
  }

  const screenshot = test.evidence?.screenshots?.[0];
  const categories = (test.tags || []).join(", ");
  const traceability: IssueTraceRow[] = [
    ...(contract ? [{ label: "API", value: contract.id }] : []),
    { label: "Operação", value: operation },
    { label: "Teste", value: test.title },
    ...(categories ? [{ label: "Categoria", value: categories }] : []),
    ...(ruleIds.length ? [{ label: "Regra", value: ruleIds.join(", ") }] : []),
    { label: "Spec", value: specPath },
    { label: "Estado", value: "Falhou" },
    { label: "Request principal", value: `${main.id} — ${operation}` },
    { label: "Gerado por", value: "FailLens" },
  ];
  return {
    title: test.title,
    suggestedTitle: `[API] ${operation} — falha em "${test.title}"`,
    specPath,
    context: [contract?.resumo || `Falha observada na operação ${operation}.`,
      ...(ruleIds.length ? [`Regra contratual relacionada: ${ruleIds.join(", ")}.`] : [])].join("\n"),
    failure: test.error?.message || "Falha registrada sem mensagem.",
    failureLocation: test.error?.file
      ? `${test.error.file}${test.error.line ? `:${test.error.line}:${test.error.column || 0}` : ""}`
      : undefined,
    expected: expectedStatus,
    actual: actualStatus,
    currentResult,
    expectedResult,
    request: { startLine: operation, headers: main.requestHeaders, body: main.requestBody },
    response: {
      startLine: main.receivedStatus === undefined ? "Sem resposta HTTP" : `HTTP/1.1 ${status(main.receivedStatus)}`,
      headers: main.responseHeaders,
      body: main.responseBody,
      durationMs: main.durationMs,
    },
    comparison,
    curl: main.curl || "Não disponível",
    bdd: test.bddScenario?.text,
    traceability,
    screenshot: screenshot ? { relativePath: screenshot.relativePath, href: screenshot.href } : undefined,
  };
}

export function buildEvidenceText(input: EvidenceContent): string {
  const oneLine = (value: unknown): string => String(value ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim();
  const json = (value: unknown): string => JSON.stringify(value ?? null, null, 2);
  const headers = (value: Record<string, unknown>): string => Object.entries(value)
    .map(([key, item]) => `${oneLine(key)}: ${oneLine(item)}`).join("\n") || "(nenhum header capturado)";
  const cell = (value: unknown): string => `\`${oneLine(value).replace(/`/g, "'").replace(/\|/g, "\\|")}\``;
  const bdd = typeof input.bdd === "string"
    ? input.bdd.split(/\r?\n/).map(oneLine).filter(Boolean).join("\n")
    : "";
  const comparison = input.comparison.length
    ? ["| Validação | Esperado | Recebido |", "|---|---|---|", ...input.comparison.map((row) =>
      `| ${oneLine(row.label).replace(/\|/g, "\\|")} | ${cell(row.expected)} | ${cell(row.received)} |`)]
    : ["Nenhuma comparação adicional disponível."];
  const trace = ["| Informação | Valor |", "|---|---|", ...input.traceability.map((row) =>
    `| ${oneLine(row.label).replace(/\|/g, "\\|")} | ${cell(row.value)} |`)];
  return [
    `# ${oneLine(input.suggestedTitle)}`,
    "", "## Contexto", "", oneLine(input.context),
    "", "## Cenário", "", ...(bdd ? ["```gherkin", bdd, "```"] : ["Cenário BDD não disponível."]),
    "", "## Resultado atual", "", input.currentResult,
    "", "## Resultado esperado", "", input.expectedResult,
    "", "## Requisição enviada", "", "```http", oneLine(input.request.startLine), headers(input.request.headers), "```",
    "", "```json", json(input.request.body), "```",
    "", "## Resposta recebida", "", "```http", oneLine(input.response.startLine), headers(input.response.headers),
    ...(input.response.durationMs !== undefined ? [`Duração: ${Math.round(input.response.durationMs)} ms`] : []), "```",
    "", "```json", json(input.response.body), "```",
    "", "## Comparação", "", ...comparison,
    "", "## Falha registrada pelo teste", "", "```text", oneLine(input.failure), "```",
    ...(input.failureLocation ? ["", "Localização:", "", "```text", oneLine(input.failureLocation), "```"] : []),
    "", "## Passos para reprodução", "", "```bash", String(input.curl || "Não disponível"), "```",
    "", "## Evidência visual", "", oneLine(input.screenshot?.relativePath || "Screenshot não disponível."),
    "", "## Rastreabilidade", "", ...trace,
  ].join("\n");
}

export function buildEvidenceHtml(input: EvidenceContent, imageDataUrl?: string): string {
  const escape = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
  const safeImage = typeof imageDataUrl === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl)
    ? `<p><img alt="Screenshot do Cypress" src="${imageDataUrl}"></p>`
    : "";
  const paragraph = (value: unknown): string => escape(value).replace(/\r?\n/g, "<br>");
  const screenshot = input.screenshot
    ? `<a href="${escape(input.screenshot.href)}">${escape(input.screenshot.relativePath)}</a>`
    : "Não disponível";
  const json = (value: unknown): string => JSON.stringify(value ?? null, null, 2);
  const headers = (value: Record<string, unknown>): string => Object.entries(value)
    .map(([key, item]) => `${key}: ${String(item)}`).join("\n") || "(nenhum header capturado)";
  const comparison = input.comparison.length
    ? `<table><thead><tr><th>Validação</th><th>Esperado</th><th>Recebido</th></tr></thead><tbody>${input.comparison.map((row) =>
      `<tr><td>${escape(row.label)}</td><td><code>${escape(row.expected)}</code></td><td><code>${escape(row.received)}</code></td></tr>`).join("")}</tbody></table>`
    : "<p>Nenhuma comparação adicional disponível.</p>";
  const trace = `<table><thead><tr><th>Informação</th><th>Valor</th></tr></thead><tbody>${input.traceability.map((row) =>
    `<tr><td>${escape(row.label)}</td><td><code>${escape(row.value)}</code></td></tr>`).join("")}</tbody></table>`;
  return `<article><h1>${escape(input.suggestedTitle)}</h1>`
    + `<h2>Contexto</h2><p>${paragraph(input.context)}</p>`
    + `<h2>Cenário</h2>${input.bdd ? `<pre>${escape(input.bdd)}</pre>` : "<p>Cenário BDD não disponível.</p>"}`
    + `<h2>Resultado atual</h2><p>${paragraph(input.currentResult)}</p>`
    + `<h2>Resultado esperado</h2><p>${paragraph(input.expectedResult)}</p>`
    + `<h2>Requisição enviada</h2><pre>${escape(input.request.startLine)}\n${escape(headers(input.request.headers))}</pre><pre>${escape(json(input.request.body))}</pre>`
    + `<h2>Resposta recebida</h2><pre>${escape(input.response.startLine)}\n${escape(headers(input.response.headers))}${input.response.durationMs !== undefined ? `\nDuração: ${Math.round(input.response.durationMs)} ms` : ""}</pre><pre>${escape(json(input.response.body))}</pre>`
    + `<h2>Comparação</h2>${comparison}`
    + `<h2>Falha registrada pelo teste</h2><pre>${escape(input.failure)}</pre>${input.failureLocation ? `<p>Localização:</p><pre>${escape(input.failureLocation)}</pre>` : ""}`
    + `<h2>Passos para reprodução</h2><pre>${escape(input.curl || "Não disponível")}</pre>`
    + `<h2>Evidência visual</h2><p>${screenshot}</p>${safeImage}`
    + `<h2>Rastreabilidade</h2>${trace}</article>`;
}
