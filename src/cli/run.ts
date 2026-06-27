import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInstrumentedConfig } from "../cypress/createInstrumentedConfig";
import { generateReportArtifacts, loadPartialSpecs } from "../cypress/registerNodeEvents";
import { detectCypress } from "./detectCypress";
import { loadFailLensConfig } from "./config";

function resolveCypressBin(projectRoot: string): string {
  try {
    const packageFile = require.resolve("cypress/package.json", { paths: [projectRoot] });
    const bin = path.join(path.dirname(packageFile), "bin", "cypress");
    if (existsSync(bin)) return bin;
    if (existsSync(`${bin}.js`)) return `${bin}.js`;
    throw new Error("binário ausente");
  } catch {
    throw new Error(
      "O Cypress está declarado no package.json, mas não foi encontrado em node_modules. Execute npm install antes de usar o FailLens.",
    );
  }
}

function executeCypress(
  projectRoot: string,
  cypressBin: string,
  configPath: string,
  forwardedArgs: string[],
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cypressBin, "run", "--config-file", configPath, ...forwardedArgs],
      { cwd: projectRoot, env: process.env, stdio: "inherit", windowsHide: true },
    );
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal) console.error(`[FailLens] Cypress foi encerrado pelo sinal ${signal}.`);
      resolve(typeof code === "number" ? code : 1);
    });
  });
}

export async function runCommand(
  forwardedArgs: string[] = [],
  projectRoot = process.cwd(),
): Promise<number> {
  console.log("[FailLens] Detectando o projeto Cypress…");
  const config = await loadFailLensConfig(projectRoot);
  const project = await detectCypress(projectRoot, config.cypressConfigFile);
  const generated = await createInstrumentedConfig(project, config);
  const cypressBin = resolveCypressBin(project.projectRoot);
  console.log(`[FailLens] Executando Cypress com ${path.relative(project.projectRoot, generated.configPath)}…`);

  let exitCode = 1;
  try {
    exitCode = await executeCypress(
      project.projectRoot,
      cypressBin,
      generated.configPath,
      forwardedArgs,
    );
  } finally {
    try {
      const specs = await loadPartialSpecs(generated.resultsDir);
      await generateReportArtifacts(specs, config.outputDir, config);
      console.log(`[FailLens] Relatório disponível em ${path.join(config.outputDir, "index.html")}`);
      console.log(`[FailLens] Dados disponíveis em ${path.join(config.outputDir, "faillens-report.json")}`);
    } catch (error) {
      console.error(
        `[FailLens] Não foi possível finalizar o relatório: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (exitCode === 0) exitCode = 1;
    }
  }
  return exitCode;
}
