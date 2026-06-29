"use strict";

function body(index, bodySize) {
  const value = { id: `entity-${index}`, name: `Entity ${index}`, metadata: { source: "bench", index } };
  return { ...value, padding: "x".repeat(Math.max(0, bodySize - JSON.stringify(value).length)) };
}

function screenshot(testIndex, retry = false) {
  const suffix = retry ? " (failed) (attempt 2).png" : " (failed).png";
  return {
    relativePath: `cypress/screenshots/spec.cy.js/Suite -- Test ${testIndex}${suffix}`,
    href: `../../cypress/screenshots/spec.cy.js/Suite%20--%20Test%20${testIndex}${suffix.replaceAll(" ", "%20")}`,
    fileName: `Suite -- Test ${testIndex}${suffix}`,
    size: 24_000,
    width: 1280,
    height: 720,
    takenAt: `2026-06-28T10:${String(testIndex % 60).padStart(2, "0")}:00.000Z`,
    attempt: retry ? 2 : 1,
    kind: "failure",
  };
}

function request(testIndex, requestIndex, bodySize) {
  const previous = requestIndex > 0 ? `entity-${testIndex * 1000 + requestIndex - 1}` : "root";
  const method = requestIndex % 3 === 0 ? "POST" : "GET";
  return {
    id: `req-${testIndex}-${requestIndex}`,
    order: requestIndex + 1,
    phase: "chamada",
    method,
    url: `http://localhost:3333/resources/${previous}`,
    originalUrl: `/resources/${previous}`,
    requestHeaders: {
      authorization: "Bearer benchmark-secret",
      "content-type": "application/json",
      "x-request-id": `request-${testIndex}-${requestIndex}`,
    },
    requestBody: method === "POST" ? body(testIndex * 1000 + requestIndex, bodySize) : null,
    responseHeaders: { "content-type": "application/json", "set-cookie": "session=benchmark-secret" },
    responseBody: body(testIndex * 1000 + requestIndex, bodySize),
    receivedStatus: requestIndex === 0 ? 201 : 200,
    durationMs: 20 + requestIndex,
    curl: "",
  };
}

function createReportFixture({
  tests = 100,
  requestsPerTest = 5,
  failureRate = 0.7,
  screenshotRate = 0,
  multipleScreenshots = false,
  bodySize = 256,
  testsPerSpec = 100,
} = {}) {
  const specs = [];
  for (let offset = 0; offset < tests; offset += testsPerSpec) {
    const count = Math.min(testsPerSpec, tests - offset);
    const specIndex = specs.length;
    const specTests = Array.from({ length: count }, (_, localIndex) => {
      const testIndex = offset + localIndex;
      const failed = testIndex / tests < failureRate;
      const hasScreenshot = failed && testIndex / Math.max(1, Math.ceil(tests * failureRate)) < screenshotRate;
      const screenshots = hasScreenshot
        ? [screenshot(testIndex, multipleScreenshots), ...(multipleScreenshots && testIndex % 5 === 0 ? [screenshot(testIndex)] : [])]
        : [];
      return {
        id: `test-${testIndex}`,
        title: `Test ${testIndex}`,
        titlePath: [`Suite ${specIndex}`, `Test ${testIndex}`],
        state: failed ? "failed" : "passed",
        durationMs: 100 + requestsPerTest * 10,
        error: failed
          ? { name: "AssertionError", message: "expected 201 to equal 400", expected: 400, actual: 201 }
          : undefined,
        assertions: failed
          ? [{ id: `assertion-${testIndex}`, title: "Status must be 400", target: "status", state: "failed", expected: 400, actual: 201 }]
          : [],
        requests: Array.from({ length: requestsPerTest }, (_, requestIndex) => request(testIndex, requestIndex, bodySize)),
        evidence: screenshots.length ? { screenshots } : undefined,
      };
    });
    specs.push({
      specPath: `cypress/e2e/spec-${specIndex}.cy.js`,
      durationMs: specTests.reduce((sum, item) => sum + item.durationMs, 0),
      tests: specTests,
    });
  }
  return specs;
}

function createLargeReportFixture() {
  return createReportFixture({ tests: 100, requestsPerTest: 5, failureRate: 0.4, bodySize: 2048, testsPerSpec: 10 });
}

module.exports = {
  createReportFixture,
  createLargeReportFixture,
  TOTAL_TESTS: 100,
  TOTAL_REQUESTS: 500,
};
