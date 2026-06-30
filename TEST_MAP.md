# TEST_MAP — Mapa de Cobertura de Testes FailLens

> Leia este arquivo ao receber qualquer tarefa de implementação.
> Ele mapeia quais testes cobrem quais módulos para que você saiba
> exatamente quais testes devem passar após sua mudança.

---

## Como usar este mapa

1. Identifique o(s) arquivo(s) `src/` que sua tarefa vai modificar
2. Encontre as entradas correspondentes abaixo
3. Leia os arquivos de teste listados — eles são o contrato da sua implementação
4. Execute apenas os testes relevantes durante o desenvolvimento; `npm test` ao finalizar

---

## src/collector/sensitiveMask.ts

**Responsabilidade:** mascaramento recursivo de dados sensíveis

| Testes | Arquivo |
|--------|---------|
| Cobertura base | `test/core.test.js` → "mascara dados sensíveis em objetos, URL e cURL" |
| Edge cases e cobertura completa | `test/unit/mask.test.js` |

**Casos críticos que DEVEM ter cobertura:**
- Objeto com campos sensíveis em qualquer nível de profundidade
- Referências circulares → `"[Circular]"` sem stack overflow
- String que é um JWT válido (3 segmentos base64url separados por `.`) → `"<TOKEN>"`
- String `"Authorization: Bearer xyz"` dentro de texto → `"Bearer <TOKEN>"`
- Campo `authorization` com valor `"Bearer real-token"` → `"Bearer <TOKEN>"`
- URL com query param sensível: `?token=real&safe=keep` → `?token=***&safe=keep`
- `extraFields` adicionais complementam (não substituem) os campos padrão
- `maskPatterns` remove trechos sensíveis em texto livre, inclusive campos genéricos como `message`/`debug`
- Campo com nome em PascalCase ou kebab-case comparado de forma canônica (`accessToken`, `access-token`, `access_token` → todos sensíveis)

---

## src/collector/normalizeCyRequestArgs.ts

**Responsabilidade:** normaliza os 4 formatos de cy.request para estrutura única

| Testes | Arquivo |
|--------|---------|
| Cobertura base (4 formatos) | `test/core.test.js` → "normaliza as quatro assinaturas" |
| Edge cases | `test/unit/normalize.test.js` |

**Casos críticos:**
- URL relativa + `baseUrl` com e sem barra final → sem double-slash
- URL absoluta + `baseUrl` → URL absoluta prevalece
- Sem `baseUrl` → `url === originalUrl`
- `body: null` vs `body: undefined` vs body ausente
- `failOnStatusCode: false` preservado; `undefined` quando ausente
- `method` em qualquer case → sempre uppercase na saída
- `headers` ausente → `{}` na saída (nunca undefined)
- `originalArgsShape` correto para cada formato

---

## src/collector/curlGenerator.ts

**Responsabilidade:** gera cURL sanitizado a partir de CurlInput

| Testes | Arquivo |
|--------|---------|
| Cobertura base | `test/core.test.js` → "mascara dados sensíveis... cURL" |
| Edge cases | `test/unit/curl.test.js` |

**Casos críticos:**
- Shell quoting correto: single quotes, escape de `'` interno como `'\''`
- Sem body → sem flag `-d`
- Body como objeto → `JSON.stringify` na saída
- Body como string → passado diretamente
- Headers múltiplos → múltiplos `-H`
- URL com parâmetros sensíveis → mascarados via `maskUrl`
- Headers sensíveis → mascarados via `maskSensitiveData`
- Body com campos sensíveis → mascarado via `maskSensitiveData`

---

## src/collector/extractSourceAssertions.ts

**Responsabilidade:** extrai plano de assertions via parse estático do source

| Testes | Arquivo |
|--------|---------|
| Cobertura base | `test/core.test.js` → "extrai o plano de assertions do spec" |

**Casos adicionais a cobrir se módulo for modificado:**
- `expect` dentro de comentário → ignorado
- `expect` dentro de string → ignorado
- `it.only`, `it.skip`, `test`, `specify` → todos reconhecidos
- Assertion com mensagem descritiva → usa a mensagem como título
- Assertion sem mensagem → gera título com `expect(subject) chain`

