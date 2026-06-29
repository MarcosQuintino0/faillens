# FailLens — Instruções para Agentes de Código

> Este arquivo é lido por Codex, ZCode/GLM e outros agentes de código.
> Se o seu ambiente não carrega este arquivo automaticamente, cole-o como system prompt no início da sessão.

## Documentação de referência

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — componentes, fronteiras e fluxo de dados
- [`docs/BEHAVIORS.md`](docs/BEHAVIORS.md) — contratos observáveis e testes correspondentes
- [`docs/TESTING.md`](docs/TESTING.md) — estratégia e checklist de testes
- [`docs/SECURITY.md`](docs/SECURITY.md) — mascaramento, privacidade e superfícies protegidas
- [`docs/REPORT_SCHEMA.md`](docs/REPORT_SCHEMA.md) — semântica e evolução do relatório
- [`docs/adr/`](docs/adr/) — decisões arquiteturais duráveis

Não duplique esses documentos aqui. Este arquivo é a fonte de regras operacionais para agentes; os documentos acima são as fontes de contexto e contratos.

---

## O que é este projeto

FailLens é uma biblioteca npm + CLI em TypeScript (Node.js ≥ 18) que:
1. Executa o Cypress com instrumentação transparente
2. Intercepta automaticamente todas as chamadas `cy.request`
3. Gera um relatório HTML offline com debug detalhado de falhas em testes de API

**Três princípios que definem todas as decisões de design:**
- Processamento 100% local: nenhum dado sai da máquina
- Zero dependências de runtime: o pacote publicado depende apenas do Node stdlib
- Arquivos do projeto consumidor são intocáveis: só lemos, nunca escrevemos

---

## Mapa de arquivos — leia antes de implementar

```
src/cli/
  index.ts            → ponto de entrada da CLI (bin/faillens.js)
  run.ts              → comando "faillens run": detecta, instrumenta, executa, gera relatório
  init.ts             → comando "faillens init": adiciona script ao package.json do consumidor
  generate.ts         → comando "faillens generate": regenera HTML a partir de JSON existente
  config.ts           → carrega faillens.config.js do projeto consumidor
  detectCypress.ts    → encontra cypress.config.js e support file do consumidor

src/cypress/
  createInstrumentedConfig.ts  → gera .faillens/ com cypress.config.generated.js e support.generated.js
  registerNodeEvents.ts        → handlers cy.task no Node.js (recebe dados do browser)
  support/
    autoCapture.ts   → sobrescreve cy.request no browser para capturar chamadas
    hooks.ts         → before/afterEach para rastrear contexto de teste atual

src/collector/
  normalizeCyRequestArgs.ts → normaliza os 4 formatos de cy.request para estrutura única
  requestStore.ts           → acumula requests por testId durante a execução
  sensitiveMask.ts          → mascara dados sensíveis recursivamente (headers, bodies, URLs)
  curlGenerator.ts          → gera cURL sanitizado a partir de uma request capturada
  extractSourceAssertions.ts → parse estático do source do teste para extrair plano de assertions
  extractTestTags.ts        → captura estática do vínculo teste→regra (@regra:<id>), inclusive data-driven
  parseContractJsdoc.ts     → parser determinístico do contrato JSDoc (procedência), zero deps

src/reporter/
  buildReportModel.ts       → constrói FailLensReport a partir de specs brutos; resolve contratos e facts
  buildPayloadDiff.ts       → marca divergências de payload apoiadas pelas assertions
  provenance/
    resolveContracts.ts     → consolida contratos por @contrato e resolve teste→regra (cross-spec)
    buildFacts.ts           → monta facts (observed/asserted/contract/verified/not-verified) + conflitos
  generateHtml.ts           → escreve o arquivo HTML standalone
  generateJson.ts           → escreve o arquivo JSON do relatório
  diagnostics/
    diagnoseFailure.ts      → motor de diagnóstico determinístico (14 categorias)
    rules.ts                → regras de diagnóstico por status HTTP
    parseAssertionError.ts  → extrai expected/actual de mensagens de erro

src/templates/
  reportTemplate.ts  → template HTML com CSS e JS embutidos
  embeddedFont.ts    → fonte Geist embutida em base64
  styles.ts          → CSS do relatório
  clientScript.ts    → JavaScript do relatório interativo

src/types/
  config.ts     → FailLensConfig, ResolvedFailLensConfig
  report.ts     → todos os tipos do relatório (FailLensReport, FailLensTest, etc.)
  provenance.ts → modelo de procedência (FactSource, FailLensFact, FailLensContract, FailLensContractRule)

src/utils/
  format.ts   → round(), asRecord(), plain()
  fs.ts       → ensureDir(), writeTextFile(), pathExists(), readJsonFile()
  safeJson.ts → parse seguro de JSON
```

