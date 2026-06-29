# Registros de decisões arquiteturais

ADRs registram decisões duráveis que tiveram alternativas relevantes. Eles não substituem documentação de comportamento nem devem ser criados para toda implementação.

## Estados

- `Proposta`: ainda em discussão.
- `Aceita`: regra vigente.
- `Substituída`: outra ADR tomou seu lugar.

## Índice

- [0001 — Zero dependências de runtime](0001-zero-runtime-dependencies.md)
- [0002 — Arquivos do consumidor são imutáveis](0002-consumer-files-immutable.md)
- [0003 — Mascarar antes de persistir](0003-mask-before-persistence.md)

## Modelo

```md
# NNNN — Título

- Estado: Proposta | Aceita | Substituída por ADR-NNNN
- Data: AAAA-MM-DD

## Contexto
## Decisão
## Consequências
```
