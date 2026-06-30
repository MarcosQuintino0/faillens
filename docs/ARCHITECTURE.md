# Arquitetura do FailLens

Este documento descreve as fronteiras e o fluxo de dados do FailLens. Para regras obrigatórias de implementação, consulte [`../AGENTS.md`](../AGENTS.md).

## Visão geral

O FailLens é uma biblioteca npm e uma CLI em TypeScript para Node.js 18 ou superior. Ele executa o Cypress com instrumentação temporária, captura chamadas `cy.request` e produz um relatório HTML offline e um JSON sanitizado.

```text
CLI
  -> detecta o projeto Cypress
  -> gera configuração temporária em .faillens/
  -> executa o Cypress

Cypress browser
  -> sobrescreve cy.request
  -> envia eventos por cy.task

Cypress Node
  -> acumula e mascara os dados
  -> salva parciais sanitizados
  -> consolida specs

Reporter
  -> infere contexto e diagnóstico
  -> gera JSON + HTML standalone

Visualizador local opcional
  -> serve o mesmo HTML em 127.0.0.1
  -> entrega apenas PNGs presentes no relatório
  -> encerra após a última aba
```

## Componentes

### CLI (`src/cli`)

- `index.ts`: interpreta comandos e argumentos.
- `run.ts`: detecta, instrumenta, executa e finaliza o relatório.
- `init.ts`: adiciona somente o script do FailLens ao `package.json` do consumidor.
- `generate.ts`: regenera artefatos a partir de JSON existente.
- `open.ts`: localiza o relatório, inicia o visualizador e abre o navegador.
- `config.ts`: resolve a configuração e seus valores padrão.
- `detectCypress.ts`: valida e localiza a instalação Cypress suportada.

### Integração Cypress (`src/cypress`)

- `createInstrumentedConfig.ts`: cria os arquivos temporários em `.faillens/` sem alterar a configuração do consumidor.
- `support/autoCapture.ts`: sobrescreve `cy.request` no browser.
- `support/hooks.ts`: acompanha o teste ativo e suas assertions.
- `registerNodeEvents.ts`: registra tasks e eventos do processo Node do Cypress.

O browser não acessa diretamente o filesystem Node. `cy.task` é a fronteira entre os dois contextos.

### Coleta (`src/collector`)

- Normaliza as quatro assinaturas de `cy.request`.
- Acumula requests e resultados por spec/teste.
- Mascara dados sensíveis antes de armazená-los.
- Gera comandos cURL sanitizados.
- Extrai estaticamente o plano de assertions do source do spec.
- Extrai estaticamente o contrato JSDoc (`parseContractJsdoc.ts`) e o vínculo teste→regra `@regra:<id>` (`extractTestTags.ts`).

### Relatório (`src/reporter`, `src/templates`)

- `buildReportModel.ts`: sanitiza novamente e enriquece o modelo, resolve contratos e monta os facts de procedência.
- `provenance/resolveContracts.ts`: consolida contratos por `@contrato` e resolve o vínculo teste→regra (cross-spec).
- `provenance/buildFacts.ts`: monta os facts, separa expectativa contratual de evidência observada de persistência e marca conflitos entre fontes.
- `buildBddScenario.ts`: transforma somente fatos sanitizados em linhas BDD tipadas, cada uma com referências de origem.
- `evidence.ts`: compõe em memória o chamado completo e gera as representações `text/plain`/`text/html`; nenhum segundo modelo é persistido.
- `buildPayloadDiff.ts`: identifica evidências de divergência no payload.
- `diagnostics/`: classifica falhas por regras determinísticas.
- `generateJson.ts`: grava o contrato de dados.
- `generateHtml.ts` e `src/templates/`: produzem o HTML standalone, incluindo fonte, CSS, JavaScript e dados.

### Visualizador local (`src/server`)

`localReportServer.ts` usa somente Node stdlib. Ele escuta exclusivamente em `127.0.0.1`, cria um token aleatório por sessão e expõe somente o HTML, o JSON, health/lifecycle e screenshots que constam na allowlist do relatório sanitizado. O servidor não é necessário para gerar, arquivar ou abrir o HTML standalone.

## Ciclo de execução

1. `runCommand` carrega a configuração e detecta o Cypress.
2. `createInstrumentedConfig` cria configuração e support file em `.faillens/`.
3. O Cypress é iniciado com `--config-file` apontando para a configuração gerada.
4. Os hooks identificam o teste ativo e `autoCapture` observa cada `cy.request`.
5. Tasks enviam request, response e resultado ao `RequestStore`.
6. O `RequestStore` mascara os dados na entrada.
7. `after:screenshot` registra somente metadata validada do PNG oficial; a associação por spec, título, tentativa e horário ocorre em `after:spec`.
8. `after:spec` grava um parcial sanitizado em `.faillens/results/`.
9. `buildReportModel` consolida, mascara novamente e adiciona fases, expectativas, diferenças, diagnóstico, reprodução e evidência segura.
10. No fluxo CLI, o `finally` é o único responsável por `generateJson` + `generateHtml`; o `after:run` mantém geração apenas no uso direto de `registerNodeEvents`.
11. A CLI retorna o código de saída resultante da execução, inclusive quando a finalização do relatório falha.
12. Quando solicitado por `open` ou `run --open`, o visualizador usa uma porta livre, abre o navegador e encerra após a última conexão de aba ou timeout de inatividade.

## Screenshots e evidência

`src/cypress/screenshotEvidence.ts` é a fronteira entre o path absoluto efêmero entregue pelo Cypress e o modelo persistido. Ele valida que o arquivo pertence ao `screenshotsFolder`, aceita apenas PNG, normaliza Windows/POSIX, produz `relativePath`/`href` e descarta o caminho absoluto. Bytes da imagem nunca entram no pipeline do reporter.

No cliente, somente o screenshot do teste selecionado pode ser preparado, e apenas após abrir a aba de evidência. Em `file://`, a referência usa o PNG original e mantém os fallbacks. Em localhost, o cliente busca o mesmo PNG por um endpoint autenticado, converte-o diretamente em `Blob` e mantém a conexão de lifecycle usada no encerramento automático.

## Fronteiras de persistência

| Local | Finalidade | Pode conter segredo em claro? |
|---|---|---|
| `.faillens/` | Configuração e resultados temporários | Não |
| `reports/faillens/faillens-report.json` | Modelo portátil do relatório | Não |
| `reports/faillens/index.html` | Relatório offline | Não |

Mascarar na entrada protege os parciais. Mascarar novamente em `buildReportModel` protege chamadas programáticas que não passaram pelo `RequestStore`.

## Restrições arquiteturais

- Nenhuma dependência de runtime.
- Nenhuma rede, telemetria ou recurso remoto.
- Nenhuma alteração nos arquivos Cypress do consumidor.
- HTML standalone totalmente autocontido, com visualizador localhost opcional.
- Comunicação browser para Node somente por tasks Cypress.
- Diagnósticos determinísticos, sem IA em runtime.

## Onde registrar mudanças

- Mudança de arquitetura: este documento e, se houver decisão com alternativas relevantes, um ADR.
- Mudança observável: [`BEHAVIORS.md`](BEHAVIORS.md).
- Mudança no modelo: [`REPORT_SCHEMA.md`](REPORT_SCHEMA.md).
- Mudança de testes: [`TESTING.md`](TESTING.md) e [`../TEST_MAP.md`](../TEST_MAP.md).
- Mudança de segurança: [`SECURITY.md`](SECURITY.md).
