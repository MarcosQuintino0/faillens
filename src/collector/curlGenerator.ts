import { maskSensitiveData, maskUrl, type MaskConfig } from "./sensitiveMask";

export interface CurlInput {
  method: string;
  url: string;
  headers?: Record<string, unknown>;
  body?: unknown;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function generateCurl(input: CurlInput, maskConfig: MaskConfig = []): string {
  const method = (input.method || "GET").toUpperCase();
  const methodArgument = /^[A-Z0-9-]+$/.test(method) ? method : shellQuote(method);
  const url = maskUrl(input.url, maskConfig);
  const headers = maskSensitiveData(input.headers ?? {}, maskConfig);
  const body = maskSensitiveData(input.body, maskConfig);
  const lines = [`curl -X ${methodArgument} ${shellQuote(url)}`];

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
