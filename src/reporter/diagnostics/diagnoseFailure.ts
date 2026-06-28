import type {
  FailLensDiagnosis,
  FailLensError,
  FailLensRequest,
  FailLensTest,
} from "../../types/report";
import { asRecord } from "../../utils/format";
import { STATUS_DIAGNOSIS_RULES, SUCCESS_STATUSES } from "./rules";

export interface DiagnosisContext {
  test: FailLensTest;
  mainRequest?: FailLensRequest;
}

function statusNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d{3}$/.test(value.trim())) return Number(value);
  return undefined;
}

function confidence(error: FailLensError | undefined, main: FailLensRequest | undefined, strong: boolean): "high" | "medium" | "low" {
  if (strong && error?.expected !== undefined && error.actual !== undefined && main) return "high";
  if (error?.expected !== undefined && main) return "medium";
  return "low";
}

function scalarMismatches(expected: unknown, actual: unknown): string[] {
  const expectedRecord = asRecord(expected);
  const actualRecord = asRecord(actual);
  const nested = asRecord(actualRecord.data);
  const nestedActual = Object.keys(nested).length ? nested : actualRecord;
  return Object.entries(expectedRecord)
    .filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))
    .filter(([key, value]) => key in nestedActual && nestedActual[key] !== value)
    .map(([key]) => key);
}

function hasGeneratedId(body: unknown): boolean {
  const record = asRecord(body);
  if (record.id !== undefined) return true;
  return asRecord(record.data).id !== undefined;
}

function baseEvidence(expected?: number, actual?: number, main?: FailLensRequest): string[] {
  const evidence: string[] = [];
  if (expected !== undefined) evidence.push(`Status esperado: ${expected}`);
  if (actual !== undefined) evidence.push(`Status observado: ${actual}`);
  if (main) evidence.push(`Chamada principal: ${main.method} ${main.originalUrl || main.url}`);
  return evidence;
}

export function diagnoseFailure(context: DiagnosisContext): FailLensDiagnosis | undefined {
  const { test, mainRequest: main } = context;
  if (test.state !== "failed" && !test.error && !main?.error) return undefined;
  const error = test.error ?? main?.error;
  const message = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
  const expected = statusNumber(error?.expected);
  const actual = statusNumber(error?.actual) ?? main?.receivedStatus;
  const mainIndex = main ? test.requests.findIndex((request) => request.id === main.id) : -1;
  const laterGets = test.requests.slice(mainIndex + 1).filter((request) => request.method === "GET");

  if (/timeout|timed out|tempo limite|etimedout/.test(message)) {
    return {
      category: "timeout",
      confidence: main ? "medium" : "low",
      title: "A chamada excedeu o tempo limite",
      summary: "A execução registrou um erro de timeout. O relatório não atribui a causa a um componente específico.",
      evidence: [...baseEvidence(expected, actual, main), error?.message || "Timeout"],
      suggestedAction: "Repita a chamada e compare a duração com os timeouts configurados no Cypress e no serviço.",
    };
  }

  if (
    (!main?.receivedStatus && /network|econn|enotfound|socket|connection|sem resposta|failed to connect/.test(message)) ||
    (main?.error && main.receivedStatus === undefined)
  ) {
    return {
      category: "network-error",
      confidence: main ? "medium" : "low",
      title: "A API não forneceu uma resposta HTTP",
      summary: "A evidência disponível indica falha de rede ou conexão antes de uma resposta HTTP completa.",
      evidence: [...baseEvidence(expected, actual, main), error?.message || "Sem resposta HTTP"],
      suggestedAction: "Confirme se o serviço está acessível no endereço registrado e verifique DNS, porta e conectividade local.",
    };
  }

  if (/schema|contract|propriedade|property|campo.*esperad|missing.*field|type mismatch|deep(?:ly)?\s+equal|nested\s+property|response\.body/.test(message)) {
    return {
      category: "schema-contract-mismatch",
      confidence: main ? "medium" : "low",
      title: "Resposta divergiu do contrato esperado",
      summary: "A assertion sugere divergência de estrutura, campo ou tipo entre a resposta e o contrato exercitado pelo teste.",
      evidence: [...baseEvidence(expected, actual, main), error?.assertionMessage || error?.message || ""].filter(Boolean),
      suggestedAction: "Compare o response body com o schema ou com os campos explicitamente verificados pelo teste.",
    };
  }

  if (main && ["POST", "PUT", "PATCH"].includes(main.method) && SUCCESS_STATUSES.includes(main.receivedStatus || 0)) {
    const verifyingGet = laterGets[0];
    const mismatches = verifyingGet
      ? scalarMismatches(main.requestBody, verifyingGet.responseBody)
      : [];
    if (verifyingGet && (verifyingGet.receivedStatus === 404 || mismatches.length > 0)) {
      return {
        category: "persistence-mismatch",
        confidence: "high",
        title: "Alteração não foi confirmada na verificação",
        summary: "A mutação retornou sucesso, mas a chamada GET posterior não confirmou o estado enviado.",
        evidence: [
          ...baseEvidence(expected, actual, main),
          `Verificação: GET ${verifyingGet.originalUrl || verifyingGet.url} → ${verifyingGet.receivedStatus ?? "sem resposta"}`,
          ...(mismatches.length ? [`Campos divergentes: ${mismatches.join(", ")}`] : []),
        ],
        suggestedAction: "Compare a resposta da mutação com o GET de verificação e confirme o contrato de consistência esperado.",
      };
    }

    if (
      expected !== undefined &&
      expected >= 400 &&
      hasGeneratedId(main.responseBody) &&
      laterGets.some((request) => SUCCESS_STATUSES.includes(request.receivedStatus || 0))
    ) {
      return {
        category: "unexpected-persistence",
        confidence: "high",
        title: "Recurso foi persistido mesmo após payload inválido",
        summary: "A request que deveria falhar retornou um identificador, e uma consulta posterior encontrou o recurso.",
        evidence: [
          ...baseEvidence(expected, actual, main),
          "A resposta da mutação contém um identificador.",
          "Uma verificação GET posterior retornou sucesso.",
        ],
        suggestedAction: "Use a sequência capturada para confirmar se o recurso criado corresponde ao payload inválido do cenário.",
      };
    }
  }

  if (expected !== undefined && actual !== undefined && main) {
    const rule = STATUS_DIAGNOSIS_RULES.find(
      (candidate) =>
        candidate.expected(expected) &&
        candidate.actual(actual) &&
        (!candidate.methods || candidate.methods.includes(main.method)),
    );
    if (rule) {
      return {
        category: rule.category,
        confidence: confidence(error, main, true),
        title: rule.title,
        summary: rule.summary(expected, actual),
        evidence: baseEvidence(expected, actual, main),
        suggestedAction: rule.suggestedAction,
      };
    }
  }

  return {
    category: "unknown",
    confidence: confidence(error, main, false),
    title: "Falha sem padrão determinístico conhecido",
    summary: "As evidências capturadas não correspondem com segurança a uma regra específica do FailLens.",
    evidence: [...baseEvidence(expected, actual, main), error?.message || "Falha registrada"],
    suggestedAction: "Comece pela assertion e pela chamada principal, depois percorra a sequência completa de requests.",
  };
}
