import path from "node:path";
import type { FailLensScreenshot, TestState } from "../types/report";
import { asRecord, clampNumber } from "../utils/format";

export interface ScreenshotCaptureContext {
  projectRoot: string;
  screenshotsFolder: string;
  outputDir: string;
}

export interface CapturedScreenshot {
  screenshot: FailLensScreenshot;
  specName: string;
  titleHint: string;
  capturedAt?: number;
}

export interface ScreenshotTestCandidate {
  id: string;
  specPath: string;
  title: string;
  titlePath?: string[];
  state: TestState;
  attempts?: Array<Record<string, unknown>>;
}

function pathApi(...values: string[]): typeof path.win32 | typeof path.posix {
  return values.some((value) => /^[A-Za-z]:[\\/]/.test(value) || value.includes("\\"))
    ? path.win32
    : path.posix;
}

function slash(value: string): string {
  return value.replace(/\\/g, "/");
}

function encodedRelativePath(value: string): string {
  return slash(value).split("/").map((segment) =>
    segment === ".." || segment === "." ? segment : encodeURIComponent(segment),
  ).join("/");
}

function inside(relativePath: string): boolean {
  return Boolean(relativePath)
    && relativePath !== ".."
    && !relativePath.startsWith(`..${path.sep}`)
    && !relativePath.startsWith("../")
    && !relativePath.startsWith("..\\")
    && !path.win32.isAbsolute(relativePath)
    && !path.posix.isAbsolute(relativePath);
}

function positiveInteger(value: unknown): number | undefined {
  const number = clampNumber(value, Number.NaN);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
}

function isoDate(value: unknown): { value?: string; epoch?: number } {
  if (typeof value !== "string") return {};
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? { value: new Date(epoch).toISOString(), epoch } : {};
}

function normalizedSpec(value: string): string {
  return slash(value).replace(/^\.\//, "").toLocaleLowerCase();
}

function canonicalTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function titleFromFile(fileName: string): string {
  return fileName
    .replace(/\.png$/i, "")
    .replace(/\s+\(attempt\s+\d+\)/gi, "")
    .replace(/\s+\(failed\)/gi, "")
    .replace(/\s+\(\d+\)$/g, "")
    .trim();
}

export function captureScreenshotMetadata(
  rawDetails: Record<string, unknown>,
  context: ScreenshotCaptureContext,
): CapturedScreenshot | undefined {
  const rawPath = typeof rawDetails.path === "string" ? rawDetails.path : "";
  if (!rawPath || rawPath.includes("\0")) return undefined;
  const api = pathApi(rawPath, context.projectRoot, context.screenshotsFolder, context.outputDir);
  if (!api.isAbsolute(rawPath)) return undefined;
  const projectRoot = api.resolve(context.projectRoot);
  const screenshotsFolder = api.resolve(projectRoot, context.screenshotsFolder);
  const outputDir = api.resolve(projectRoot, context.outputDir);
  const absolutePath = api.resolve(rawPath);
  const fromScreenshots = api.relative(screenshotsFolder, absolutePath);
  const fromProject = api.relative(projectRoot, absolutePath);
  if (!inside(fromScreenshots) || !inside(fromProject) || api.extname(absolutePath).toLowerCase() !== ".png") {
    return undefined;
  }

  const fileName = api.basename(absolutePath);
  const href = api.relative(outputDir, absolutePath);
  if (!href || api.isAbsolute(href)) return undefined;
  const dimensions = asRecord(rawDetails.dimensions);
  const date = isoDate(rawDetails.takenAt);
  const attemptMatch = fileName.match(/\(attempt\s+(\d+)\)/i);
  const kind = /\(failed\)/i.test(fileName) ? "failure" : "manual";
  const attempt = attemptMatch ? positiveInteger(attemptMatch[1]) : kind === "failure" ? 1 : undefined;
  const screenshot: FailLensScreenshot = {
    relativePath: slash(fromProject),
    href: encodedRelativePath(href),
    fileName,
    size: Math.max(0, clampNumber(rawDetails.size)),
    width: positiveInteger(dimensions.width),
    height: positiveInteger(dimensions.height),
    takenAt: date.value,
    attempt,
    kind,
  };
  for (const key of ["width", "height", "takenAt", "attempt"] as const) {
    if (screenshot[key] === undefined) delete screenshot[key];
  }
  return {
    screenshot,
    specName: normalizedSpec(String(rawDetails.specName || "")),
    titleHint: canonicalTitle(titleFromFile(fileName)),
    capturedAt: date.epoch,
  };
}

function specScore(expected: string, actual: string): number {
  const left = normalizedSpec(expected);
  const right = normalizedSpec(actual);
  if (!left || !right) return 0;
  if (left === right) return 40;
  if (left.endsWith(`/${right}`) || right.endsWith(`/${left}`)) return 30;
  return 0;
}

function attemptAt(candidate: ScreenshotTestCandidate, capturedAt: number | undefined): number | undefined {
  if (capturedAt === undefined) return undefined;
  const attempts = candidate.attempts || [];
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index];
    const start = Date.parse(String(attempt.wallClockStartedAt || ""));
    const duration = clampNumber(attempt.wallClockDuration);
    if (Number.isFinite(start) && capturedAt >= start && capturedAt <= start + duration) return index + 1;
  }
  return undefined;
}

export function associateScreenshots(
  candidates: ScreenshotTestCandidate[],
  captures: CapturedScreenshot[],
): Map<string, FailLensScreenshot[]> {
  const matches = new Map<string, FailLensScreenshot[]>();
  for (const capture of captures) {
    let best: { candidate: ScreenshotTestCandidate; score: number; attempt?: number } | undefined;
    let tied = false;
    for (const candidate of candidates) {
      let score = specScore(candidate.specPath, capture.specName);
      if (!score) continue;
      const fullTitle = canonicalTitle((candidate.titlePath?.length ? candidate.titlePath : [candidate.title]).join(" -- "));
      const shortTitle = canonicalTitle(candidate.title);
      if (capture.titleHint && capture.titleHint === fullTitle) score += 100;
      else if (capture.titleHint && capture.titleHint === shortTitle) score += 80;
      const timedAttempt = attemptAt(candidate, capture.capturedAt);
      if (timedAttempt) score += 50;
      if (capture.screenshot.kind === "failure" && candidate.state === "failed") score += 10;
      const attempt = capture.screenshot.attempt || timedAttempt;
      const attemptState = attempt ? String(candidate.attempts?.[attempt - 1]?.state || "") : "";
      if (attemptState === "failed") score += 20;
      if (score <= 40) continue;
      if (!best || score > best.score) {
        best = { candidate, score, attempt };
        tied = false;
      } else if (score === best.score) {
        tied = true;
      }
    }
    if (!best || tied) continue;
    const screenshot = { ...capture.screenshot, attempt: best.attempt || capture.screenshot.attempt };
    if (screenshot.attempt === undefined) delete screenshot.attempt;
    const list = matches.get(best.candidate.id) || [];
    list.push(screenshot);
    matches.set(best.candidate.id, list);
  }
  for (const screenshots of matches.values()) {
    screenshots.sort((left, right) =>
      Number(right.kind === "failure") - Number(left.kind === "failure")
      || (right.attempt || 0) - (left.attempt || 0)
      || Date.parse(right.takenAt || "") - Date.parse(left.takenAt || ""),
    );
  }
  return matches;
}
