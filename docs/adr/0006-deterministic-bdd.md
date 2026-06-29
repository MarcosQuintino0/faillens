# ADR 0006 — BDD determinístico para chamados

## Status

Aceito.

## Contexto

O FailLens precisa transformar execução, assertions e contrato em um cenário curto para chamados. Texto livre ou IA generativa poderia inventar causa, tratar uma expectativa como fato observado ou afirmar uma consequência de persistência sem consulta comprobatória. O relatório já possui procedência determinística e evidência sanitizada.

## Decisão

Gerar `bddScenario` somente para testes falhos por meio de templates fixos em `buildBddScenario.ts`.

- Cada linha persiste keyword, texto e uma ou mais referências de origem (`request`, `assertion`, `contract`, `error` ou `persistence`).
- Linhas sem fonte suficiente são omitidas e o cenário normalmente fica entre quatro e seis linhas.
- A request principal usa `operation=` de uma regra resolvida como discriminador mais forte. Quando setup e ação compartilham o método contratual, a última chamada compatível vence.
- Endpoint contratual é usado apenas quando há exatamente uma rota compatível com o método; caso contrário prevalece a URL observada sanitizada.
- Conflitos entre assertion e contrato são apresentados, nunca resolvidos silenciosamente.
- Consequências posteriores exigem `persistenceEvidence` confirmado.
- O BDD aparece apenas na aba **Evidência para o dev** e no clipboard dessa evidência. Request, response e cURL permanecem nas superfícies existentes.

## Consequências

- O JSON recebe o campo opcional `bddScenario`, mantendo compatibilidade com consumidores anteriores.
- Testes aprovados não aumentam o relatório com BDD.
- O gerador opera após o mascaramento e não recebe dados brutos do consumidor.
- Templates cobrem apenas informações demonstráveis; condições sem metadata explícita, como “token expirado”, são omitidas.
- A renderização continua offline e sem dependências de runtime.
