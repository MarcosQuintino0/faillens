import { maskSensitiveText } from "../../collector/sensitiveMask";
import type { FailLensError } from "../../types/report";

function parseLiteral(value: string): unknown {
  const clean = value.trim().replace(/[.,;]$/, "");
  if (/^-?\d+(?:\.\d+)?$/.test(clean)) return Number(clean);
  if (clean === "true") return true;
  if (clean === "false") return false;
  if (clean === "null") return null;
  return clean.replace(/^['"`]|['"`]$/g, "");
}

function sourceLocation(stack?: string): Pick<FailLensError, "file" | "line" | "column"> {
  if (!stack) return {};
  const candidates = Array.from(
    stack.matchAll(/(?:\(|\s|^)((?:[A-Za-z]:)?[^()\n]+?\.(?:[cm]?[jt]sx?)):(\d+):(\d+)\)?/g),
  );
  const preferred =
    candidates.find((match) => !/node_modules|cypress[\\/]runner/i.test(match[1])) ?? candidates[0];
  if (!preferred) return {};
  return {
    file: preferred[1].trim(),
    line: Number(preferred[2]),
    column: Number(preferred[3]),
  };
}

export function parseAssertionError(
  input: unknown,
  maskFields: string[] = [],
): FailLensError {
  const raw =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : { message: String(input ?? "Erro desconhecido") };
  const message = maskSensitiveText(String(raw.message ?? "Erro desconhecido"), maskFields);
  const stack = raw.stack ? maskSensitiveText(String(raw.stack), maskFields) : undefined;
  const location = sourceLocation(stack);
  const result: FailLensError = {
    name: String(raw.name ?? (/assert/i.test(message) ? "AssertionError" : "Error")),
    message,
    stack,
    file: raw.file ? String(raw.file) : location.file,
    line: typeof raw.line === "number" ? raw.line : location.line,
    column: typeof raw.column === "number" ? raw.column : location.column,
  };

  if (raw.expected !== undefined) result.expected = raw.expected;
  if (raw.actual !== undefined) result.actual = raw.actual;
  if (raw.assertionMessage) {
    result.assertionMessage = maskSensitiveText(String(raw.assertionMessage), maskFields);
  }

  const descriptive = message.match(/^(?:AssertionError:\s*)?(.+?):\s*expected\s+/i);
  if (descriptive && !result.assertionMessage) result.assertionMessage = descriptive[1].trim();

  const gotPattern = message.match(
    /expected\s+(?:response\.)?status\s+to\s+(?:equal|eq|be)\s+([^\s,;]+).*?\b(?:but\s+)?got\s+([^\s,;]+)/i,
  );
  if (gotPattern) {
    result.expected = parseLiteral(gotPattern[1]);
    result.actual = parseLiteral(gotPattern[2]);
    return result;
  }

  const equality = message.match(
    /expected\s+(.+?)\s+to\s+(?:deep\s+)?(?:equal|eq)\s+([^\n,;]+?)(?:\s+but\s+got\s+.+)?$/im,
  );
  if (equality) {
    result.actual = parseLiteral(equality[1]);
    result.expected = parseLiteral(equality[2]);
    return result;
  }

  const below = message.match(/expected\s+(.+?)\s+to\s+be\s+below\s+([^\s,;]+)/i);
  if (below) {
    result.actual = parseLiteral(below[1]);
    result.expected = parseLiteral(below[2]);
  }

  if (!result.assertionMessage && /assert|expected/i.test(message)) {
    result.assertionMessage = message.replace(/^AssertionError:\s*/i, "");
  }
  return result;
}
