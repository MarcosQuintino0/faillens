import { generateCurl } from "../collector/curlGenerator";
import { maskSensitiveData, maskSensitiveText, maskUrl } from "../collector/sensitiveMask";
import type { ResolvedFailLensConfig } from "../types/config";
import type {
  FailLensError,
  FailLensAssertion,
  FailLensReport,
  FailLensRequest,
  FailLensSpec,
  FailLensStatusExpectation,
  FailLensTest,
} from "../types/report";
import { round } from "../utils/format";
import { diagnoseFailure } from "./diagnostics/diagnoseFailure";
import { parseAssertionError } from "./diagnostics/parseAssertionError";
import { buildPayloadDiff } from "./buildPayloadDiff";
import { sanitizeEvidence } from "./evidence";

const VERSION = "0.1.0";

// Vari\u00e1vel encadeada detectada de forma gen\u00e9rica (qualquer API/idioma):
// um valor concreto da resposta de um passo que reaparece num passo posterior.
interface ChainVariable {
  name: string; // nome shell, derivado da CHAVE real do campo (ex.: "ID", "TOKEN")
  ref: string; // "$ID"
  path: string; // caminho json na resposta de origem (ex.: "data.id")
  value?: string; // valor concreto p/ substitui\u00e7\u00e3o (undefined quando mascarado)
  kind: "value" | "token";
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d{3}$/.test(value.trim())) return Number(value);
  return undefined;
}

function pathOf(request: FailLensRequest): string {
  const raw = request.originalUrl || request.url || "";
  try {
    const parsed = new URL(raw, "http://faillens.local");
    return parsed.pathname + parsed.search;
  } catch (_) {
    return raw;
  }
}

const STATUS_REASON: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
  301: "Moved Permanently", 302: "Found", 304: "Not Modified",
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
  405: "Method Not Allowed", 409: "Conflict", 410: "Gone",
  422: "Unprocessable Entity", 429: "Too Many Requests",
  500: "Internal Server Error", 502: "Bad Gateway",
  503: "Service Unavailable", 504: "Gateway Timeout",
};

function statusReason(code: number | null | undefined): string {
  if (code == null) return "sem resposta";
  return STATUS_REASON[code] ? `${code} ${STATUS_REASON[code]}` : String(code);
}

function singleLine(value: unknown): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim();
}

function isSafeJsonPath(value: string): boolean {
  return value.split(".").every((part) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(part));
}

// "Chamada validada pelo teste": o sinal determin\u00edstico mais forte \u00e9 o request
// cujo status recebido \u00e9 igual ao 'actual' afirmado pela asser\u00e7\u00e3o. Depois disso,
// preferimos m\u00e9todos de muta\u00e7\u00e3o e a ordem. Sem palavras de t\u00edtulo nem nomes de
// endpoint \u2014 funciona em qualquer API e qualquer idioma.
export function inferMainRequest(test: FailLensTest): FailLensRequest | undefined {
  if (!test.requests.length) return undefined;
  const actual = numeric(test.error?.actual);
  let winner = test.requests[0];
  let winnerScore = -Infinity;
  test.requests.forEach((request, index) => {
    let score = 0;
    if (actual !== undefined && request.receivedStatus === actual) score += 50;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) score += 5;
    score -= index * 0.01; // empate: a a\u00e7\u00e3o costuma vir antes da verifica\u00e7\u00e3o
    if (score > winnerScore) {
      winner = request;
      winnerScore = score;
    }
  });
  return winner;
}

function maskError(error: FailLensError | undefined, maskFields: string[]): FailLensError | undefined {
  if (!error) return undefined;
  const parsed = parseAssertionError(error, maskFields);
  return {
    ...parsed,
    message: maskSensitiveText(error.message, maskFields),
    stack: error.stack ? maskSensitiveText(error.stack, maskFields) : undefined,
    expected: maskSensitiveData(parsed.expected, maskFields),
    actual: maskSensitiveData(parsed.actual, maskFields),
  };
}

