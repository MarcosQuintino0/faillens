# FailLens — Instruções para Claude Code

## O que é este projeto

FailLens é uma biblioteca npm + CLI que executa o Cypress, intercepta chamadas `cy.request` de forma transparente e gera um relatório HTML offline com debug detalhado de falhas em testes de API.

**Princípios fundamentais do projeto:**
- 100% local: sem serviços externos, sem telemetria, sem CDN
- Zero dependências de runtime (package.json não tem "dependencies")
- Arquivos do projeto consumidor são intocáveis
- HTML gerado é standalone (CSS, JS e dados embutidos no próprio arquivo)

---

## Arquitetura — onde cada coisa fica

```
src/
  cli/              → comandos: run, init, generate, config, detectCypress
  cypress/          → instrumentação temporária gerada em .faillens/
    support/        → autoCapture.ts (sobrescreve cy.request) + hooks.ts
    createInstrumentedConfig.ts → gera .faillens/cypress.config.generated.js
    registerNodeEvents.ts       → recebe dados do browser via cy.task()
  collector/        → normalização, mascaramento, geração de cURL
  reporter/         → modelo de relatório, diagnóstico, geração de HTML/JSON
    diagnostics/    → diagnoseFailure.ts, rules.ts, parseAssertionError.ts
  templates/        → HTML, CSS, JS embutidos no relatório
  types/            → config.ts, report.ts (contratos de tipo)
  utils/            → format.ts, fs.ts, safeJson.ts

test/
  unit/             → funções puras, sem I/O
  integration/      → com filesystem real via tmpdir
  e2e/              → spawn do CLI real contra fixture Cypress
    fixtures/       → projeto Cypress mínimo para testes E2E
  benchmarks/       → medição de performance com asserções de budget

Arquivos raiz de contexto:
  TEST_MAP.md         → qual teste cobre qual módulo (leia antes de implementar)
  PERFORMANCE_BUDGET.md → thresholds numéricos obrigatórios
  AGENTS.md           → versão universal destas instruções (Codex, ZCode)
```

---

## Fluxo de comunicação interno

```
Browser (Cypress runner)
  ↓ cy.task("faillens:addRequest", payload)
  ↓ cy.task("faillens:finishRequest", payload)
Node.js (registerNodeEvents.ts)
  ↓ persiste em .faillens/results/
  ↓ after:spec → consolida spec
  ↓ after:run  → generateReportArtifacts()
reporter/buildReportModel.ts → maskSensitiveData → generateHtml + generateJson
```

---

## Invariantes — NUNCA violar

### 1. Mascaramento antes de qualquer persistência
```
ERRADO:  fs.writeFile(path, JSON.stringify(specs))
CORRETO: fs.writeFile(path, JSON.stringify(maskSensitiveData(specs, maskFields)))

ERRADO:  console.log("response:", body)
CORRETO: (não logue dados de resposta — podem conter credenciais)
```
O mascaramento acontece em `buildReportModel.ts` antes de qualquer chamada a `generateHtml` ou `generateJson`. Nunca mova essa responsabilidade para depois.

### 2. Arquivos do projeto consumidor são intocáveis
- `cypress.config.js` do consumidor: **nunca modificar**
- `cypress/support/`, testes, `package.json` do consumidor: **nunca modificar**
- `.faillens/` é pasta temporária do FailLens, não do consumidor
- Os arquivos gerados em `.faillens/` podem ser sobrescritos a cada execução

### 3. Exit code do Cypress é preservado
```typescript
// CORRETO — padrão atual em run.ts
try {
  exitCode = await executeCypress(...)
} finally {
  await generateReportArtifacts(...)  // erro aqui não mascara o exitCode do Cypress
}
return exitCode  // sempre o código do Cypress, não do FailLens
```

### 4. HTML é 100% standalone
- Sem `<link href="..." rel="stylesheet">` externo
- Sem `<script src="...">` externo
- Sem CDN, Google Fonts, analytics, ou qualquer requisição externa
- CSS em `<style>`, JS em `<script>` inline, dados em `<script id="faillens-data">`

### 5. Zero dependências de runtime
- `package.json` não tem campo `"dependencies"` — só `"devDependencies"`
- Se precisar de algo: verifique Node stdlib primeiro (`fs`, `path`, `crypto`, `perf_hooks`, `url`, `util`)
- Nunca adicione uma dependência de runtime sem discussão explícita

### 6. Os 4 formatos de cy.request devem sempre funcionar
```javascript
cy.request('/health')                              // url-only
cy.request('GET', '/health')                       // method+url
cy.request('POST', '/users', { name: 'Ana' })      // method+url+body
cy.request({ method: 'POST', url: '/users', ... }) // options object
```
Qualquer mudança em `autoCapture.ts` ou `normalizeCyRequestArgs.ts` exige que todos os 4 continuem funcionando.

---

## Decision Ladder — avaliar ANTES de escrever qualquer código

Percorra esta sequência em ordem antes de implementar qualquer coisa:

**1. PRECISA EXISTIR?**
O comportamento pode ser alcançado compondo funções que já existem em `src/`?
Se sim → compose, não crie.

