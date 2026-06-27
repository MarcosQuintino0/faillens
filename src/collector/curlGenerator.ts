import { maskSensitiveData, maskUrl } from "./sensitiveMask";

export interface CurlInput {
  method: string;
  url: string;
  headers?: Record<string, unknown>;
  body?: unknown;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function generateCurl(input: CurlInput, maskFields: string[] = []): string {
  const method = (input.method || "GET").toUpperCase();
  const url = maskUrl(input.url, maskFields);
  const headers = maskSensitiveData(input.headers ?? {}, maskFields);
  const body = maskSensitiveData(input.body, maskFields);
  const lines = [`curl -X ${method} ${shellQuote(url)}`];

  for (const [name, value] of Object.entries(headers)) {
    const rendered = Array.isArray(value) ? value.join(", ") : String(value);
    lines.push(`-H ${shellQuote(`${name}: ${rendered}`)}`);
  }

  if (body !== null && body !== undefined) {
    const rendered = typeof body === "string" ? body : JSON.stringify(body, null, 2);
    lines.push(`-d ${shellQuote(rendered)}`);
  }

  return lines.join(" \\\n  ");
}
