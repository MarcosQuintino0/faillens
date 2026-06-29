# Contratos de comportamento

Este catálogo registra comportamentos observáveis que agentes e mantenedores devem preservar. O código mostra a implementação; os testes são a prova executável; este arquivo explica a intenção.

## Captura de `cy.request`

São aceitas quatro assinaturas:

```javascript
cy.request('/health')
cy.request('GET', '/health')
cy.request('POST', '/users', { name: 'Ana' })
cy.request({ method: 'POST', url: '/users', body: { name: 'Ana' } })
```

URLs relativas usam `baseUrl`; URLs absolutas prevalecem. Métodos são normalizados para maiúsculas e headers ausentes tornam-se `{}`.

- Implementação: `src/collector/normalizeCyRequestArgs.ts`
- Testes: `test/core.test.js`, `test/unit/normalize.test.js`

## Mascaramento

Requests, responses, redirects, erros, assertions e cURL não podem persistir segredos. O mascaramento reconhece campos sensíveis, parâmetros de query, Bearer tokens, JWTs e JSON embutido em strings. Campos configurados em `maskFields` complementam os padrões.

- Implementação: `src/collector/sensitiveMask.ts`, `src/collector/requestStore.ts`, `src/reporter/buildReportModel.ts`
- Testes: `test/unit/mask.test.js`, `test/integration/build-report.test.js`

## Request principal

A chamada principal é inferida por sinais genéricos, sem nomes de endpoints ou palavras do título:

1. Sem requests, retorna `undefined`.
2. O request cujo status coincide com `error.actual` recebe a maior prioridade.
3. Em seguida, mutações (`POST`, `PUT`, `PATCH`, `DELETE`) têm prioridade sobre outros métodos.
4. Empates preservam a chamada mais antiga.

Login e autenticação não são casos especiais nessa decisão.

- Implementação: `inferMainRequest` em `src/reporter/buildReportModel.ts`
- Testes: `test/unit/infer-request.test.js`

## Fases das requests

Depois de escolher a principal:

- a principal é `validacao`;
- chamadas anteriores são `preparacao`;
- `GET` posteriores são `verificacao`;
- `DELETE` posteriores são `limpeza`;
- as demais são `chamada`.

- Implementação: `annotateRequests` em `src/reporter/buildReportModel.ts`
- Testes: `test/core.test.js`, `test/integration/build-report.test.js`

## Expectativa de status e payload

A expectativa HTTP pode vir do plano estático, de uma assertion de status ou do erro. Ela é mantida separada de assertions sobre body para evitar que valores numéricos do payload sejam interpretados como status.

O diff de payload marca somente divergências apoiadas pelas assertions. Evidências observacionais, como um campo nulo citado na falha, podem ser exibidas sem transformar outros nulos em erro.

- Implementação: `src/collector/extractSourceAssertions.ts`, `src/reporter/buildPayloadDiff.ts`, `src/reporter/buildReportModel.ts`
- Testes: `test/core.test.js`, `test/unit/payload-diff.test.js`, `test/integration/build-report.test.js`

## Diagnóstico

O diagnóstico só é gerado para teste falho. As categorias atuais são:

- `validation-not-applied`
- `unhandled-validation-error`
- `authorization-not-enforced`
- `authentication-not-enforced`
- `resource-not-found-mismatch`
- `duplicate-conflict`
- `success-expected-but-client-error`
- `success-expected-but-server-error`
- `persistence-mismatch`
- `unexpected-persistence`
- `network-error`
- `timeout`
- `schema-contract-mismatch`
- `unknown`

Toda nova categoria exige tipo, regra e fixture correspondente.

- Implementação: `src/reporter/diagnostics/`
- Testes: `test/unit/diagnose.test.js`

## Reprodução determinística

O script de reprodução é gerado apenas para testes falhos com requests. Ele contém o fluxo completo, não somente a request principal.

Variáveis são descobertas quando um valor de uma resposta reaparece literalmente em request posterior. O nome shell vem da chave real do campo. Tokens são o único caso especial: uma chave de token pode gerar `$TOKEN` quando uma chamada posterior usa Bearer, mesmo que o valor já esteja mascarado.

- Implementação: `buildReproductionScript` em `src/reporter/buildReportModel.ts`
- Testes: `test/integration/build-report.test.js`

## Redirects

O histórico de redirects exposto pelo Cypress é normalizado e preservado. Cada `location` passa por mascaramento de URL antes de persistir.

- Implementação: `src/cypress/support/autoCapture.ts`, `src/collector/requestStore.ts`
- Testes: `test/core.test.js`, `test/integration/build-report.test.js`

## Procedência determinística

Cada informação que o FailLens poderá usar em BDD, resultado atual, resultado esperado ou chamado carrega uma fonte rastreável (`observed`, `asserted`, `contract`, `verified`, `not-verified`). O relatório não inventa causa, não escolhe silenciosamente entre fontes conflitantes, não trata assertion como contrato nem afirma persistência apenas porque recebeu um ID.

