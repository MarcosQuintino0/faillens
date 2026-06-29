# Estratégia de testes

O FailLens usa `node:test` nativo. Não adicione Jest, Vitest, Mocha ou outra dependência de runtime/teste sem uma decisão explícita do projeto.

## Pirâmide usada pelo projeto

| Camada | Local | Uso |
|---|---|---|
| Unitário | `test/unit/` | Funções puras, regras e casos de borda |
| Integração | `test/integration/` | Filesystem, configuração e artefatos reais |
| Fluxo CLI | `test/cli-run.test.js` | Orquestração com Cypress simulado |
| E2E/fixtures | `test/e2e/` | Projeto Cypress mínimo e suporte a execução real |
| Benchmark | `test/benchmarks/` | Tempo e tamanho dos artefatos |

O índice módulo → testes fica em [`../TEST_MAP.md`](../TEST_MAP.md).

## Escolha do teste

- Regra pura ou parser: teste unitário.
- Arquivo gerado ou configuração lida: integração.
- Sequência completa da CLI ou preservação de exit code: fluxo CLI/E2E.
- Mudança em `collector` ou `reporter`: além dos testes funcionais, execute benchmarks.
- Correção de bug: primeiro acrescente um caso que reproduza a regressão.

Não duplique um cenário já coberto em camada mais apropriada. Acrescente o menor caso que prove o novo contrato.

## Contratos obrigatórios

- Os quatro formatos de `cy.request` continuam funcionando.
- Nenhum segredo aparece em JSON, HTML, cURL ou parciais.
- O HTML continua standalone.
- O servidor opcional escuta apenas em loopback, exige token e não permite traversal.
- Arquivos do consumidor permanecem intactos, exceto a adição controlada feita por `init`.
- O código de saída definido para a execução Cypress é preservado pelo fluxo.
- Toda categoria de diagnóstico possui fixture.
- Toda alteração no schema possui teste de serialização/modelo.

## Comandos

```bash
npm run build
npm run test:unit
npm run test:integration
npm run test:e2e
npm test
npm run bench
npm pack --dry-run
```

`npm test` já executa o build por meio de `pretest`.

## Performance

Antes de modificar `src/collector/` ou `src/reporter/`, leia [`../PERFORMANCE_BUDGET.md`](../PERFORMANCE_BUDGET.md). Não aumente limites para acomodar uma regressão sem uma decisão arquitetural registrada.

## Fixtures

- Use valores obviamente fictícios.
- Inclua segredos sentinela para provar que foram removidos.
- Mantenha fixtures pequenas, exceto as de benchmark.
- Uma categoria de diagnóstico deve ter ao menos uma fixture positiva.
- Quando a ordem das regras importar, inclua um caso que prove a precedência.

## Checklist antes de finalizar

1. Consultar `TEST_MAP.md` para os módulos alterados.
2. Executar os testes diretamente relacionados durante a implementação.
3. Executar `npm test` antes da entrega.
4. Executar `npm run bench` quando `collector` ou `reporter` mudarem.
5. Atualizar `TEST_MAP.md` quando arquivos ou responsabilidades mudarem.
6. Atualizar `BEHAVIORS.md` apenas quando o contrato observável mudar.

## Matriz manual de evidência

Não afirmar compatibilidade com Jira sem executar o destino real. Para cada release com mudança de clipboard, validar tanto `file://` quanto `faillens open` e registrar:

| Navegador | Abrir screenshot | Copiar texto | Copiar imagem/rico | Fallback canvas/ClipboardItem | Colar em campo simples | Colar no Jira |
|---|---|---|---|---|---|---|
| Chrome | manual | manual | manual | manual | manual | não validado |
| Edge | manual | manual | manual | manual | manual | não validado |
| Firefox | manual | manual | manual | manual | manual | não validado |

Os testes automatizados cobrem montagem determinística de texto/HTML, feature detection, promises de sucesso/falha, fallback textual, link seguro, CSP e ausência de PNG/base64. Eles não substituem permissões reais do navegador nem o editor do Jira.

O teste do servidor cobre bind, token, Host, allowlist, MIME e encerramento. A validação manual deve confirmar abertura no navegador, PNG em mesma origem, fechamento da última aba e ausência de processo Node órfão.
