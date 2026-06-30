# ADR 0007 — Criação de chamados na terceira aba

## Status

Aceito.

## Contexto

O relatório já possuía uma aba de evidência com BDD, cURL e screenshot. Criar uma quarta aba para o chamado duplicaria conteúdo e ações. Persistir um segundo modelo de chamado também duplicaria o schema e aumentaria o risco de divergência em relação aos dados sanitizados do relatório.

## Decisão

Transformar a terceira aba em **Criar chamado** e compor o documento completo em memória.

- `buildIssueContent` usa somente teste, contrato vinculado e dados já sanitizados.
- `buildEvidenceText` e `buildEvidenceHtml` preservam a ordem fixa das doze seções aprovadas.
- Request, response, comparação e rastreabilidade são derivados deterministicamente; ausência de metadata opcional não impede a geração.
- Mensagens aparecem somente quando uma assertion ou regra vinculada as fornece. Diagnóstico heurístico não é tratado como fato.
- O clipboard tenta `text/plain`, `text/html` e `image/png`, mantendo o chamado textual completo nos fallbacks.
- Não há integração direta com Jira/GitHub/Azure nem transmissão de dados: o usuário controla o destino ao colar.

## Consequências

- Nenhum campo novo é adicionado ao JSON persistido.
- A antiga ação **Copiar evidência** passa a ser **Copiar chamado**.
- O screenshot continua sendo o arquivo oficial do Cypress e só é convertido em memória quando o navegador permite.
- O HTML permanece standalone, local e sem dependências de runtime.
