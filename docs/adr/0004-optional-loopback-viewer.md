# ADR 0004 — Visualizador loopback opcional

## Status

Aceito.

## Contexto

O relatório standalone é portátil e não exige processo ativo, mas navegadores tratam arquivos `file://` como origem opaca em operações de canvas e restringem o clipboard rico. Embutir screenshots em base64 aumentaria os artefatos e duplicaria dados. Tornar um servidor obrigatório pioraria arquivamento e uso em CI.

## Decisão

Manter `index.html` como artifact standalone e adicionar `faillens open` como visualizador opcional em `127.0.0.1`. `faillens run --open` combina geração e abertura. O servidor usa somente Node stdlib, token efêmero, allowlist derivada do relatório e encerramento automático após a última aba.

## Consequências

- O fluxo existente continua funcionando sem servidor.
- O localhost fornece origem estável para PNG e clipboard rico.
- A permissão do clipboard permanece decisão do navegador.
- Há uma nova superfície HTTP, coberta por bind loopback, token, validação de Host, CSP e testes de traversal.
- A CLI e os testes ganham lógica de lifecycle, mas o usuário não precisa escolher porta nem encerrar o servidor manualmente.
