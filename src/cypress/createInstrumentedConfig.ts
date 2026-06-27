import { promises as fs } from "node:fs";
import path from "node:path";
import type { ResolvedFailLensConfig } from "../types/config";
import type { DetectedCypressProject } from "../cli/detectCypress";
import { ensureDir, writeTextFile } from "../utils/fs";

export interface InstrumentedFiles {
  workDir: string;
  configPath: string;
  supportPath: string;
  resultsDir: string;
}

export async function createInstrumentedConfig(
  project: DetectedCypressProject,
  config: ResolvedFailLensConfig,
): Promise<InstrumentedFiles> {
  const workDir = path.join(project.projectRoot, ".faillens");
  const resultsDir = path.join(workDir, "results");
  const configPath = path.join(workDir, "cypress.config.generated.js");
  const supportPath = path.join(workDir, "support.generated.js");
  await ensureDir(workDir);
  await fs.rm(resultsDir, { recursive: true, force: true });
  await ensureDir(resultsDir);
  await writeTextFile(path.join(workDir, "package.json"), '{"type":"commonjs","private":true}\n');

  const hooksModule = require.resolve("./support/hooks");
  const captureModule = require.resolve("./support/autoCapture");
  const registerModule = require.resolve("./registerNodeEvents");
  const supportSource = [
    '"use strict";',
    project.supportPath ? `require(${JSON.stringify(project.supportPath)});` : "",
    `const { installFailLensHooks } = require(${JSON.stringify(hooksModule)});`,
    `const { installAutoCapture } = require(${JSON.stringify(captureModule)});`,
    "installFailLensHooks();",
    "installAutoCapture();",
    "",
  ].filter(Boolean).join("\n");
  await writeTextFile(supportPath, supportSource);

  const runtimeOptions = {
    projectRoot: project.projectRoot,
    resultsDir,
    outputDir: config.outputDir,
    config,
  };
  const configSource = `"use strict";
const loaded = require(${JSON.stringify(project.configPath)});
const original = loaded && loaded.default ? loaded.default : loaded;
const { registerNodeEvents } = require(${JSON.stringify(registerModule)});
const originalE2e = original.e2e || {};
const originalSetup = originalE2e.setupNodeEvents;

function collector(realOn) {
  const events = new Map();
  const collect = (name, handler) => {
    const handlers = events.get(name) || [];
    handlers.push(handler);
    events.set(name, handlers);
  };
  const flush = () => {
    for (const [name, handlers] of events) {
      if (name === "task") {
        realOn(name, Object.assign({}, ...handlers));
      } else if (handlers.length === 1) {
        realOn(name, handlers[0]);
      } else {
        realOn(name, (...args) => {
          let last;
          let pending;
          for (const handler of handlers) {
            if (pending) pending = pending.then(() => handler(...args));
            else {
              const value = handler(...args);
              if (value && typeof value.then === "function") pending = Promise.resolve(value);
              else if (value !== undefined) last = value;
            }
          }
          return pending ? pending.then((value) => value === undefined ? last : value) : last;
        });
      }
    }
  };
  return { collect, flush };
}

module.exports = {
  ...original,
  e2e: {
    ...originalE2e,
    supportFile: ${JSON.stringify(supportPath)},
    setupNodeEvents(on, config) {
      const events = collector(on);
      const attach = (resolved) => {
        const effectiveConfig = resolved && typeof resolved === "object" ? resolved : config;
        effectiveConfig.supportFile = ${JSON.stringify(supportPath)};
        if (effectiveConfig.e2e && typeof effectiveConfig.e2e === "object") {
          effectiveConfig.e2e.supportFile = ${JSON.stringify(supportPath)};
        }
        registerNodeEvents(events.collect, effectiveConfig, ${JSON.stringify(runtimeOptions)});
        events.flush();
        return effectiveConfig;
      };
      if (typeof originalSetup !== "function") return attach(config);
      const result = originalSetup(events.collect, config);
      return result && typeof result.then === "function" ? result.then(attach) : attach(result);
    }
  }
};
`;
  await writeTextFile(configPath, configSource);
  return { workDir, configPath, supportPath, resultsDir };
}
