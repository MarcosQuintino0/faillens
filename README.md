# FailLens

FailLens é um relatório HTML local para testes de API com Cypress E2E. Ele executa o Cypress, captura automaticamente todas as chamadas feitas com `cy.request` e transforma falhas em uma visão de debug com requests, responses, cURL, sequência temporal e diagnóstico determinístico.

Tudo roda na máquina ou no runner de CI. O FailLens não usa IA, não envia telemetria e não transmite requests, responses ou credenciais para serviços externos.

## Instalação

```bash
npm install -D faillens
```

Adicione o script:

```json
{
  "scripts": {
    "test:report": "faillens run"
  }
}
```

Ou deixe o FailLens adicioná-lo sem sobrescrever um script existente:

```bash
npx faillens init
```

Execute:

```bash
npm run test:report
```

O Cypress roda normalmente e o relatório é criado em:

```text
reports/faillens/index.html
reports/faillens/faillens-report.json
```

O HTML é standalone: CSS, JavaScript e dados ficam embutidos no próprio arquivo. Ele pode ser aberto localmente, sem servidor, CDN, fonte externa ou conexão com a internet.

## Exemplo Cypress

Um projeto consumidor pode continuar usando `cy.request` sem importar helper algum:

```js
describe("API de usuários", () => {
  it("rejeita um usuário sem e-mail", () => {
    cy.request({
      method: "POST",
      url: "/usuarios",
      body: { name: "João da Silva" },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "Deve retornar 400 sem e-mail").to.equal(400)
    })
  })
})
```

Não é necessário trocar `cy.request`, criar um comando customizado ou alterar assertions.

## O que é capturado

Para cada teste, o FailLens registra:

- título completo, estado, duração e erro;
- todas as chamadas `cy.request`, na ordem em que ocorreram;
- método, URL original e URL resolvida com `baseUrl`;
- headers e body do request;
- status, headers, body e duração da response;
- `failOnStatusCode` sem modificar seu valor;
- cURL sanitizado;
- request principal e fases de preparação, validação, verificação e limpeza;
- expected/actual de assertions reconhecidas;
- diagnóstico baseado em regras e uma prévia shell de reprodução.

O diagnóstico não tenta adivinhar a implementação do backend. Ele usa linguagem cuidadosa e somente evidências presentes no teste e nas respostas capturadas.

## Como funciona a captura automática

`faillens run` cria uma instrumentação temporária dentro de `.faillens/`:

```text
.faillens/
├── cypress.config.generated.js
├── support.generated.js
└── results/
```

A configuração gerada:

1. carrega `cypress.config.js` do projeto;
2. preserva as opções E2E e combina o `setupNodeEvents` original;
3. carrega primeiro o support original do projeto;
4. instala hooks globais e uma sobrescrita transparente de `cy.request`;
5. consolida resultados por spec e gera os dois relatórios.

O `cypress.config.js`, os testes e o support original nunca são editados. O FailLens preserva o exit code do Cypress e ainda tenta finalizar o relatório quando há testes com falha.

## CLI

### `faillens init`

Adiciona ao `package.json`:

```json
"test:report": "faillens run"
```

Se esse script já existir, nenhum valor é sobrescrito.

### `faillens run`

Detecta o Cypress, cria a configuração temporária, executa os testes e gera os relatórios.

Argumentos adicionais podem ser encaminhados ao Cypress depois de `--`:

```bash
npx faillens run -- --browser chrome --spec "cypress/e2e/api/**/*.cy.js"
```

### `faillens generate`

Regenera somente o HTML a partir de um JSON FailLens existente:

```bash
npx faillens generate \
  --input reports/faillens/faillens-report.json \
  --output reports/faillens/index.html
```

O comando reaplica a máscara padrão antes de embutir dados no HTML.

## Relatório

O relatório abre no tema escuro por padrão e oferece:

- visão master-detail agrupada por spec;
- filtros por texto, falhas ou todos os testes;
- cards de status esperado/atual, duração e quantidade de requests;
- diagnóstico determinístico com evidências e ação sugerida;
- assertion, expected/actual e localização quando disponível;
- sequência de chamadas com fase, status, duração e barra temporal;
- request/response bodies e cURL copiável;
- detecção de `$TOKEN`, `$USER_ID`, `$ORDER_ID` e `$RESOURCE_ID`;
- prévia de reprodução shell com variáveis encadeadas;
- exportação do JSON e alternância de tema.

A prévia de reprodução é uma aproximação para acelerar o debug. Ela pode exigir ajustes de ambiente, dados dinâmicos ou ferramentas como `jq`.

## Máscara de dados sensíveis

Antes de salvar JSON ou HTML, o FailLens mascara recursivamente headers, bodies, query params, erros e cURL.

Campos padrão incluem:

```text
authorization, cookie, set-cookie, password, senha, token,
accessToken, refreshToken, apiKey, secret, clientSecret,
jwt, bearer, cpf, cnpj
```

Valores comuns viram `***`; um Authorization Bearer vira `Bearer <TOKEN>`. JWTs reconhecíveis também são substituídos.

Campos adicionais podem ser definidos em `faillens.config.js`:

```js
module.exports = {
  maskFields: ["sessionId", "privateKey"],
}
```

A lista adicional complementa a proteção padrão; ela não a desativa.

## Configuração opcional

O FailLens funciona sem arquivo de configuração. Para personalizar, crie `faillens.config.js` na raiz do projeto:

```js
module.exports = {
  outputDir: "reports/faillens",
  projectName: "checkout-service",
  runId: process.env.CI_PIPELINE_ID,
  branch: process.env.CI_COMMIT_REF_NAME,
  theme: "dark",
  maskFields: ["authorization", "cookie", "password", "token"],
  cypressConfigFile: "cypress.config.js",
}
```

Todos os campos são opcionais.

## Uso em CI

O comando retorna o mesmo exit code do Cypress. Configure a publicação dos arquivos de `reports/faillens/` em uma etapa que rode mesmo quando os testes falharem.

Exemplo GitHub Actions:

```yaml
- name: Install
  run: npm ci

- name: Cypress API report
  run: npm run test:report

- name: Save FailLens report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: faillens-report
    path: reports/faillens/
```

O upload do artifact é uma escolha do pipeline. O pacote FailLens, por si só, não envia nenhum dado.

## Desenvolvimento da biblioteca

```bash
npm install
npm run build
npm test
node bin/faillens.js --help
npm pack --dry-run
```

O código TypeScript fica em `src/`, e o build CommonJS com declarações fica em `dist/`.

## Limitações da versão 0.1

- suporta somente Cypress E2E;
- suporta inicialmente `cypress.config.js`;
- `cypress.config.ts` ainda não é suportado;
- captura apenas chamadas feitas por `cy.request`;
- não captura `axios` ou `fetch` diretamente;
- o parse de assertions e os diagnósticos são heurísticos e determinísticos;
- a prévia shell pode exigir ajustes manuais;
- não usa IA.

## Roadmap

- suporte a `cypress.config.ts`;
- suporte a Playwright;
- histórico e comparação entre execuções;
- exportação para Markdown;
- integração com criação de bug report;
- modo de IA local opcional no futuro.

## Privacidade

O FailLens foi desenhado para dados de teste potencialmente sensíveis:

- processamento 100% local;
- nenhum serviço remoto;
- nenhuma telemetria;
- nenhuma dependência de internet para abrir o HTML;
- máscara aplicada antes da persistência do relatório.

Ainda assim, trate o relatório como um artifact de teste: adicione campos específicos do seu domínio em `maskFields` e controle quem pode acessar artifacts do CI.

## Licença

MIT.
