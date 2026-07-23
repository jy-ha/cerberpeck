import {createReadStream} from "node:fs";
import {stat} from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {WorkspaceError} from "../errors.js";

const MEDIA_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export async function serveStatic(input: {root: string; port: number; host?: string}): Promise<void> {
  const root = path.resolve(input.root);
  const host = input.host ?? "127.0.0.1";
  const server = http.createServer(async (request, response) => {
    try {
      const parsed = new URL(request.url ?? "/", `http://${host}`);
      const decoded = decodeURIComponent(parsed.pathname);
      if (decoded === "/favicon.ico") {
        response.writeHead(204, {"cache-control": "no-store"}).end();
        return;
      }
      const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
      const target = path.resolve(root, relative);
      if (!target.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      let resolved = target;
      const info = await stat(resolved);
      if (info.isDirectory()) resolved = path.join(resolved, "index.html");
      const file = await stat(resolved);
      if (!file.isFile()) throw new Error("Not a file");
      response.writeHead(200, {
        "content-type": MEDIA_TYPES[path.extname(resolved).toLowerCase()] ?? "application/octet-stream",
        "content-length": file.size,
        "cache-control": "no-store",
      });
      createReadStream(resolved).pipe(response);
    } catch {
      response.writeHead(404, {"content-type": "text/plain; charset=utf-8"}).end("Not found");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.port, host, resolve);
  }).catch((error) => {
    throw new WorkspaceError("WORKSPACE_INVALID", "Static server failed to listen", {cause: error});
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