---

## src/collector/parseContractJsdoc.ts

**Responsabilidade:** parser determinístico do contrato JSDoc (`@contrato/@api/@campo/@regra/@permissao/@cobertura`), incluindo expectativa tipada `persistence`, aspas escapadas e avisos para valores malformados, zero deps

| Testes | Arquivo |
|--------|---------|
| Gramática, atributos, status/persistence inválidos, duplicidade, formato antigo | `test/unit/parse-contract-jsdoc.test.js` |

## src/collector/extractTestTags.ts

**Responsabilidade:** captura estática das tags do `it` — vínculo `@regra:<id>`, tags operacionais/catálogo string (`@bug`) e referências `CatalogoTags.X`; mais `parseCatalogModule`/`findImportSource` para resolver o valor do catálogo lendo o módulo importado

| Testes | Arquivo |
|--------|---------|
| it simples, data-driven, comentário/string, it.only/skip, 3 categorias juntas, resolução de catálogo | `test/unit/extract-test-tags.test.js` |

A resolução do módulo de tags (`CatalogoTags.X` → `@valor`) é feita em `src/cypress/registerNodeEvents.ts` (`resolveCatalogTags`, lê o módulo importado pelo spec) e persistida por `RequestStore.mergeTestTags` em `test.tags`.

## src/reporter/provenance/ (resolveContracts.ts, buildFacts.ts)

**Responsabilidade:** resolução contextual cross-spec contrato→regra→teste, detecção de definições divergentes, montagem dos facts e cálculo separado de expectativa/evidência de persistência

| Testes | Arquivo |
|--------|---------|
| Vínculo cross-spec, facts por fonte, conflito, regra inexistente, ambiguidade e masking | `test/integration/provenance.test.js` |
| Persistência: criação, ausência, preservação, remoção, payload divergente, duplicidade inconclusiva e `not-verified` | `test/integration/provenance.test.js` |

## src/reporter/buildReportModel.ts (+ inferMainRequest, annotateRequests, buildReproductionScript)

**Responsabilidade:** constrói FailLensReport completo a partir de specs brutos

| Testes | Arquivo |
|--------|---------|
| Cobertura base (fluxo completo) | `test/core.test.js` → "monta relatório, infere request principal..." |
| CLI integrado | `test/cli-run.test.js` |
| Edge cases de modelo | `test/integration/build-report.test.js` |

**inferMainRequest — casos críticos:**
- Sem requests → `undefined`
- Operação de regra resolvida é o sinal de maior prioridade; quando setup e ação usam o mesmo método, a última chamada compatível vence
- Sem operação contratual, status recebido igual ao `actual` do erro é o sinal de maior prioridade
- Mutações (`POST`, `PUT`, `PATCH`, `DELETE`) vencem métodos sem mutação quando não há sinal de status
- Empate preserva a chamada mais antiga
- Login/auth não recebe tratamento especial; endpoint e idioma não influenciam
- Múltiplos POSTs → escolhe o que tem status matching o erro

## src/reporter/buildBddScenario.ts

**Responsabilidade:** gera BDD para testes falhos por templates determinísticos, com quatro a seis linhas quando houver fontes suficientes e procedência por linha

| Contrato | Arquivo |
|---|---|
| Campo ausente obrigatório, conflito de fontes, duplicidade comprovada, timeout, autenticação, rede, persistência e teste aprovado | `test/unit/bdd.test.js` |
| Seleção da ação por `operation=` | `test/unit/infer-request.test.js` |
| Escape de conteúdo não confiável no HTML | `test/integration/security.test.js` |

**annotateRequests — fases:**
- `mainRequestId` → `"validacao"`
- Requests anteriores à principal → `"preparacao"`
- Após main, método GET → `"verificacao"`
- Após main, método DELETE → `"limpeza"`
- Demais → `"chamada"`

