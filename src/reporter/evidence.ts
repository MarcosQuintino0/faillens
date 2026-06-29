import type { FailLensEvidence, FailLensScreenshot } from "../types/report";

export interface EvidenceContent {
  title: string;
  specPath: string;
  failure: string;
  expected: string;
  actual: string;
  curl: string;
  bdd?: string;
  screenshot?: Pick<FailLensScreenshot, "relativePath" | "href">;
}

function validRelativePath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || value.includes("\0") || value.includes("\\")) return undefined;
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value) || !/\.png$/i.test(value)) return undefined;
  const parts = value.split("/");
  return parts.some((part) => !part || part === "." || part === "..") ? undefined : value;
}

function validHref(value: unknown, relativePath: string): string | undefined {
  if (typeof value !== "string" || !value || value.includes("\0") || value.includes("\\")) return undefined;
  if (/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/|\/)/.test(value) || /[?#]/.test(value)) return undefined;
  const parts = value.split("/");
  const decoded: string[] = [];
  try {
    for (const part of parts) {
      const item = decodeURIComponent(part);
      if (!item || item === "." || item.includes("/") || item.includes("\\") || item.includes("\0")) return undefined;
      decoded.push(item);
    }
  } catch {
    return undefined;
  }
  const suffix = decoded.filter((part) => part !== "..").join("/");
  return suffix === relativePath ? value : undefined;
}

export function sanitizeEvidence(value: FailLensEvidence | undefined): FailLensEvidence | undefined {
  if (!Array.isArray(value?.screenshots)) return undefined;
  const screenshots: FailLensScreenshot[] = [];
  for (const source of value.screenshots) {
    const relativePath = validRelativePath(source?.relativePath);
    if (!relativePath) continue;
    const href = validHref(source.href, relativePath);
    const fileName = relativePath.split("/").at(-1);
    if (!href || source.fileName !== fileName || (source.kind !== "failure" && source.kind !== "manual")) continue;
    if (!Number.isFinite(source.size) || source.size < 0) continue;
    const screenshot: FailLensScreenshot = {
      relativePath,
      href,
      fileName,
      size: source.size,
      kind: source.kind,
    };
    if (Number.isFinite(source.width) && Number(source.width) > 0) screenshot.width = Math.round(Number(source.width));
    if (Number.isFinite(source.height) && Number(source.height) > 0) screenshot.height = Math.round(Number(source.height));
    if (source.takenAt && Number.isFinite(Date.parse(source.takenAt))) screenshot.takenAt = new Date(source.takenAt).toISOString();
    if (Number.isInteger(source.attempt) && Number(source.attempt) > 0) screenshot.attempt = Number(source.attempt);
    screenshots.push(screenshot);
  }
  return screenshots.length ? { screenshots } : undefined;
}

export function buildEvidenceText(input: EvidenceContent): string {
  const oneLine = (value: unknown): string => String(value ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim();
  const bdd = typeof input.bdd === "string"
    ? input.bdd.split(/\r?\n/).map(oneLine).filter(Boolean).join("\n")
    : "";
  return [
    "Evidência FailLens",
    "",
    `Teste: ${oneLine(input.title)}`,
    `Spec: ${oneLine(input.specPath)}`,
    `Falha: ${oneLine(input.failure)}`,
    `Esperado: ${oneLine(input.expected)}`,
    `Recebido: ${oneLine(input.actual)}`,
    ...(bdd ? ["", "Cenário BDD:", bdd] : []),
    "",
    "cURL:",
    String(input.curl || "Não disponível"),
    "",
    "Screenshot:",
    oneLine(input.screenshot?.relativePath || "Não disponível"),
  ].join("\n");
}

export function buildEvidenceHtml(input: EvidenceContent, imageDataUrl?: string): string {
  const escape = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
  const safeImage = typeof imageDataUrl === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl)
    ? `<p><img alt="Screenshot do Cypress" src="${imageDataUrl}"></p>`
    : "";
  const screenshot = input.screenshot
    ? `<a href="${escape(input.screenshot.href)}">${escape(input.screenshot.relativePath)}</a>`
    : "Não disponível";
  const bdd = typeof input.bdd === "string" && input.bdd.trim()
    ? `<h2>Cenário BDD</h2><pre>${escape(input.bdd)}</pre>`
    : "";
  return `<article><h1>Evidência FailLens</h1><p><strong>Teste:</strong> ${escape(input.title)}<br>`
    + `<strong>Spec:</strong> ${escape(input.specPath)}<br><strong>Falha:</strong> ${escape(input.failure)}<br>`
    + `<strong>Esperado:</strong> ${escape(input.expected)}<br><strong>Recebido:</strong> ${escape(input.actual)}</p>`
    + `${bdd}<h2>cURL</h2><pre>${escape(input.curl || "Não disponível")}</pre><p><strong>Screenshot:</strong> ${screenshot}</p>${safeImage}</article>`;
}