- O contrato JSDoc estruturado (`@contrato`/`@campo`/`@regra` com ID e atributos `chave=valor`) é parseado de forma determinística; atributos inválidos viram avisos e não derrubam o relatório; o formato antigo degrada sem vincular regra específica.
- O vínculo teste→regra vem da tag `@regra:<id>` lida estaticamente do source (inclusive data-driven sobre array literal), nunca de comparação de palavras do título.
- As demais tags do `it` são preservadas em `test.tags`: operacionais e de catálogo escritas como string (ex.: `@bug`) direto; tags de catálogo escritas como `CatalogoTags.X` são resolvidas ao valor real lendo o módulo de tags importado (determinístico, sem derivar do nome da constante) e degradam silenciosamente se o módulo não for legível.
- A resolução contrato→regra→teste é cross-spec e contextual: primeiro usa o contrato cujo source está na mesma pasta do spec; sem contexto inequívoco, um id só resolve quando exatamente um contrato o declara.
- Definições divergentes da mesma regra em specs do mesmo contrato geram aviso e tornam o vínculo ambíguo.
- Conflito entre `asserted` e `contract` aparece como divergência de fontes (`conflictsWith`), não como diagnóstico do backend.
- A expectativa de persistência vem exclusivamente do atributo tipado `persistence` da regra JSDoc vinculada; a evidência observada é calculada separadamente da sequência capturada.
- POST 2xx só confirma criação quando um GET posterior está correlacionado ao ID/variável retornada e contém os dados enviados. ID sem GET ou payload divergente permanece `not-verified`.
- POST rejeitado + GET 404 do mesmo recurso confirma ausência; PUT/PATCH rejeitado exige leitura anterior e posterior idênticas; DELETE 2xx exige GET 404 posterior do mesmo recurso.
- POST duplicado + GET 200 do registro original não prova unicidade e permanece `not-verified`.
- Somente estados `confirmed-*` geram uma frase determinística na comparação existente; `not-verified` bloqueia afirmações positivas e negativas e não representa falha de persistência.
- Títulos curtos duplicados no mesmo spec não recebem vínculo estático até que a associação seja inequívoca.

`facts`, `contracts`, `persistenceExpectation` e `persistenceEvidence` são persistidos no JSON e mascarados antes da primeira persistência. Não existe uma seção HTML chamada “Evidência de persistência”. `sourceFiles` usa o caminho relativo do spec, nunca `spec.absolute`.

- Implementação: `src/collector/parseContractJsdoc.ts`, `src/collector/extractTestTags.ts` (`parseCatalogModule`/`findImportSource`), `src/cypress/registerNodeEvents.ts` (`resolveCatalogTags`), `src/reporter/provenance/resolveContracts.ts`, `src/reporter/provenance/buildFacts.ts`, `src/reporter/buildReportModel.ts`
- Testes: `test/unit/parse-contract-jsdoc.test.js`, `test/unit/extract-test-tags.test.js`, `test/integration/provenance.test.js`

## Relatório HTML

O HTML deve abrir offline e não pode usar CDN, scripts externos, fontes remotas, `fetch` ou importação dinâmica externa. Dados, fonte, CSS e JavaScript ficam embutidos.

- Implementação: `src/reporter/generateHtml.ts`, `src/templates/`
- Testes: `test/integration/generate-html.test.js`, `test/integration/report-features.test.js`, `test/integration/visual-styling.test.js`

## Evidência para o dev

O toolbar de detalhe possui, nesta ordem, `Chamada selecionada`, `Script de reprodução` e `Evidência para o dev`, com semântica ARIA e navegação por setas/Home/End. A evidência textual usa somente dados já sanitizados e o cURL da request principal.

O evento oficial `after:screenshot` registra metadata; a associação exige spec e título completo ou a janela temporal de uma tentativa. Imagens automáticas de falha vencem manuais e a tentativa falha mais recente aparece primeiro. Ausência, remoção posterior do arquivo e `screenshotOnRunFailure: false` não quebram o relatório.

O clipboard tenta texto, HTML e PNG. Se a imagem ou a API moderna forem bloqueadas, copia texto/cURL/path relativo pelo fallback existente e informa o nível de sucesso confirmado.

Ao abrir a aba, o cliente cria uma única prévia `<img>` lazy para o screenshot do teste selecionado. Essa mesma imagem alimenta a tentativa de canvas/clipboard; não há segundo carregamento oculto. Se o navegador bloquear o acesso programático aos pixels, a prévia ainda permite copiar pela ação nativa do navegador ou arrastar a imagem, sem embutir bytes no relatório.

## Visualizador localhost

`faillens open` serve o relatório padrão em uma porta livre de `127.0.0.1`; `--report`, `--port` e `--no-browser` controlam localização, porta e abertura do navegador. `faillens run --open` realiza a mesma abertura após gerar os artefatos e nunca substitui o exit code do Cypress. Em `CI=true`, a abertura é ignorada.

Cada sessão recebe token aleatório. O servidor aceita somente `Host` local, não serve arquivos arbitrários e entrega PNG apenas quando seu `relativePath` consta no JSON sanitizado. Uma conexão SSE representa cada aba; fechar a última agenda o encerramento automático, com timeout de inatividade como proteção adicional.

Em localhost, screenshot, texto e HTML são preparados para `ClipboardItem` sem passar pelo canvas de origem opaca. Negação de permissão continua acionando o fallback textual.

- Implementação: `src/cli/open.ts`, `src/server/localReportServer.ts`, `src/templates/clientScript.ts`
- Testes: `test/integration/local-report-server.test.js`, `test/integration/open-command.test.js`, `test/integration/generate-html.test.js`

- Implementação: `src/cypress/screenshotEvidence.ts`, `src/reporter/evidence.ts`, `src/templates/evidenceClipboard.ts`, `src/templates/clientScript.ts`
- Testes: `test/unit/screenshot-evidence.test.js`, `test/unit/evidence.test.js`, `test/integration/generate-html.test.js`, `test/cli-run.test.js`

## Como alterar este catálogo

Atualize uma seção quando uma mudança modificar algo observável pelo consumidor, pelo relatório ou pelos testes. Refatorações internas sem mudança de contrato não precisam de entrada nova.