**buildReproductionScript — variáveis:**
- Valor escalar de uma resposta só vira variável quando reaparece em request posterior
- Nome da variável é derivado da chave real do campo, sem vocabulário de domínio
- Response body com chave de token + uso Bearer posterior → extrai `$TOKEN`
- O script preserva o fluxo completo de requests
- Variável usada em request posterior → substituída no cURL
- `$TOKEN` usado em `Authorization: Bearer` → substituído automaticamente

---

## src/reporter/diagnostics/diagnoseFailure.ts

**Responsabilidade:** motor de diagnóstico determinístico (14 categorias)

| Testes | Arquivo |
|--------|---------|
| Cobertura por categoria | `test/unit/diagnose.test.js` |

**Uma fixture por categoria — obrigatório:**
```
timeout                          → mensagem com "timeout" / "timed out"
network-error                    → sem receivedStatus + erro de rede
schema-contract-mismatch         → mensagem com "schema" / "property"
persistence-mismatch             → POST 2xx + GET 404 depois
persistence-mismatch (campos)    → POST 2xx + GET 2xx com campos divergentes
unexpected-persistence           → POST com id na resposta + GET 2xx depois
validation-not-applied           → expected 400, received 201 (POST)
unhandled-validation-error       → expected 400, received 500
authorization-not-enforced       → expected 403, received 200
authentication-not-enforced      → expected 401, received 200
resource-not-found-mismatch      → expected 404, received 200
duplicate-conflict               → expected 409, criação recebeu 2xx
success-expected-but-client-error → expected 200, received 400
success-expected-but-server-error → expected 200, received 500
unknown                          → sem padrão reconhecido
```

**Estado sem falha → retorna `undefined`** (teste passado, sem diagnosis)

---

## src/reporter/diagnostics/parseAssertionError.ts

**Responsabilidade:** extrai expected/actual/assertionMessage de mensagens de erro

| Testes | Arquivo |
|--------|---------|
| Cobertura base | `test/core.test.js` → "extrai expected, actual e mensagem descritiva" |
| Edge cases | `test/unit/parse-error.test.js` |

**Formatos que devem ser reconhecidos:**
```
"expected 201 to equal 400"                    → actual=201, expected=400
"expected X to deep equal Y"                   → actual=X, expected=Y
"expected response.status to equal 400 but got 201"  → actual=201, expected=400
"expected 500 to be below 400"                 → actual=500, expected=400
"Mensagem descritiva: expected 201 to equal 400" → assertionMessage="Mensagem descritiva"
"AssertionError: expected 201 to equal 400"    → name="AssertionError"
```

**Extração de location a partir da stack:**
- Ignora linhas com `node_modules` ou `cypress/runner`
- Prefere o primeiro arquivo do projeto do usuário

---

## src/reporter/diagnostics/rules.ts

**Responsabilidade:** define STATUS_DIAGNOSIS_RULES (regras declarativas de status)

| Testes | Arquivo |
|--------|---------|
| Testado indiretamente via diagnoseFailure | `test/unit/diagnose.test.js` |

**Se modificar rules.ts:** adicione/atualize o caso correspondente em `diagnose.test.js`

---

## src/cli/config.ts

**Responsabilidade:** carrega e resolve faillens.config.js

| Testes | Arquivo |
|--------|---------|
| Cobertura | `test/integration/config.test.js` |

**Casos críticos:**
- Sem `faillens.config.js` → usa defaults (outputDir = reports/faillens, theme = dark)
- Com `maskFields` customizado → merged com DEFAULT_MASK_FIELDS (sem duplicatas)
- Com `maskPatterns` customizado → normalizado para strings serializáveis (incluindo RegExp literal)
- `theme: "light"` → preservado; qualquer outro valor → `"dark"`
- `outputDir` relativo → resolvido para absoluto a partir de projectRoot
- `projectName` ausente mas `package.json` tem `name` → usa `package.json`

---

## src/cli/detectCypress.ts

**Responsabilidade:** detecta se o projeto tem Cypress configurado

