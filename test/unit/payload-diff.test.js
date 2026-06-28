"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPayloadDiff } = require("../../dist/reporter/buildPayloadDiff");

test("deep equality marca todos os valores divergentes e campos extras recebidos", () => {
  const actual = {
    status: 200,
    error: "resultado inesperado",
    internalCode: "ERR-1",
  };
  const markers = buildPayloadDiff([{
    id: "contract",
    title: "Body deve respeitar o contrato",
    target: "body",
    state: "failed",
    expected: { status: 404, error: "Pedido não encontrado" },
    actual,
  }], actual);

  assert.deepEqual(markers.map((marker) => marker.path), [
    "$.status",
    "$.error",
    "$.internalCode",
  ]);
});

test("observa campo nulo citado pela assertion sem marcar outros nulos", () => {
  const markers = buildPayloadDiff([{
    id: "status",
    title: "Deve retornar 400 quando email não for informado",
    target: "status",
    state: "failed",
  }], {
    email: null,
    optionalMetadata: null,
  }, true);

  assert.deepEqual(markers, [{
    path: "$.email",
    kind: "value",
    reason: "Valor nulo observado no campo email da resposta.",
    evidenceOnly: true,
  }]);
});

test("não cria observação de nulo quando fallback está desabilitado", () => {
  const markers = buildPayloadDiff([], { email: null }, false);
  assert.deepEqual(markers, []);
});