**2. JÁ ESTÁ NO CODEBASE?**
Busque em `src/` antes de escrever. Foque em `src/collector/` e `src/utils/`.
Se existir similar → adapte ou reutilize.

**3. ESTÁ NA STDLIB DO NODE?**
`fs`, `path`, `crypto`, `perf_hooks`, `util`, `url`, `os`, `child_process`
Se o stdlib resolve → use o stdlib.

**4. PODE SER INLINE?**
O código pode ficar no próprio chamador sem criar função ou módulo?
Se sim → deixe inline.

**5. PODE SER UMA LINHA?**
Pode ser uma expressão ou uma linha?
Se sim → faça em uma linha.

**6. SOMENTE ENTÃO:** escreva o mínimo que faça os testes passarem.

---

## Fluxo de trabalho TDAD — seguir em TODA tarefa

Ao receber qualquer tarefa ("implemente X", "corrija Y"):

```
1. Identifique os arquivos src/ que serão tocados
2. Leia TEST_MAP.md → encontre os testes correspondentes
3. Leia os arquivos de teste — eles são o contrato da feature
4. Se tocar em collector/ ou reporter/: leia PERFORMANCE_BUDGET.md
5. Aplique o Decision Ladder (seção acima) antes de escrever código
6. Implemente o mínimo que faça os testes passarem
7. Execute: npm test
8. Se falhar → autocorrija e volte ao passo 7
9. Se benchmark falhar → otimize antes de finalizar
10. Nunca finalize com testes falhando
```

**Regra TDAD crítica:** Simplesmente "seguir TDD" sem contexto piora os resultados.
O que funciona é ler TEST_MAP.md para ter contexto real de quais testes são afetados.

---

## Regras de performance

Ao modificar `src/collector/` ou `src/reporter/`:

- **Iteração única:** prefira single-pass sobre arrays a múltiplas passagens
- **`maskSensitiveData` usa WeakMap** para proteção contra circular refs — não remova
- **Não use JSON.parse/stringify em loops quentes** — só fora do loop principal
- **Não acumule strings** com `+=` em loops — use arrays e `.join()`
- **Verifique o budget:** após implementar, rode `npm run bench`

Budget atual (ver `PERFORMANCE_BUDGET.md` para thresholds exatos):
- 100 testes, 500 requests, 2KB de body médio → geração completa < 500ms
- Arquivo HTML resultante < 3MB

---

## Domínio Cypress — contexto necessário

- `cy.request` roda no **browser** (Cypress runner), não no Node.js
- `cy.task()` é o canal browser → Node.js — é o único mecanismo válido para enviar dados de request ao Node
- `setupNodeEvents(on, config)` é o hook Node.js do Cypress — é onde registramos os handlers de task
- `supportFile` é carregado no contexto do browser antes de cada spec
- O Cypress executa specs em isolamento — cada spec tem seu próprio contexto de browser

---

## Convenções de código

- **Sem comentários** exceto quando o "por quê" é não-óbvio
- **Sem console.log** em código de biblioteca (apenas em `src/cli/run.ts` com prefixo `[FailLens]`)
- **TypeScript estrito** — sem `any` explícito exceto em wrappers de Cypress (`declare const Cypress: any`)
- **Exports nomeados** — sem default exports exceto quando necessário para compatibilidade CJS
- **CJS** — o build gera CommonJS (`"module": "commonjs"` no tsconfig)

---

## Comandos

```bash
npm run build          # compila TypeScript → dist/
npm run dev            # compila em modo watch
npm test               # build + todos os testes (node:test)
npm run test:unit      # só testes unitários
npm run test:integration  # só testes de integração
npm run test:e2e       # só testes E2E (requer build)
npm run bench          # benchmarks de performance
npm pack --dry-run     # verifica o que seria publicado
```

---

## O que não fazer

- **Não adicionar jest, vitest, mocha ou qualquer framework de teste** — usar `node:test` nativo
- **Não criar abstrações para uso hipotético futuro** — implementar só o que o teste exige agora
- **Não logar request/response bodies** — contêm dados potencialmente sensíveis
- **Não modificar `.faillens/` diretamente** em testes — usar tmpdir isolado
- **Não commitar `.faillens/`** — está no gitignore e é temporário
- **Não usar `cypress.config.ts`** — suporte apenas a `.js` na v0.1
- **Não quebrar os testes existentes em `test/core.test.js` e `test/cli-run.test.js`**

---

## Estrutura de tipos — referência rápida

```typescript
// Os tipos principais estão em src/types/report.ts
FailLensReport        // raiz do relatório
  .specs[]            // FailLensSpec[]
    .tests[]          // FailLensTest[]
      .requests[]     // FailLensRequest[]
      .assertions[]   // FailLensAssertion[]
      .diagnosis      // FailLensDiagnosis
      .error          // FailLensError

// Fases de request (definidas por inferência em buildReportModel.ts)
"preparacao"   // login/auth antes da ação principal
"validacao"    // request principal do teste
"verificacao"  // GET após mutação para confirmar estado
"limpeza"      // DELETE após o teste
"chamada"      // qualquer outra chamada
```
