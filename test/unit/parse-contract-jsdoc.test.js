"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const { parseContractJsdoc } = require("../../dist/collector/parseContractJsdoc");

const FILE = "cypress/e2e/apis/alegacao-ans/crud.cy.js";

const STRUCTURED = `
import { X } from "y";

/**
 * @contrato alegacao-ans
 *
 * @api POST /alegacao_ans | GET /alegacao_ans/{id}
 *
 * @resumo Cadastro de alegações ANS.
 *
 * @campo descricao {string} required=true maxLength=50
 * @campo codigo {number} required=true min=1 max=99 unique=true immutable=true
 * @campo ativo {boolean} required=true filterable=true
 *
 * @regra descricao-obrigatoria operation=POST field=descricao condition=missing status=400 message="O campo Descrição é obrigatório e deve ser informado"
 * @regra codigo-duplicado operation=POST field=codigo condition=duplicate status=409 persistence=forbidden message="Alegação Ans com o código <codigo> já existe."
 *
 * @permissao authentication=required
 *
 * @cobertura @credencial-invalida nao-confirmado — contrato não diferencia token ausente e inválido
 */
describe("API Alegação ANS", () => {});
`;

test("parseContractJsdoc — lê contrato estruturado com id, api, campos e regras", () => {
  const contract = parseContractJsdoc(STRUCTURED, FILE);
  assert.ok(contract);
  assert.equal(contract.id, "alegacao-ans");
  assert.equal(contract.legacy, false);
  assert.deepEqual(contract.api, ["POST /alegacao_ans", "GET /alegacao_ans/{id}"]);
  assert.equal(contract.resumo, "Cadastro de alegações ANS.");
  assert.equal(contract.fields.length, 3);
  const codigo = contract.fields.find((f) => f.name === "codigo");
  assert.equal(codigo.type, "number");
  assert.equal(codigo.attributes.required, true);
  assert.equal(codigo.attributes.min, 1);
  assert.equal(codigo.attributes.max, 99);
  assert.equal(codigo.attributes.unique, true);
});

test("parseContractJsdoc — regra preserva id, status e mensagem com espaços/Unicode", () => {
  const contract = parseContractJsdoc(STRUCTURED, FILE);
  const rule = contract.rules.find((r) => r.id === "descricao-obrigatoria");
  assert.ok(rule);
  assert.equal(rule.status, 400);
  assert.equal(rule.message, "O campo Descrição é obrigatório e deve ser informado");
  assert.equal(rule.attributes.operation, "POST");
  assert.equal(rule.attributes.field, "descricao");
  assert.equal(rule.attributes.condition, "missing");

  const dup = contract.rules.find((r) => r.id === "codigo-duplicado");
  assert.equal(dup.status, 409);
  assert.equal(dup.attributes.persistence, "forbidden");
  assert.equal(dup.message, "Alegação Ans com o código <codigo> já existe.");
});

test("parseContractJsdoc — @cobertura e @permissao preservados", () => {
  const contract = parseContractJsdoc(STRUCTURED, FILE);
  assert.equal(contract.permissao.authentication, "required");
  assert.equal(contract.cobertura.length, 1);
  assert.equal(contract.cobertura[0].tag, "@credencial-invalida");
  assert.equal(contract.cobertura[0].status, "nao-confirmado");
});

test("parseContractJsdoc — atributo desconhecido preservado sem derrubar o bloco", () => {
  const src = `/**
 * @contrato x
 * @regra r1 operation=POST status=400 foo=bar message="ok"
 */`;
  const contract = parseContractJsdoc(src, FILE);
  const rule = contract.rules[0];
  assert.equal(rule.attributes.foo, "bar");
  assert.equal(rule.status, 400);
  assert.equal(rule.message, "ok");
});

test("parseContractJsdoc — status inválido vira aviso e não quebra os demais atributos", () => {
  const src = `/**
 * @contrato x
 * @regra r1 operation=POST status=99 message="ok"
 */`;
  const contract = parseContractJsdoc(src, FILE);
  assert.equal(contract.rules[0].status, undefined);
  assert.equal(contract.rules[0].message, "ok");
  assert.ok(contract.warnings.some((w) => w.code === "invalid-status"));
});

test("parseContractJsdoc — regra duplicada gera aviso", () => {
  const src = `/**
 * @contrato x
 * @regra r1 status=400
 * @regra r1 status=409
 */`;
  const contract = parseContractJsdoc(src, FILE);
  assert.ok(contract.warnings.some((w) => w.code === "duplicate-rule"));
});

test("parseContractJsdoc — formato antigo degrada: legacy=true e sem regra com id", () => {
  const legacy = `/**
 * @api POST /alegacao_ans | GET /alegacao_ans/{id}
 * @resumo Cadastro de alegações ANS codificadas.
 * @campo descricao {string} max 50 chars | obrigatório
 * @regra 404 + "Alegação Ans não foi encontrado." — id inexistente
 */
describe("x", () => {});`;
  const contract = parseContractJsdoc(legacy, FILE);
  assert.ok(contract);
  assert.equal(contract.legacy, true);
  assert.equal(contract.id, "alegacao-ans"); // derivado da pasta
  assert.equal(contract.rules.length, 0);
  assert.ok(contract.warnings.some((w) => w.code === "rule-without-id"));
  assert.ok(contract.warnings.some((w) => w.code === "legacy-format"));
  // o campo continua legível como contexto, sem inventar constraints estruturadas
  assert.equal(contract.fields[0].name, "descricao");
  assert.deepEqual(contract.fields[0].attributes, {});
});

test("parseContractJsdoc — sem bloco de contrato retorna undefined", () => {
  assert.equal(parseContractJsdoc("// apenas um comentário de linha\nconst x = 1;", FILE), undefined);
});

test("parseContractJsdoc — aceita aspas escapadas dentro de mensagem", () => {
  const src = `/**
 * @contrato x
 * @regra r1 status=400 message="Campo \\"nome\\" inválido"
 */`;
  const contract = parseContractJsdoc(src, FILE);
  assert.equal(contract.rules[0].message, 'Campo "nome" inválido');
});

test("parseContractJsdoc — aspas não fechadas geram aviso sem perder atributos válidos", () => {
  const src = `/**
 * @contrato x
 * @regra r1 status=400 message="texto incompleto
 */`;
  const contract = parseContractJsdoc(src, FILE);
  assert.equal(contract.rules[0].status, 400);
  assert.ok(contract.warnings.some((w) => w.code === "invalid-quoted-value"));
});
