import path from "node:path";
import type { FailLensConfig, ResolvedFailLensConfig } from "../types/config";
import { DEFAULT_MASK_FIELDS } from "../collector/sensitiveMask";
import { pathExists, readJsonFile } from "../utils/fs";

interface ProjectManifest {
  name?: string;
}

export async function loadFailLensConfig(projectRoot: string): Promise<ResolvedFailLensConfig> {
  const configPath = path.join(projectRoot, "faillens.config.js");
  let userConfig: FailLensConfig = {};
  if (await pathExists(configPath)) {
    try {
      delete require.cache[require.resolve(configPath)];
      const loaded = require(configPath) as FailLensConfig | { default?: FailLensConfig };
      userConfig = ("default" in loaded && loaded.default ? loaded.default : loaded) as FailLensConfig;
    } catch (error) {
      throw new Error(
        `Não foi possível carregar faillens.config.js: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  let manifest: ProjectManifest = {};
  try {
    manifest = await readJsonFile<ProjectManifest>(path.join(projectRoot, "package.json"));
  } catch {
    // A detecção do Cypress emitirá a mensagem adequada se package.json não existir.
  }
  const outputDir = path.resolve(projectRoot, userConfig.outputDir || path.join("reports", "faillens"));
  const maskFields = Array.from(new Set([...DEFAULT_MASK_FIELDS, ...(userConfig.maskFields || [])]));
  const maskPatterns = Array.from(new Set((userConfig.maskPatterns || []).map((pattern) =>
    pattern instanceof RegExp ? `/${pattern.source}/${pattern.flags}` : String(pattern),
  ).filter(Boolean)));
  return {
    outputDir,
    projectName: userConfig.projectName || manifest.name,
    runId: userConfig.runId,
    branch: userConfig.branch,
    theme: userConfig.theme === "light" ? "light" : "dark",
    maskFields,
    maskPatterns,
    cypressConfigFile: userConfig.cypressConfigFile,
  };
}