---

## Fluxo de execução completo

```
faillens run
  → loadFailLensConfig()          lê faillens.config.js se existir
  → detectCypress()               encontra cypress.config.js + support do consumidor
  → createInstrumentedConfig()    gera .faillens/cypress.config.generated.js
                                  gera .faillens/support.generated.js
  → executeCypress()              spawn do binário do Cypress com --config-file gerado

  Dentro do Cypress (browser):
    autoCapture.ts instala sobrescrita de cy.request
    hooks.ts registra before/afterEach para rastrear testId atual
    Cada cy.request → cy.task("faillens:addRequest", ...) → cy.task("faillens:finishRequest", ...)

  Dentro do Cypress (Node.js — registerNodeEvents.ts):
    faillens:addRequest    → acumula request no requestStore
    faillens:finishRequest → completa request com status/body/duration
    faillens:setTest       → registra início de teste com id e specPath
    faillens:setTestResult → registra resultado (passed/failed + error + assertions)
    after:spec             → consolida spec e salva em .faillens/results/<spec>.json
    after:run              → chama generateReportArtifacts()

  → generateReportArtifacts()
      loadPartialSpecs()          lê .faillens/results/*.json
      buildReportModel()          monta modelo completo com mascaramento
      generateJson()              escreve reports/faillens/faillens-report.json
      generateHtml()              escreve reports/faillens/index.html
```

---

## Invariantes — NUNCA violar

### INV-1: Mascaramento antes de qualquer persistência
```
PROIBIDO:  fs.writeFile(destino, JSON.stringify(specs))
CORRETO:   const report = buildReportModel(specs, { config })
           // buildReportModel já aplica maskSensitiveData internamente
           generateJson(report, outputDir)
           generateHtml(report, outputDir)

PROIBIDO:  console.log("headers recebidos:", responseHeaders)
CORRETO:   (não logue dados de request/response — podem conter credenciais)
```

### INV-2: Arquivos do consumidor são intocáveis
```
PROIBIDO:  editar cypress.config.js do consumidor
PROIBIDO:  editar cypress/support/ do consumidor
PROIBIDO:  editar package.json do consumidor (exceto initCommand que só ADICIONA scripts)
CORRETO:   criar novos arquivos em .faillens/ (pasta temporária do FailLens)
```

### INV-3: Exit code do Cypress é preservado
```typescript
// Padrão obrigatório — não alterar este fluxo
let exitCode = 1
try {
  exitCode = await executeCypress(...)  // preserva o código do Cypress
} finally {
  await generateReportArtifacts(...)    // erro aqui não muda exitCode
}
return exitCode
```

### INV-4: HTML é 100% standalone
```
PROIBIDO:  <link href="https://fonts.googleapis.com/..." rel="stylesheet">
PROIBIDO:  <script src="https://cdn.jsdelivr.net/..."></script>
PROIBIDO:  fetch(), XMLHttpRequest, import() dinâmico para URLs externas
CORRETO:   <style>/* CSS embutido */</style>
CORRETO:   <script>/* JS embutido */</script>
CORRETO:   <script id="faillens-data" type="application/json">/* dados */</script>
```

### INV-5: Zero dependências de runtime
```
PROIBIDO:  npm install qualquer-pacote --save
CORRETO:   use Node stdlib: fs, path, crypto, perf_hooks, url, util, os, child_process
CORRETO:   devDependencies são aceitas (typescript, rimraf, @types/node)
```

### INV-6: Os 4 formatos de cy.request devem funcionar
```javascript
cy.request('/health')                               // url-only → GET + baseUrl
cy.request('GET', '/health')                        // method+url
cy.request('POST', '/users', { name: 'Ana' })       // method+url+body
cy.request({ method: 'POST', url: '/users', ... })  // options object
```

---

## Decision Ladder — avaliar em ordem antes de escrever código

Antes de criar qualquer função, módulo, ou abstração:

**1. PRECISA EXISTIR?**
Pode ser alcançado compondo o que já existe em `src/`?
→ Se sim: componha, não crie