| Testes | Arquivo |
|--------|---------|
| Cobertura | `test/integration/detect-cypress.test.js` |

**Casos críticos:**
- Sem `package.json` → lança CYPRESS_NOT_FOUND_MESSAGE
- Sem cypress em nenhuma seção de deps → lança
- Sem `cypress.config.js` → lança
- Sem diretório `cypress/` → lança
- Com `cypress/support/e2e.js` → detecta como supportPath
- Com `cypress/support/index.js` (fallback) → detecta como supportPath
- Sem support file → supportPath é undefined (válido)
- `configuredFile` customizado → usa esse path em vez de cypress.config.js

---

## src/cli/run.ts

**Responsabilidade:** orquestra detecção, instrumentação, execução e geração

| Testes | Arquivo |
|--------|---------|
| Integração CLI completa | `test/cli-run.test.js` (já existe — não duplicar) |

`test/e2e/fixtures/minimal-project/` contém a fixture Cypress mínima. Ainda não há um arquivo de teste E2E dedicado; não cite um até ele existir.

## src/cli/open.ts + src/server/localReportServer.ts

**Responsabilidade:** localizar e servir o relatório em loopback com lifecycle automático.

| Contrato | Arquivo |
|---|---|
| Diretório padrão e artefatos obrigatórios | `test/integration/open-command.test.js` |
| Bind em loopback, token, Host, allowlist de PNG, JSON e MIME | `test/integration/local-report-server.test.js` |
| SSE e encerramento após a última aba | `test/integration/local-report-server.test.js` |
| Transporte do PNG e lifecycle no cliente | `test/integration/generate-html.test.js` |

---

## src/cli/init.ts

**Responsabilidade:** adiciona script test:report ao package.json

| Testes | Arquivo |
|--------|---------|
| Cobertura base | `test/core.test.js` → "init adiciona script e não sobrescreve" |

---

## src/cypress/createInstrumentedConfig.ts

**Responsabilidade:** gera os arquivos temporários em .faillens/

| Testes | Arquivo |
|--------|---------|
| Integração via cli-run | `test/cli-run.test.js` |

Se a instrumentação ganhar um contrato que `test/cli-run.test.js` não consiga provar, crie então um teste de integração dedicado e atualize este mapa com o caminho real.

---

## src/reporter/generateHtml.ts + src/templates/

**Responsabilidade:** escreve o HTML standalone

| Testes | Arquivo |
|--------|---------|
| Cobertura base | `test/core.test.js` → "gera HTML offline autocontido e sem segredos" |
| Cobertura adicional | `test/integration/generate-html.test.js` |
| Contrato visual | `test/integration/visual-styling.test.js` |
| Features de UI | `test/integration/report-features.test.js` |

**Casos críticos:**
- Arquivo criado no outputDir correto
- Sem CDN, fontes externas, `<link>` externo, `<script src=`
- Dados sensíveis ausentes (mascarados antes)
- Script de reprodução presente quando há requests
- `data-detail-tab="script"` presente
- Seção `diff-line` presente para assertions com expected/actual
- Sequência de chamadas renderizada (`request-row`, `sequence-legend`)
- Resumo de persistência aparece somente para `confirmed-*` na comparação existente; não existe seção “Evidência de persistência”
- Cenário BDD aparece somente na aba de evidência dos testes falhos e é incluído no conteúdo copiado
- Aba `Criar chamado` contém as doze seções aprovadas e mantém fallback quando não há screenshot

**Contrato visual (não regredir a aparência) — `visual-styling.test.js`:**
- Paleta de verde unificada: `--green-line` nos dois temas, `--green-soft` em `rgba(34,197,94,.13)`, sem o órfão `rgba(53,209,126)`
- Cores de método alinhadas (`get #5fd39a`, `put #fcd34d`, post bg `rgba(59,130,246,.16)`)
- Coloração ciente de estado: `.comparison-card.received.passed/.failed`, `.metric-card.success`, `.failure-banner.passed`, `.match-note`
- Tela de sucesso: `analysisSections` (não `failureSections`) renderiza "Resposta validada" + "contrato satisfeito" para testes que passam
- Ao editar `styles.ts`/`clientScript.ts`, rode este arquivo — ele trava o visual contra a referência

