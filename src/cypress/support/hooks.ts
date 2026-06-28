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

interface CapturedAssertion {
  id: string;
  title: string;
  state: "passed" | "failed" | "pending" | "skipped" | "unknown";
  message?: string;
  expected?: unknown;
  actual?: unknown;
  file?: string;
  line?: number;
  column?: number;
  started?: boolean;
  ended?: boolean;
  origin?: "command" | "log";
}

let capturedAssertions: CapturedAssertion[] = [];
let assertionCounter = 0;

function commandAttributes(command: any): Record<string, any> {
  if (!command) return {};
  if (typeof command.get === "function") {
    try {
      return command.get() || {};
    } catch {
      return {};
    }
  }
  return command;
}

function printable(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "function") return value.name ? `[callback ${value.name}]` : "[callback]";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function cleanAssertionMessage(value: unknown): string {
  return printable(value).replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

function assertionTitle(args: unknown[]): string {
  if (!args.length) return "Assertion Cypress";
  if (typeof args[0] === "function") return "Validação personalizada";
  const [chainer, ...values] = args;
  const readable = String(chainer)
    .replace(/^not\./, "não ")
    .replace(/[._]/g, " ")
    .replace(/\beq\b|\bequal\b/g, "igual a");
  const suffix = values.map(printable).filter(Boolean).join(", ");
  return `${readable}${suffix ? ` ${suffix}` : ""}`;
}

function sourceLocation(stack: unknown): Pick<CapturedAssertion, "file" | "line" | "column"> {
  const match = String(stack || "").match(/(?:\(|at\s+)([^()\n]+?):(\d+):(\d+)\)?/);
  if (!match) return {};
  return { file: match[1], line: Number(match[2]), column: Number(match[3]) };
}

function findAssertion(id: unknown): CapturedAssertion | undefined {
  return capturedAssertions.find((item) => item.id === String(id || ""));
}

function activeAssertion(): CapturedAssertion | undefined {
  return [...capturedAssertions].reverse().find((item) => item.origin === "command" && item.started && !item.ended);
}

function installAssertionCapture(): void {
  Cypress.on("command:enqueued", (raw: any) => {
    if (!currentContext) return;
    const command = commandAttributes(raw);
    if (!/^(should|and|assert)$/i.test(String(command.name || ""))) return;
    const id = String(command.id || `assertion-${++assertionCounter}`);
    if (findAssertion(id)) return;
    capturedAssertions.push({
      id,
      title: assertionTitle(Array.isArray(command.args) ? command.args : []),
      state: "unknown",
      origin: "command",
      ...sourceLocation(command.userInvocationStack),
    });
  });

  Cypress.on("command:start", (raw: any) => {
    const command = commandAttributes(raw);
    const assertion = findAssertion(command.id);
    if (assertion) assertion.started = true;
  });

  Cypress.on("command:end", (raw: any) => {
    const command = commandAttributes(raw);
    const assertion = findAssertion(command.id);
    if (!assertion) return;
    assertion.started = true;
    assertion.ended = true;
    if (assertion.state === "unknown") assertion.state = "passed";
  });

  Cypress.on("skipped:command:end", (raw: any) => {
    const command = commandAttributes(raw);
    const assertion = findAssertion(command.id);
    if (assertion) {
      assertion.ended = true;
      assertion.state = "skipped";
    }
  });

  Cypress.on("log:added", (raw: any) => {
    if (!currentContext || String(raw?.name || "").toLowerCase() !== "assert") return;
    let assertion = activeAssertion();
    if (!assertion) {
      const id = String(raw?.id || `assertion-log-${++assertionCounter}`);
      assertion = findAssertion(id);
      if (!assertion) {
        assertion = {
          id,
          title: cleanAssertionMessage(raw?.message || raw?.displayName || "Assertion observada"),
          state: "unknown",
          started: true,
          origin: "log",
          ...sourceLocation(raw?.userInvocationStack),
        };
        capturedAssertions.push(assertion);
      }
    }
    if (raw?.message) assertion.title = cleanAssertionMessage(raw.message);
    if (raw?.state === "passed") {
      assertion.state = "passed";
      assertion.ended = true;
    }
    if (raw?.error) {
      assertion.message = String(raw.error.message || raw.error);
      assertion.expected = raw.error.expected;
      assertion.actual = raw.error.actual;
      assertion.state = "failed";
    }
  });
}

function finalizedAssertions(testState: string, error: any): CapturedAssertion[] {
  let failureAssigned = capturedAssertions.some((item) => item.state === "failed");
  const lastStarted = [...capturedAssertions].reverse().find((item) => item.started && !item.ended);
  return capturedAssertions.map((item) => {
    const result = { ...item };
    if (result.state === "unknown") {
      if (testState === "failed" && !failureAssigned && result.id === lastStarted?.id) {
        result.state = "failed";
        failureAssigned = true;
      } else if (!result.started) {
        result.state = "skipped";
      } else {
        result.state = testState === "passed" ? "passed" : "pending";
      }
    }
    if (result.state === "failed" && error) {
      result.message ||= String(error.message || error);
      result.expected ??= error.expected;
      result.actual ??= error.actual;
    }
    delete result.started;
    delete result.ended;
    delete result.origin;
    return result;
  });
}

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
  installAssertionCapture();

  beforeEach(function failLensBeforeEach(this: any) {
    capturedAssertions = [];
    const titlePath = titlePathFor(this);
    const specPath = String(Cypress.spec?.relative || Cypress.spec?.name || "unknown-spec");
    currentContext = {
      testId: stableId(specPath, titlePath),
      specPath,
      title: titlePath[titlePath.length - 1] || "Teste sem título",
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
        assertions: finalizedAssertions(state, test?.err),
      },
      { log: false },
    );
  });
}
