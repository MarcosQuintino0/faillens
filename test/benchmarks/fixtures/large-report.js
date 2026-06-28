"use strict";

const SPECS = 10;
const TESTS_PER_SPEC = 10;
const REQUESTS_PER_TEST = 5;
const BODY_SIZE_KB = 2;

function generateBody(index) {
  const base = {
    id: index,
    name: `Entidade ${index}`,
    email: `user${index}@example.com`,
    role: index % 3 === 0 ? "admin" : "user",
    createdAt: new Date(Date.now() - index * 60000).toISOString(),
    metadata: { source: "api", version: "1.0", tags: [`tag-${index}`, `category-${index % 5}`] },
  };
  const padding = "x".repeat(Math.max(0, BODY_SIZE_KB * 1024 - JSON.stringify(base).length));
  return { ...base, _pad: padding };
}

function generateRequest(specIndex, testIndex, reqIndex) {
  const methods = ["POST", "GET", "PUT", "DELETE", "PATCH"];
  const method = methods[reqIndex % methods.length];
  return {
    id: `req-${specIndex}-${testIndex}-${reqIndex}`,
    order: reqIndex + 1,
    phase: "chamada",
    method,
    url: `http://localhost:3333/resources/${specIndex * 100 + testIndex}`,
    originalUrl: `/resources/${specIndex * 100 + testIndex}`,
    requestHeaders: {
      authorization: "Bearer token-de-acesso-longo-para-simular-producao",
      "content-type": "application/json",
      "x-request-id": `req-${specIndex}-${testIndex}-${reqIndex}`,
      "x-user-id": `user-${specIndex}`,
      "x-trace-id": `trace-${Date.now()}`,
    },
    requestBody: method !== "GET" && method !== "DELETE" ? generateBody(specIndex * 100 + testIndex) : null,
    responseHeaders: {
      "content-type": "application/json",
      "set-cookie": `session-id=session-cookie-value-${specIndex}; HttpOnly`,
      "x-response-time": `${reqIndex * 10 + 45}ms`,
    },
    responseBody: generateBody(specIndex * 100 + testIndex + 1000),
    receivedStatus: reqIndex === 0 ? 201 : reqIndex === 1 ? 200 : reqIndex === 2 ? 422 : 200,
    durationMs: reqIndex * 15 + 45,
    curl: "",
    failOnStatusCode: reqIndex !== 2,
  };
}

function generateTest(specIndex, testIndex) {
  const states = ["failed", "passed", "failed", "passed", "passed", "failed", "passed", "passed", "failed", "passed"];
  const state = states[testIndex % states.length];
  return {
    id: `test-${specIndex}-${testIndex}`,
    title: `Cenário ${testIndex + 1} do spec ${specIndex + 1}`,
    titlePath: [`Suite ${specIndex + 1}`, `Cenário ${testIndex + 1} do spec ${specIndex + 1}`],
    state,
    durationMs: testIndex * 20 + 150,
    error: state === "failed"
      ? {
          name: "AssertionError",
          message: `expected 201 to equal 400`,
          expected: 400,
          actual: 201,
          stack: `AssertionError: expected 201 to equal 400\n    at cypress/e2e/spec${specIndex}.cy.js:${testIndex + 5}:10`,
        }
      : undefined,
    assertions: state === "failed"
      ? [
          { id: `a-${specIndex}-${testIndex}-1`, title: "Status deve ser 400", state: "failed", expected: 400, actual: 201 },
          { id: `a-${specIndex}-${testIndex}-2`, title: "Body deve ter campo error", state: "pending" },
          { id: `a-${specIndex}-${testIndex}-3`, title: "Headers de rate-limit presentes", state: "skipped" },
        ]
      : [],
    requests: Array.from({ length: REQUESTS_PER_TEST }, (_, reqIndex) =>
      generateRequest(specIndex, testIndex, reqIndex),
    ),
  };
}

function generateSpec(specIndex) {
  return {
    specPath: `cypress/e2e/spec${specIndex + 1}.cy.js`,
    durationMs: (specIndex + 1) * 500,
    tests: Array.from({ length: TESTS_PER_SPEC }, (_, testIndex) =>
      generateTest(specIndex, testIndex),
    ),
  };
}

function createLargeReportFixture() {
  return Array.from({ length: SPECS }, (_, specIndex) => generateSpec(specIndex));
}

module.exports = {
  createLargeReportFixture,
  SPECS,
  TESTS_PER_SPEC,
  REQUESTS_PER_TEST,
  TOTAL_TESTS: SPECS * TESTS_PER_SPEC,
  TOTAL_REQUESTS: SPECS * TESTS_PER_SPEC * REQUESTS_PER_TEST,
};
