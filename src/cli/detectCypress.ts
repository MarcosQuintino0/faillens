import path from "node:path";
import { readJsonFile, pathExists } from "../utils/fs";

export const CYPRESS_NOT_FOUND_MESSAGE =
  "Não foi possível detectar um projeto Cypress. Nesta versão, FailLens suporta apenas Cypress E2E com cypress.config.js.";

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface DetectedCypressProject {
  projectRoot: string;
  packageJsonPath: string;
  configPath: string;
  cypressDir: string;
  supportPath?: string;
  outputDir: string;
}

export async function detectCypress(
  projectRoot = process.cwd(),
  configuredFile?: string,
): Promise<DetectedCypressProject> {
  const root = path.resolve(projectRoot);
  const packageJsonPath = path.join(root, "package.json");
  if (!(await pathExists(packageJsonPath))) throw new Error(CYPRESS_NOT_FOUND_MESSAGE);
  const manifest = await readJsonFile<PackageManifest>(packageJsonPath);
  const hasDependency = [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
  ].some((dependencies) => Boolean(dependencies?.cypress));
  const configPath = path.resolve(root, configuredFile || "cypress.config.js");
  const cypressDir = path.join(root, "cypress");
  if (!hasDependency || !(await pathExists(configPath)) || !(await pathExists(cypressDir))) {
    throw new Error(CYPRESS_NOT_FOUND_MESSAGE);
  }

  const supportCandidates = [
    path.join(cypressDir, "support", "e2e.js"),
    path.join(cypressDir, "support", "index.js"),
  ];
  let supportPath: string | undefined;
  for (const candidate of supportCandidates) {
    if (await pathExists(candidate)) {
      supportPath = candidate;
      break;
    }
  }

  return {
    projectRoot: root,
    packageJsonPath,
    configPath,
    cypressDir,
    supportPath,
    outputDir: path.join(root, "reports", "faillens"),
  };
}
