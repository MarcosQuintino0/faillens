import type { FailLensSpec, FailLensTest, FailLensRequest, TestState } from "../types/report";
import { generateCurl } from "./curlGenerator";
import { maskSensitiveData, maskSensitiveText, maskUrl } from "./sensitiveMask";
import { parseAssertionError } from "../reporter/diagnostics/parseAssertionError";
import { asRecord, clampNumber, createId } from "../utils/format";

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
}

export interface TestResultPayload {
  testId?: string;
  specPath?: string;
  state?: TestState | string;
  durationMs?: number;
  error?: unknown;
}

interface MutableSpec extends FailLensSpec {
  tests: FailLensTest[];
}

function normalizeState(value: unknown): TestState {
  if (value === "pending" || value === "skipped") return "skipped";
  return value === "passed" || value === "failed" ? value : "unknown";
}

function sameTitle(test: FailLensTest, title: unknown): boolean {
  const value = Array.isArray(title) ? title.map(String).join(" > ") : String(title ?? "");
  return test.title === value || test.titlePath?.join(" > ") === value;
}

export class RequestStore {
  private readonly specs = new Map<string, MutableSpec>();
  private currentTestId?: string;
  private currentSpecPath = "unknown-spec";

  constructor(private readonly maskFields: string[] = []) {}

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
    const headers = maskSensitiveData(asRecord(payload.requestHeaders), this.maskFields);
    const body = maskSensitiveData(payload.requestBody ?? null, this.maskFields);
    const url = maskUrl(String(payload.url || ""), this.maskFields);
    const request: FailLensRequest = {
      id,
      order: test.requests.length + 1,
      phase: "chamada",
      method: String(payload.method || "GET").toUpperCase(),
      url,
      originalUrl: payload.originalUrl
        ? maskUrl(String(payload.originalUrl), this.maskFields)
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
        this.maskFields,
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
    request.responseHeaders = maskSensitiveData(asRecord(payload.responseHeaders), this.maskFields);
    request.responseBody = maskSensitiveData(payload.responseBody ?? null, this.maskFields);
    request.durationMs = Math.max(0, clampNumber(payload.durationMs));
    if (payload.error) request.error = parseAssertionError(payload.error, this.maskFields);
    request.curl = generateCurl(
      {
        method: request.method,
        url: request.url,
        headers: request.requestHeaders,
        body: request.requestBody,
      },
      this.maskFields,
    );
    return null;
  }

  setTestResult(payload: TestResultPayload): null {
    const test = this.findTest(payload.specPath, payload.testId);
    if (!test) return null;
    test.state = normalizeState(payload.state);
    test.durationMs = Math.max(0, clampNumber(payload.durationMs));
    if (payload.error) test.error = parseAssertionError(payload.error, this.maskFields);
    return null;
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
      if (error && !test.error) test.error = parseAssertionError(error, this.maskFields);

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
            message: maskSensitiveText(test.error.message, this.maskFields),
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
