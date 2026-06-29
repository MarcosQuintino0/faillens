# Ecossistema FailLens

> Como os **agents de IA genéricos**, os **testes no padrão de qualidade de API** e a
> biblioteca **FailLens** formam um sistema fechado de qualidade de API: **a IA lê o
> backend, escreve testes com oráculo, e o FailLens transforma a execução em um relatório
> de diagnóstico acionável — não apenas "passou/falhou".**

Este documento é a **fonte única da visão**. Ele responde a três perguntas que nenhum
documento isolado consegue responder:

1. Por que o padrão de escrita de testes é tão rígido sobre JSDoc `@contrato`, `@regra` e tags?
2. Por que o FailLens consegue diagnosticar falhas de forma mais rica que um reporter genérico?
3. Como essas duas metades — padrão de escrita e biblioteca de relatório — se reforçam?

Se você está contribuindo com o FailLens, escrevendo testes, ou programando um agente
executor de testes, leia isto **antes** dos outros docs. O `README.md` descreve a biblioteca
isolada; os `pattern/*.md` descrevem o padrão isolado; **só este documento mostra por que
eles só funcionam juntos**.

---

## 1. O problema que o ecossistema resolve

### O reporter genérico só sabe "expected vs actual"

Todo reporter de teste (Allure, Cypress Cloud, Mochawesome, ReportPortal) opera sobre o
mesmo modelo mínimo: o teste falhou em `expect(x).to.eq(400)` recebendo `201`, e o reporter
mostra `expected 400, got 201`. Isso é útil, mas **incompleto** para triagem de QA, porque
deixa três perguntas sem resposta:

1. **Por que `400` era o valor esperado?** — qual regra contratual define isso?
2. **Qual campo/condição causou a divergência?** — o que no payload ou na resposta violou a regra?
3. **Isso é um defeito do backend ou um teste quebrado?** — o vermelho é esperado (bug) ou acidental?

Sem essas respostas, a triagem vira trabalho manual: abrir o teste, abrir o backend, comparar
com o contrato, decidir o que fazer. Num projeto com centenas de testes de API, isso escala mal.

### A causa raiz: o oráculo não está acessível à máquina

Um reporter genérico não consegue responder às três perguntas porque o **oráculo** (o critério
que define o comportamento correto) **está na cabeça de quem escreveu o teste**, não no código.
O `expect(...).to.eq(400)` diz *o que* é esperado, mas não *por que*. O "por que" mora no
contrato da API, em decisões de produto, em documentação que o reporter nunca vê.

### A tese do FailLens

> Se o teste **carregar o oráculo de forma legível por máquina**, e o reporter **souber lê-lo**,
> então o diagnóstico deixa de ser "a assertion falhou" e passa a ser "a regra `codigo-obrigatorio`
> foi violada: a API aceitou um payload que o contrato define como inválido".

O ecossistema FailLens existe para fechar esse ciclo: tornar o oráculo **explícito e estruturado**
no teste, e tornar o relatório **um leitor desse oráculo**.

---

## 2. Os três componentes do ecossistema

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   AGENTS DE IA  ──►  TESTES NO PADRÃO DE API  ──►  BIBLIOTECA FAILLENS  │
│   (escrevem)          (carregam oráculo)            (lêem o oráculo)    │
│                                                                         │
│   .ai/agents/         cypress/e2e/00-apis/          faillens (npm)      │
│   - api-criador       - JSDoc @contrato             - captura cy.request│
│   - api-mapeador      - @campo / @regra             - parseContractJsdoc│
│   - api-preparador    - CatalogoTags                - extractTestTags   │
│   - api-revisor       - @regra:<id>                 - provenance/facts  │
│   - api-pattern       - phase nas requests          - diagnóstico       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

Cada componente tem uma responsabilidade que **os outros não podem assumir**.

### 2.0. Premissa fundamental: agents genéricos, contrato de metadados compartilhado

Antes de detalhar cada componente, é essencial fixar duas premissas que moldam todo o sistema:

**1. Os agents são genéricos, não acoplados a um produto.** O conjunto `.ai/agents/`
(api-mapeador, api-preparador, api-criador, api-revisor, api-pattern) foi desenhado para
funcionar em **qualquer produto/backend da empresa**, não atrelado a um domínio específico.
A genéricidade vem de duas decisões:

