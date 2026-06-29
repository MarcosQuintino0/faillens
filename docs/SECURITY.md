# Segurança e privacidade

O FailLens processa payloads de API potencialmente sensíveis. Segurança aqui é um contrato funcional, não uma etapa opcional de acabamento.

## Modelo de ameaça

Os principais riscos considerados são:

- credenciais gravadas em parciais, JSON ou HTML;
- segredos expostos em cURL, erros, stack traces ou logs;
- recursos remotos carregados ao abrir o relatório;
- alterações inesperadas no projeto consumidor;
- dados enviados por telemetria ou serviços externos.

## Regra central

Dados devem ser mascarados antes da primeira persistência. O `RequestStore` mascara requests, responses, redirects, erros e assertions na entrada. `buildReportModel` aplica nova sanitização antes de gerar os artefatos finais.

Nunca mova a única barreira de sanitização para `generateJson` ou `generateHtml`: nesse ponto, parciais anteriores já poderiam ter sido gravados.

## Superfícies protegidas

- Headers de request e response.
- Bodies de request e response.
- Query strings e locations de redirect.
- Mensagens e stacks de erro.
- Assertions, expected e actual.
- Comandos cURL e scripts de reprodução.
- Resultados parciais em `.faillens/results/`.
- JSON e HTML finais.

## Regras de mascaramento

Os padrões ficam em `DEFAULT_MASK_FIELDS`, em `src/collector/sensitiveMask.ts`. A comparação de nomes é canônica e case-insensitive. `maskFields` da configuração acrescenta campos do domínio sem substituir os padrões.

Comportamentos especiais:

- Bearer token vira `Bearer <TOKEN>`.
- JWT reconhecido vira `<TOKEN>`.
- Query param sensível vira `***`.
- JSON embutido em string é analisado e mascarado.
- Referência circular vira `[Circular]`.

## Logs

É permitido registrar caminhos, estados gerais e mensagens operacionais. É proibido registrar headers, bodies, URLs completas não sanitizadas ou objetos brutos de erro/request/response.

## Relatório offline

O HTML não pode conter dependências remotas, telemetria ou chamadas de rede. Fonte, CSS, JavaScript e dados são embutidos. A exportação ou o upload do relatório é decisão explícita do pipeline consumidor, não do FailLens.

O template normaliza valores usados em atributos e inclui uma Content Security Policy que bloqueia conexões, formulários e base URLs. Como o relatório é standalone, scripts e estilos inline e fontes `data:` permanecem permitidos.

Para a evidência, `img-src` permite apenas recursos relativos da própria origem, `data:` e `blob:`. `connect-src 'none'` permanece inalterado. `data:`/`blob:` servem exclusivamente ao preparo efêmero do screenshot selecionado e não são persistidos.

## Servidor localhost opcional

O visualizador local não altera o contrato offline e não envia dados para a rede. Ele:

- escuta exclusivamente em `127.0.0.1`, nunca em `0.0.0.0`;
- exige um token aleatório de 192 bits em toda rota de dados;
- aceita somente headers `Host` correspondentes a `127.0.0.1` ou `localhost` na porta escolhida;
- aplica CSP, `nosniff`, `no-referrer`, `no-store` e isolamento same-origin;
- monta uma allowlist de screenshots a partir do JSON já sanitizado;
- valida extensão, `realpath` dentro do projeto e existência do arquivo, inclusive contra symlinks externos;
- não oferece endpoint genérico de filesystem;
- encerra depois que a última aba desconecta ou pelo timeout de inatividade.

O token é efêmero e não é persistido no relatório.

## Segurança de screenshots

- O path absoluto recebido de `after:screenshot` existe apenas em memória.
- A captura aceita somente `.png` dentro do `screenshotsFolder` e do projeto.
- `relativePath` não aceita segmentos `..`, drive, UNC, esquema ou path absoluto.
- `href` precisa ser relativo, codificado e terminar no mesmo `relativePath`; `javascript:`, `file:`, `data:` e URLs de rede são rejeitados no modelo.
- O reporter não usa `readFile` nos PNGs e o cliente não lê paths arbitrários de relatórios importados.
- O arquivo original nunca é alterado, movido ou removido.

## Scripts de reprodução

Todo valor usado como argumento de shell precisa ser validado ou protegido por quoting. Metadados exibidos em comentários são reduzidos a uma linha. A extração com `jq` aceita somente caminhos formados por identificadores seguros; chaves arbitrárias continuam no relatório, mas não viram comandos executáveis.

Objetos reconstruídos a partir de payloads devem preservar chaves como `__proto__` como propriedades próprias, sem acionar setters do protótipo. Mapas internos indexados por dados do relatório usam protótipo nulo.

## Integridade do consumidor

O FailLens cria instrumentação somente em `.faillens/`. Não altera configuração, support files ou specs do consumidor. A única exceção é `faillens init`, que adiciona um script sem sobrescrever um valor existente.

## Checklist para mudanças

- O novo campo pode conter segredo?
- Ele é mascarado antes de chegar ao filesystem?
- Ele aparece em erro, cURL, redirect ou script derivado?
- Há teste com um segredo sentinela ausente do artefato?
- A mudança introduz URL, recurso ou dependência externa?
- Algum log novo imprime dados controlados pela API testada?

Se qualquer resposta exigir exceção, registre a decisão antes de implementar.
