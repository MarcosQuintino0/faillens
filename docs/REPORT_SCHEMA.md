# Contrato do relatório

A fonte de verdade de tipos é `src/types/report.ts`. Este documento registra a semântica e a política de evolução do modelo persistido.

## Raiz: `FailLensReport`

| Campo | Obrigatório | Semântica |
|---|---:|---|
| `generatedAt` | sim | Data ISO da geração |
| `tool` | sim | Nome, pacote e versão do FailLens |
| `project` | não | Nome, run id e branch informados pela configuração |
| `theme` | não | Tema de apresentação (`dark` ou `light`) |
| `summary` | sim | Contadores e duração agregados |
| `specs` | sim | Specs e seus testes |
| `contracts` | não | Contratos JSDoc resolvidos (procedência); ausente quando não há contrato |

## `FailLensSummary`

Contém `tests`, `passed`, `failed`, `skipped`, `requests`, `durationMs` e `passRate`. `passRate` é percentual arredondado; sem testes, vale zero.

## `FailLensSpec`

- `specPath`: identidade do spec.
- `durationMs`: duração consolidada.
- `tests`: testes pertencentes ao spec.

## `FailLensTest`

Campos básicos: identidade, título, caminho do título, estado e duração.

Campos enriquecidos:

- `error`: erro normalizado e sanitizado.
- `assertions`: plano e resultados das assertions.
- `requests`: sequência capturada e sanitizada.
- `mainRequestId`: request considerada principal.
- `statusExpectation`: expectativa HTTP independente do payload.
- `payloadDiff`: marcadores de divergência/evidência.
- `diagnosis`: classificação determinística da falha.
- `reproductionScript`: reprodução gerada para teste falho.
- `evidence`: campo opcional com metadata de screenshots relacionados ao teste.
- `contractId`: contrato vinculado ao teste por `@regra:<id>`, quando resolvido.
- `ruleRefs`: vínculos teste→regra declarados nas tags, com `resolved` indicando se a regra existe no contrato.
- `tags`: tags de catálogo e operacionais autoradas no 2º argumento do `it` (ex.: `@obrigatoriedade`, `@bug`), na ordem do source. O vínculo `@regra:<id>` não entra aqui (vive em `ruleRefs`). Tags de catálogo via `CatalogoTags.X` aparecem resolvidas a valor quando o módulo de tags importado pôde ser lido.
- `facts`: procedência (interno; não renderizado no HTML). Ver "Procedência".
- `persistenceExpectation`: expectativa contratual tipada (`required`, `forbidden`, `preserve`, `remove` ou `not-specified`).
- `persistenceEvidence`: efeito comprovado pela sequência (`confirmed-created`, `confirmed-absent`, `confirmed-preserved`, `confirmed-removed` ou `not-verified`) e IDs das requests usadas como prova.
- `bddScenario`: cenário determinístico opcional, gerado somente para teste falho e usado na evidência para o desenvolvedor.

### Cenário BDD (`bddScenario`)

`bddScenario.text` contém o Gherkin pronto para exibição/cópia. `lines` preserva a forma auditável: cada item possui `keyword` (`DADO`, `E`, `QUANDO`, `ENTÃO` ou `MAS`), `text` e uma lista não vazia de `sources`. Cada source contém `kind` (`request`, `assertion`, `contract`, `error` ou `persistence`) e um `id` rastreável no teste/contrato.

O cenário é produzido por templates fixos, sem IA generativa. Linhas sem evidência são omitidas; normalmente há entre quatro e seis linhas. A operação usa o endpoint do contrato somente quando existe uma única rota contratual compatível com o método principal; caso contrário usa a URL observada sanitizada. Conflitos entre assertion e contrato são escritos explicitamente. Consequências de persistência aparecem somente para `confirmed-*`. Testes aprovados e estados `not-verified` não geram BDD/conclusão posterior.

### Criação de chamado

O chamado não cria um novo campo no schema. `buildIssueContent` compõe em memória os dados já sanitizados de `FailLensTest`, `FailLensContract` e `FailLensSpec`, e os renderizadores produzem `text/plain` e `text/html`. A ordem fixa é: título, contexto, BDD, resultado atual, resultado esperado, request, response, comparação, falha, cURL, evidência visual e rastreabilidade. Metadata opcional ausente degrada para texto neutro sem impedir a cópia.

### Procedência (`facts` e `contracts`)

`facts` é o modelo interno de procedência. Cada fato carrega `source` em
`observed | asserted | contract | verified | not-verified`, um `kind` (ex.:
`received-status`, `expected-status`, `rule-status`, `rule-message`,
`request-field-absent`, `persistence-expectation`, `persistence-evidence`) e
referências opcionais (`requestId`, `contractId`, `ruleId`). Quando `asserted` e
`contract` divergem na mesma `dimension`, os fatos envolvidos listam `conflictsWith`
e ambos são preservados — o relatório nunca escolhe silenciosamente uma fonte.