- **Os agents leem o backend real de cada produto** (controllers, DTOs, exception handlers,
  validações) e derivam o contrato daquela API — eles não carregam conhecimento de domínio
  embutido. O mesmo `api-criador` que escreve testes para o produto A escreve para o produto B.
- **A adaptação por produto acontece por perfil/configuração local** (`api-preparador` cria a
  base Cypress específica: autenticação daquele produto, sinais de vazamento daquela stack,
  envelope de paginação, mensagens de erro). O padrão (`pattern/*.md`) é universal; o que muda
  é a parametrização, nunca o arcabouço.

Isso significa que o "padrão de qualidade de API" é um **padrão de empresa**, não de um
projeto. Qualquer referência neste documento a um produto específico é apenas ilustrativa.

**2. O ponto de acoplamento entre agents e FailLens é um contrato de metadados.** Os agents e
o FailLens são desenvolvidos como projetos independentes, mas **precisam concordar sobre o que
vai dentro dos testes**. Essa concordância é o que chamamos de **contrato de metadados**: o
conjunto de comentários, JSDoc, tags e convenções de código que os agents **devem** produzir
nos testes para que o FailLens consiga extrair o máximo de informação e produzir o diagnóstico
rico. Sem esse contrato, o FailLens volta a ser um reporter genérico.

Em outras palavras:

- **Os agents não precisam saber como o FailLens funciona internamente** — só precisam saber
  *o que produzir* nos testes (quais comentários, qual formato de JSDoc, quais tags).
- **O FailLens não precisa saber como os agents chegaram ao oráculo** — só precisa saber *onde
  e em que formato* lê-lo no teste (JSDoc `@contrato`, `@regra:<id>` no 2º arg do `it`, etc.).

A tabela abaixo é o **contrato de metadados** — o que os agents são responsáveis por produzir
em cada teste, e o que o FailLens extrai disso. Se um agente deixar de produzir um desses
metadados, o relatório perde uma capacidade correspondente. É por isso que os `pattern/*.md`
são tão específicos sobre formato: não é dogma de estilo, é o contrato que alimenta o FailLens.

| Agent produz no teste… | FailLens extrai… | Resultado no relatório |
|---|---|---|
| Bloco JSDoc com `@contrato <id>` acima do `describe` | `contracts[].id` | Contrato da API visível e navegável |
| `@campo <nome> {tipo} chave=valor` (constraints de domínio) | `contracts[].fields[]` | Constraints do domínio documentadas |
| `@regra <id-estável> operation=X field=Y condition=Z status=N` | `contracts[].rules[]` | Oráculo contratual que sustenta o diagnóstico |
| `@regra:<id>` no 2º argumento do `it` | `test.ruleRefs[]` (resolvido cross-spec) | Rastreabilidade teste ↔ regra contratual |
| `CatalogoTags.X` (tag de catálogo, vocabulário fechado) | `test.catalogTags[]` | Classificação do tipo de teste → matriz de cobertura |
| `@bug` / `@seguranca` / `@melhoria` (tags operacionais) | `test.operationalTags[]` | Diferencia vermelho esperado (defeito) de teste quebrado |
| `phase: "setup"\|"verification"\|"cleanup"` nas chamadas de `_support/api.js` | `request.phase` | Sequência temporal semântica (não plana) |
| Comentário `@bug` no ponto de uso (3 bullets: observado/esperado/por que vermelho) | contexto humano no diagnóstico | Triagem sabe por que o teste falha de propósito |
| Constantes nomeadas com fonte (ex.: `// Fonte: @Max(99) do DTO`) | rastreabilidade do oráculo | Auditoria da origem do oráculo |
| Mensagens de erro centralizadas em `payload.js` (não espalhadas) | expectativa separada de contrato | Contrato contém só verdades confirmadas |

**A regra de ouro do contrato:** o agente é responsável por **colocar** o máximo de informação
estruturada no teste; o FailLens é responsável por **ler** essa informação e **diagnosticar**
contra ela. Quanto mais completa e correta a produção dos agents, mais rico o relatório — mas
o FailLens nunca inventa o que os agents não produziram.