const TOKEN_KEY = /^(access[_-]?token|id[_-]?token|refresh[_-]?token|token|jwt)$/i;

// Nome shell-safe derivado da CHAVE real do campo: camelCase -> SNAKE_CASE.
function shellNameFromKey(key: string): string {
  const snake = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return snake || "VALUE";
}

interface Scalar { path: string; key: string; value: string; }

function collectScalars(value: unknown): Scalar[] {
  const out: Scalar[] = [];
  const visited = new Set<object>();
  const walk = (node: unknown, path: string[]): void => {
    if (!node || typeof node !== "object" || visited.has(node as object)) return;
    visited.add(node as object);
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const nextPath = [...path, key];
      if (typeof child === "string" || typeof child === "number") {
        const text = String(child);
        if (text && text !== "***" && !/^<.*>$/.test(text)) out.push({ path: nextPath.join("."), key, value: text });
      } else {
        walk(child, nextPath);
      }
    }
  };
  walk(value, []);
  return out;
}

// Localiza um campo de token na resposta mesmo que o VALOR esteja mascarado:
// a captura é feita por caminho (jq), então só precisamos da chave/caminho.
function findTokenField(value: unknown): { path: string } | undefined {
  let result: { path: string } | undefined;
  const visited = new Set<object>();
  const walk = (node: unknown, path: string[]): void => {
    if (result || !node || typeof node !== "object" || visited.has(node as object)) return;
    visited.add(node as object);
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const nextPath = [...path, key];
      if ((typeof child === "string" || typeof child === "number") && TOKEN_KEY.test(key)) {
        result = { path: nextPath.join(".") };
        return;
      }
      walk(child, nextPath);
    }
  };
  walk(value, []);
  return result;
}

function usesBearer(request: FailLensRequest): boolean {
  return Object.entries(request.requestHeaders || {}).some(
    ([key, value]) => /authorization/i.test(key) && /bearer/i.test(String(value)),
  );
}

function requestText(request: FailLensRequest): { url: string; body: string } {
  let body = "";
  try { body = JSON.stringify(request.requestBody ?? null); } catch { body = String(request.requestBody ?? ""); }
  return { url: request.url || "", body };
}

function appearsIn(text: { url: string; body: string }, value: string): boolean {
  const encoded = encodeURIComponent(value);
  return text.url.includes(value) || text.url.includes(encoded) || text.body.includes(value);
}

