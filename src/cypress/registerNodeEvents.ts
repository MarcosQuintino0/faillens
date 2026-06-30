import { promises as fs } from "node:fs";
import path from "node:path";
import { RequestStore } from "../collector/requestStore";
import { buildReportModel } from "../reporter/buildReportModel";
import { generateHtml } from "../reporter/generateHtml";
import { generateJson } from "../reporter/generateJson";
import type { ResolvedFailLensConfig } from "../types/config";
import type { FailLensReport, FailLensSpec } from "../types/report";
import { ensureDir, pathExists, readJsonFile, writeJsonFile } from "../utils/fs";
import { extractSourceAssertions } from "../collector/extractSourceAssertions";
import {
  extractTestTags,
  findImportSource,
  parseCatalogModule,
  type PlannedTestTags,
} from "../collector/extractTestTags";
import { parseContractJsdoc } from "../collector/parseContractJsdoc";
import {
  associateScreenshots,
  captureScreenshotMetadata,
  type CapturedScreenshot,
} from "./screenshotEvidence";

export interface RegisterNodeEventsOptions {
  projectRoot: string;
  resultsDir: string;
  outputDir: string;
  config: ResolvedFailLensConfig;
  generateOnAfterRun?: boolean;
}

type CypressOn = (event: string, handler: unknown) => void;

// Resolve as tags de catálogo (CatalogoTags.X) lendo o módulo de tags importado
// pelo spec e mapeando constante -> valor real declarado. Determinístico e
// degradável: se o módulo não for encontrado/parseável, as tags de catálogo
// simplesmente não resolvem (as tags string como "@bug" já foram capturadas).
async function resolveCatalogTags(
  planned: PlannedTestTags[],
  source: string,
  specFile: string,
): Promise<void> {
  const objects = new Set<string>();
  for (const test of planned) for (const ref of test.catalogRefs) objects.add(ref.object);
  if (!objects.size) return;

  const maps = new Map<string, Map<string, string>>();
  for (const object of objects) {
    const importPath = findImportSource(source, object);
    if (!importPath || !importPath.startsWith(".")) continue;
    const base = path.resolve(path.dirname(specFile), importPath);
    const candidates = [base, `${base}.js`, `${base}.ts`, path.join(base, "index.js")];
    for (const candidate of candidates) {
      try {
        const moduleSource = await fs.readFile(candidate, "utf8");
        const parsed = parseCatalogModule(moduleSource);
        if (parsed.size) {
          maps.set(object, parsed);
          break;
        }
      } catch {
        // tenta o próximo candidato
      }
    }
  }

  for (const test of planned) {
    for (const ref of test.catalogRefs) {
      const value = maps.get(ref.object)?.get(ref.name);
      if (value && !test.tags.includes(value)) test.tags.unshift(value);
    }
  }
}

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
  const store = new RequestStore(options.config.maskFields, options.config.maskPatterns);
  const screenshots: CapturedScreenshot[] = [];
  const screenshotsFolder = path.resolve(
    options.projectRoot,
    typeof cypressConfig.screenshotsFolder === "string"
      ? cypressConfig.screenshotsFolder
      : "cypress/screenshots",
  );

  on("task", {
    "faillens:setTest": (payload: Parameters<RequestStore["setTest"]>[0]) => store.setTest(payload),
    "faillens:addRequest": (payload: Parameters<RequestStore["addRequest"]>[0]) => store.addRequest(payload),
    "faillens:finishRequest": (payload: Parameters<RequestStore["finishRequest"]>[0]) => store.finishRequest(payload),
    "faillens:setTestResult": (payload: Parameters<RequestStore["setTestResult"]>[0]) => store.setTestResult(payload),
  });

  on("after:screenshot", (details: Record<string, unknown>) => {
    const capture = captureScreenshotMetadata(details, {
      projectRoot: options.projectRoot,
      screenshotsFolder,
      outputDir: options.outputDir,
    });
    if (capture) screenshots.push(capture);
  });

  on("after:spec", async (spec: Record<string, unknown>, results?: Record<string, unknown>) => {
    const partial = store.mergeAfterSpec(spec, results);
    const resultTests = Array.isArray(results?.tests) ? results.tests.map((item) => item as Record<string, unknown>) : [];
    const candidates = partial.tests.map((test) => {
      const fullTitle = (test.titlePath?.length ? test.titlePath : [test.title]).join(" > ");
      const result = resultTests.find((item) => {
        const title = Array.isArray(item.title) ? item.title.map(String).join(" > ") : String(item.title || "");
        return title === fullTitle || title === test.title;
      });
      return {
        id: test.id,
        specPath: partial.specPath,
        title: test.title,
        titlePath: test.titlePath,
        state: test.state,
        attempts: Array.isArray(result?.attempts)
          ? result.attempts.map((item) => item as Record<string, unknown>)
          : [],
      };
    });
    const associated = associateScreenshots(candidates, screenshots.splice(0));
    for (const [testId, metadata] of associated) store.setTestScreenshots(partial.specPath, testId, metadata);
    const specFile = String(spec.absolute || path.resolve(options.projectRoot, partial.specPath));
    try {
      const source = await fs.readFile(specFile, "utf8");
      store.mergeSourceAssertions(partial.specPath, extractSourceAssertions(source, specFile));
      const planned = extractTestTags(source);
      await resolveCatalogTags(planned, source, specFile);
      store.mergeTestTags(partial.specPath, planned);
      store.mergeContract(partial.specPath, parseContractJsdoc(source, partial.specPath));
    } catch {
      // O relatório continua válido quando o spec não está disponível para leitura estática.
    }
    const enriched = store.snapshotSpec(partial.specPath);
    await writeJsonFile(path.join(options.resultsDir, resultFileName(enriched.specPath)), enriched);
  });

  on("after:run", async () => {
    if (options.generateOnAfterRun === false) return;
    const specs = store.snapshot();
    await generateReportArtifacts(specs, options.outputDir, options.config);
    console.log(`[FailLens] Relatório gerado em ${path.join(options.outputDir, "index.html")}`);
  });

  return cypressConfig;
}
