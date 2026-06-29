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
}

export interface FailLensSpec {
  specPath: string;
  durationMs: number;
  tests: FailLensTest[];
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
}
