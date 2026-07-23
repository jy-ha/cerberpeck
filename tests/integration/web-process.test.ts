import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  findAvailablePort,
  RunRecipeSchema,
  startWebProcess,
} from "../../packages/runtime/src/index.js";

const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("web process lifecycle", () => {
  it("waits for HTTP readiness and stops the process group", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cerberpeck-web-process-"));
    fixtures.push(root);
    const port = await findAvailablePort();
    const script = `const http=require('http');const s=http.createServer((q,r)=>r.end('ok'));s.listen(${port},'127.0.0.1');process.on('SIGTERM',()=>s.close());`;
    const recipe = RunRecipeSchema.parse({
      schemaVersion: 1,
      detector: "explicit",
      cwd: root,
      start: {argv: [process.execPath, "-e", script], env: {}},
      ready: {url: `http://127.0.0.1:${port}/`, expectedStatus: 200, timeoutSeconds: 5},
      stop: {signal: "SIGTERM", timeoutSeconds: 2},
      routes: ["/"],
    });
    const running = await startWebProcess(recipe);
    expect((await fetch(recipe.ready.url)).status).toBe(200);
    await running.stop();
    await expect(fetch(recipe.ready.url, {signal: AbortSignal.timeout(500)})).rejects.toBeDefined();
  });
});
