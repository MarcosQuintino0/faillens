import { spawn } from "node:child_process";
import path from "node:path";
import { startReportServer } from "../server/localReportServer";
import { pathExists } from "../utils/fs";

export interface OpenOptions {
  report?: string;
  port?: number;
  browser?: boolean;
  idleTimeoutMs?: number;
}

export interface ReportLocation {
  reportDir: string;
  projectRoot: string;
}

export async function resolveReportLocation(report: string | undefined, projectRoot: string): Promise<ReportLocation> {
  const target = path.resolve(projectRoot, report || path.join("reports", "faillens"));
  const reportDir = path.extname(target).toLowerCase() === ".html" ? path.dirname(target) : target;
  if (!(await pathExists(path.join(reportDir, "index.html"))) || !(await pathExists(path.join(reportDir, "faillens-report.json")))) {
    throw new Error(`Não foi encontrado um relatório FailLens válido em ${reportDir}.`);
  }
  const defaultDir = path.resolve(projectRoot, "reports", "faillens");
  return { reportDir, projectRoot: reportDir === defaultDir ? projectRoot : path.resolve(projectRoot) };
}

function launchBrowser(url: string): void {
  const command = process.platform === "win32" ? "cmd.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.once("error", (error) => console.error(`[FailLens] Não foi possível abrir o navegador: ${error.message}`));
  child.unref();
}

export async function openReport(options: OpenOptions = {}, projectRoot = process.cwd()): Promise<void> {
  const location = await resolveReportLocation(options.report, projectRoot);
  const server = await startReportServer({
    ...location,
    port: options.port,
    idleTimeoutMs: options.idleTimeoutMs,
  });
  console.log(`[FailLens] Relatório aberto em ${server.url}`);
  console.log("[FailLens] O servidor será encerrado automaticamente ao fechar a última aba.");
  if (options.browser !== false) launchBrowser(server.url);
  const stop = (): void => { void server.close(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await server.closed;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await server.close();
  }
}

export async function openCommand(options: OpenOptions = {}, projectRoot = process.cwd()): Promise<number> {
  await openReport(options, projectRoot);
  return 0;
}
