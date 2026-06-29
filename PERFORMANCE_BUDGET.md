# PERFORMANCE_BUDGET — Limites de Performance FailLens

> Leia este arquivo antes de modificar src/collector/ ou src/reporter/.
> Os limites abaixo são asserções executadas por `npm run bench`.

---

## Por que performance importa neste projeto

FailLens gera relatórios logo após o Cypress terminar, dentro do mesmo pipeline de CI.
Suites grandes podem ter centenas de testes e milhares de requests capturados.
Um relatório lento atrasa o feedback do CI e prejudica a experiência do desenvolvedor.

As operações críticas são:
1. `maskSensitiveData` — recursiva, executada sobre cada request (headers + body)
2. `buildReportModel` — itera specs × testes × requests, aplica mascaramento, infere diagnóstico
3. `generateHtml` — serializa o relatório completo em JSON embutido no HTML
4. `generateJson` — escreve o JSON no disco

---

## Fixture de referência

Todos os limites abaixo usam a mesma fixture definida em `test/benchmarks/fixtures/large-report.js`:

```
10 specs
  × 10 testes por spec    = 100 testes totais
    × 5 requests por teste = 500 requests totais
      body médio: 2KB de payload JSON por request
      headers: 5 headers por request (incluindo Authorization)
```

Esta fixture representa uma suite de API de médio porte.

---

## Limites obrigatórios

| Operação | Input | Limite máximo | Script |
|----------|-------|---------------|--------|
| `buildReportModel(specs)` | fixture de referência (100t/500r) | **400ms** | `generation.bench.js` |
| `generateHtml(report, dir)` | relatório completo gerado acima | **200ms** | `generation.bench.js` |
| `generateJson(report, dir)` | relatório completo gerado acima | **150ms** | `generation.bench.js` |
| Pipeline completo (model+html+json) | fixture de referência | **500ms** | `generation.bench.js` |
| `maskSensitiveData(obj)` | objeto único com 100 campos aninhados | **5ms** | `masking.bench.js` |
| `maskSensitiveData(obj)` | objeto com 1.000 campos aninhados | **30ms** | `masking.bench.js` |
| `maskSensitiveData(obj)` | objeto com 10.000 campos aninhados | **150ms** | `masking.bench.js` |
| `maskUrl(url)` | URL com 20 query params | **1ms** | `masking.bench.js` |

---

## Limites de tamanho de saída

| Artefato | Input | Limite máximo |
|----------|-------|---------------|
| `index.html` | fixture de referência (100t/500r/2KB) | **5MB** |
| `faillens-report.json` | fixture de referência | **5MB** |

Arquivos maiores que estes limites prejudicam o carregamento no browser e aumentam o custo de artefatos de CI.

---

## Como os benchmarks funcionam

Os benchmarks em `test/benchmarks/` usam `perf_hooks` do Node stdlib:

```javascript
const { performance } = require("node:perf_hooks")
const start = performance.now()
// ... operação a medir ...
const elapsed = performance.now() - start
assert.ok(elapsed < LIMITE_MS, `Esperado < ${LIMITE_MS}ms, obtido ${elapsed.toFixed(1)}ms`)
```

Cada benchmark executa a operação **5 vezes** e valida a **mediana** (não o mínimo).
Isso reduz ruído de cold start e garbage collection.

---

## Regras de implementação para manter o budget

### maskSensitiveData
- A função usa `WeakMap` para detectar circulares — NÃO remover
- A canonicalização de chaves (`toLowerCase().replace(/[^a-z0-9]/g, "")`) é chamada frequentemente — o `sensitiveSet` deve ser criado uma vez por chamada, não por campo
- Não fazer `JSON.parse(JSON.stringify(value))` para "clonar" — é O(n) desnecessário
- Strings que parecem JSON passam por `JSON.parse` → re-`walk` — este é o único case aceitável

### buildReportModel
- A iteração `specs → tests → requests` não deve ser aninhada além de 3 níveis
- `inferMainRequest` é O(n) sobre requests do teste — aceitável
- `findGeneratedVariables` usa `visited: Set<object>` para evitar loops circulares
- `annotateRequests` é uma única passagem — não introduzir segunda passagem

### generateHtml
- `JSON.stringify(report)` é chamado uma vez para embutir dados
- `safeEmbeddedJson` escapa `<`, ` `, ` ` — necessário para segurança XSS
- Não fazer múltiplos `stringify` ou passar pelo template em múltiplos estágios
- O CSS e JS embutidos são strings de módulo pré-compiladas — não processar em runtime

---

## Como reagir se o benchmark falhar

1. **Identifique a operação lenta** — o output do benchmark mostra qual etapa passou do limite
2. **Profile com `--inspect`**: `node --inspect test/benchmarks/generation.bench.js`
3. **Verifique o que mudou**: `git diff src/` — a regressão provavelmente está na mudança mais recente
4. **Aplique as regras acima** para a operação identificada
5. **Não relaxe o limite** — ajuste o código, não o budget

---

## Execução

```bash
npm run bench                             # todos os benchmarks
node test/benchmarks/generation.bench.js  # só geração
node test/benchmarks/masking.bench.js     # só mascaramento
```

## Pipeline e matrizes ampliadas

`generation.bench.js` faz warm-up e usa mediana de 5 execuções até 1.000 testes. Fixtures de 2.000 e 2.500 testes usam 2 execuções para limitar custo de CI. Todo diretório temporário é removido em `finally`.

| Medição | Limite |
|---|---:|
| Captura/RequestStore — 100 testes, 500 requests | 300 ms |
| `buildReportModel` — referência 100/500, body 2 KB | 400 ms |
| Serialização HTML | 200 ms |
| Serialização JSON | 150 ms |
| Escrita HTML + JSON em paralelo | 300 ms |
| Pipeline real de referência | 500 ms |
| Pipeline até 2.500 testes/12.500 requests | 8 s |
| RSS isolado até 2.500 testes | 1.200 MB |

Contratos relacionais:

- 2.500 testes custam no máximo 3 vezes o cenário de 1.000;
- 200 requests em um teste custam no máximo 3 vezes o cenário de 100;
- metadata em 80% dos testes falhos acrescenta no máximo 10% de tempo (com tolerância mínima de 10 ms para ruído) e 1 KB por teste falho;
- heap e tamanho dos artefatos de 2.500 testes ficam em até 3 vezes o cenário de 1.000;
- fixtures de screenshot contêm somente metadata/path fictício e rejeitam assinaturas PNG/base64.

Output esperado (quando dentro do budget):
```
[BENCH] buildReportModel (100t/500r): 187ms  ✓ (limite 400ms)
[BENCH] generateHtml:                  94ms  ✓ (limite 200ms)
[BENCH] generateJson:                  41ms  ✓ (limite 100ms)
[BENCH] Pipeline completo:            322ms  ✓ (limite 500ms)
[BENCH] HTML size:                   1.8MB  ✓ (limite 5MB)
[BENCH] JSON size:                   0.9MB  ✓ (limite 3MB)
```
