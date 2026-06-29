"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractTestTags,
  findImportSource,
  parseCatalogModule,
} = require("../../dist/collector/extractTestTags");

test("extractTestTags — it simples com @regra:<id> literal", () => {
  const src = `
    it(
      "deve retornar 409 ao criar com código duplicado",
      { tags: [CatalogoTags.REGRA_NEGOCIO, "@regra:codigo-duplicado", "@bug"] },
      () => {},
    );
  `;
  const tags = extractTestTags(src);
  const found = tags.find((t) => t.title === "deve retornar 409 ao criar com código duplicado");
  assert.ok(found);
  assert.deepEqual(found.ruleRefs, ["codigo-duplicado"]);
});

test("extractTestTags — data-driven resolve regra por caso", () => {
  const src = `
    [
      { campo: "descricao", regra: "descricao-obrigatoria", mensagem: M.DESCRICAO },
      { campo: "codigo", regra: "codigo-obrigatorio", mensagem: M.CODIGO },
    ].forEach(({ campo, regra, mensagem }) => {
      it(
        \`deve retornar 400 quando \${campo} não for enviado\`,
        { tags: [CatalogoTags.OBRIGATORIEDADE, \`@regra:\${regra}\`, "@bug"] },
        () => {},
      );
    });
  `;
  const tags = extractTestTags(src);
  const a = tags.find((t) => t.title === "deve retornar 400 quando descricao não for enviado");
  const b = tags.find((t) => t.title === "deve retornar 400 quando codigo não for enviado");
  assert.ok(a, "primeiro caso resolvido");
  assert.ok(b, "segundo caso resolvido");
  assert.deepEqual(a.ruleRefs, ["descricao-obrigatoria"]);
  assert.deepEqual(b.ruleRefs, ["codigo-obrigatorio"]);
});

test("extractTestTags — it sem @regra retorna ruleRefs vazio", () => {
  const src = `it("deve criar com dados válidos", { tags: [CatalogoTags.FLUXO_PRINCIPAL] }, () => {});`;
  const tags = extractTestTags(src);
  assert.equal(tags.length, 1);
  assert.deepEqual(tags[0].ruleRefs, []);
});

test("extractTestTags — @regra dentro de comentário/string é ignorado", () => {
  const src = `
    // it("falso", { tags: ["@regra:nao-conta"] }, () => {});
    const s = 'it("string", { tags: ["@regra:nao-conta"] })';
    it("verdadeiro", { tags: ["@regra:conta"] }, () => {});
  `;
  const tags = extractTestTags(src);
  const titles = tags.map((t) => t.title);
  assert.ok(titles.includes("verdadeiro"));
  assert.ok(!titles.includes("falso"));
  assert.ok(!titles.includes("string"));
  const real = tags.find((t) => t.title === "verdadeiro");
  assert.deepEqual(real.ruleRefs, ["conta"]);
});

test("extractTestTags — as 3 categorias de tag juntas: catálogo, vínculo e operacional", () => {
  // Caso do demo: { tags: [CatalogoTags.OBRIGATORIEDADE, "@regra:codigo-obrigatorio", "@bug"] }
  const src = `
    it(
      "deve retornar 400 ao criar produto sem o campo obrigatório codigo",
      { tags: [CatalogoTags.OBRIGATORIEDADE, "@regra:codigo-obrigatorio", "@bug"] },
      () => {},
    );
  `;
  const t = extractTestTags(src)[0];
  // vínculo -> ruleRefs
  assert.deepEqual(t.ruleRefs, ["codigo-obrigatorio"]);
  // operacional (string literal) -> tags, capturado e NÃO descartado
  assert.deepEqual(t.tags, ["@bug"]);
  // catálogo (CatalogoTags.X) -> referência a resolver via módulo
  assert.deepEqual(t.catalogRefs, [{ object: "CatalogoTags", name: "OBRIGATORIEDADE" }]);
});

test("extractTestTags — tag de catálogo escrita como string literal vai direto para tags", () => {
  const src = `it("x", { tags: ["@obrigatoriedade", "@regra:r1", "@bug"] }, () => {});`;
  const t = extractTestTags(src)[0];
  assert.deepEqual(t.ruleRefs, ["r1"]);
  assert.deepEqual(t.tags, ["@obrigatoriedade", "@bug"]);
  assert.deepEqual(t.catalogRefs, []);
});

test("extractTestTags — data-driven mantém @bug por caso além do vínculo", () => {
  const src = `
    [{ campo: "codigo", regra: "codigo-obrigatorio" }].forEach(({ campo, regra }) => {
      it(\`deve falhar quando \${campo} ausente\`, { tags: [CatalogoTags.OBRIGATORIEDADE, \`@regra:\${regra}\`, "@bug"] }, () => {});
    });
  `;
  const t = extractTestTags(src)[0];
  assert.deepEqual(t.ruleRefs, ["codigo-obrigatorio"]);
  assert.deepEqual(t.tags, ["@bug"]);
  assert.deepEqual(t.catalogRefs, [{ object: "CatalogoTags", name: "OBRIGATORIEDADE" }]);
});

test("parseCatalogModule — resolve constante -> valor real declarado (sem heurística)", () => {
  const moduleSource = `
    export const CatalogoTagsMeta = {
      FLUXO_PRINCIPAL: { valor: "@fluxo-principal", tipo: "Fluxo principal valido", quando: "..." },
      OBRIGATORIEDADE: { valor: "@obrigatoriedade", tipo: "Obrigatoriedade", quando: "..." },
    };
    export const CatalogoTags = Object.fromEntries(
      Object.entries(CatalogoTagsMeta).map(([n, m]) => [n, m.valor]),
    );
  `;
  const map = parseCatalogModule(moduleSource);
  assert.equal(map.get("OBRIGATORIEDADE"), "@obrigatoriedade");
  assert.equal(map.get("FLUXO_PRINCIPAL"), "@fluxo-principal");
  // valor é o declarado, não derivado do nome
  assert.equal(map.size, 2);
});

test("parseCatalogModule — sem CatalogoTagsMeta retorna mapa vazio (degrada)", () => {
  assert.equal(parseCatalogModule("export const x = 1;").size, 0);
});

test("findImportSource — localiza o módulo de onde o identificador foi importado", () => {
  const src = `import { CatalogoTags } from "./_support/tags";\nimport { Api } from "./_support/api";`;
  assert.equal(findImportSource(src, "CatalogoTags"), "./_support/tags");
  assert.equal(findImportSource(src, "Api"), "./_support/api");
  assert.equal(findImportSource(src, "NaoExiste"), undefined);
});

test("extractTestTags — it.only / it.skip reconhecidos", () => {
  const src = `
    it.only("um", { tags: ["@regra:r1"] }, () => {});
    it.skip("dois", { tags: ["@regra:r2"] }, () => {});
  `;
  const tags = extractTestTags(src);
  assert.deepEqual(
    tags.map((t) => ({ title: t.title, refs: t.ruleRefs })),
    [
      { title: "um", refs: ["r1"] },
      { title: "dois", refs: ["r2"] },
    ],
  );
});
