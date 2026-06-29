# 0001 — Zero dependências de runtime

- Estado: Aceita
- Data: 2026-06-28

## Contexto

O FailLens é executado dentro de projetos e pipelines consumidores. Dependências de runtime aumentariam superfície de supply chain, tempo de instalação, conflitos e necessidade de atualizações.

## Decisão

O pacote publicado usará apenas APIs do Node.js para seu runtime. Ferramentas de compilação e desenvolvimento podem permanecer em `devDependencies`.

## Consequências

- Funcionalidades devem preferir `node:fs`, `node:path`, `node:url`, `node:crypto`, `node:child_process` e demais módulos nativos.
- `package.json` não deve ganhar `dependencies` sem substituir esta ADR.
- Algumas implementações podem ser mais explícitas do que seriam com bibliotecas externas.
- A instalação e a auditoria do pacote permanecem pequenas e previsíveis.
