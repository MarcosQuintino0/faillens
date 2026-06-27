import path from "node:path";
import { readJsonFile, writeJsonFile } from "../utils/fs";

interface PackageManifest {
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

export async function initCommand(projectRoot = process.cwd()): Promise<number> {
  const packagePath = path.join(projectRoot, "package.json");
  let manifest: PackageManifest;
  try {
    manifest = await readJsonFile<PackageManifest>(packagePath);
  } catch {
    throw new Error(`Não foi possível abrir ${packagePath}. Execute o comando na raiz do projeto.`);
  }
  manifest.scripts ||= {};
  if (manifest.scripts["test:report"]) {
    console.log('[FailLens] O script "test:report" já existe; nenhuma alteração foi feita.');
    return 0;
  }
  manifest.scripts["test:report"] = "faillens run";
  await writeJsonFile(packagePath, manifest);
  console.log('[FailLens] Pronto! Adicionamos "test:report": "faillens run" ao package.json.');
  console.log("[FailLens] Execute: npm run test:report");
  return 0;
}
