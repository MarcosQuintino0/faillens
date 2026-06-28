import { normalizeCyRequestArgs } from "../../collector/normalizeCyRequestArgs";
import { getCurrentTestContext } from "./hooks";

declare const Cypress: any;
declare const cy: any;

interface PendingRequest {
  id: string;
  testId?: string;
  specPath?: string;
  startedAt: number;
}

export function normalizeRedirects(value: unknown): Array<{ statusCode?: number; location: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") {
      const match = item.match(/^\s*(\d{3})\s*:\s*(.+?)\s*$/);
      return [{ statusCode: match ? Number(match[1]) : undefined, location: match ? match[2] : item }];
    }
    if (!item || typeof item !== "object") return [];
    const redirect = item as Record<string, any>;
    const location = redirect.location || redirect.redirectedToUrl || redirect.headers?.location;
    if (!location) return [];
    const status = redirect.statusCode ?? redirect.status;
    return [{ statusCode: typeof status === "number" ? status : undefined, location: String(location) }];
  });
}

function requestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function serializeError(error: any): Record<string, unknown> {
  return {
    name: String(error?.name || "RequestError"),
    message: String(error?.message || error || "Falha em cy.request"),
    stack: error?.stack ? String(error.stack) : undefined,
    expected: error?.expected,
    actual: error?.actual,
  };
}

function finishPayload(item: PendingRequest, response: any, error?: any): Record<string, unknown> {
  const received = response || error?.response || error?.request?.response;
  return {
    id: item.id,
    testId: item.testId,
    specPath: item.specPath,
    receivedStatus:
      typeof received?.status === "number"
        ? received.status
        : typeof error?.status === "number"
          ? error.status
          : undefined,
    responseHeaders: received?.headers || {},
    responseBody: received?.body ?? null,
    redirects: normalizeRedirects(received?.redirects),
    durationMs:
      typeof received?.duration === "number" ? received.duration : Math.max(0, Date.now() - item.startedAt),
    error: error ? serializeError(error) : undefined,
  };
}

export function installAutoCapture(): void {
  if ((Cypress as any).__failLensAutoCaptureInstalled) return;
  (Cypress as any).__failLensAutoCaptureInstalled = true;

  Cypress.Commands.overwrite("request", (originalFn: (...args: any[]) => any, ...args: any[]) => {
    const context = getCurrentTestContext();
    const normalized = normalizeCyRequestArgs(args, Cypress.config("baseUrl") || undefined);
    const id = requestId();
    const item: PendingRequest = {
      id,
      testId: context?.testId,
      specPath: context?.specPath || Cypress.spec?.relative,
      startedAt: Date.now(),
    };
    return cy.task(
      "faillens:addRequest",
      {
        id,
        testId: item.testId,
        specPath: item.specPath,
        method: normalized.method,
        url: normalized.url,
        originalUrl: normalized.originalUrl,
        requestHeaders: normalized.headers,
        requestBody: normalized.body,
        failOnStatusCode: normalized.failOnStatusCode,
        startedAt: new Date(item.startedAt).toISOString(),
      },
      { log: false },
    ).then(() => {
      item.startedAt = Date.now();
      return originalFn(...args);
    }).then((response: any) => {
      return cy
        .task("faillens:finishRequest", finishPayload(item, response), { log: false })
        .then(() => response);
    });
  });
}
