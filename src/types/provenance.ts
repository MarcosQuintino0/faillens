// Modelo de procedência determinística.
//
// Cada informação que o FailLens poderá usar futuramente (BDD, resultado atual,
// resultado esperado, chamado) carrega uma fonte rastreável. Este modelo é INTERNO:
// é persistido no JSON para auditoria/geração determinística, mas não é renderizado
// no HTML. Nenhuma frase pode ser tratada como fato sem uma fonte permitida aqui.

// Tipos de procedência aprovados (PROCEDENCIA-INFORMACOES.md):
// - observed:     capturado na execução (status, body, headers, duração);
// - asserted:     exigido por uma assertion do teste;
// - contract:     declarado no contrato JSDoc vinculado por @regra:<id>;
// - verified:     comprovado por operação posterior (ex.: GET pós-mutação);
// - not-verified: não houve evidência suficiente para comprovar a consequência.
export type FactSource =
  | "observed"
  | "asserted"
  | "contract"
  | "verified"
  | "not-verified";

export interface FailLensFact {
  // Identificador estável dentro do teste, usado para apontar conflitos.
  id: string;
  // Natureza do fato (ex.: "received-status", "expected-status",
  // "request-field-absent", "required-field", "rule-status", "rule-message",
  // "persistence-verified", "persistence-not-verified").
  kind: string;
  value: unknown;
  source: FactSource;
  // Eixo lógico para detecção de conflito entre fontes (ex.: "status").
  dimension?: string;
  requestId?: string;
  contractId?: string;
  ruleId?: string;
  file?: string;
  line?: number;
  // IDs de facts que divergem deste na mesma dimensão (conflito de fontes).
  conflictsWith?: string[];
}

export interface FailLensContractField {
  name: string;
  type?: string;
  // Atributos confirmados em formato chave=valor (required, maxLength, min, max…).
  attributes: Record<string, string | number | boolean>;
  // Texto original da linha, preservado para auditoria e degradação.
  raw: string;
}

export interface FailLensContractRule {
  // Identificador estável da regra (kebab-case). Ausente em JSDoc legado.
  id: string;
  attributes: Record<string, string | number | boolean>;
  status?: number;
  message?: string;
  raw: string;
}

export interface FailLensContractCoverage {
  tag: string;
  status: string;
  motivo: string;
}

export interface ContractParseWarning {
  // Código estável do aviso (ex.: "unknown-attribute", "rule-without-id",
  // "duplicate-rule", "invalid-status", "legacy-format").
  code: string;
  message: string;
  tag?: string;
  ruleId?: string;
  detail?: string;
}

export interface FailLensContract {
  // @contrato <id>. Para JSDoc legado sem @contrato, o id é derivado da pasta/spec.
  id: string;
  api: string[];
  resumo?: string;
  fields: FailLensContractField[];
  rules: FailLensContractRule[];
  permissao?: Record<string, string | number | boolean>;
  cobertura: FailLensContractCoverage[];
  // Specs onde o bloco de contrato foi encontrado.
  sourceFiles: string[];
  // true quando extraído do formato JSDoc antigo (degradado, sem IDs estáveis).
  legacy: boolean;
  warnings: ContractParseWarning[];
}
