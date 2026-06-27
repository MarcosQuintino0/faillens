declare const Cypress: any;
declare const cy: any;
declare function beforeEach(callback: (this: any) => void): void;
declare function afterEach(callback: (this: any) => void): void;

export interface BrowserTestContext {
  testId: string;
  specPath: string;
  title: string;
  titlePath: string[];
}

let currentContext: BrowserTestContext | undefined;

function titlePathFor(context: any): string[] {
  const cypressTitlePath = Cypress.currentTest?.titlePath;
  if (Array.isArray(cypressTitlePath)) return cypressTitlePath.map(String);
  if (typeof cypressTitlePath === "function") return cypressTitlePath.call(Cypress.currentTest).map(String);
  if (typeof context?.currentTest?.titlePath === "function") {
    return context.currentTest.titlePath().map(String);
  }
  const title = Cypress.currentTest?.title || context?.currentTest?.title || "Teste sem título";
  return [String(title)];
}

function stableId(specPath: string, titlePath: string[]): string {
  const input = `${specPath}\u0000${titlePath.join("\u0000")}`;
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
  }
  return `test-${(hash >>> 0).toString(36)}`;
}

function serializeError(error: any): Record<string, unknown> | undefined {
  if (!error) return undefined;
  return {
    name: String(error.name || "Error"),
    message: String(error.message || error),
    stack: error.stack ? String(error.stack) : undefined,
    expected: error.expected,
    actual: error.actual,
  };
}

export function getCurrentTestContext(): BrowserTestContext | undefined {
  return currentContext;
}

export function installFailLensHooks(): void {
  if ((Cypress as any).__failLensHooksInstalled) return;
  (Cypress as any).__failLensHooksInstalled = true;

  beforeEach(function failLensBeforeEach(this: any) {
    const titlePath = titlePathFor(this);
    const specPath = String(Cypress.spec?.relative || Cypress.spec?.name || "unknown-spec");
    currentContext = {
      testId: stableId(specPath, titlePath),
      specPath,
      title: titlePath.join(" > "),
      titlePath,
    };
    cy.task(
      "faillens:setTest",
      { id: currentContext.testId, title: currentContext.title, titlePath, specPath },
      { log: false },
    );
  });

  afterEach(function failLensAfterEach(this: any) {
    const test = this.currentTest || Cypress.currentTest;
    if (!currentContext) return;
    const state = ["passed", "failed", "skipped"].includes(test?.state) ? test.state : "unknown";
    cy.task(
      "faillens:setTestResult",
      {
        testId: currentContext.testId,
        specPath: currentContext.specPath,
        state,
        durationMs: typeof test?.duration === "number" ? test.duration : 0,
        error: serializeError(test?.err),
      },
      { log: false },
    );
  });
}
