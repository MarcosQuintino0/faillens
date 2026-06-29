// Consolida os contratos JSDoc de todos os specs e resolve o vínculo teste->regra.
//
// Contratos com o mesmo @contrato são mesclados (regras/campos/arquivos). O vínculo
// é determinístico: um @regra:<id> de um teste resolve para a regra de mesmo id no
// índice global. Se exatamente um contrato declara o id, resolve; se nenhum, fica
// não resolvido; se vários declaram o mesmo id, é ambíguo e não resolve (sem chute).

import type { FailLensContract, FailLensContractRule } from "../../types/provenance";
import type { FailLensRuleRef, FailLensSpec } from "../../types/report";

export interface ResolvedContracts {
  contracts: FailLensContract[];
  ruleIndex: Map<string, Array<{ contractId: string; rule: FailLensContractRule }>>;
}

function mergeContract(target: FailLensContract, incoming: FailLensContract): void {
  const comparable = (value: Record<string, unknown>): string => JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))),
  );
  for (const rule of incoming.rules) {
    const existing = target.rules.find((item) => item.id === rule.id);
    if (!existing) target.rules.push(rule);
    else if (existing.status !== rule.status || existing.message !== rule.message || comparable(existing.attributes) !== comparable(rule.attributes)) {
      target.rules.push(rule);
      target.warnings.push({ code: "conflicting-rule", tag: "@regra", ruleId: rule.id, message: `Definições conflitantes para a regra "${rule.id}".` });
    }
  }
  for (const field of incoming.fields) {
    const existing = target.fields.find((item) => item.name === field.name);
    if (!existing) target.fields.push(field);
    else if (existing.type !== field.type || comparable(existing.attributes) !== comparable(field.attributes)) {
      target.warnings.push({ code: "conflicting-field", tag: "@campo", message: `Definições conflitantes para o campo "${field.name}".` });
    }
  }
  for (const file of incoming.sourceFiles) if (!target.sourceFiles.includes(file)) target.sourceFiles.push(file);
  target.warnings.push(...incoming.warnings);
  target.api = Array.from(new Set([...target.api, ...incoming.api]));
  target.resumo = target.resumo || incoming.resumo;
  target.legacy = target.legacy && incoming.legacy;
}

export function resolveContracts(specs: FailLensSpec[]): ResolvedContracts {
  const byId = new Map<string, FailLensContract>();
  for (const spec of specs) {
    const contract = spec.contract;
    if (!contract) continue;
    const existing = byId.get(contract.id);
    if (existing) mergeContract(existing, contract);
    else byId.set(contract.id, { ...contract, rules: [...contract.rules], fields: [...contract.fields] });
  }

  const ruleIndex = new Map<string, Array<{ contractId: string; rule: FailLensContractRule }>>();
  for (const contract of byId.values()) {
    for (const rule of contract.rules) {
      const bucket = ruleIndex.get(rule.id) || [];
      bucket.push({ contractId: contract.id, rule });
      ruleIndex.set(rule.id, bucket);
    }
  }

  return { contracts: Array.from(byId.values()), ruleIndex };
}

export function resolveRuleRef(
  ref: FailLensRuleRef,
  ruleIndex: ResolvedContracts["ruleIndex"],
  preferredContractId?: string,
): FailLensRuleRef {
  const allMatches = ruleIndex.get(ref.ruleId) || [];
  const matches = preferredContractId
    ? allMatches.filter((match) => match.contractId === preferredContractId)
    : allMatches;
  // Vínculo só resolve quando exatamente um contrato declara o id (sem ambiguidade).
  if (matches.length === 1) {
    return { ruleId: ref.ruleId, contractId: matches[0].contractId, resolved: true, rule: matches[0].rule };
  }
  return { ruleId: ref.ruleId, resolved: false };
}

export function contractIdForSpec(specPath: string, contracts: FailLensContract[]): string | undefined {
  const normalized = specPath.replace(/\\/g, "/");
  const directory = normalized.slice(0, normalized.lastIndexOf("/") + 1);
  const matches = contracts.filter((contract) => contract.sourceFiles.some((file) => {
    const source = file.replace(/\\/g, "/");
    return source === normalized || source.slice(0, source.lastIndexOf("/") + 1) === directory;
  }));
  return matches.length === 1 ? matches[0].id : undefined;
}
