// Monta os facts de procedência de um teste e marca conflitos entre fontes.
//
// Cada fact carrega uma fonte permitida (observed/asserted/contract/verified/
// not-verified). O FailLens nunca inventa: facts contract só existem quando há
// regra vinculada resolvida; facts asserted vêm da expectativa do teste; facts
// observed vêm da execução. Quando asserted e contract divergem na mesma dimensão,
// ambos são preservados e marcados como conflitantes (divergência de fontes), em
// vez de escolher silenciosamente um valor.

import { maskSensitiveText, type MaskConfig } from "../../collector/sensitiveMask";
import type {
  FailLensFact,
  FailLensPersistenceEvidence,
  FailLensPersistenceExpectation,
} from "../../types/provenance";
import type { FailLensRequest, FailLensRuleRef, FailLensTest } from "../../types/report";

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d{3}$/.test(value.trim())) return Number(value);
  return undefined;
}

function isMutation(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

function bodyMissingField(body: unknown, field: string): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  if (!(field in record)) return true;
  const value = record[field];
  return value === null || value === undefined || value === "";
}

function responseIdentifiers(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const record = body as Record<string, unknown>;
  return Object.entries(record)
    .filter(([key, value]) => /(^id$|id$)/i.test(key) && (typeof value === "string" || typeof value === "number"))
    .map(([, value]) => String(value));
}

function verifiesMutation(mutation: FailLensRequest, request: FailLensRequest): boolean {
  const generated = new Set(mutation.generatedVariables || []);
  if ((request.usedVariables || []).some((variable) => generated.has(variable))) return true;
  return responseIdentifiers(mutation.responseBody).some((id) => {
    const encoded = encodeURIComponent(id);
    return request.url.includes(`/${id}`) || request.url.includes(`/${encoded}`);
  });
}

function successful(request: FailLensRequest): boolean {
  return typeof request.receivedStatus === "number"
    && request.receivedStatus >= 200
    && request.receivedStatus < 300;
}

function rejected(request: FailLensRequest): boolean {
  return typeof request.receivedStatus === "number" && request.receivedStatus >= 400;
}

function resourceUrl(url: string): string {
  try {
    const parsed = new URL(url, "http://faillens.invalid");
    const pathname = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, "") : parsed.pathname;
    return `${pathname}${parsed.search}`;
  } catch {
    return url.replace(/\/+$/, "");
  }
}

function sameResource(mutation: FailLensRequest, request: FailLensRequest): boolean {
  return resourceUrl(mutation.url) === resourceUrl(request.url) || verifiesMutation(mutation, request);
}

function payloadMatches(expected: unknown, observed: unknown): { matches: boolean; compared: boolean } {
  if (typeof expected === "string" && ["***", "<TOKEN>", "Bearer <TOKEN>"].includes(expected)) {
    return { matches: false, compared: false };
  }
  if (expected === null || typeof expected !== "object") {
    return { matches: Object.is(expected, observed), compared: true };
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(observed) || expected.length !== observed.length) return { matches: false, compared: true };
    let compared = false;
    for (let index = 0; index < expected.length; index += 1) {
      const result = payloadMatches(expected[index], observed[index]);
      if (!result.matches) return result;
      compared ||= result.compared;
    }
    return { matches: true, compared };
  }
  if (!observed || typeof observed !== "object" || Array.isArray(observed)) return { matches: false, compared: true };
  let compared = false;
  for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(observed, key)) return { matches: false, compared: true };
    const result = payloadMatches(value, (observed as Record<string, unknown>)[key]);
    if (!result.matches) return result;
    compared ||= result.compared;
  }
  return { matches: true, compared };
}

export interface PersistenceState {
  expectation: FailLensPersistenceExpectation;
  evidence: FailLensPersistenceEvidence;
}

