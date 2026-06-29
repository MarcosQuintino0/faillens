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