// Detecção 100% determinística: um valor da resposta vira variável APENAS se
// reaparecer literalmente em um request posterior (encadeamento real). Tokens
// são o único caso especial — costumam vir mascarados, então casamos pela
// chave (token/jwt/...) quando algum request seguinte usa Authorization: Bearer.
function computeChain(requests: FailLensRequest[]): { used: ChainVariable[][]; generated: ChainVariable[][] } {
  const used: ChainVariable[][] = requests.map(() => []);
  const generated: ChainVariable[][] = requests.map(() => []);
  const takenNames = new Set<string>();
  const requestTexts = requests.map(requestText);
  const bearerUsage = requests.map(usesBearer);
  const requestOffsets: number[] = [];
  const requestChunks = requestTexts.map((text) => `${text.url}\n${text.body}\u0000`);
  let textLength = 0;
  for (const chunk of requestChunks) {
    requestOffsets.push(textLength);
    textLength += chunk.length;
  }
  const allRequestText = requestChunks.join("");
  const bearerAfter: boolean[] = requests.map(() => false);
  let laterBearer = false;
  for (let index = requests.length - 1; index >= 0; index -= 1) {
    bearerAfter[index] = laterBearer;
    laterBearer ||= bearerUsage[index];
  }
  const uniqueName = (base: string): string => {
    let name = base || "VALUE";
    let suffix = 2;
    while (takenNames.has(name)) name = `${base}_${suffix++}`;
    takenNames.add(name);
    return name;
  };
  const availableValues = new Set<string>();
  const variableUses = new Map<ChainVariable, number[]>();
  let tokenAvailable = false;
  const requestIndexAt = (position: number): number => {
    let low = 0;
    let high = requestOffsets.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (requestOffsets[middle] <= position) low = middle + 1;
      else high = middle - 1;
    }
    return Math.max(0, high);
  };
  const findUses = (value: string, sourceIndex: number): number[] => {
    const indexes = new Set<number>();
    const futureOffset = sourceIndex + 1 < requestOffsets.length
      ? requestOffsets[sourceIndex + 1]
      : allRequestText.length;
    const encoded = encodeURIComponent(value);
    for (const needle of encoded === value ? [value] : [value, encoded]) {
      let position = allRequestText.indexOf(needle, futureOffset);
      while (position >= 0) {
        const requestIndex = requestIndexAt(position);
        if (requestIndex > sourceIndex && appearsIn(requestTexts[requestIndex], value)) indexes.add(requestIndex);
        position = allRequestText.indexOf(
          needle,
          requestOffsets[requestIndex] + requestChunks[requestIndex].length,
        );
      }
    }
    return Array.from(indexes).sort((left, right) => left - right);
  };

  requests.forEach((request, index) => {
    const scalars = collectScalars(request.responseBody);
    const newVars: ChainVariable[] = [];
    const tokenField = findTokenField(request.responseBody);
    if (tokenField && isSafeJsonPath(tokenField.path) && bearerAfter[index] && !tokenAvailable) {
      const name = uniqueName("TOKEN");
      const variable: ChainVariable = { name, ref: `$${name}`, path: tokenField.path, value: undefined, kind: "token" };
      variableUses.set(variable, bearerUsage.flatMap((uses, requestIndex) => uses && requestIndex > index ? [requestIndex] : []));
      newVars.push(variable);
    }
    scalars.forEach((scalar) => {
      if (scalar.value.length < 3) return;
      if (!isSafeJsonPath(scalar.path)) return;
      if (availableValues.has(scalar.value) || newVars.some((item) => item.value === scalar.value)) return;
      const useIndexes = findUses(scalar.value, index);
      if (!useIndexes.length) return;
      const name = uniqueName(shellNameFromKey(scalar.key));
      const variable: ChainVariable = { name, ref: `$${name}`, path: scalar.path, value: scalar.value, kind: "value" };
      variableUses.set(variable, useIndexes);
      newVars.push(variable);
    });
    newVars.forEach((variable) => {
      generated[index].push(variable);
      for (const requestIndex of variableUses.get(variable) || []) used[requestIndex].push(variable);
      if (variable.kind === "token") tokenAvailable = true;
      else if (variable.value !== undefined) availableValues.add(variable.value);
    });
  });

  return { used, generated };
}

