// Extrai o vínculo determinístico teste -> regra a partir do source do spec.
//
// Captura a tag `@regra:<id>` declarada no 2º argumento do it(...) e resolve
// cenários data-driven (`[...].forEach((param) => it(...))` sobre array literal),
// substituindo os valores literais de cada caso no título e nas tags. Não depende
// de runtime do Cypress nem de bibliotecas externas (zero deps) e ignora strings
// e comentários ao varrer o código.

// Referência a uma tag de catálogo escrita como constante (ex.: CatalogoTags.OBRIGATORIEDADE).
// O valor ("@obrigatoriedade") vive no módulo de tags importado e é resolvido depois.
export interface CatalogTagRef {
  object: string;
  name: string;
}

export interface PlannedTestTags {
  title: string;
  ruleRefs: string[];
  // Tags @… escritas como string literal/template (ex.: "@bug"), exceto @regra:<id>.
  tags: string[];
  // Tags de catálogo escritas como CatalogoTags.X, ainda não resolvidas a valor.
  catalogRefs: CatalogTagRef[];
}

const RULE_TAG = /^@regra:(.+)$/;
const MEMBER_TAG = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/;

function parseString(source: string, start: number): { value: string; end: number } | undefined {
  const quote = source[start];
  if (quote !== '"' && quote !== "'" && quote !== "`") return undefined;
  let value = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      const next = source[index + 1];
      const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t" };
      value += escapes[next] ?? next ?? "";
      index += 1;
      continue;
    }
    if (character === quote) return { value, end: index + 1 };
    value += character;
  }
  return undefined;
}

function skipIgnored(source: string, start: number): number | undefined {
  if (["'", '"', "`"].includes(source[start])) return parseString(source, start)?.end;
  if (source[start] === "/" && source[start + 1] === "/") {
    const end = source.indexOf("\n", start + 2);
    return end < 0 ? source.length : end + 1;
  }
  if (source[start] === "/" && source[start + 1] === "*") {
    const end = source.indexOf("*/", start + 2);
    return end < 0 ? source.length : end + 2;
  }
  return undefined;
}

function matchingDelimiter(source: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const ignoredEnd = skipIgnored(source, index);
    if (ignoredEnd !== undefined) {
      index = ignoredEnd - 1;
      continue;
    }
    if (source[index] === open) depth += 1;
    if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevel(source: string): string[] {
  const parts: string[] = [];
  let start = 0;
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const ignoredEnd = skipIgnored(source, index);
    if (ignoredEnd !== undefined) {
      index = ignoredEnd - 1;
      continue;
    }
    const character = source[index];
    if (pairs[character]) stack.push(pairs[character]);
    else if (stack.at(-1) === character) stack.pop();
    else if (character === "," && stack.length === 0) {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts;
}

function skipWhitespace(source: string, start: number): number {
  let index = start;
  while (/\s/.test(source[index] || "")) index += 1;
  return index;
}

type Bindings = Record<string, string>;

// Resolve uma expressão de título/tag para texto, substituindo ${ident} pelos
// valores ligados do caso data-driven. Literais simples são desembrulhados.
function resolveExpr(expr: string, bindings: Bindings): string {
  const trimmed = expr.trim();
  const literal = parseString(trimmed, 0);
  if (literal && literal.end === trimmed.length && trimmed[0] !== "`") return literal.value;
  if (trimmed[0] === "`" && trimmed.at(-1) === "`") {
    const inner = trimmed.slice(1, -1);
    return inner.replace(/\$\{([^}]*)\}/g, (whole, raw) => {
      const key = String(raw).trim();
      return Object.prototype.hasOwnProperty.call(bindings, key) ? bindings[key] : whole;
    });
  }
  return trimmed;
}

// Lê os valores string-literais das propriedades de um objeto literal `{...}`.
function objectStringProps(objectSource: string): Bindings {
  const inner = objectSource.replace(/^\{/, "").replace(/\}$/, "");
  const out: Bindings = {};
  for (const part of splitTopLevel(inner)) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const key = part.slice(0, colon).trim();
    const literal = parseString(part.slice(colon + 1).trim(), 0);
    if (/^[A-Za-z_$][\w$]*$/.test(key) && literal) out[key] = literal.value;
  }
  return out;
}

// Mapeia o nome local usado no corpo para a chave do objeto do caso.
// `{ regra }` -> { regra: "regra" }; `{ regra: r }` -> { r: "regra" }.
function destructuredKeys(paramSource: string): Record<string, string> {
  const match = paramSource.match(/\{([^}]*)\}/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const part of splitTopLevel(match[1])) {
    const clean = part.split("=")[0].trim();
    const colon = clean.indexOf(":");
    if (colon >= 0) {
      const key = clean.slice(0, colon).trim();
      const local = clean.slice(colon + 1).trim();
      if (key && local) out[local] = key;
    } else if (clean) {
      out[clean] = clean;
    }
  }
  return out;
}

interface ClassifiedTags {
  ruleRefs: string[];
  tags: string[];
  catalogRefs: CatalogTagRef[];
}

