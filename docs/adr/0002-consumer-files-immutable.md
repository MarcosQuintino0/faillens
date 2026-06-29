# 0002 — Arquivos do consumidor são imutáveis

- Estado: Aceita
- Data: 2026-06-28

## Contexto

Instrumentar Cypress alterando sua configuração ou support file poderia sobrescrever decisões do consumidor, causar conflitos e deixar resíduos após falhas.

## Decisão

O fluxo normal cria configuração e support file derivados somente em `.faillens/`. Configuração, specs e arquivos de suporte do consumidor são apenas lidos.

A exceção explícita é `faillens init`: ele pode adicionar um script ao `package.json`, mas não pode sobrescrever um script existente.

## Consequências

- A instrumentação é descartável e reproduzível.
- `.faillens/` deve permanecer ignorado pelo Git.
- Novas integrações precisam funcionar por composição/configuração gerada.
- Qualquer nova escrita fora de `.faillens/` e do diretório de saída exige uma nova decisão.
