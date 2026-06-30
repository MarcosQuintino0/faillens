import type {
  AssertionState,
  FailLensAssertion,
  FailLensSpec,
  FailLensTest,
  FailLensRequest,
  FailLensScreenshot,
  TestState,
} from "../types/report";
import { generateCurl } from "./curlGenerator";
import { maskSensitiveData, maskSensitiveText, maskUrl, type MaskConfig } from "./sensitiveMask";
import { parseAssertionError } from "../reporter/diagnostics/parseAssertionError";
import { asRecord, clampNumber, createId } from "../utils/format";
import type { PlannedTestAssertions } from "./extractSourceAssertions";
import type { PlannedTestTags } from "./extractTestTags";
import type { FailLensContract, FailLensRuleRef } from "../types/report";

export interface SetTestPayload {
  id?: string;
  title: string;
  titlePath?: string[];
  specPath?: string;
}

export interface AddRequestPayload {
  testId?: string;
  specPath?: string;
  id?: string;
  method?: string;
  url?: string;
  originalUrl?: string;
  requestHeaders?: Record<string, unknown>;
  requestBody?: unknown;
  failOnStatusCode?: boolean;
  startedAt?: string;
}

export interface FinishRequestPayload {
  testId?: string;
  specPath?: string;
  id: string;
  receivedStatus?: number;
  responseHeaders?: Record<string, unknown>;
  responseBody?: unknown;
  durationMs?: number;
  error?: unknown;
  redirects?: Array<{ statusCode?: number; location: string }>;
}

export interface TestResultPayload {
  testId?: string;
  specPath?: string;
  state?: TestState | string;
  durationMs?: number;
  error?: unknown;
  assertions?: FailLensAssertion[];
}

interface MutableSpec extends FailLensSpec {
  tests: FailLensTest[];
}

function normalizeState(value: unknown): TestState {
  if (value === "pending" || value === "skipped") return "skipped";
  return value === "passed" || value === "failed" ? value : "unknown";
}

function normalizeAssertionState(value: unknown): AssertionState {
  if (["passed", "failed", "pending", "skipped"].includes(String(value))) {
    return value as AssertionState;
  }
  return "unknown";
}

function sameTitle(test: FailLensTest, title: unknown): boolean {
  const value = Array.isArray(title) ? title.map(String).join(" > ") : String(title ?? "");
  return test.title === value || test.titlePath?.join(" > ") === value;
}