**Features de UI (`report-features.test.js`):**
- Fonte Geist embutida em base64 (sem links externos) — `src/templates/embeddedFont.ts`
- Sequência: tubo por status HTTP (`statusBarClass`, `.request-bar.s2/s3/s45/snone`), tempo dentro/fora do tubo (`positionBarTimes`), métodos OPTIONS/HEAD coloridos, saltos de redirect inline (`seq-hop`), limite 10 + "mostrar mais"
- Menu lateral: contadores `✕`/`✓` (`spec-counts`), colapso de suite (`data-spec-toggle`) e dos que passaram (`data-passed-toggle`)
- Sucesso: asserções em 2 colunas (`successAssertions`, `pass-layout`, `assert-summary`)
- Cards Esperado/Recebido: ampliar (`expand-btn` → `openModal`) + rolagem (`max-height: 340px`)

---

## src/reporter/generateJson.ts

**Responsabilidade:** escreve o JSON do relatório

| Testes | Arquivo |
|--------|---------|
| Cobertura | `test/integration/generate-json.test.js` |

---

## test/benchmarks/

**Responsabilidade:** medir performance e falhar se ultrapassar budget

| Arquivo | O que mede |
|---------|-----------|
| `test/benchmarks/generation.bench.js` | RequestStore, modelo, serialização, escrita paralela, pipeline, escalas, screenshots, RSS/heap e artefatos |
| `test/benchmarks/masking.bench.js` | maskSensitiveData em objetos de vários tamanhos |

## src/cypress/screenshotEvidence.ts

| Contrato | Arquivo |
|---|---|
| Paths Windows/POSIX, encoding, folder customizado, traversal, spec+título, retries, manual/automático e ausência | `test/unit/screenshot-evidence.test.js` |
| Handler preservado, partial sanitizado, geração única e exit code | `test/cli-run.test.js` |
| Uso público direto continua gerando em `after:run` | `test/integration/register-node-events.test.js` |

## src/reporter/evidence.ts + src/templates/evidenceClipboard.ts

| Contrato | Arquivo |
|---|---|
| Montagem do chamado, ordem das seções, metadata opcional, texto/HTML/BDD e clipboard | `test/unit/evidence.test.js` |
| Terceira aba `Criar chamado`, ARIA, link, estado vazio, CSP e ausência de bytes | `test/integration/generate-html.test.js` |
| Rejeição de schemes/traversal/path absoluto e escape integral do chamado | `test/integration/security.test.js` |

Leia `PERFORMANCE_BUDGET.md` antes de modificar collector/ ou reporter/.

---

## Segurança transversal

| Contrato | Arquivo |
|---|---|
| Injeção de shell em cURL e reprodução | `test/integration/security.test.js` |
| Chaves especiais e proteção contra prototype pollution | `test/integration/security.test.js` |
| Tema não confiável, CSP e mapas do cliente | `test/integration/security.test.js` |

Ao adicionar uma nova superfície de persistência, shell ou HTML, inclua uma regressão nesse arquivo além do teste funcional do módulo.

---

## Testes existentes — não duplicar

Os seguintes casos já têm cobertura em `test/core.test.js`:
- `extractSourceAssertions` com spec básico
- `normalizeCyRequestArgs` com os 4 formatos básicos
- `maskSensitiveData` com objeto aninhado, URL e cURL
- `parseAssertionError` com 4 formatos básicos
- `buildReportModel` com um spec completo (mascaramento, fase, variável, diagnóstico)
- `generateHtml` com estrutura e ausência de segredos
- `initCommand` com script ausente e com script existente

Os seguintes casos já têm cobertura em `test/cli-run.test.js`:
- `runCommand` com Cypress mock: exit code, relatório criado, mascaramento, preservação de tasks

**Ao criar novos testes, adicione apenas casos NÃO cobertos pelos arquivos acima.**
