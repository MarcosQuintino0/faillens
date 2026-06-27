import { generateCurl } from "../collector/curlGenerator";
import { maskSensitiveData, maskSensitiveText, maskUrl } from "../collector/sensitiveMask";
import type { ResolvedFailLensConfig } from "../types/config";
import type {
  FailLensError,
  FailLensAssertion,
  FailLensReport,
  FailLensRequest,
  FailLensSpec,
  FailLensTest,
} from "../types/report";
import { round } from "../utils/format";
import { diagnoseFailure } from "./diagnostics/diagnoseFailure";
import { parseAssertionError } from "./diagnostics/parseAssertionError";

const VERSION = "0.1.0";

interface GeneratedVariable {
  name: "$TOKEN" | "$USER_ID" | "$ORDER_ID" | "$RESOURCE_ID";
  path: string;
  value?: string;
}

function plain(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isAuth(request: FailLensRequest): boolean {
  return /\/(auth\/login|login)(?:[/?#]|$)/i.test(request.originalUrl || request.url);
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d{3}$/.test(value.trim())) return Number(value);
  return undefined;
}

export function inferMainRequest(test: FailLensTest): FailLensRequest | undefined {
  if (!test.requests.length) return undefined;
  const candidates = test.requests.filter((request) => !isAuth(request));
  const pool = candidates.length ? candidates : test.requests;
  const title = plain(test.title);
  const expectedMethod = /\b(criar|create|cadastrar)\b/.test(title)
    ? "POST"
    : /\b(atualizar|alterar|update|editar)\b/.test(title)
      ? "PATCH_OR_PUT"
      : /\b(excluir|deletar|cancelar|delete|remove)\b/.test(title)
        ? "DELETE"
        : /\b(buscar|consultar|listar|obter|search|list|get)\b/.test(title)
          ? "GET"
          : undefined;
  const actual = numeric(test.error?.actual);

  let winner = pool[0];
  let winnerScore = -1;
  for (const request of pool) {
    let score = 1;
    if (expectedMethod === request.method) score += 30;
    if (expectedMethod === "PATCH_OR_PUT" && ["PATCH", "PUT"].includes(request.method)) score += 30;
    if (actual !== undefined && request.receivedStatus === actual) score += 45;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) score += 3;
    if (score > winnerScore) {
      winner = request;
      winnerScore = score;
    }
  }
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

function variableForEndpoint(url: string): GeneratedVariable["name"] {
  if (/\/(usuarios|users)(?:[/?#]|$)/i.test(url)) return "$USER_ID";
  if (/\/(pedidos|orders)(?:[/?#]|$)/i.test(url)) return "$ORDER_ID";
  return "$RESOURCE_ID";
}

function findGeneratedVariables(request: FailLensRequest): GeneratedVariable[] {
  const found: GeneratedVariable[] = [];
  const visited = new Set<object>();
  const walk = (value: unknown, path: string[]): void => {
    if (!value || typeof value !== "object" || visited.has(value as object)) return;
    visited.add(value as object);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = [...path, key];
      if (/^(token|accessToken)$/i.test(key)) {
        found.push({ name: "$TOKEN", path: nextPath.join("."), value: typeof child === "string" && child !== "***" ? child : undefined });
      } else if (/^id$/i.test(key) && (typeof child === "string" || typeof child === "number")) {
        found.push({ name: variableForEndpoint(request.url), path: nextPath.join("."), value: String(child) });
      }
      walk(child, nextPath);
    }
  };
  walk(request.responseBody, []);
  return found.filter((item, index, all) => all.findIndex((other) => other.name === item.name) === index);
}

function usesVariable(request: FailLensRequest, variable: GeneratedVariable): boolean {
  if (variable.name === "$TOKEN") {
    return Object.entries(request.requestHeaders).some(
      ([key, value]) => /authorization/i.test(key) && /bearer/i.test(String(value)),
    );
  }
  if (!variable.value) return false;
  const encoded = encodeURIComponent(variable.value);
  return (
    request.url.includes(`/${variable.value}`) ||
    request.url.includes(`/${encoded}`) ||
    JSON.stringify(request.requestBody).includes(`"${variable.value}"`)
  );
}

function applyVariable(command: string, variable: GeneratedVariable): string {
  let result = command;
  if (variable.name === "$TOKEN") {
    result = result.replace(/Bearer\s+(?:<TOKEN>|\*\*\*)/gi, `Bearer ${variable.name}`);
  }
  if (variable.value) {
    const encoded = encodeURIComponent(variable.value);
    result = result
      .split(`/${variable.value}`).join(`/${variable.name}`)
      .split(`/${encoded}`).join(`/${variable.name}`)
      .split(`"${variable.value}"`).join(`"${variable.name}"`);
  }
  return result.replace(/'([^'\n]*\$[A-Z_]+[^'\n]*)'/g, '"$1"');
}

function annotateRequests(test: FailLensTest, main: FailLensRequest | undefined): void {
  const mainIndex = main ? test.requests.findIndex((request) => request.id === main.id) : -1;
  const available: GeneratedVariable[] = [];

  test.requests.forEach((request, index) => {
    if (isAuth(request)) request.phase = "preparacao";
    else if (request.id === main?.id) request.phase = "validacao";
    else if (index > mainIndex && request.method === "GET") request.phase = "verificacao";
    else if (index > mainIndex && request.method === "DELETE") request.phase = "limpeza";
    else request.phase = "chamada";

    request.usedVariables = available.filter((variable) => usesVariable(request, variable)).map((item) => item.name);
    const generated = findGeneratedVariables(request).filter(
      (item) => !available.some((known) => known.name === item.name),
    );
    request.generatedVariables = generated.map((item) => item.name);
    available.push(...generated);
  });
}

function buildReproductionScript(requests: FailLensRequest[]): string {
  const available: GeneratedVariable[] = [];
  const commands: string[] = [
    "# Prévia de reprodução gerada pelo FailLens",
    "# Requer curl; extrações de variáveis usam jq.",
  ];

  for (const request of requests) {
    let command = request.curl;
    for (const variable of available) command = applyVariable(command, variable);
    const generated = findGeneratedVariables(request).filter(
      (item) => !available.some((known) => known.name === item.name),
    );
    const primary = generated[0];
    if (primary) {
      const shellName = primary.name.slice(1);
      command = command.replace(/^curl\s+/, "curl -s ");
      commands.push(`${shellName}=$(${command} | jq -r '.${primary.path}')`);
      for (const variable of generated) {
        if (!available.some((known) => known.name === variable.name)) available.push(variable);
      }
    } else {
      commands.push(command);
    }
  }
  return commands.join("\n\n");
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

function prepareTest(source: FailLensTest, maskFields: string[]): FailLensTest {
  const test: FailLensTest = {
    ...source,
    error: maskError(source.error, maskFields),
    requests: source.requests.map((request) => sanitizeRequest(request, maskFields)),
  };
  const main = inferMainRequest(test);
  test.assertions = prepareAssertions(source, test.error, maskFields);
  test.mainRequestId = main?.id;
  annotateRequests(test, main);
  test.diagnosis = diagnoseFailure({ test, mainRequest: main });
  test.reproductionScript = buildReproductionScript(test.requests);
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
    theme: options.config?.theme ?? "dark",
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