> Esta tabela é **normativa**: ela define a interface entre agents e FailLens. Se o FailLens
> começar a consumir um novo metadado, um `pattern/*.md` correspondente deve documentar como o
> agente deve produzi-lo; e reciprocamente, se um `pattern/*.md` introduz um novo metadado, o
> FailLens precisa aprender a lê-lo. Esse sincronismo é o que mantém o sistema coeso.

### 2.1. Os agents de IA (`.ai/agents/`)

Os agents são o **motor de geração**. Eles não executam testes nem leem relatórios — eles
**leem o código-fonte do backend e produzem os testes** seguindo o padrão de qualidade
de API definido em `.ai/agents/pattern/`.

**São genéricos por design (multi-produto).** O mesmo conjunto de agents atende qualquer
backend da empresa: o `api-mapeador` deriva o contrato lendo o código real de cada produto;
a adaptação específica (auth, sinais de vazamento, paginação, mensagens) entra via perfil/
configuração local criada pelo `api-preparador`. O padrão (`pattern/*.md`) é **universal**;
nenhum agent carrega conhecimento de domínio embutido. Por isso os examples ilustrativos
deste documento (produto, alegação) são apenas demonstrações — o sistema não é atrelado a
esses domínios.

**O que cada agent faz:**

- `api-mapeador` — lê o backend (controllers, DTOs, exception handlers, validações) e produz
  o **mapeamento de contrato** da API: endpoints, campos, regras, mensagens de erro, status.
- `api-preparador` — cria a base compartilhada do projeto Cypress (client genérico, schemas,
  helpers de auth/cleanup, config de erros e sinais de vazamento) **parametrizada por produto**.
- `api-criador` — usa o mapeamento + o padrão de seleção para **decidir quais cenários são
  aplicáveis** e implementar as specs. É ele quem **preenche o contrato de metadados** (§ 2.0):
  escreve o JSDoc `@contrato`/`@campo`/`@regra`, anexa `CatalogoTags` e `@regra:<id>` no 2º
  argumento do `it`, documenta `@bug` no ponto de uso. A completude do relatório depende
  diretamente da completude dessa produção.
- `api-revisor` — verifica se os testes obedecem ao padrão (rastreabilidade título↔validação,
  oráculo confirmado por fonte, comentários `@bug` documentados) — ou seja, **audita o
  cumprimento do contrato de metadados** que o FailLens vai consumir.
- `api-pattern` + `pattern/01-07` — a fonte única dos critérios (oráculo, validação por
  camadas, convenções, JSDoc, organização, portabilidade).

**Por que são a base de tudo:** a qualidade do relatório FailLens é **limitada pela qualidade
do oráculo** que os agents escrevem no teste. Um `@regra` com status errado produz um
diagnóstico errado; um `@bug` ausente faz o relatório tratar um defeito intencional como
falha acidental; uma `CatalogoTags` faltante deixa a matriz de cobertura cega. Os agents são o
lugar onde a verdade contratual entra no sistema — e o FailLens só consegue extrair o que os
agents colocaram.

### 2.2. Os testes no padrão de qualidade de API (`cypress/e2e/00-apis/`)

Os testes não são código comum — são **contratos executáveis carregados de metadados**. Cada
spec é, simultaneamente:

- um **teste** (valida comportamento em runtime); e
- um **documento de contrato** (legível por máquina, parseado estaticamente).

**A estrutura obrigatória** (definida nos `pattern/*.md`):

```text
cypress/e2e/00-apis/<recurso>/
├── crud.cy.js              ← spec com bloco JSDoc @contrato acima do describe
└── _support/
    ├── api.js              ← chamadas HTTP (criar, buscar, atualizar, excluir)
    ├── asserts.js          ← regra de negócio (não checagem de tipo — isso é schema)
    ├── helpers.js          ← setupHooks, registrarParaLimpeza, criarRegistroDeTeste
    ├── payload.js          ← factories + LIMITES + MENSAGENS (com fonte contratual)
    └── tags.js             ← CatalogoTags (vocabulário fechado de classificação)
```

**O bloco JSDoc de contrato** é o coração da rastreabilidade. Cada tag tem um papel que o
FailLens consome:

