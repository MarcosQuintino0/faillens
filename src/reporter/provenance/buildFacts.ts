// Monta os facts de procedência de um teste e marca conflitos entre fontes.
//
// Cada fact carrega uma fonte permitida (observed/asserted/contract/verified/
// not-verified). O FailLens nunca inventa: facts contract só existem quando há
// regra vinculada resolvida; facts asserted vêm da expectativa do teste; facts
// observed vêm da execução. Quando asserted e contract divergem na mesma dimensão,
// ambos são preservados e marcados como conflitantes (divergência de fontes), em
// vez de escolher silenciosamente um valor.

import { maskSensitiveText } from "../../collector/sensitiveMask";
import type { FailLensFact } from "../../types/provenance";
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

export function buildFacts(
  test: FailLensTest,
  mainRequest: FailLensRequest | undefined,
  ruleRefs: FailLensRuleRef[],
  maskFields: string[],
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
        value: maskSensitiveText(rule.message, maskFields),
        source: "contract",
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

  // verified / not-verified: persistência confirmada por operação posterior.
  const mutation = mainRequest && isMutation(mainRequest.method)
    ? mainRequest
    : test.requests.find((request) => isMutation(request.method));
  if (mutation) {
    const verification = test.requests.find(
      (request) =>
        request.phase === "verificacao" &&
        typeof request.receivedStatus === "number" &&
        request.receivedStatus >= 200 &&
        request.receivedStatus < 300 &&
        verifiesMutation(mutation, request),
    );
    if (verification) {
      facts.push({
        id: nextId(),
        kind: "persistence-verified",
        value: true,
        source: "verified",
        requestId: verification.id,
      });
    } else {
      facts.push({ id: nextId(), kind: "persistence-not-verified", value: true, source: "not-verified" });
    }
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
