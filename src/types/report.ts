import type {
  FactSource,
  FailLensContract,
  FailLensContractRule,
  FailLensFact,
  FailLensPersistenceEvidence,
  FailLensPersistenceExpectation,
} from "./provenance";

export type {
  FactSource,
  FailLensContract,
  FailLensFact,
  FailLensPersistenceEvidence,
  FailLensPersistenceExpectation,
  PersistenceEvidenceState,
  PersistenceExpectation,
} from "./provenance";

export type RequestPhase =
  | "preparacao"
  | "validacao"
  | "verificacao"
  | "limpeza"
  | "chamada";

export type TestState = "passed" | "failed" | "skipped" | "unknown";

export type AssertionState = "passed" | "failed" | "pending" | "skipped" | "unknown";

export type AssertionTarget = "status" | "body" | "header" | "schema" | "unknown";

export interface FailLensStatusExpectation {
  type: "exact" | "set" | "range" | "family" | "unknown";
  label: string;
  expected?: number;
  values?: number[];
  min?: number;
  max?: number;
  actual?: number;
  matched?: boolean;
  // Fonte da expectativa: "asserted" quando veio de uma assertion/erro,
  // "contract" quando veio de uma regra contratual vinculada.
  source?: FactSource;
}

// Vínculo determinístico teste -> regra contratual, derivado da tag @regra:<id>
// (sem heurística textual de título). `resolved` indica se a regra existe no
// contrato vinculado.
export interface FailLensRuleRef {
  ruleId: string;
  contractId?: string;
  resolved: boolean;
  rule?: FailLensContractRule;
}

export interface FailLensPayloadDiffMarker {
  path: string;
  kind: "property" | "object" | "array" | "value" | "whole-response";
  reason: string;
  evidenceOnly?: boolean;
}

export interface FailLensError {
  name: string;
  message: string;
  stack?: string;
  assertionMessage?: string;
  expected?: unknown;
  actual?: unknown;
  file?: string;
  line?: number;
  column?: number;
}

export interface FailLensDiagnosis {
  category:
    | "validation-not-applied"
    | "unhandled-validation-error"
    | "authorization-not-enforced"
    | "authentication-not-enforced"
    | "resource-not-found-mismatch"
    | "duplicate-conflict"
    | "success-expected-but-client-error"
    | "success-expected-but-server-error"
    | "persistence-mismatch"
    | "unexpected-persistence"
    | "network-error"
    | "timeout"
    | "schema-contract-mismatch"
    | "unknown";
  confidence: "high" | "medium" | "low";
  title: string;
  summary: string;
  evidence: string[];
  suggestedAction: string;
}

export interface FailLensAssertion {
  id: string;
  title: string;
  state: AssertionState;
  message?: string;
  expected?: unknown;
  actual?: unknown;
  file?: string;
  line?: number;
  column?: number;
  target?: AssertionTarget;
}

export interface FailLensRedirect {
  statusCode?: number;
  location: string;
}

export interface FailLensRequest {
  id: string;
  order: number;
  phase: RequestPhase;
  method: string;
  url: string;
  originalUrl?: string;
  requestHeaders: Record<string, unknown>;
  requestBody: unknown;
  failOnStatusCode?: boolean;
  startedAt?: string;
  receivedStatus?: number;
  responseHeaders: Record<string, unknown>;
  responseBody: unknown;
  durationMs: number;
  curl: string;
  error?: FailLensError;
  redirects?: FailLensRedirect[];
  generatedVariables?: string[];
  usedVariables?: string[];
}

export interface FailLensScreenshot {
  relativePath: string;
  href: string;
  fileName: string;
  size: number;
  width?: number;
  height?: number;
  takenAt?: string;
  attempt?: number;
  kind: "failure" | "manual";
}

export interface FailLensEvidence {
  screenshots?: FailLensScreenshot[];
}

export interface FailLensTest {
  id: string;
  title: string;
  titlePath?: string[];
  state: TestState;
  durationMs: number;
  error?: FailLensError;
  diagnosis?: FailLensDiagnosis;
  assertions?: FailLensAssertion[];
  requests: FailLensRequest[];
  mainRequestId?: string;
  reproductionScript?: string;
  statusExpectation?: FailLensStatusExpectation;
  payloadDiff?: FailLensPayloadDiffMarker[];
  evidence?: FailLensEvidence;
  // Procedência (interno; não renderizado no HTML).
  contractId?: string;
  ruleRefs?: FailLensRuleRef[];
  facts?: FailLensFact[];
  // Expectativa contratual e evidência observada são deliberadamente separadas.
  persistenceExpectation?: FailLensPersistenceExpectation;
  persistenceEvidence?: FailLensPersistenceEvidence;
  // Tags de catálogo e operacionais autoradas no 2º argumento do it (ex.:
  // "@obrigatoriedade", "@bug"), na ordem do source. O vínculo @regra:<id> NÃO
  // entra aqui (vive em ruleRefs). Tags de catálogo via CatalogoTags.X só
  // aparecem quando o módulo de tags importado pôde ser resolvido.
  tags?: string[];
}

export interface FailLensSpec {
  specPath: string;
  durationMs: number;
  tests: FailLensTest[];
  // Contrato JSDoc bruto deste spec (procedência). Consolidado no relatório por
  // @contrato em buildReportModel; não é emitido por spec no relatório final.
  contract?: FailLensContract;
}

export interface FailLensSummary {
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  requests: number;
  durationMs: number;
  passRate: number;
}

export interface FailLensReport {
  generatedAt: string;
  tool: {
    name: "FailLens";
    packageName: "faillens";
    version: string;
  };
  project?: {
    name?: string;
    runId?: string;
    branch?: string;
  };
  theme?: "dark" | "light";
  summary: FailLensSummary;
  specs: FailLensSpec[];
  // Contratos JSDoc resolvidos (procedência). Ausente quando não há contrato.
  contracts?: FailLensContract[];
}