```js
/**
 * @contrato produtos                              // id estável cross-spec
 *
 * @campo codigo {number} required=true min=100 max=999 unique=true immutable=true
 *
 * @regra codigo-obrigatorio operation=POST field=codigo condition=missing status=400
 * @regra codigo-duplicado  operation=POST field=codigo condition=duplicate status=409 persistence=forbidden
 * @regra update-ignora-codigo operation=PUT field=codigo condition=immutable
 *
 * @permissao authentication=required
 * @cobertura @campo-controlado aplicavel — falta cenário negativo dedicado
 */
```

**Os metadados que o teste carrega** e o que cada um alimenta no relatório:

| Metadado no teste | Onde vive | O que alimenta no relatório FailLens |
|---|---|---|
| `@contrato <id>` | JSDoc do crud | `contracts[]` — o contrato da API aparece no relatório |
| `@campo ... chave=valor` | JSDoc do crud | `contracts[].fields[]` — constraints do domínio |
| `@regra <id> ...` | JSDoc do crud | `contracts[].rules[]` — oráculo contratual |
| `@regra:<id>` | 2º arg do `it` | `test.ruleRefs[]` — rastreabilidade teste ↔ regra |
| `CatalogoTags.X` | 2º arg do `it` | `test.catalogTags` — matriz de cobertura |
| `@bug` / `@seguranca` | 2º arg do `it` | `test.operationalTags` — estado do vermelho |
| `phase: "setup"\|"verification"\|"cleanup"` | chamadas `_support/api.js` | `request.phase` — sequência semântica |
| comentários `@bug` (3 bullets) | ponto de uso no `it` | contexto humano no diagnóstico |

### 2.3. A biblioteca FailLens (`faillens`, npm)

O FailLens é o **motor de leitura e diagnóstico**. Ele executa o Cypress, captura as chamadas
`cy.request`, **lê o oráculo dos testes** (JSDoc + tags) e produz um relatório que diagnostica
falhas contra o contrato — não apenas contra a assertion.

**O que faz (e o que NÃO faz):**

| Faz | Não faz |
|---|---|
| Captura `cy.request` automaticamente | Não exige `cy.faillens()` ou wrappers |
| Lê `@contrato`/`@regra` estaticamente | Não usa IA nem adivinha o backend |
| Mascara dados sensíveis | Não envia dados a serviços externos |
| Diagnostica contra o oráculo do teste | Não substitui a leitura do contrato real |
| Gera curl de reprodução com variáveis | Não executa a reprodução |

**O fluxo interno** (ver `ARCHITECTURE.md` para detalhe):

```text
CLI (faillens run)
  → detecta Cypress
  → cria instrumentação temporária em .faillens/
  → executa Cypress com sobrescrita transparente de cy.request
  → captura requests/responses/duração/assertions
  → lê estaticamente o JSDoc de contrato e os vínculos @regra:<id>
  → resolve contratos cross-spec
  → monta facts de procedência (observed/asserted/contract/verified)
  → classifica falhas por regras determinísticas
  → gera JSON sanitizado + HTML standalone
```

---

## 3. Por que o diagnóstico do FailLens é mais rico

Compare dois relatórios para a **mesma falha** (POST aceitando payload sem campo obrigatório):

### Reporter genérico (Allure / Cypress Cloud / Mochawesome)

```text
✗ deve retornar 400 ao criar produto sem o campo obrigatório codigo
  AssertionError: expected 201 to equal 400
    at validarStatus (asserts.js:7)
```

Aqui o QA precisa: abrir o teste → ler o `expect` → inferir que 400 era esperado por
"obrigatoriedade" → abrir o backend → confirmar que a validação falta → abrir um ticket.

### FailLens (lendo o oráculo do teste)

