import path from "node:path";
import { buildReportModel } from "../reporter/buildReportModel";
import { generateHtml } from "../reporter/generateHtml";
import type { FailLensReport } from "../types/report";
import { readJsonFile } from "../utils/fs";

export interface GenerateOptions {
  input?: string;
  output?: string;
}

export async function generateCommand(
  options: GenerateOptions,
  projectRoot = process.cwd(),
): Promise<number> {
  if (!options.input || !options.output) {
    throw new Error("Uso: faillens generate --input caminho.json --output caminho.html");
  }
  const input = path.resolve(projectRoot, options.input);
  const output = path.resolve(projectRoot, options.output);
  const source = await readJsonFile<FailLensReport>(input);
  if (!source || !Array.isArray(source.specs)) {
    throw new Error("O arquivo de entrada não contém um relatório FailLens válido.");
  }
  const report = buildReportModel(source.specs, {
    generatedAt: source.generatedAt,
    config: {
      projectName: source.project?.name,
      runId: source.project?.runId,
      branch: source.project?.branch,
      theme: source.theme || "dark",
      maskFields: [],
    },
  });
  const file = await generateHtml(report, output);
  console.log(`[FailLens] HTML standalone gerado em ${file}`);
  return 0;
}
