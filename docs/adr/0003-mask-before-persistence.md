# 0003 — Mascarar antes de persistir

- Estado: Aceita
- Data: 2026-06-28

## Contexto

`cy.request` pode transportar tokens, cookies, dados pessoais e payloads de negócio. Mascarar somente no HTML deixaria segredos em parciais ou no JSON.

## Decisão

Todo dado controlado por request/response é mascarado no `RequestStore`, antes da primeira gravação. `buildReportModel` aplica sanitização novamente para proteger entradas programáticas e os artefatos finais.

Logs não podem imprimir estruturas brutas de request, response ou erro.

## Consequências

- Parciais, JSON, HTML, cURL e reprodução devem conter apenas dados sanitizados.
- Novos campos precisam entrar no caminho de mascaramento antes de qualquer escrita.
- A dupla sanitização é intencional como defesa em profundidade.
- Testes de segurança devem procurar pela ausência de segredos sentinela em todos os artefatos.
