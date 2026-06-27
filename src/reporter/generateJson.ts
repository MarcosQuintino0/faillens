import path from "node:path";
import type { FailLensReport } from "../types/report";
import { writeJsonFile } from "../utils/fs";

export async function generateJson(report: FailLensReport, output: string): Promise<string> {
  const file = path.extname(output).toLowerCase() === ".json"
    ? output
    : path.join(output, "faillens-report.json");
  await writeJsonFile(file, report);
  return file;
}