// Separa os três papéis do array `tags`: vínculo @regra:<id>, tags @… literais e
// referências de catálogo (CatalogoTags.X). Nada é descartado silenciosamente.
function classifyTags(optsSource: string, bindings: Bindings): ClassifiedTags {
  const result: ClassifiedTags = { ruleRefs: [], tags: [], catalogRefs: [] };
  const tagsMatch = optsSource.match(/tags\s*:\s*\[/);
  if (!tagsMatch) return result;
  const open = optsSource.indexOf("[", tagsMatch.index);
  const close = matchingDelimiter(optsSource, open, "[", "]");
  if (close < 0) return result;
  for (const raw of splitTopLevel(optsSource.slice(open + 1, close))) {
    const element = raw.trim();
    if (!element) continue;
    const isString = element[0] === '"' || element[0] === "'" || element[0] === "`";
    if (isString) {
      const resolved = resolveExpr(element, bindings);
      const ruleMatch = resolved.match(RULE_TAG);
      if (ruleMatch) {
        if (!ruleMatch[1].includes("${")) result.ruleRefs.push(ruleMatch[1].trim());
      } else if (resolved.startsWith("@") && !resolved.includes("${")) {
        result.tags.push(resolved);
      }
      continue;
    }
    // Identificador/membro: CatalogoTags.X vira referência de catálogo a resolver.
    const member = element.match(MEMBER_TAG);
    if (member) result.catalogRefs.push({ object: member[1], name: member[2] });
  }
  return result;
}

function emitTest(callSource: string, bindings: Bindings, out: PlannedTestTags[]): void {
  const open = callSource.indexOf("(");
  if (open < 0) return;
  const args = splitTopLevel(callSource.slice(open + 1, callSource.length - 1));
  if (!args.length) return;
  const title = resolveExpr(args[0], bindings);
  const opts = args[1] && args[1].trim().startsWith("{") ? args[1] : "";
  const { ruleRefs, tags, catalogRefs } = opts
    ? classifyTags(opts, bindings)
    : { ruleRefs: [], tags: [], catalogRefs: [] };
  out.push({ title, ruleRefs, tags, catalogRefs });
}

// Localiza o caminho do módulo de onde um identificador foi importado
// (ex.: import { CatalogoTags } from "./_support/tags").
export function findImportSource(source: string, identifier: string): string | undefined {
  const re = new RegExp(
    `import\\s*\\{[^}]*\\b${identifier}\\b[^}]*\\}\\s*from\\s*(['"\`])([^'"\`]+)\\1`,
  );
  return source.match(re)?.[2];
}

// Lê o vocabulário de catálogo de um módulo de tags: mapeia a constante
// (ex.: OBRIGATORIEDADE) para o valor (ex.: "@obrigatoriedade") a partir do
// objeto `CatalogoTagsMeta = { CONST: { valor: "@x", ... } }`. Determinístico:
// lê o valor real declarado, sem derivar do nome da constante.
export function parseCatalogModule(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const meta = source.match(/CatalogoTagsMeta\s*=\s*\{/);
  if (!meta || meta.index === undefined) return map;
  const open = source.indexOf("{", meta.index);
  const close = matchingDelimiter(source, open, "{", "}");
  if (close <= open) return map;
  for (const part of splitTopLevel(source.slice(open + 1, close))) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const key = part.slice(0, colon).trim();
    if (!/^[A-Za-z_$][\w$]*$/.test(key)) continue;
    const valor = objectStringProps(part.slice(colon + 1).trim()).valor;
    if (valor) map.set(key, valor);
  }
  return map;
}

function scan(source: string, bindings: Bindings, out: PlannedTestTags[]): void {
  for (let index = 0; index < source.length; index += 1) {
    const ignoredEnd = skipIgnored(source, index);
    if (ignoredEnd !== undefined) {
      index = ignoredEnd - 1;
      continue;
    }

    // Data-driven: array literal seguido de .forEach(callback).
    if (source[index] === "[") {
      const arrayEnd = matchingDelimiter(source, index, "[", "]");
      const after = skipWhitespace(source, arrayEnd + 1);
      const forEach = source.slice(after).match(/^\.\s*forEach\s*\(/);
      if (arrayEnd > 0 && forEach) {
        const callOpen = source.indexOf("(", after);
        const callClose = matchingDelimiter(source, callOpen, "(", ")");
        const elements = splitTopLevel(source.slice(index + 1, arrayEnd));
        const callback = source.slice(callOpen + 1, callClose);
        const bodyOpen = callback.indexOf("{", callback.indexOf("=>") >= 0 ? callback.indexOf("=>") : 0);
        const paramSource = callback.slice(0, callback.indexOf("=>") >= 0 ? callback.indexOf("=>") : bodyOpen);
        const bodyClose = matchingDelimiter(callback, bodyOpen, "{", "}");
        const keys = destructuredKeys(paramSource);
        if (bodyOpen >= 0 && bodyClose > bodyOpen) {
          const body = callback.slice(bodyOpen + 1, bodyClose);
          for (const element of elements) {
            const props = objectStringProps(element);
            const caseBindings: Bindings = { ...bindings };
            for (const [local, key] of Object.entries(keys)) {
              if (props[key] !== undefined) caseBindings[local] = props[key];
            }
            scan(body, caseBindings, out);
          }
        }
        index = callClose;
        continue;
      }
    }

    // it / test / specify (com .only/.skip), respeitando fronteira de palavra.
    const match = source.slice(index).match(/^(it|test|specify)(?:\.(?:only|skip))?\s*\(/);
    if (match && !/[\w$]/.test(source[index - 1] || "")) {
      const open = source.indexOf("(", index);
      const close = matchingDelimiter(source, open, "(", ")");
      if (close > open) {
        emitTest(source.slice(index, close + 1), bindings, out);
        index = close;
        continue;
      }
    }
  }
}

export function extractTestTags(source: string): PlannedTestTags[] {
  const out: PlannedTestTags[] = [];
  scan(source, {}, out);
  return out;
}
