import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";

export interface ReportServerOptions {
  reportDir: string;
  projectRoot: string;
  port?: number;
  idleTimeoutMs?: number;
  closeGraceMs?: number;
}

export interface ReportServer {
  url: string;
  port: number;
  token: string;
  closed: Promise<void>;
  close(): Promise<void>;
}

function secureTokenMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const left = createHash("sha256").update(received).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

function writeSecurityHeaders(response: ServerResponse, contentType: string): void {
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

function collectEvidencePaths(report: unknown): Set<string> {
  const allowed = new Set<string>();
  if (!report || typeof report !== "object") return allowed;
  const specs = (report as { specs?: unknown }).specs;
  if (!Array.isArray(specs)) return allowed;
  for (const spec of specs) {
    const tests = spec && typeof spec === "object" ? (spec as { tests?: unknown }).tests : undefined;
    if (!Array.isArray(tests)) continue;
    for (const test of tests) {
      const evidence = test && typeof test === "object" ? (test as { evidence?: unknown }).evidence : undefined;
      const screenshots = evidence && typeof evidence === "object"
        ? (evidence as { screenshots?: unknown }).screenshots
        : undefined;
      if (!Array.isArray(screenshots)) continue;
      for (const screenshot of screenshots) {
        const relativePath = screenshot && typeof screenshot === "object"
          ? (screenshot as { relativePath?: unknown }).relativePath
          : undefined;
        if (typeof relativePath === "string") allowed.add(relativePath.replace(/\\/g, "/"));
      }
    }
  }
  return allowed;
}

export async function startReportServer(options: ReportServerOptions): Promise<ReportServer> {
  const host = "127.0.0.1";
  const reportDir = path.resolve(options.reportDir);
  const projectRoot = path.resolve(options.projectRoot);
  const realProjectRoot = await fs.realpath(projectRoot);
  const htmlPath = path.join(reportDir, "index.html");
  const jsonPath = path.join(reportDir, "faillens-report.json");
  const [standaloneHtml, reportText] = await Promise.all([
    fs.readFile(htmlPath, "utf8"),
    fs.readFile(jsonPath, "utf8"),
  ]);
  const allowedEvidence = collectEvidencePaths(JSON.parse(reportText) as unknown);
  const localHtml = standaloneHtml.replace(/connect-src\s+'none'/, "connect-src 'self'");
  const token = randomBytes(24).toString("base64url");
  const clients = new Set<ServerResponse>();
  let idleTimer: NodeJS.Timeout | undefined;
  let graceTimer: NodeJS.Timeout | undefined;
  let closing: Promise<void> | undefined;
  let resolveClosed: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });

  const server = createServer((request, response) => {
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : options.port || 0;
    const hostHeader = request.headers.host || "";
    if (hostHeader !== `${host}:${port}` && hostHeader !== `localhost:${port}`) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const url = new URL(request.url || "/", `http://${hostHeader}`);
    const authorized = secureTokenMatches(url.searchParams.get("token"), token);
    const resetIdle = (): void => {
      if (idleTimer) clearTimeout(idleTimer);
      if (clients.size === 0) idleTimer = setTimeout(() => void close(), options.idleTimeoutMs ?? 15 * 60_000);
    };
    resetIdle();

    if (url.pathname === "/") {
      if (!authorized) { response.writeHead(403).end("Forbidden"); return; }
      writeSecurityHeaders(response, "text/html; charset=utf-8");
      response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; font-src data:; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'");
      response.end(localHtml);
      return;
    }
    if (url.pathname === "/__faillens/health") {
      if (!authorized) { response.writeHead(403).end("Forbidden"); return; }
      writeSecurityHeaders(response, "application/json; charset=utf-8");
      response.end('{"status":"ok"}');
      return;
    }
    if (url.pathname === "/faillens-report.json") {
      if (!authorized) { response.writeHead(403).end("Forbidden"); return; }
      writeSecurityHeaders(response, "application/json; charset=utf-8");
      response.end(reportText);
      return;
    }
    if (url.pathname === "/__faillens/events") {
      if (!authorized) { response.writeHead(403).end("Forbidden"); return; }
      if (idleTimer) clearTimeout(idleTimer);
      if (graceTimer) clearTimeout(graceTimer);
      writeSecurityHeaders(response, "text/event-stream; charset=utf-8");
      response.setHeader("Connection", "keep-alive");
      response.flushHeaders();
      clients.add(response);
      response.write("event: ready\ndata: connected\n\n");
      const remove = (): void => {
        clients.delete(response);
        if (clients.size === 0 && !closing) {
          graceTimer = setTimeout(() => void close(), options.closeGraceMs ?? 7_500);
        }
      };
      request.once("close", remove);
      return;
    }
    if (url.pathname === "/__faillens/evidence") {
      if (!authorized) { response.writeHead(403).end("Forbidden"); return; }
      const relativePath = (url.searchParams.get("path") || "").replace(/\\/g, "/");
      if (!allowedEvidence.has(relativePath) || path.posix.extname(relativePath).toLowerCase() !== ".png") {
        response.writeHead(404).end("Not found");
        return;
      }
      const file = path.resolve(projectRoot, ...relativePath.split("/"));
      const relative = path.relative(projectRoot, file);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        response.writeHead(404).end("Not found");
        return;
      }
      void fs.realpath(file).then(async (realFile) => {
        const realRelative = path.relative(realProjectRoot, realFile);
        if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
          response.writeHead(404).end("Not found");
          return;
        }
        const stat = await fs.stat(realFile);
        if (!stat.isFile()) { response.writeHead(404).end("Not found"); return; }
        writeSecurityHeaders(response, "image/png");
        response.setHeader("Content-Length", stat.size);
        createReadStream(realFile).on("error", () => response.destroy()).pipe(response);
      }).catch(() => { if (!response.headersSent) response.writeHead(404).end("Not found"); });
      return;
    }
    response.writeHead(404).end("Not found");
  });

  const close = async (): Promise<void> => {
    if (closing) return closing;
    closing = new Promise<void>((resolve) => {
      if (idleTimer) clearTimeout(idleTimer);
      if (graceTimer) clearTimeout(graceTimer);
      for (const client of clients) client.end();
      clients.clear();
      server.close(() => { resolveClosed?.(); resolve(); });
      server.closeIdleConnections?.();
    });
    return closing;
  };

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Não foi possível obter a porta do servidor local.");
  idleTimer = setTimeout(() => void close(), options.idleTimeoutMs ?? 15 * 60_000);
  return {
    url: `http://${host}:${address.port}/?token=${encodeURIComponent(token)}`,
    port: address.port,
    token,
    closed,
    close,
  };
}
