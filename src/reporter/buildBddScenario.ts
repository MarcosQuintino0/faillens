import { STATUS_CODES } from "node:http";
import type {
  FailLensBddLine,
  FailLensBddScenario,
  FailLensBddSource,
  FailLensContract,
  FailLensRequest,
  FailLensRuleRef,
  FailLensTest,
} from "../types/report";

function source(kind: FailLensBddSource["kind"], id: string): FailLensBddSource {
  return { kind, id };
}

function line(keyword: FailLensBddLine["keyword"], text: string, sources: FailLensBddSource[]): FailLensBddLine {
  return { keyword, text, sources };
}

function statusText(status: number): string {
  return `HTTP ${status}${STATUS_CODES[status] ? ` ${STATUS_CODES[status]}` : ""}`;
}

function pathOf(request: FailLensRequest): string {
  try {
    const parsed = new URL(request.url, "http://faillens.invalid");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return request.originalUrl || request.url;
  }
}

function contractPath(method: string, contract: FailLensContract | undefined): string | undefined {
  const matches = (contract?.api || []).map((entry) => entry.trim().match(/^(\S+)\s+(\S+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match && match[1].toUpperCase() === method));
  return matches.length === 1 ? matches[0][2] : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function comparable(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function shown(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function isSuccess(request: FailLensRequest): boolean {
  return typeof request.receivedStatus === "number" && request.receivedStatus >= 200 && request.receivedStatus < 300;
}

function hasOwn(value: Record<string, unknown> | undefined, key: string): boolean {
  return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
}

function fieldContext(
  test: FailLensTest,
  main: FailLensRequest,
  ref: FailLensRuleRef | undefined,
  contract: FailLensContract | undefined,
): FailLensBddLine[] {
  const rule = ref?.rule;
  const field = typeof rule?.attributes.field === "string" ? rule.attributes.field : undefined;
  if (!field) return [];
  const body = record(main.requestBody);
  const value = body?.[field];
  const requestSource = source("request", main.id);
  const contractSource = ref?.contractId && rule ? source("contract", `${ref.contractId}:${rule.id}`) : undefined;
  const sources = contractSource ? [requestSource, contractSource] : [requestSource];
  const condition = typeof rule?.attributes.condition === "string" ? rule.attributes.condition : "";
  const contractField = contract?.fields.find((item) => item.name === field);

  if (condition === "missing" && (!hasOwn(body, field) || value === undefined || value === "")) {
    const required = contractField?.attributes.required === true;
    return [line("DADO", `que o payload não continha o campo${required ? " obrigatório" : ""} "${field}"`, sources)];
  }
  if (condition === "not-found") {
    const pathValue = decodeURIComponent(pathOf(main).split("/").filter(Boolean).at(-1) || "");
    const identifier = comparable(value) && value !== undefined ? value : pathValue;
    if (identifier !== "") return [line("DADO", `que foi utilizado o identificador de teste ${shown(identifier)}`, sources)];
  }
  if (value === null) return [line("DADO", `que o campo "${field}" foi enviado como null`, sources)];

  if (condition === "duplicate" && comparable(value)) {
    const mainIndex = test.requests.indexOf(main);
    const prior = test.requests.slice(0, mainIndex).find((request) =>
      isSuccess(request) && (record(request.responseBody)?.[field] === value || record(request.requestBody)?.[field] === value));
    if (prior) {
      return [line("DADO", `que o valor ${shown(value)} do campo "${field}" já estava associado a outro recurso`, [
        source("request", prior.id),
        ...(contractSource ? [contractSource] : []),
      ])];
    }
  }

  const max = Number(contractField?.attributes.max ?? contractField?.attributes.maxLength);
  const exceeds = Number.isFinite(max) && ((typeof value === "number" && value > max)
    || (typeof value === "string" && value.length > max));
  if (exceeds) {
    return [
      line("DADO", `que o campo "${field}" possui limite máximo contratual de ${max}`, contractSource ? [contractSource] : sources),
      line("E", `foi enviado com o valor ${shown(value)}`, [requestSource]),
    ];
  }

  if (contractField?.type && value !== undefined) {
    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (actualType !== contractField.type.toLowerCase()) {
      return [line("DADO", `que o campo "${field}" foi enviado como ${actualType} com o valor ${shown(value)}`, sources)];
    }
  }
  return [];
}

function authenticationContext(test: FailLensTest, main: FailLensRequest, refs: FailLensRuleRef[]): FailLensBddLine[] {
  const expected = test.statusExpectation?.type === "exact" ? test.statusExpectation.expected : undefined;
  const contractStatuses = refs.filter((ref) => ref.resolved).map((ref) => ref.rule?.status);
  if (![expected, ...contractStatuses].some((status) => status === 401 || status === 403)) return [];
  const hasAuthorization = Object.keys(main.requestHeaders).some((key) => key.toLowerCase() === "authorization");
  return hasAuthorization ? [] : [line("DADO", "que a requisição foi enviada sem o header Authorization", [source("request", main.id)])];
}

function expectedLine(test: FailLensTest, refs: FailLensRuleRef[]): FailLensBddLine | undefined {
  const asserted = test.statusExpectation?.source !== "contract" && test.statusExpectation?.type === "exact"
    ? test.statusExpectation.expected
    : undefined;
  const contractRefs = refs.filter((ref) => ref.resolved && ref.rule?.status !== undefined);
  const statuses = new Set(contractRefs.map((ref) => ref.rule?.status));
  const contractRef = statuses.size === 1 ? contractRefs[0] : undefined;
  const contracted = contractRef?.rule?.status;
  const assertion = test.assertions?.find((item) => item.target === "status") || test.assertions?.find((item) => item.state === "failed");
  const assertionSource = source("assertion", assertion?.id || "test-error");
  const contractSource = contractRef ? source("contract", `${contractRef.contractId}:${contractRef.rule?.id}`) : undefined;

  if (asserted !== undefined && contracted !== undefined && asserted === contracted) {
    return line("MAS", `o teste e o contrato esperavam ${statusText(asserted)}`, [assertionSource, contractSource as FailLensBddSource]);
  }
  if (asserted !== undefined && contracted !== undefined) {
    return line("MAS", `o teste esperava ${statusText(asserted)} e o contrato declara ${statusText(contracted)}`,
      [assertionSource, contractSource as FailLensBddSource]);
  }
  if (asserted !== undefined) return line("MAS", `o teste esperava ${statusText(asserted)}`, [assertionSource]);
  if (contracted !== undefined && contractRef?.rule) {
    return line("MAS", `a regra "${contractRef.rule.id}" declara ${statusText(contracted)}`, [contractSource as FailLensBddSource]);
  }
  return undefined;
}

function persistenceLine(test: FailLensTest): FailLensBddLine | undefined {
  const evidence = test.persistenceEvidence;
  if (!evidence || evidence.state === "not-verified" || !evidence.verificationRequestId) return undefined;
  const messages: Record<string, string> = {
    "confirmed-created": "uma consulta posterior confirmou que o recurso foi criado com os dados enviados",
    "confirmed-absent": "uma consulta posterior confirmou a ausência do recurso",
    "confirmed-preserved": "uma consulta posterior confirmou que os dados originais foram preservados",
    "confirmed-removed": "uma consulta posterior confirmou que o recurso removido não foi encontrado",
  };
  return line("E", messages[evidence.state], [source("persistence", evidence.verificationRequestId)]);
}

export function buildBddScenario(
  test: FailLensTest,
  main: FailLensRequest | undefined,
  refs: FailLensRuleRef[],
  contract?: FailLensContract,
): FailLensBddScenario | undefined {
  if (test.state !== "failed" || !main) return undefined;
  const resolvedRef = refs.find((ref) => ref.resolved && ref.rule);
  const context = [
    ...authenticationContext(test, main, refs),
    ...fieldContext(test, main, resolvedRef, contract),
  ];
  const operationPath = contractPath(main.method, contract) || pathOf(main);
  const operationSources = [source("request", main.id)];
  if (contractPath(main.method, contract) && contract) operationSources.push(source("contract", contract.id));
  const operation = line("QUANDO", `foi executado ${main.method} ${operationPath}`, operationSources);
  const timeout = /\b(?:timeout|timed out)\b/i.test(test.error?.message || "");
  const observed: FailLensBddLine[] = timeout
    ? [
      line("ENTÃO", "a requisição excedeu o tempo limite configurado", [source("error", "test-error")]),
      line("E", "não houve resposta HTTP", [source("request", main.id)]),
    ]
    : main.receivedStatus === undefined
      ? [
        line("ENTÃO", "a requisição terminou sem resposta HTTP", [source("request", main.id)]),
        ...(test.diagnosis?.category === "network-error"
          ? [line("E", "o Cypress registrou um erro de conexão", [source("error", "test-error")])]
          : []),
      ]
      : [line("ENTÃO", `a API retornou ${statusText(main.receivedStatus)}`, [source("request", main.id)])];
  const expected = expectedLine(test, refs);
  const posterior = persistenceLine(test);
  const core = [operation, ...observed, ...(expected ? [expected] : []), ...(posterior ? [posterior] : [])];
  const availableContext = Math.max(0, 6 - core.length);
  const selectedContext = context.slice(0, availableContext).map((item, index) => ({ ...item, keyword: index === 0 ? "DADO" as const : "E" as const }));
  const lines = [...selectedContext, ...core];
  return { lines, text: lines.map((item) => `${item.keyword} ${item.text}`).join("\n") };
}