```text
✗ deve retornar 400 ao criar produto sem o campo obrigatório codigo
  Regra violada: codigo-obrigatorio (contrato: produtos)
  ┌─ facts de procedência ────────────────────────────────────────────┐
  │ received-status    201   source: observed                         │
  │ expected-status    400   source: asserted (pelo teste)            │
  │ rule-status        400   source: contract (@regra codigo-obrigatorio) │
  │ rule-field       codigo  source: contract                         │
  │ request-field-absent  codigo  source: observed                    │
  └───────────────────────────────────────────────────────────────────┘
  Diagnóstico: validation-not-applied (confiança: alta)
    "A evidência indica que a API respondeu 201 para um cenário que esperava 400.
     O payload foi processado como sucesso, embora o teste o trate como inválido."
  Payload diff: $.codigo — valor nulo observado no campo codigo da resposta
  Reprodução: curl encadeado (login → POST → DELETE) com variáveis $TOKEN, $ID
  Tags: @obrigatoriedade · @regra:codigo-obrigatorio · @bug
```

A diferença é que o FailLens **cruza três fontes**:

1. **observed** — o que a API realmente fez (status 201, campo `codigo` ausente do payload);
2. **asserted** — o que o teste validou (esperava 400);
3. **contract** — o que o oráculo diz que deveria acontecer (regra `codigo-obrigatorio`,
   status 400, field `codigo`).

Esse cruzamento é o que permite responder às **três perguntas da triagem** sem trabalho manual:

| Pergunta da triagem | Resposta do FailLens |
|---|---|
| Por que `400` era esperado? | regra `codigo-obrigatorio` do contrato `produtos` |
| Qual campo causou a divergência? | `codigo` (ausente no payload, nulo na resposta) |
| É defeito ou teste quebrado? | `@bug` indica vermelho esperado; diagnóstico `validation-not-applied` |

**Sem o oráculo do teste, nenhum desses campos existiria** — voltaríamos a `expected 400, got 201`.

---

## 4. A dependência circular: por que cada decisão dos agents importa para o FailLens

