import type {
  AssertionTarget,
  FailLensAssertion,
  FailLensStatusExpectation,
} from "../types/report";

export interface PlannedTestAssertions {
  title: string;
  assertions: PlannedSourceAssertion[];
  statusExpectation?: FailLensStatusExpectation;
}

export interface PlannedSourceAssertion extends FailLensAssertion {
  sourceRequestOrder?: number;
  sourceStatusExpectation?: FailLensStatusExpectation;
}

interface ParsedString {
  value: string;
  end: number;
}

function skipWhitespace(source: string, start: number): number {
  let index = start;
  while (/\s/.test(source[index] || "")) index += 1;
  return index;
}

function parseString(source: string, start: number): ParsedString | undefined {
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

function firstCodeCharacter(source: string, start: number, end: number, expected: string): number {
  for (let index = start; index < end; index += 1) {
    const ignoredEnd = skipIgnored(source, index);
    if (ignoredEnd !== undefined) {
      index = ignoredEnd - 1;
      continue;
    }
    if (source[index] === expected) return index;
  }
  return -1;
}

function lineAndColumn(source: string, index: number): { line: number; column: number } {
  const before = source.slice(0, index);
  const lines = before.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
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

function titleForExpect(argumentsSource: string, chainSource: string): string {
  const args = splitTopLevel(argumentsSource);
  const messageSource = args[1]?.trim();
  const message = messageSource ? parseString(messageSource, 0)?.value : undefined;
  if (message) return message.replace(/\s+/g, " ").trim();
  const subject = (args[0] || "valor").replace(/\s+/g, " ").trim();
  const chain = chainSource.replace(/\s+/g, " ").replace(/;$/, "").trim();
  return `expect(${subject}) ${chain || "deve atender à validação"}`.slice(0, 220);
}

function targetForExpect(argumentsSource: string): AssertionTarget {
  const subject = splitTopLevel(argumentsSource)[0]?.toLowerCase() || "";
  if (/\bstatus(?:code)?\b/.test(subject)) return "status";
  if (/\bheaders?\b/.test(subject)) return "header";
  if (/\bbody\b|response\s*$/.test(subject)) return "body";
  return "unknown";
}

function statusExpectationFor(chainSource: string, title: string): FailLensStatusExpectation | undefined {
  const exact = chainSource.match(/\.(?:eq|equal)\s*\(\s*(\d{3})\s*\)/i);
  if (exact) {
    const expected = Number(exact[1]);
    return { type: "exact", label: String(expected), expected };
  }

  const oneOf = chainSource.match(/\.oneOf\s*\(\s*\[([^\]]+)]\s*\)/i);
  if (oneOf) {
    const values = (oneOf[1].match(/\b\d{3}\b/g) || []).map(Number);
    if (values.length) {
      const familyLabel = title.match(/\b[1-5]xx(?:\s*\/\s*[1-5]xx)+\b/i)?.[0].replace(/\s/g, "");
      return { type: "set", label: familyLabel || values.join(" ou "), values };
    }
  }

  const minimumMatch = chainSource.match(/\.(?:gte|least)\s*\(\s*(\d{3})\s*\)/i);
  const greaterMatch = chainSource.match(/\.gt\s*\(\s*(\d{3})\s*\)/i);
  const lowerMatch = chainSource.match(/\.lt\s*\(\s*(\d{3})\s*\)/i);
  const maximumMatch = chainSource.match(/\.(?:lte|most)\s*\(\s*(\d{3})\s*\)/i);
  const min = minimumMatch ? Number(minimumMatch[1]) : greaterMatch ? Number(greaterMatch[1]) + 1 : undefined;
  const max = lowerMatch ? Number(lowerMatch[1]) - 1 : maximumMatch ? Number(maximumMatch[1]) : undefined;
  if (min !== undefined || max !== undefined) {
    const family = min !== undefined && max !== undefined && min % 100 === 0 && max === min + 99
      ? `${Math.floor(min / 100)}xx`
      : undefined;
    return {
      type: family ? "family" : "range",
      label: family || `${min ?? "-\u221e"}\u2013${max ?? "+\u221e"}`,
      min,
      max,
    };
  }
  return undefined;
}

function extractExpects(
  source: string,
  bodyStart: number,
  bodyEnd: number,
  file: string,
): PlannedSourceAssertion[] {
  const assertions: PlannedSourceAssertion[] = [];
  for (let index = bodyStart; index < bodyEnd; index += 1) {
    const ignoredEnd = skipIgnored(source, index);
    if (ignoredEnd !== undefined) {
      index = ignoredEnd - 1;
      continue;
    }
    if (source.slice(index, index + 6) !== "expect" || /[\w$]/.test(source[index - 1] || "")) continue;
    const open = skipWhitespace(source, index + 6);
    if (source[open] !== "(") continue;
    const close = matchingDelimiter(source, open, "(", ")");
    if (close < 0 || close > bodyEnd) continue;
    let chainEnd = close + 1;
    while (chainEnd < bodyEnd && source[chainEnd] !== ";" && source[chainEnd] !== "\n") chainEnd += 1;
    if (source[chainEnd] === ";") chainEnd += 1;
    const location = lineAndColumn(source, index);
    const argumentsSource = source.slice(open + 1, close);
    const chainSource = source.slice(close + 1, chainEnd);
    const title = titleForExpect(argumentsSource, chainSource);
    const target = targetForExpect(argumentsSource);
    assertions.push({
      id: `source-${location.line}-${location.column}`,
      title,
      state: "unknown",
      target,
      file,
      line: location.line,
      column: location.column,
      sourceRequestOrder: (source.slice(bodyStart, index).match(/\bcy\s*\.\s*request\s*\(/g) || []).length,
      sourceStatusExpectation: target === "status" ? statusExpectationFor(chainSource, title) : undefined,
    });
    index = close;
  }
  return assertions;
}

export function extractSourceAssertions(source: string, file: string): PlannedTestAssertions[] {
  const tests: PlannedTestAssertions[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const ignoredEnd = skipIgnored(source, index);
    if (ignoredEnd !== undefined) {
      index = ignoredEnd - 1;
      continue;
    }
    const match = source.slice(index).match(/^(it|test|specify)(?:\.(?:only|skip))?\s*\(/);
    if (!match || /[\w$]/.test(source[index - 1] || "")) continue;
    const open = source.indexOf("(", index + match[1].length);
    const close = matchingDelimiter(source, open, "(", ")");
    if (close < 0) continue;
    const titleStart = skipWhitespace(source, open + 1);
    const title = parseString(source, titleStart);
    if (!title) {
      index = close;
      continue;
    }
    const bodyOpen = firstCodeCharacter(source, title.end, close, "{");
    if (bodyOpen < 0) {
      index = close;
      continue;
    }
    const bodyClose = matchingDelimiter(source, bodyOpen, "{", "}");
    if (bodyClose < 0 || bodyClose > close) {
      index = close;
      continue;
    }
    const assertions = extractExpects(source, bodyOpen + 1, bodyClose, file);
    tests.push({
      title: title.value,
      assertions,
      statusExpectation: assertions.find((assertion) => assertion.sourceStatusExpectation)?.sourceStatusExpectation,
    });
    index = close;
  }
  return tests;
}
