import { promises as fs } from "node:fs";
import path from "node:path";
import { RequestStore } from "../collector/requestStore";
import { buildReportModel } from "../reporter/buildReportModel";
import { generateHtml } from "../reporter/generateHtml";
import { generateJson } from "../reporter/generateJson";
import type { ResolvedFailLensConfig } from "../types/config";
import type { FailLensReport, FailLensSpec } from "../types/report";
import { ensureDir, pathExists, readJsonFile, writeJsonFile } from "../utils/fs";

export interface RegisterNodeEventsOptions {
  projectRoot: string;
  resultsDir: string;
  outputDir: string;
  config: ResolvedFailLensConfig;
}

type CypressOn = (event: string, handler: unknown) => void;

function resultFileName(specPath: string): string {
  let hash = 5381;
  for (const character of specPath) hash = ((hash << 5) + hash) ^ character.charCodeAt(0);
  return `spec-${(hash >>> 0).toString(36)}.json`;
}

export async function generateReportArtifacts(
  specs: FailLensSpec[],
  outputDir: string,
  config: Partial<ResolvedFailLensConfig> = {},
): Promise<FailLensReport> {
  const report = buildReportModel(specs, { config });
  await ensureDir(outputDir);
  await Promise.all([generateJson(report, outputDir), generateHtml(report, outputDir)]);
  return report;
}

export async function loadPartialSpecs(resultsDir: string): Promise<FailLensSpec[]> {
  if (!(await pathExists(resultsDir))) return [];
  const names = (await fs.readdir(resultsDir)).filter((name) => name.endsWith(".json")).sort();
  const byPath = new Map<string, FailLensSpec>();
  for (const name of names) {
    try {
      const spec = await readJsonFile<FailLensSpec>(path.join(resultsDir, name));
      if (spec?.specPath && Array.isArray(spec.tests)) byPath.set(spec.specPath, spec);
    } catch {
      // Um parcial corrompido não impede que os demais specs gerem relatório.
    }
  }
  return Array.from(byPath.values());
}

export function registerNodeEvents(
  on: CypressOn,
  cypressConfig: Record<string, unknown>,
  options: RegisterNodeEventsOptions,
): Record<string, unknown> {
  const store = new RequestStore(options.config.maskFields);

  on("task", {
    "faillens:setTest": (payload: Parameters<RequestStore["setTest"]>[0]) => store.setTest(payload),
    "faillens:addRequest": (payload: Parameters<RequestStore["addRequest"]>[0]) => store.addRequest(payload),
    "faillens:finishRequest": (payload: Parameters<RequestStore["finishRequest"]>[0]) => store.finishRequest(payload),
    "faillens:setTestResult": (payload: Parameters<RequestStore["setTestResult"]>[0]) => store.setTestResult(payload),
  });

  on("after:spec", async (spec: Record<string, unknown>, results?: Record<string, unknown>) => {
    const partial = store.mergeAfterSpec(spec, results);
    await writeJsonFile(path.join(options.resultsDir, resultFileName(partial.specPath)), partial);
  });

  on("after:run", async () => {
    const specs = store.snapshot();
    await generateReportArtifacts(specs, options.outputDir, options.config);
    console.log(`[FailLens] Relatório gerado em ${path.join(options.outputDir, "index.html")}`);
  });

  return cypressConfig;
}