O padrão de escrita parece rígido demais ("por que o JSDoc tem que ter exatamente
`chave=valor`?") — até você entender que o FailLens faz **parsing estático determinístico** disso.
Cada regra aparentemente arbitrária dos agents existe porque o FailLens depende dela para
diagnosticar. A tabela abaixo mapeia cada regra dos agents ao impacto no relatório:

| Regra dos agents | Por que existe | Impacto no relatório se violada |
|---|---|---|
| JSDoc `@contrato` com id estável em kebab-case | O FailLens resolve vínculos `@regra:<id>` **cross-spec** por esse id | Teste perde rastreabilidade à regra; `ruleRefs` fica `resolved: false` |
| `@regra` com `chave=valor` (não prosa livre) | Parser determinístico (`parseContractJsdoc.ts`) extrai atributos | Contrato não é parseado; `contracts[]` fica vazio |
| `message=` só quando confirmada por fonte contratual | O contrato só pode conter **verdade**; mentira vira diagnóstico falso | Relatório afirma mensagem que o backend não garante → falsos positivos |
| `@regra:<id>` no 2º arg do `it` | `extractTestTags.ts` lê estaticamente esse vínculo | Teste não aparece vinculado à regra no diagnóstico |
| `CatalogoTags` com vocabulário fechado | A matriz de cobertura agrega por essas tags | Tipo do teste não é classificado; cobertura fica burra |
| `@bug` documentando vermelho esperado | Diferencia defeito de teste quebrado no diagnóstico | Falha intencional parece acidental; triagem perde tempo |
| `phase` nas chamadas `_support/api.js` | Sequência temporal com preparação/ação/verificação | Timeline fica plana; a "chamada principal" não é destacável |
| `asserts.js` só com regra de negócio (formato = schema) | Separação de camadas mantém o oráculo legível | Diagnóstico mistura validação de tipo com regra de negócio |

**A regra de ouro:** o que é rígido nos agents é rígido **porque é a entrada do FailLens**.
Afrouxar o padrão sem afrouxar o FailLens (ou vice-versa) quebra o sistema.

---

## 5. A jornada completa (uso pretendido)

Este é o fluxo end-to-end que o ecossistema foi projetado para suportar:

```text
1. Backend pronto (Java/Spring, Node, etc.)
        │
        ▼
2. Agente api-mapeador lê o código-fonte do backend
   → produz mapeamento de contrato (endpoints, campos, regras, mensagens)
        │
        ▼
3. Agente api-preparador cria a base Cypress compartilhada
   → client genérico, schemas, helpers de auth/cleanup, config de erros
        │
        ▼
4. Agente api-criador implementa as specs no padrão de qualidade de API
   → JSDoc @contrato, @regra, CatalogoTags, @regra:<id>, comentários @bug
   → prioriza a COBERTURA MAIS COMPLETA POSSÍVEL (catálogo de tipos aplicáveis)
        │
        ▼
5. Agente api-revisor valida o padrão
   → rastreabilidade título↔validação, oráculo confirmado por fonte, @bug documentado
        │
        ▼
6. QA/dev roda: npm run test:report
   → o FailLens executa o Cypress, captura cy.request, lê o oráculo
        │
        ▼
7. Relatório FailLens
   → diagnóstico contra o oráculo, não apenas expected/actual
   → facts de procedência, payload diff, reprodução em curl
   → matriz de cobertura alimentada pelas CatalogoTags
        │
        ▼
8. QA/dev age sobre o relatório
   → defeitos viram tickets (com script de reprodução pronto)
   → falhas de automação viram correção de teste
   → lacunas de cobertura viram novos cenários (catálogo orienta o que falta)
```

O ecossistema fecha o ciclo: **a IA que escreve o teste é a mesma que produziu o oráculo**,
então o relatório diagnostica exatamente contra aquilo que a IA considerou contrato. Não há
desalinhamento entre "o que o teste verifica" e "o que o relatório explica".

---

## 6. Prioridade: cobertura máxima com oráculo confirmado

Um objetivo central do ecossistema é **a cobertura de testes mais completa possível** — não
apenas "testar o happy path". O catálogo de tipos do `pattern/01-oraculo-selecao.md` orienta
quais categorias avaliar para cada API:

- **fluxo principal** (CRUD completo);
- **obrigatoriedade** (campos obrigatórios ausentes);
- **valor limite** (mínimo, máximo, primeiro inválido);
- **tipo inválido** (formato, enum, estrutura);
- **regra de negócio** (duplicidade, imutabilidade, vínculo, estado);
- **recurso inexistente** (id/código que não existe);
- **relacionamento inexistente** (entidade dependente ausente);
- **campo controlado** (cliente enviando id/auditoria/imutável);
- **idempotência** (repetição de POST/DELETE);
- **paginação** (listagem, filtro, ordenação);
- **segurança** (sem auth, credencial inválida, permissão insuficiente);
- **entrada inválida** (body ausente, query inválida);
- **não-vazamento** (stack trace, SQL, internals).

Cada teste classificado por `CatalogoTags` alimenta a matriz de cobertura. O relatório
permite ver, por API, **quais categorias estão cobertas e quais são lacuna** — transformando
"quantos testes tenho?" em "quão bem coberto está o contrato?".

A regra de qualidade: **todo tipo aplicável deve ter cenário dedicado**; os `@cobertura`
marcados `nao-aplicavel` precisam justificar; os `aplicavel` indicam dívida de cobertura.

---

## 7. Estado atual e roadmap

### O que já funciona (v0.1)

- Captura automática de `cy.request` (sem wrapper);
- Máscara de dados sensíveis (antes da persistência);
- Diagnóstico determinístico por regras (`validation-not-applied`, `server-error`,
  `schema-contract-mismatch`, `resource-not-found-mismatch`, etc.);
- Prévia de reprodução em curl com variáveis encadeadas;
- HTML standalone offline + JSON sanitizado;
- **Parser de JSDoc de contrato** (`parseContractJsdoc.ts`) — lê `@contrato`/`@campo`/`@regra`;
- **Vínculo teste → regra** (`extractTestTags.ts`) — lê `@regra:<id>` e resolve cross-spec;
- **Facts de procedência** (`buildFacts.ts`) — cruzamento observed/asserted/contract/verified;
- **Payload diff** — destaca campo/condição da divergência;
- **Contratos no relatório** — `contracts[]` expõe o oráculo da API.

### Em desenvolvimento ativo

- **Captura das tags de catálogo e `@bug`** — hoje `extractTestTags.ts` preserva apenas
  `ruleRefs` (o vínculo `@regra:<id>`); as `CatalogoTags` (`@obrigatoriedade`, etc.) e a tag
  de estado (`@bug`) são lidas do source mas descartadas na saída. Persisti-las em
  `test.catalogTags` / `test.operationalTags` é pré-requisito para a matriz de cobertura
  e para diferenciar defeito de teste quebrado no diagnóstico.
- **Matriz de cobertura cruzada** (catálogo × contrato × specs);
- **Histórico e comparação entre execuções** (regressões, flaky rate);
- **Detecção e exibição de redirects** (cadeia 3xx hoje é colapsada);
- **Agrupamento de falhas por causa raiz** (cluster de `error.message` normalizado);
- **Deep-link por teste** (`#test-id`) e busca ampla (URL/status/mensagem);
- **Suporte a Playwright** e `cypress.config.ts`.

### Decisões de design que não mudam

- **Sem IA no diagnóstico** — heurísticas determinísticas, linguagem cuidadosa, só evidências
  presentes no teste e nas respostas. O FailLens não adivinha o backend.
- **100% local** — sem telemetria, sem serviços externos, HTML abre offline. Dados sensíveis
  nunca saem da máquina do QA/CI.
- **Não edita o Cypress do consumidor** — instrumentação é temporária em `.faillens/`;
  `cypress.config.js` e specs originais permanecem intocados.
- **Padrão ≠ biblioteca** — os agents podem ser usados sem o FailLens (qualidade de teste);
  o FailLens pode ser usado sem os agents (relatório sem oráculo). Mas **o diagnóstico rico
  só acontece quando os dois operam juntos**.

---

## 8. Decisões de design que derivam desta visão

### Por que o oráculo vive no teste (e não num arquivo separado)?

Poderia haver um `produtos.contract.json` separado. Não foi assim que o sistema foi desenhado.
O oráculo vive **no próprio teste** (JSDoc acima do `describe`) por três razões:

1. **Versionamento conjunto** — quando o contrato muda, o teste muda no mesmo commit; não há
   risco de drift entre "o que o teste verifica" e "o que o contrato declara".
2. **Rastreabilidade estática** — o FailLens lê o oráculo do mesmo arquivo que contém a
   validação, sem precisar correlacionar arquivos externos.
3. **Manutenção barata** — o dev que mexe no teste vê o contrato ao lado; não precisa abrir
   outro repositório ou ferramenta.

### Por que `message=` é condicional no JSDoc?

A mensagem de erro só entra na `@regra` se for **confirmada por fonte contratual autoritativa**
(OpenAPI, exception handler, DTO, documentação oficial). Se for apenas "o que o teste espera",
fica em `payload.js` como expectativa, mas não entra no contrato. Razão: **o contrato só pode
conter verdades**. Uma mensagem não-confirmada, se parasse no contrato, faria o diagnóstico
do FailLens afirmar algo que o backend não garante — produzindo falsos positivos quando o
backend mudar o texto sem violar o status.

### Por que o diagnóstico não usa IA?

IA no diagnóstico introduziria não-determinismo (a mesma falha explicada diferente a cada run)
e risco de alucinação (explicar uma causa que não existe). O FailLens prefere **heurísticas
determinísticas sobre evidências observadas** — o diagnóstico é o mesmo toda vez, e cada
afirmação é sustentada por um fact com fonte rastreada. Isso é mais confiável para gating de
CI e para auditoria. IA local **opcional** pode entrar no futuro como camada de resumo, mas
nunca como fonte de verdade do diagnóstico.

### Por que os agents são tão rígidos sobre nomenclatura (`deve ...`, `@campo`, `@regra`)?

Porque o FailLens e o gerador de cobertura fazem **parsing estático** desses tokens. Um `it`
que começa com "Test 1" não é classificável; uma `@regra` em prosa livre não é parseável; um
`@regra:<id>` com typo não resolve o vínculo. A rigidez não é dogma de estilo — é **contrato
de máquina**. O `api-revisor` existe para garantir que a rigidez seja respeitada antes de o
teste ir para a suíte.

---

## 9. Onde cada peça vive (referência rápida)

```text
REPOSITÓRIO DOS AGENTS (projeto de testes do consumidor)
├── .ai/agents/
│   ├── api-mapeador.md          → como mapear o backend
│   ├── api-preparador.md        → como criar a base Cypress
│   ├── api-criador.md           → como implementar specs
│   ├── api-revisor.md           → como validar o padrão
│   ├── api-pattern.md           → índice fundacional do padrão
│   ├── api-templates.md         → exemplos técnicos
│   ├── pattern/01-07            → regras detalhadas (oráculo, camadas, JSDoc…)
│   └── mapeamento/              → estrutura do mapeamento de contrato
├── cypress/support/             → base compartilhada genérica (client, schemas, asserts)
└── cypress/e2e/00-apis/<api>/   → specs + _support no padrão de qualidade de API

REPOSITÓRIO DO FAILLENS (biblioteca npm)
├── src/
│   ├── cli/                     → faillens run / init / generate / open
│   ├── cypress/                 → instrumentação temporária (createInstrumentedConfig, hooks)
│   ├── collector/               → captura + máscara + parse estático
│   │   ├── parseContractJsdoc.ts → lê @contrato/@campo/@regra
│   │   └── extractTestTags.ts     → lê @regra:<id> (+ tags de catálogo, em desenvolvimento)
│   ├── reporter/
│   │   ├── buildReportModel.ts  → enriquece o modelo
│   │   ├── provenance/          → resolveContracts + buildFacts
│   │   ├── diagnostics/         → classifica falhas
│   │   └── buildPayloadDiff.ts  → destaca divergências
│   └── templates/               → HTML standalone
├── docs/
│   ├── ARCHITECTURE.md          → fluxo interno do faillens
│   ├── BEHAVIORS.md             → contratos de comportamento
│   ├── REPORT_SCHEMA.md         → contrato do JSON
│   ├── SECURITY.md              → privacidade e máscara
│   ├── TESTING.md               → como testar o próprio faillens
│   └── ECOSYSTEM.md             → ESTE DOCUMENTO (a visão que une tudo)
└── README.md                    → quickstart da biblioteca isolada
```

---

## 10. Como contribuir sabendo disso

| Se você está… | Leia primeiro | Lembre-se |
|---|---|---|
| Programando o FailLens | `ARCHITECTURE.md` + este doc | Cada campo do JSON que parece "falta fazer" (ex.: `catalogTags`) tem um consumidor esperando: a matriz de cobertura. Não corte campos — implemente-os. E quando extrair um novo metadado do source, atualize o `pattern/*.md` correspondente para que os agents o produzam. |
| Escrevendo um agent executor | `pattern/01-07` + este doc (§ 2.0) | Você é responsável por **produzir o contrato de metadados** no teste. A rigidez do JSDoc/tags não é teu inimigo — é o que o FailLens lê. Quanto mais completo e correto o que você produzir (JSDoc, `@regra:<id>`, `CatalogoTags`, `@bug`, `phase`), mais rico o relatório. O agente é genérico (multi-produto), mas o formato dos metadados é fixo. |
| Escrevendo testes manualmente | `pattern/03-convencoes.md` + `04-comentarios-jsdoc.md` | Sempre confirme o oráculo por fonte contratual antes de declarar `message=`. Sem oráculo, o relatório perde a capacidade de diagnosticar. |
| Revisando testes de API | `api-revisor.md` + `pattern/05-exemplos.md` | A rastreabilidade título↔validação e o `@bug` documentado são obrigatórios — sem eles o relatório mente. A revisão audita o cumprimento do contrato de metadados (§ 2.0). |
| Avaliando o FailLens vs concorrentes | Seção 3 deste doc | O diferencial é o **diagnóstico contra o oráculo do teste** — concorrentes não têm acesso a isso. Compare em pé de igualdade só se o oráculo estiver presente (i.e., os agents tiverem produzido os metadados). |

---

## 11. Resumo em uma frase

> **Os agents genéricos escrevem o oráculo no teste (num formato de metadados acordado);
> o FailLens lê esse oráculo e diagnostica falhas contra ele — transformando
> `expected 400, got 201` em `a regra codigo-obrigatorio foi violada: a API aceitou um payload
> que o contrato define como inválido`.** O ponto que une as duas partes é o **contrato de
> metadados**: os agents são responsáveis por produzir o máximo de informação estruturada no
> teste; o FailLens, por extrair dela o diagnóstico mais rico possível — sem nunca inventar o
> que não foi produzido.