export function buildPersistenceState(
  test: FailLensTest,
  mainRequest: FailLensRequest | undefined,
  ruleRefs: FailLensRuleRef[],
): PersistenceState | undefined {
  const declaredOperations = new Set(ruleRefs
    .filter((ref) => ref.resolved && typeof ref.rule?.attributes.operation === "string")
    .map((ref) => String(ref.rule?.attributes.operation).toUpperCase()));
  const operationMatches = declaredOperations.size === 1
    ? test.requests.filter((request) => isMutation(request.method) && declaredOperations.has(request.method))
    : [];
  const mutation = operationMatches.length === 1
    ? operationMatches[0]
    : mainRequest && isMutation(mainRequest.method)
    ? mainRequest
    : test.requests.find((request) => isMutation(request.method));
  if (!mutation) return undefined;

  const declared = ruleRefs.filter((ref) => ref.resolved && ref.rule?.persistence);
  const distinct = new Set(declared.map((ref) => ref.rule?.persistence));
  const resolved = distinct.size === 1 ? declared[0] : undefined;
  const expectation: FailLensPersistenceExpectation = resolved?.rule?.persistence
    ? { state: resolved.rule.persistence, contractId: resolved.contractId, ruleId: resolved.rule.id }
    : { state: "not-specified" };
  const unverified: PersistenceState = {
    expectation,
    evidence: { state: "not-verified", mutationRequestId: mutation.id },
  };
  const mutationIndex = test.requests.indexOf(mutation);
  const before = test.requests.slice(0, mutationIndex);
  const after = test.requests.slice(mutationIndex + 1);

  if (mutation.method === "POST" && successful(mutation)) {
    const verification = after.find((request) => {
      if (request.method !== "GET" || !successful(request) || !verifiesMutation(mutation, request)) return false;
      const payload = payloadMatches(mutation.requestBody, request.responseBody);
      return payload.matches && payload.compared;
    });
    return verification ? {
      expectation,
      evidence: {
        state: "confirmed-created",
        mutationRequestId: mutation.id,
        verificationRequestId: verification.id,
        summary: "Uma consulta posterior encontrou o recurso criado com os dados enviados.",
      },
    } : unverified;
  }

  if (mutation.method === "POST" && rejected(mutation)) {
    const verification = after.find((request) =>
      request.method === "GET" && request.receivedStatus === 404 && sameResource(mutation, request));
    return verification ? {
      expectation,
      evidence: {
        state: "confirmed-absent",
        mutationRequestId: mutation.id,
        verificationRequestId: verification.id,
        summary: "Uma consulta posterior confirmou a ausência do recurso.",
      },
    } : unverified;
  }

  if (["PUT", "PATCH"].includes(mutation.method) && rejected(mutation)) {
    let baseline: FailLensRequest | undefined;
    for (let index = before.length - 1; index >= 0; index -= 1) {
      const request = before[index];
      if (request.method === "GET" && successful(request) && sameResource(mutation, request)) {
        baseline = request;
        break;
      }
    }
    const verification = after.find((request) => request.method === "GET" && successful(request) && sameResource(mutation, request));
    if (baseline && verification && payloadMatches(baseline.responseBody, verification.responseBody).matches
      && payloadMatches(verification.responseBody, baseline.responseBody).matches) {
      return {
        expectation,
        evidence: {
          state: "confirmed-preserved",
          mutationRequestId: mutation.id,
          baselineRequestId: baseline.id,
          verificationRequestId: verification.id,
          summary: "A releitura posterior encontrou o mesmo estado observado antes da operação rejeitada.",
        },
      };
    }
    return unverified;
  }

  if (mutation.method === "DELETE" && successful(mutation)) {
    const verification = after.find((request) =>
      request.method === "GET" && request.receivedStatus === 404 && sameResource(mutation, request));
    return verification ? {
      expectation,
      evidence: {
        state: "confirmed-removed",
        mutationRequestId: mutation.id,
        verificationRequestId: verification.id,
        summary: "Uma consulta posterior confirmou que o recurso removido não foi encontrado.",
      },
    } : unverified;
  }

  return unverified;
}

