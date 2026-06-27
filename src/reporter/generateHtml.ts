import path from "node:path";
import type { FailLensReport } from "../types/report";
import { reportTemplate } from "../templates/reportTemplate";
import { writeTextFile } from "../utils/fs";

export async function generateHtml(report: FailLensReport, output: string): Promise<string> {
  const file = path.extname(output).toLowerCase() === ".html" ? output : path.join(output, "index.html");
  await writeTextFile(file, reportTemplate(report));
  return file;
}