function applyVariable(command: string, variable: ChainVariable): string {
  let result = command;
  if (variable.kind === "token") {
    result = result.replace(/Bearer\s+(?:<TOKEN>|\*\*\*|[^\s'"]+)/gi, `Bearer ${variable.ref}`);
  }
  if (variable.value !== undefined) {
    const encoded = encodeURIComponent(variable.value);
    result = result
      .split(`/${variable.value}`).join(`/${variable.ref}`)
      .split(`/${encoded}`).join(`/${variable.ref}`)
      .split(`"${variable.value}"`).join(`"${variable.ref}"`);
  }
  return result.replace(/'([^'\n]*\$[A-Z_][A-Z0-9_]*[^'\n]*)'/g, '"$1"');
}

type RequestChain = ReturnType<typeof computeChain>;

function annotateRequests(
  test: FailLensTest,
  main: FailLensRequest | undefined,
  chain: RequestChain,
): void {
  const mainIndex = main ? test.requests.findIndex((request) => request.id === main.id) : -1;
  const { used, generated } = chain;

  test.requests.forEach((request, index) => {
    if (request.id === main?.id) request.phase = "validacao";
    else if (mainIndex >= 0 && index < mainIndex) request.phase = "preparacao";
    else if (index > mainIndex && request.method === "GET") request.phase = "verificacao";
    else if (index > mainIndex && request.method === "DELETE") request.phase = "limpeza";
    else request.phase = "chamada";

    request.usedVariables = used[index].map((item) => item.ref);
    request.generatedVariables = generated[index].map((item) => item.ref);
  });
}

function buildReproductionScript(test: FailLensTest, chain: RequestChain): string {
  const requests = test.requests;
  if (!requests.length) return "";
  const { used, generated } = chain;
  const expectation = test.statusExpectation;

  const lines: string[] = [
    "# Reprodução determinística — gerada pelo FailLens",
    "# Requer curl; extração de variáveis usa jq.",
  ];
  if (test.title) lines.push(`# Teste: ${singleLine(test.title)}`);
  if (expectation && expectation.actual !== undefined) {
    lines.push(
      `# Veredito: ${test.state === "failed" ? "FALHOU" : "OK"}` +
        ` · status esperado ${singleLine(expectation.label)} · recebido ${expectation.actual}`,
    );
  }

  requests.forEach((request, index) => {
    let command = request.curl;
    used[index].forEach((variable) => { command = applyVariable(command, variable); });

    lines.push("");
    lines.push(
      `# [${index + 1}] ${singleLine(request.method)} ${singleLine(pathOf(request))}` +
        `  →  ${statusReason(request.receivedStatus)}  ·  ${Math.round(request.durationMs || 0)} ms`,
    );
    if (request.id === test.mainRequestId) {
      let mark = "#     >> chamada validada pelo teste";
      if (expectation && expectation.actual !== undefined) {
        mark += ` (esperado ${singleLine(expectation.label)}, recebido ${expectation.actual})`;
      }
      lines.push(mark);
    }
    used[index].forEach((variable) => { lines.push(`#     usa ${variable.ref}`); });

    const primary = generated[index][0];
    if (primary) {
      lines.push(`#     captura ${primary.ref}  =  campo ".${primary.path}" da resposta`);
      command = command.replace(/^curl\s+/, "curl -s ");
      lines.push(`${primary.name}=$(${command} | jq -r '.${primary.path}')`);
    } else {
      lines.push(command);
    }
  });

  return lines.join("\n");
}

function sanitizeRequest(request: FailLensRequest, maskFields: string[]): FailLensRequest {
  const sanitized: FailLensRequest = {
    ...request,
    url: maskUrl(request.url, maskFields),
    originalUrl: request.originalUrl ? maskUrl(request.originalUrl, maskFields) : undefined,
    requestHeaders: maskSensitiveData(request.requestHeaders || {}, maskFields),
    requestBody: maskSensitiveData(request.requestBody, maskFields),
    responseHeaders: maskSensitiveData(request.responseHeaders || {}, maskFields),
    responseBody: maskSensitiveData(request.responseBody, maskFields),
    redirects: request.redirects?.map((redirect) => ({
      statusCode: redirect.statusCode,
      location: maskUrl(redirect.location, maskFields),
    })),
    error: maskError(request.error, maskFields),
  };
  sanitized.curl = generateCurl(
    {
      method: sanitized.method,
      url: sanitized.url,
      headers: sanitized.requestHeaders,
      body: sanitized.requestBody,
    },
    maskFields,
  );
  return sanitized;
}

function prepareAssertions(
  source: FailLensTest,
  error: FailLensError | undefined,
  maskFields: string[],
): FailLensAssertion[] {
  if (source.assertions?.length) {
    return source.assertions.map((assertion, index) => ({
      ...assertion,
      id: assertion.id || `assertion-${index + 1}`,
      title: maskSensitiveText(assertion.title || "Assertion observada", maskFields),
      message: assertion.message
        ? maskSensitiveText(assertion.message, maskFields)
        : undefined,
      expected: maskSensitiveData(assertion.expected, maskFields),
      actual: maskSensitiveData(assertion.actual, maskFields),
    }));
  }
  if (!error) return [];
  return [{
    id: "assertion-failure",
    title: error.assertionMessage || "Assertion principal",
    state: "failed",
    message: error.message,
    expected: error.expected,
    actual: error.actual,
    file: error.file,
    line: error.line,
    column: error.column,
  }];
}

function resolveStatusExpectation(
  test: FailLensTest,
  main: FailLensRequest | undefined,
): FailLensStatusExpectation | undefined {
  let expectation = test.statusExpectation ? { ...test.statusExpectation } : undefined;
  if (!expectation) {
    const statusAssertion = test.assertions?.find((assertion) => assertion.target === "status");
    const expected = numeric(statusAssertion?.expected);
    if (expected !== undefined) expectation = { type: "exact", label: String(expected), expected };
  }
  if (!expectation) {
    const expected = numeric(test.error?.expected);
    const actual = numeric(test.error?.actual);
    if (expected !== undefined && actual !== undefined) {
      expectation = { type: "exact", label: String(expected), expected };
    }
  }
  if (!expectation) return undefined;
  const actual = main?.receivedStatus;
  if (actual === undefined) return expectation;
  const matched = expectation.type === "exact"
    ? actual === expectation.expected
    : expectation.type === "set"
      ? Boolean(expectation.values?.includes(actual))
      : (expectation.min === undefined || actual >= expectation.min)
        && (expectation.max === undefined || actual <= expectation.max);
  return { ...expectation, actual, matched };
}

function prepareTest(source: FailLensTest, maskFields: string[]): FailLensTest {
  const test: FailLensTest = {
    ...source,
    title: source.titlePath?.length
      ? source.titlePath[source.titlePath.length - 1]
      : source.title,
    error: maskError(source.error, maskFields),
    requests: source.requests.map((request) => sanitizeRequest(request, maskFields)),
    evidence: sanitizeEvidence(source.evidence),
  };
  const main = inferMainRequest(test);
  const chain = computeChain(test.requests);
  test.assertions = prepareAssertions(source, test.error, maskFields);
  test.mainRequestId = main?.id;
  annotateRequests(test, main, chain);
  test.statusExpectation = resolveStatusExpectation(test, main);
  test.payloadDiff = buildPayloadDiff(test.assertions, main?.responseBody, test.state === "failed");
  test.diagnosis = diagnoseFailure({ test, mainRequest: main });
  test.reproductionScript = test.state === "failed" && test.requests.length
    ? buildReproductionScript(test, chain)
    : undefined;
  return test;
}

export interface BuildReportOptions {
  generatedAt?: string;
  config?: Partial<ResolvedFailLensConfig>;
}

export function buildReportModel(
  inputSpecs: FailLensSpec[],
  options: BuildReportOptions = {},
): FailLensReport {
  const maskFields = options.config?.maskFields ?? [];
  const specs = inputSpecs.map((spec) => {
    const tests = spec.tests.map((test) => prepareTest(test, maskFields));
    return {
      specPath: spec.specPath,
      durationMs: spec.durationMs || tests.reduce((sum, test) => sum + test.durationMs, 0),
      tests,
    };
  });
  const tests = specs.flatMap((spec) => spec.tests);
  const passed = tests.filter((test) => test.state === "passed").length;
  const failed = tests.filter((test) => test.state === "failed").length;
  const skipped = tests.filter((test) => test.state === "skipped").length;
  const total = tests.length;
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    tool: { name: "FailLens", packageName: "faillens", version: VERSION },
    project: {
      name: options.config?.projectName,
      runId: options.config?.runId,
      branch: options.config?.branch,
    },
    theme: options.config?.theme === "light" ? "light" : "dark",
    summary: {
      tests: total,
      passed,
      failed,
      skipped,
      requests: tests.reduce((sum, test) => sum + test.requests.length, 0),
      durationMs: specs.reduce((sum, spec) => sum + spec.durationMs, 0),
      passRate: total ? round((passed / total) * 100, 1) : 0,
    },
    specs,
  };
}
