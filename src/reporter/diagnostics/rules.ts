import type { FailLensDiagnosis } from "../../types/report";

export const SUCCESS_STATUSES = [200, 201, 202, 204];
export const CLIENT_ERROR_STATUSES = [400, 401, 403, 404, 409, 422];

export interface StatusDiagnosisRule {
  category: FailLensDiagnosis["category"];
  title: string;
  expected: (status: number) => boolean;
  actual: (status: number) => boolean;
  methods?: string[];
  summary: (expected: number, actual: number) => string;
  suggestedAction: string;
}

export const STATUS_DIAGNOSIS_RULES: StatusDiagnosisRule[] = [
  {
    category: "duplicate-conflict",
    title: "Restrição de unicidade não foi aplicada",
    expected: (status) => status === 409,
    actual: (status) => SUCCESS_STATUSES.includes(status),
    methods: ["POST", "PUT", "PATCH"],
    summary: (_expected, actual) =>
      `A operação que deveria ser rejeitada por conflito de unicidade foi aceita com status ${actual}.`,
    suggestedAction:
      "Confirme a regra de unicidade exercitada pelo teste e reproduza a chamada com o mesmo valor duplicado.",
  },
  {
    category: "validation-not-applied",
    title: "Payload inválido foi aceito pela API",
    expected: (status) => status === 400 || status === 422,
    actual: (status) => SUCCESS_STATUSES.includes(status),
    methods: ["POST", "PUT", "PATCH"],
    summary: (expected, actual) =>
      `A evidência indica que a API respondeu ${actual} para um cenário que esperava ${expected}. O payload foi processado como sucesso, embora o teste o trate como inválido.`,
    suggestedAction:
      "Revise o contrato de validação desse endpoint e confirme quais campos ou regras deveriam rejeitar o payload enviado.",
  },
  {
    category: "unhandled-validation-error",
    title: "Entrada inválida gerou erro interno",
    expected: (status) => status === 400 || status === 422,
    actual: (status) => status >= 500,
    summary: (expected, actual) =>
      `Com base na resposta recebida, um cenário que esperava erro de validação ${expected} terminou com status interno ${actual}.`,
    suggestedAction:
      "Verifique se entradas inválidas são convertidas em resposta de cliente controlada, preservando detalhes seguros do erro de validação.",
  },
  {
    category: "authorization-not-enforced",
    title: "Operação restrita foi permitida",
    expected: (status) => status === 403,
    actual: (status) => SUCCESS_STATUSES.includes(status),
    summary: (_expected, actual) =>
      `O comportamento observado sugere que a operação foi aceita com status ${actual}, apesar de o cenário esperar bloqueio por autorização (403).`,
    suggestedAction:
      "Confirme as permissões exigidas para a operação e reproduza a chamada com o mesmo contexto de identidade apresentado no relatório.",
  },
  {
    category: "authentication-not-enforced",
    title: "Request sem autenticação foi aceita",
    expected: (status) => status === 401,
    actual: (status) => SUCCESS_STATUSES.includes(status),
    summary: (_expected, actual) =>
      `A request retornou ${actual} em um cenário que esperava 401. A evidência indica aceitação da chamada no contexto testado.`,
    suggestedAction:
      "Confirme a política de autenticação do endpoint e se algum cookie, header ou estado prévio tornou a chamada autenticada.",
  },
  {
    category: "resource-not-found-mismatch",
    title: "Recurso inexistente foi tratado como sucesso",
    expected: (status) => status === 404,
    actual: (status) => SUCCESS_STATUSES.includes(status),
    summary: (_expected, actual) =>
      `A API respondeu ${actual} para o recurso que o teste considerava inexistente e esperava receber 404.`,
    suggestedAction:
      "Compare o identificador enviado com a massa criada pelo teste e confirme o contrato esperado para recursos ausentes.",
  },
  {
    category: "success-expected-but-client-error",
    title: "Fluxo positivo recebeu erro de cliente",
    expected: (status) => SUCCESS_STATUSES.includes(status),
    actual: (status) => CLIENT_ERROR_STATUSES.includes(status),
    summary: (expected, actual) =>
      `O fluxo esperava sucesso ${expected}, mas a API respondeu com erro de cliente ${actual}.`,
    suggestedAction:
      "Inspecione o request body, os headers e a resposta selecionada para identificar qual requisito do contrato não foi atendido.",
  },
  {
    category: "success-expected-but-server-error",
    title: "Fluxo positivo gerou erro interno",
    expected: (status) => SUCCESS_STATUSES.includes(status),
    actual: (status) => status >= 500,
    summary: (expected, actual) =>
      `O cenário esperava sucesso ${expected}, mas a chamada principal terminou com status interno ${actual}.`,
    suggestedAction:
      "Reproduza a chamada com o cURL sanitizado e correlacione o horário da execução com os logs locais do serviço.",
  },
];