export function buildFacts(
  test: FailLensTest,
  mainRequest: FailLensRequest | undefined,
  ruleRefs: FailLensRuleRef[],
  maskConfig: MaskConfig,
  persistence?: PersistenceState,
): FailLensFact[] {
  const facts: FailLensFact[] = [];
  let counter = 0;
  const nextId = (): string => `fact-${++counter}`;

  // observed: status recebido na chamada principal.
  if (mainRequest?.receivedStatus !== undefined) {
    facts.push({
      id: nextId(),
      kind: "received-status",
      value: mainRequest.receivedStatus,
      source: "observed",
      dimension: "status",
      requestId: mainRequest.id,
    });
  }

  // asserted: status esperado pelo teste (assertion/erro).
  const expected = numeric(test.statusExpectation?.expected);
  if (expected !== undefined && test.statusExpectation?.source !== "contract") {
    facts.push({
      id: nextId(),
      kind: "expected-status",
      value: expected,
      source: "asserted",
      dimension: "status",
    });
  }

  // contract: derivado das regras vinculadas e resolvidas.
  for (const ref of ruleRefs) {
    if (!ref.resolved || !ref.rule) continue;
    const { rule } = ref;
    if (rule.status !== undefined) {
      facts.push({
        id: nextId(),
        kind: "rule-status",
        value: rule.status,
        source: "contract",
        dimension: "status",
        contractId: ref.contractId,
        ruleId: rule.id,
      });
    }
    if (rule.message) {
      facts.push({
        id: nextId(),
        kind: "rule-message",
        value: maskSensitiveText(rule.message, maskConfig),
        source: "contract",
        contractId: ref.contractId,
        ruleId: rule.id,
      });
    }
    if (rule.persistence) {
      facts.push({
        id: nextId(),
        kind: "persistence-expectation",
        value: rule.persistence,
        source: "contract",
        dimension: "persistence-expectation",
        contractId: ref.contractId,
        ruleId: rule.id,
      });
    }
    const field = rule.attributes.field;
    if (typeof field === "string") {
      // observed: o campo exigido pela regra está ausente no request principal?
      if (mainRequest && bodyMissingField(mainRequest.requestBody, field)) {
        facts.push({
          id: nextId(),
          kind: "request-field-absent",
          value: field,
          source: "observed",
          requestId: mainRequest.id,
        });
      }
      facts.push({
        id: nextId(),
        kind: "rule-field",
        value: field,
        source: "contract",
        contractId: ref.contractId,
        ruleId: rule.id,
      });
    }
  }

  if (persistence) {
    facts.push({
      id: nextId(),
      kind: "persistence-evidence",
      value: persistence.evidence.state,
      source: persistence.evidence.state === "not-verified" ? "not-verified" : "verified",
      requestId: persistence.evidence.verificationRequestId || persistence.evidence.mutationRequestId,
    });
  }

  markConflicts(facts);
  return facts;
}

// Conflito = na mesma dimensão, fontes asserted e contract apontam valores
// diferentes. Observed não entra (status observado divergir do esperado é a
// própria falha, não um conflito de fontes).
function markConflicts(facts: FailLensFact[]): void {
  const byDimension = new Map<string, FailLensFact[]>();
  for (const fact of facts) {
    if (!fact.dimension) continue;
    if (fact.source !== "asserted" && fact.source !== "contract") continue;
    const bucket = byDimension.get(fact.dimension) || [];
    bucket.push(fact);
    byDimension.set(fact.dimension, bucket);
  }
  for (const bucket of byDimension.values()) {
    const distinct = new Set(bucket.map((fact) => JSON.stringify(fact.value)));
    if (distinct.size <= 1) continue;
    for (const fact of bucket) {
      fact.conflictsWith = bucket.filter((other) => other.id !== fact.id).map((other) => other.id);
    }
  }
}