**2. JÁ EXISTE?**
Busque especialmente em `src/collector/` e `src/utils/`.
→ Se encontrar similar: adapte ou reutilize

**3. É STDLIB DO NODE?**
`fs`, `path`, `crypto`, `perf_hooks`, `util`, `url`, `os`, `child_process`
→ Se o stdlib resolve: use o stdlib

**4. PODE SER INLINE?**
O código pode ficar no chamador sem criar função nova?
→ Se sim: deixe inline

**5. PODE SER UMA LINHA?**
→ Se sim: escreva em uma linha

**6. SOMENTE ENTÃO:** escreva o mínimo que faça os testes correspondentes passarem.

**Validação de necessidade para este projeto específico:**
- Antes de adicionar qualquer campo ao `FailLensReport`: existe um teste que valida este campo?
- Antes de adicionar categoria de diagnóstico: existe uma fixture de teste que o dispara?
- Antes de modificar o HTML template: existe um teste de `generateHtml` que verifica o comportamento?

---

## Fluxo de trabalho TDAD — seguir em TODA implementação

Ao receber "implemente a feature X" ou "corrija o bug Y":

```
PASSO 1: Identificar escopo
   → Leia o enunciado da tarefa
   → Identifique os arquivos src/ que precisam mudar

PASSO 2: Consultar contexto de testes
   → Leia TEST_MAP.md
   → Encontre as entradas correspondentes aos arquivos identificados
   → Leia os arquivos de teste listados — eles são o CONTRATO da feature

PASSO 3: Verificar performance (se aplicável)
   → Se os arquivos modificados forem src/collector/ ou src/reporter/:
     Leia PERFORMANCE_BUDGET.md e entenda os limites

PASSO 4: Aplicar Decision Ladder
   → Percorra os 6 passos antes de escrever qualquer código

PASSO 5: Implementar
   → Escreva o mínimo necessário para os testes passarem
   → Não adicione código que o teste não valida

PASSO 6: Verificar
   → Execute: npm test
   → Se falhar: leia o erro, autocorrija, repita
   → Se benchmark falhar: otimize antes de finalizar

PASSO 7: Finalizar
   → Todos os testes passam? Finalize.
   → Nunca entregue com testes falhando.
```

**Por que esta ordem importa:**
Dar ao agente apenas a instrução "siga TDD" sem contexto de quais testes são afetados
aumenta regressões. Ler TEST_MAP.md primeiro fornece o contexto necessário para
implementar sem quebrar o que já funciona.

---

## Regras de performance

Ao modificar `src/collector/` ou `src/reporter/`:

```
PREFERIR:
  - Uma única passagem sobre arrays (single-pass)
  - WeakMap para memoização de estruturas circulares (já existe em maskSensitiveData)
  - Arrays + join() para construção de strings longas
  - Lazy evaluation: só processa o que vai ser usado

EVITAR:
  - Múltiplas passagens sobre os mesmos dados
  - JSON.parse/stringify dentro de loops (custo O(n) por iteração)
  - Acumulação de strings com += em loops
  - Recursão sem proteção contra profundidade
  - Criar objetos intermediários desnecessários
```

Thresholds numéricos em `PERFORMANCE_BUDGET.md`.

---

## Tipos principais — referência rápida

```typescript
// src/types/report.ts
FailLensReport {
  generatedAt: string
  tool: { name, packageName, version }
  project?: { name?, runId?, branch? }
  theme: "dark" | "light"
  summary: FailLensSummary
  specs: FailLensSpec[]
}

FailLensSpec {
  specPath: string
  durationMs: number
  tests: FailLensTest[]
}

FailLensTest {
  id, title, titlePath?, state: TestState, durationMs
  error?: FailLensError
  diagnosis?: FailLensDiagnosis
  assertions?: FailLensAssertion[]
  requests: FailLensRequest[]
  mainRequestId?: string
  reproductionScript?: string
}

FailLensRequest {
  id, order, phase: RequestPhase, method, url, originalUrl?
  requestHeaders, requestBody
  failOnStatusCode?: boolean
  startedAt?, receivedStatus?, responseHeaders, responseBody
  durationMs, curl
  error?, generatedVariables?, usedVariables?
}

// Fases inferidas por buildReportModel.ts
type RequestPhase = "preparacao" | "validacao" | "verificacao" | "limpeza" | "chamada"
//                   login/auth     principal     GET pós-mutação  DELETE pós-teste  demais

// Categorias de diagnóstico (diagnoseFailure.ts)
type DiagnosisCategory =
  | "validation-not-applied"       // payload inválido foi aceito (esperava 400/422, recebeu 2xx)
  | "unhandled-validation-error"   // esperava 400/422, recebeu 5xx
  | "authorization-not-enforced"   // esperava 403, recebeu 2xx
  | "authentication-not-enforced"  // esperava 401, recebeu 2xx
  | "resource-not-found-mismatch"  // esperava 404, recebeu 2xx
  | "duplicate-conflict"           // duplicidade deveria retornar 409, mas foi aceita
  | "success-expected-but-client-error"  // esperava 2xx, recebeu 4xx
  | "success-expected-but-server-error"  // esperava 2xx, recebeu 5xx
  | "persistence-mismatch"         // POST 2xx + GET 404 ou campos divergentes
  | "unexpected-persistence"       // POST que deveria falhar criou recurso (GET encontrou)
  | "network-error"                // sem resposta HTTP
  | "timeout"                      // timeout detectado na mensagem de erro
  | "schema-contract-mismatch"     // divergência de schema/campo/tipo
  | "unknown"                      // sem padrão reconhecido
```

