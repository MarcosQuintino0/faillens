import type {
  FailLensAssertion,
  FailLensPayloadDiffMarker,
} from "../types/report";

function kindFor(value: unknown): FailLensPayloadDiffMarker["kind"] {
  if (Array.isArray(value)) return "array";
  if (value && typeof value === "object") return "object";
  return "property";
}

function propertyAt(body: unknown, path: string): unknown {
  let current = body;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function comparable(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function structuralMarkers(
  expected: unknown,
  actual: unknown,
  path: string,
  markers: FailLensPayloadDiffMarker[],
): void {
  if (markers.length >= 100 || comparable(expected) === comparable(actual)) return;
  if (Array.isArray(expected) || Array.isArray(actual)) {
    markers.push({ path, kind: path === "$" ? "whole-response" : "array", reason: "O array recebido difere do valor esperado." });
    return;
  }
  if (expected && actual && typeof expected === "object" && typeof actual === "object") {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    for (const key of Object.keys(actualRecord)) {
      if (key in expectedRecord) {
        structuralMarkers(expectedRecord[key], actualRecord[key], `${path}.${key}`, markers);
      } else {
        markers.push({
          path: `${path}.${key}`,
          kind: kindFor(actualRecord[key]),
          reason: `A propriedade ${key} não existe no contrato esperado.`,
        });
      }
    }
    return;
  }
  if (actual !== undefined) {
    markers.push({ path, kind: "value", reason: "O valor recebido difere do valor esperado." });
  }
}

export function buildPayloadDiff(
  assertions: FailLensAssertion[],
  responseBody: unknown,
  includeObservations = false,
): FailLensPayloadDiffMarker[] {
  const markers: FailLensPayloadDiffMarker[] = [];
  const relevant = assertions.filter((assertion) => assertion.target === "body" && assertion.state !== "passed");

  for (const assertion of relevant) {
    const evidence = `${assertion.title} ${assertion.message || ""}`;
    const forbidden = evidence.match(/not\s+have(?:\s+(?:own|nested))?\s+property\s+['"`]([^'"`]+)['"`]/i);
    if (forbidden && assertion.state === "failed") {
      const property = forbidden[1];
      const value = propertyAt(responseBody, property);
      if (value !== undefined) {
        markers.push({
          path: `$.${property}`,
          kind: kindFor(value),
          reason: `A propriedade ${property} deveria estar ausente.`,
        });
      }
      continue;
    }
    if (Array.isArray(responseBody) && /n[aã]o\s+deve.*(?:array|cole[cç][aã]o)|not.*(?:array)/i.test(evidence)) {
      markers.push({
        path: "$",
        kind: "whole-response",
        reason: "A resposta retornou uma coleção quando o cenário esperava uma resposta de erro.",
      });
      continue;
    }
    if (assertion.state === "failed" && assertion.expected && assertion.actual
      && typeof assertion.expected === "object" && typeof assertion.actual === "object") {
      structuralMarkers(assertion.expected, assertion.actual, "$", markers);
    }
  }

  if (!markers.length && includeObservations && responseBody && typeof responseBody === "object") {
    const evidence = assertions.map((assertion) => assertion.title).join(" ").toLowerCase();
    const nullFields: Array<{ path: string; key: string }> = [];
    const walk = (value: unknown, path: string): void => {
      if (!value || typeof value !== "object" || nullFields.length >= 20) return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const childPath = `${path}.${key}`;
        if (child === null) nullFields.push({ path: childPath, key });
        else walk(child, childPath);
      }
    };
    walk(responseBody, "$" );
    const mentioned = nullFields.filter((field) => evidence.includes(field.key.toLowerCase()));
    for (const field of mentioned.length ? mentioned : nullFields) {
      markers.push({
        path: field.path,
        kind: "value",
        reason: `Valor nulo observado no campo ${field.key} da resposta.`,
        evidenceOnly: true,
      });
    }
  }

  return markers.filter((marker, index, all) => all.findIndex((item) => item.path === marker.path) === index);
}