`statusExpectation.source` registra se a expectativa veio de assertion (`asserted`)
ou de regra contratual (`contract`).

`contracts` (raiz) lista os contratos JSDoc resolvidos: `id`, `api`, `fields`,
`rules` (com `id`, `status`, `message`, `attributes`), `cobertura`, `legacy` e
`warnings` de parse. Esse modelo é interno e mascarado antes da persistência; o
usuário final verá texto natural, não o JSON de procedência.

Contratos repetidos com o mesmo ID são consolidados somente quando suas definições coincidem. Regras ou campos divergentes geram `conflicting-rule`/`conflicting-field`; uma regra conflitante não resolve o vínculo do teste. `sourceFiles` contém paths relativos normalizados com `/`.

### Estado de persistência

O atributo JSDoc `persistence` declara somente a expectativa da regra. Valores fora do enum geram `invalid-persistence` e não viram expectativa tipada. A evidência é calculada separadamente e nunca é aceita a partir do JSDoc ou de campos fornecidos no modelo de entrada.

- `confirmed-created`: POST 2xx seguido por GET correlacionado ao ID/variável retornada e com os dados enviados presentes na resposta. Um ID sozinho não basta.
- `confirmed-absent`: POST rejeitado seguido por GET 404 inequivocamente ligado ao mesmo recurso.
- `confirmed-preserved`: PUT/PATCH rejeitado, com GET anterior e posterior do mesmo recurso e respostas idênticas.
- `confirmed-removed`: DELETE 2xx seguido por GET 404 do mesmo recurso.
- `not-verified`: sequência ausente, incompleta, sem correlação ou ambígua. Esse estado impede conclusões; não significa que o efeito ocorreu ou deixou de ocorrer.

Um POST duplicado seguido por GET 200 do registro original permanece `not-verified`, pois essa consulta não prova unicidade nem ausência de uma segunda gravação. A expectativa usa `contractId`/`ruleId`; a evidência usa `mutationRequestId`, `verificationRequestId` e, para preservação, `baselineRequestId`. Somente estados `confirmed-*` recebem `summary`; `not-verified` não gera texto. O HTML apresenta esse resumo na comparação existente e não cria uma seção chamada “Evidência de persistência”.

`ruleRefs` é resolvido primeiro dentro do contrato associado ao diretório do spec. Isso permite que APIs diferentes reutilizem IDs legíveis, como `descricao-obrigatoria`. Quando o diretório não identifica exatamente um contrato, a resolução global só ocorre se houver uma única candidata.

### `FailLensScreenshot`

`evidence.screenshots` preserva todas as imagens associadas em ordem de preferência. Cada item contém `relativePath`, `href`, `fileName`, `size`, `kind` (`failure` ou `manual`) e, quando disponíveis, `width`, `height`, `takenAt` e `attempt`.

`relativePath` e `href` são relativos e normalizados com `/`. O schema nunca contém path absoluto, bytes de PNG, Blob, base64 ou data URL. Relatórios anteriores sem `evidence` permanecem válidos.

## `FailLensRequest`

Registra ordem, fase, método, URL, request, response, duração, redirects, erro e cURL. `generatedVariables` e `usedVariables` descrevem encadeamentos reconhecidos na reprodução.

As fases possíveis são:

- `preparacao`
- `validacao`
- `verificacao`
- `limpeza`
- `chamada`

## Diagnóstico

`FailLensDiagnosis` contém categoria, confiança, título, resumo, evidências e ação sugerida. A lista atual de categorias está em [`BEHAVIORS.md`](BEHAVIORS.md) e no union type de `src/types/report.ts`.

## Compatibilidade

Até existir versionamento explícito do schema, trate o JSON como contrato público da versão do pacote:

- adicionar campo opcional é uma mudança compatível;
- adicionar campo obrigatório exige atualização coordenada de produtores, HTML e testes;
- renomear, remover ou mudar a semântica de campo é incompatível;
- consumidores devem tolerar campos opcionais ausentes e campos desconhecidos.

## Procedimento para alterar o modelo

1. Confirmar que o comportamento exige o campo.
2. Atualizar `src/types/report.ts`.
3. Preencher o campo em `buildReportModel` ou no ponto de captura apropriado.
4. Garantir sanitização antes da persistência.
5. Atualizar os testes de modelo, JSON e HTML afetados.
6. Atualizar este documento e `TEST_MAP.md`.
7. Executar `npm test` e, se `reporter` mudou, `npm run bench`.