function comparableAssertionTitle(value: unknown): string {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function assertionMatches(planned: FailLensAssertion, observed: FailLensAssertion): boolean {
  if (planned.line && observed.line && planned.line === observed.line) return true;
  const expected = comparableAssertionTitle(planned.title);
  const actual = comparableAssertionTitle(observed.title);
  return Boolean(expected && actual && (actual.includes(expected) || expected.includes(actual)));
}

export class RequestStore {
  private readonly specs = new Map<string, MutableSpec>();
  private currentTestId?: string;
  private currentSpecPath = "unknown-spec";
  private readonly maskConfig: MaskConfig;

  constructor(maskFields: string[] = [], maskPatterns: string[] = []) {
    this.maskConfig = { fields: maskFields, patterns: maskPatterns };
  }

  private getSpec(specPath = this.currentSpecPath): MutableSpec {
    const key = specPath || "unknown-spec";
    let spec = this.specs.get(key);
    if (!spec) {
      spec = { specPath: key, durationMs: 0, tests: [] };
      this.specs.set(key, spec);
    }
    return spec;
  }

  private findTest(specPath?: string, testId?: string): FailLensTest | undefined {
    const spec = this.getSpec(specPath);
    const id = testId ?? this.currentTestId;
    return spec.tests.find((test) => test.id === id);
  }

  setTest(payload: SetTestPayload): string {
    this.currentSpecPath = payload.specPath || this.currentSpecPath;
    const spec = this.getSpec(this.currentSpecPath);
    const titlePath = payload.titlePath?.map(String).filter(Boolean);
    const title = titlePath?.length
      ? titlePath[titlePath.length - 1]
      : String(payload.title || "Teste sem título");
    const id = payload.id || createId("test");
    let test = spec.tests.find((item) => item.id === id);
    if (!test) {
      test = { id, title, titlePath, state: "unknown", durationMs: 0, requests: [] };
      spec.tests.push(test);
    }
    this.currentTestId = id;
    return id;
  }

  addRequest(payload: AddRequestPayload): string {
    const specPath = payload.specPath || this.currentSpecPath;
    let test = this.findTest(specPath, payload.testId);
    if (!test) {
      const id = this.setTest({ id: payload.testId, title: "Teste em execução", specPath });
      test = this.findTest(specPath, id)!;
    }
    const id = payload.id || createId("req");
    const headers = maskSensitiveData(asRecord(payload.requestHeaders), this.maskConfig);
    const body = maskSensitiveData(payload.requestBody ?? null, this.maskConfig);
    const url = maskUrl(String(payload.url || ""), this.maskConfig);
    const request: FailLensRequest = {
      id,
      order: test.requests.length + 1,
      phase: "chamada",
      method: String(payload.method || "GET").toUpperCase(),
      url,
      originalUrl: payload.originalUrl
        ? maskUrl(String(payload.originalUrl), this.maskConfig)
        : undefined,
      requestHeaders: headers,
      requestBody: body,
      failOnStatusCode: payload.failOnStatusCode,
      startedAt: payload.startedAt || new Date().toISOString(),
      responseHeaders: {},
      responseBody: null,
      durationMs: 0,
      curl: generateCurl(
        { method: String(payload.method || "GET"), url, headers, body },
        this.maskConfig,
      ),
    };
    test.requests.push(request);
    return id;
  }

  finishRequest(payload: FinishRequestPayload): null {
    const test = this.findTest(payload.specPath, payload.testId);
    const request = test?.requests.find((item) => item.id === payload.id);
    if (!request) return null;
    request.receivedStatus =
      typeof payload.receivedStatus === "number" ? payload.receivedStatus : request.receivedStatus;
    request.responseHeaders = maskSensitiveData(asRecord(payload.responseHeaders), this.maskConfig);
    request.responseBody = maskSensitiveData(payload.responseBody ?? null, this.maskConfig);
    request.redirects = Array.isArray(payload.redirects)
      ? payload.redirects.map((redirect) => ({
          statusCode: typeof redirect.statusCode === "number" ? redirect.statusCode : undefined,
          location: maskUrl(String(redirect.location || ""), this.maskConfig),
        })).filter((redirect) => redirect.location)
      : undefined;
    request.durationMs = Math.max(0, clampNumber(payload.durationMs));
    if (payload.error) request.error = parseAssertionError(payload.error, this.maskConfig);
    request.curl = generateCurl(
      {
        method: request.method,
        url: request.url,
        headers: request.requestHeaders,
        body: request.requestBody,
      },
      this.maskConfig,
    );
    return null;
  }

  setTestResult(payload: TestResultPayload): null {
    const test = this.findTest(payload.specPath, payload.testId);
    if (!test) return null;
    test.state = normalizeState(payload.state);
    test.durationMs = Math.max(0, clampNumber(payload.durationMs));
    if (payload.error) test.error = parseAssertionError(payload.error, this.maskConfig);
    if (Array.isArray(payload.assertions)) {
      test.assertions = payload.assertions.map((assertion, index) => ({
        id: String(assertion.id || `assertion-${index + 1}`),
        title: maskSensitiveText(String(assertion.title || "Assertion observada"), this.maskConfig),
        state: normalizeAssertionState(assertion.state),
        message: assertion.message
          ? maskSensitiveText(String(assertion.message), this.maskConfig)
          : undefined,
        expected: maskSensitiveData(assertion.expected, this.maskConfig),
        actual: maskSensitiveData(assertion.actual, this.maskConfig),
        file: assertion.file ? String(assertion.file) : undefined,
        line: typeof assertion.line === "number" ? assertion.line : undefined,
        column: typeof assertion.column === "number" ? assertion.column : undefined,
        target: assertion.target,
      }));
    }
    return null;
  }

  setTestScreenshots(specPath: string, testId: string, screenshots: FailLensScreenshot[]): void {
    const test = this.findTest(specPath, testId);
    if (test && screenshots.length) test.evidence = { screenshots };
  }

  mergeSourceAssertions(specPath: string, plannedTests: PlannedTestAssertions[]): void {
    const spec = this.getSpec(specPath);
    for (const plannedTest of plannedTests) {
      const test = spec.tests.find((item) => sameTitle(item, plannedTest.title));
      if (!test || !plannedTest.assertions.length) continue;
      if (plannedTest.statusExpectation) test.statusExpectation = { ...plannedTest.statusExpectation };
      const observed = test.assertions || [];
      const used = new Set<string>();
      const assertions = plannedTest.assertions.map((planned) => {
        const match = observed.find((item) => !used.has(item.id) && assertionMatches(planned, item));
        if (match) used.add(match.id);
        return match
          ? {
              ...planned,
              ...match,
              id: planned.id,
              title: planned.title,
              file: planned.file,
              line: planned.line,
              column: planned.column,
              target: planned.target,
            }
          : { ...planned };
      });
      let failureIndex = assertions.findIndex((item) => item.state === "failed");
      if (failureIndex < 0 && test.error?.line) {
        failureIndex = assertions.findIndex((item) => item.line === test.error?.line);
      }
      if (failureIndex < 0 && test.error?.assertionMessage) {
        const message = comparableAssertionTitle(test.error.assertionMessage);
        failureIndex = assertions.findIndex((item) => message.includes(comparableAssertionTitle(item.title)));
      }
      if (test.state === "failed" && failureIndex >= 0) {
        assertions[failureIndex] = {
          ...assertions[failureIndex],
          state: "failed",
          message: assertions[failureIndex].message || test.error?.message,
          expected: assertions[failureIndex].expected ?? test.error?.expected,
          actual: assertions[failureIndex].actual ?? test.error?.actual,
        };
        const failedRequestOrder = plannedTest.assertions[failureIndex]?.sourceRequestOrder;
        for (let index = failureIndex + 1; index < assertions.length; index += 1) {
          if (assertions[index].state !== "unknown") continue;
          const requestOrder = plannedTest.assertions[index]?.sourceRequestOrder;
          assertions[index].state =
            failedRequestOrder !== undefined && requestOrder !== undefined && requestOrder > failedRequestOrder
              ? "skipped"
              : "pending";
        }
      }
      if (test.state === "passed") {
        for (const assertion of assertions) {
          if (assertion.state === "unknown") assertion.state = "skipped";
        }
      }
      test.assertions = assertions.map((assertion) => {
        const {
          sourceRequestOrder: _sourceRequestOrder,
          sourceStatusExpectation: _sourceStatusExpectation,
          ...publicAssertion
        } = assertion;
        return publicAssertion;
      });
    }
  }

  // Anexa o contrato JSDoc bruto ao spec. A consolidação por @contrato e a
  // resolução de regras acontecem em buildReportModel (visão de todos os specs).
  mergeContract(specPath: string, contract: FailLensContract | undefined): void {
    if (contract) {
      this.getSpec(specPath).contract = maskSensitiveData(contract, this.maskConfig) as FailLensContract;
    }
  }

  // Liga cada teste às suas tags: vínculo @regra:<id> (ruleRefs, resolvido depois
  // no reporter) e tags de catálogo/operacionais (tags), na ordem do source.
  mergeTestTags(specPath: string, plannedTags: PlannedTestTags[]): void {
    const spec = this.getSpec(specPath);
    for (const planned of plannedTags) {
      if (!planned.ruleRefs.length && !planned.tags.length) continue;
      const matches = spec.tests.filter((item) => sameTitle(item, planned.title));
      if (matches.length !== 1) continue;
      const test = matches[0];
      if (planned.ruleRefs.length) {
        const refs: FailLensRuleRef[] = [];
        const seen = new Set<string>();
        for (const ruleId of planned.ruleRefs) {
          if (seen.has(ruleId)) continue;
          seen.add(ruleId);
          refs.push({ ruleId, resolved: false });
        }
        test.ruleRefs = refs;
      }
      if (planned.tags.length) {
        const seen = new Set<string>();
        const tags: string[] = [];
        for (const tag of planned.tags) {
          if (seen.has(tag)) continue;
          seen.add(tag);
          tags.push(tag);
        }
        test.tags = tags;
      }
    }
  }

  mergeAfterSpec(specInfo: Record<string, unknown>, results?: Record<string, unknown>): FailLensSpec {
    const specPath = String(specInfo.relative || specInfo.name || this.currentSpecPath);
    this.currentSpecPath = specPath;
    const spec = this.getSpec(specPath);
    const stats = asRecord(results?.stats);
    spec.durationMs = clampNumber(
      stats.duration ?? stats.wallClockDuration,
      spec.tests.reduce((sum, test) => sum + test.durationMs, 0),
    );
    const resultTests = Array.isArray(results?.tests) ? results.tests : [];

    for (const rawTest of resultTests) {
      const resultTest = asRecord(rawTest);
      const titleParts = Array.isArray(resultTest.title) ? resultTest.title.map(String) : [String(resultTest.title ?? "")];
      let test = spec.tests.find((item) => sameTitle(item, titleParts));
      if (!test) {
        test = {
          id: createId("test"),
          title: titleParts[titleParts.length - 1] || "Teste sem título",
          titlePath: titleParts,
          state: normalizeState(resultTest.state),
          durationMs: 0,
          requests: [],
        };
        spec.tests.push(test);
      }
      test.state = normalizeState(resultTest.state);
      const attempts = Array.isArray(resultTest.attempts) ? resultTest.attempts : [];
      const lastAttempt = asRecord(attempts.at(-1));
      test.durationMs = clampNumber(lastAttempt.wallClockDuration ?? resultTest.duration, test.durationMs);
      const error = lastAttempt.error ?? resultTest.displayError;
      if (error && !test.error) test.error = parseAssertionError(error, this.maskConfig);

      for (const request of test.requests) {
        if (!request.error && request.durationMs === 0 && test.state === "failed" && test.error) {
          const statusMatch = test.error.message.match(
            /(?:status(?:\s+code)?|response\s+status)\s*[:=]?\s*(\d{3})/i,
          );
          if (statusMatch) request.receivedStatus = Number(statusMatch[1]);
          const startedAt = request.startedAt ? Date.parse(request.startedAt) : Number.NaN;
          if (Number.isFinite(startedAt)) request.durationMs = Math.max(0, Date.now() - startedAt);
          request.error = {
            name: "RequestError",
            message: maskSensitiveText(test.error.message, this.maskConfig),
            stack: test.error.stack,
          };
        }
      }
    }
    return this.snapshotSpec(specPath);
  }

  snapshotSpec(specPath: string): FailLensSpec {
    const spec = this.getSpec(specPath);
    return JSON.parse(JSON.stringify(spec)) as FailLensSpec;
  }

  snapshot(): FailLensSpec[] {
    return Array.from(this.specs.values()).map((spec) =>
      JSON.parse(JSON.stringify(spec)) as FailLensSpec,
    );
  }
}