---

## Domínio Cypress — contexto obrigatório

- `cy.request` executa no **contexto do browser** (Cypress runner), não no Node.js
- `cy.task(nome, payload)` é o único canal browser → Node.js para dados
- `setupNodeEvents(on, config)` é o hook Node.js — onde FailLens registra os handlers
- `supportFile` carrega no browser antes de cada spec — onde `autoCapture.ts` instala a sobrescrita
- Specs rodam em isolamento — cada spec tem seu contexto de browser independente
- `Cypress.Commands.overwrite("request", fn)` substitui o comando globalmente para aquela sessão

---

## Padrões de mascaramento — como funcionam

```typescript
// sensitiveMask.ts — campos sensíveis por padrão (case-insensitive, normalizado)
DEFAULT_MASK_FIELDS = [
  "authorization", "cookie", "set-cookie", "password", "senha",
  "token", "accessToken", "refreshToken", "apiKey", "secret",
  "clientSecret", "jwt", "bearer", "cpf", "cnpj"
]

// Regras especiais:
// - "Authorization: Bearer xyz" → "Bearer <TOKEN>"
// - String com padrão JWT (3 segmentos base64) → "<TOKEN>"
// - URL query params sensíveis: /users?token=real → /users?token=***
// - JSON embutido em strings → re-parseado e re-mascarado
// - Referências circulares → "[Circular]" (via WeakMap)
// - Campos adicionais via faillens.config.js → maskFields: ["sessionId"]
```

---

## Comandos

```bash
npm run build              # compila TypeScript → dist/ (obrigatório antes de testar)
npm run dev                # compila em watch mode
npm test                   # build + todos os testes
npm run test:unit          # testes unitários (node:test nativo, sem deps)
npm run test:integration   # testes de integração (com filesystem)
npm run test:e2e           # testes E2E (spawn do CLI real)
npm run bench              # benchmarks de performance
npm pack --dry-run         # preview do que seria publicado
node bin/faillens.js --help
```

---

## Anti-padrões — nunca fazer

```
✗ Adicionar framework de teste (jest, vitest, mocha) — usar node:test nativo
✗ Adicionar dependência de runtime em package.json
✗ Criar abstração "para uso futuro" sem teste que a demande
✗ Logar request bodies, response bodies ou headers no stdout
✗ Buscar dados externos na geração do relatório
✗ Modificar arquivos do projeto consumidor (exceto initCommand que só adiciona)
✗ Commitar .faillens/ (é temporário e está no .gitignore)
✗ Usar cypress.config.ts (suporte apenas a .js na v0.1)
✗ Criar novo arquivo antes de verificar se o stdlib ou código existente resolve
```

---

## Manutenção da documentação

- Mudou comportamento observável: atualize `docs/BEHAVIORS.md` e o teste correspondente.
- Mudou arquitetura ou fronteira entre módulos: atualize `docs/ARCHITECTURE.md`.
- Mudou o schema persistido: atualize `docs/REPORT_SCHEMA.md` e os testes de modelo/geração.
- Mudou segurança ou persistência: atualize `docs/SECURITY.md`.
- Mudou arquivo, responsabilidade ou cobertura: atualize `TEST_MAP.md`.
- Houve uma decisão com alternativas e consequências duráveis: crie um ADR.
- Refatoração interna sem mudança de contrato não exige um novo `.md`.
