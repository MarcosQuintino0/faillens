# ADR 0005 — Procedência determinística das informações

## Status

Aceito.

## Contexto

O FailLens passará a alimentar BDD, resultado atual, resultado esperado e criação de chamados. Sem uma origem rastreável para cada informação, o relatório poderia inventar causa, escolher silenciosamente entre fontes conflitantes, tratar uma assertion como contrato, ou afirmar persistência apenas porque recebeu um ID. Nenhuma frase pode ser tratada como fato sem procedência.

O contrato do recurso é declarado em JSDoc no spec (`crud.cy.js`), enquanto os testes que o validam podem estar em outro spec (`validacoes.cy.js`). A associação teste→regra não pode usar semelhança textual de título.

## Decisão

Introduzir um modelo interno de procedência (`src/types/provenance.ts`) com cinco fontes permitidas: `observed`, `asserted`, `contract`, `verified`, `not-verified`. Cada teste persiste uma lista de `facts` no JSON (interno, não renderizado no HTML).

- Um parser determinístico sem dependências (`parseContractJsdoc.ts`) lê o bloco JSDoc estruturado (`@contrato/@api/@resumo/@campo/@regra/@permissao/@cobertura`) com gramática `chave=valor`; atributos inválidos viram avisos estruturados e não derrubam o relatório; formato antigo degrada sem vincular regra específica.
- O vínculo teste→regra vem da tag `@regra:<id>` capturada estaticamente do source (`extractTestTags.ts`), inclusive em cenários data-driven sobre array literal — nunca de runtime do Cypress nem de heurística de título.
- A resolução contrato→regra→teste é cross-spec e contextual, feita em `buildReportModel` (visão de todos os specs). Primeiro usa o contrato identificado pela pasta do spec; sem contexto inequívoco, um id resolve apenas quando exatamente um contrato o declara.
- Quando `asserted` e `contract` divergem na mesma dimensão, ambos os facts são preservados e marcados como conflitantes; o FailLens não escolhe um valor nem trata o conflito como diagnóstico do backend.

## Consequências

- O JSON ganha campos opcionais (`facts`, `ruleRefs`, `contractId` por teste; `contracts` na raiz; `statusExpectation.source`). Mudança compatível: consumidores antigos ignoram.
- O HTML standalone permanece inalterado; `facts` é interno e mascarado antes da persistência.
- A captura estática de tags não resolve tags geradas fora de array literal — limitação documentada, alinhada ao gerador de cobertura.
- A gramática JSDoc é compartilhada com os agentes e o gerador de cobertura; o parser do FailLens é próprio (zero deps) e deve concordar com o do coverage via fixtures espelhadas.
- Performance medida em `npm run bench` permanece dentro do budget (`buildReportModel` ~35ms para a fixture de referência).
