import {readFile, stat} from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import {WorkspaceError} from "../errors.js";
import {type RunRecipe, RunRecipeSchema} from "./schemas.js";

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function detectRunRecipes(input: {
  cwd: string;
  cliExecutable: string;
  port?: number;
  command?: string;
  args?: string[];
  route?: string;
}): Promise<RunRecipe[]> {
  const cwd = path.resolve(input.cwd);
  const port = input.port ?? await findAvailablePort();
  const route = normalizeRoute(input.route ?? "/");
  if (input.command) {
    return [recipe("explicit", cwd, [input.command, ...(input.args ?? [])], port, route)];
  }

  const packageJson = await readPackageJson(cwd);
  const packageManager = await detectPackageManager(cwd);
  const dependencies = {...packageJson?.dependencies, ...packageJson?.devDependencies};
  const recipes: RunRecipe[] = [];
  if (packageJson?.scripts?.dev && dependencies.vite) {
    recipes.push(recipe("vite", cwd, runScript(packageManager, "dev", ["--host", "127.0.0.1", "--port", String(port)]), port, route));
  }
  if (packageJson?.scripts?.dev && dependencies.next) {
    recipes.push(recipe("next", cwd, runScript(packageManager, "dev", ["--hostname", "127.0.0.1", "--port", String(port)]), port, route));
  }
  if (await exists(path.join(cwd, "index.html"))) {
    recipes.push(recipe("static-html", cwd, [process.execPath, path.resolve(input.cliExecutable), "__serve-static", "--root", cwd, "--port", String(port)], port, route));
  }
  if (packageJson?.scripts?.dev && recipes.length === 0) {
    recipes.push(recipe("package-script", cwd, runScript(packageManager, "dev", []), port, route));
  }
  if (recipes.length === 0) {
    throw new WorkspaceError("WORKSPACE_INVALID", "No safe web run recipe detected", {
      details: {cwd, hint: "Use --command and --arg to provide a local development server"},
    });
  }
  return recipes;
}

export async function findAvailablePort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new WorkspaceError("WORKSPACE_INVALID", "Could not allocate a local port"));
        return;
      }
      const selected = address.port;
      server.close((error) => error ? reject(error) : resolve(selected));
    });
  });
}

function recipe(
  detector: RunRecipe["detector"],
  cwd: string,
  argv: string[],
  port: number,
  route: string,
): RunRecipe {
  return RunRecipeSchema.parse({
    schemaVersion: 1,
    detector,
    cwd,
    start: {argv, env: {NODE_ENV: "development"}},
    ready: {url: `http://127.0.0.1:${port}${route}`, expectedStatus: 200, timeoutSeconds: 90},
    stop: {signal: "SIGTERM", timeoutSeconds: 10},
    routes: [route],
  });
}

function runScript(manager: "pnpm" | "npm" | "yarn" | "bun", name: string, args: string[]): string[] {
  if (manager === "yarn") return ["yarn", name, ...args];
  if (manager === "bun") return ["bun", "run", name, ...args];
  if (manager === "pnpm") return ["pnpm", "run", name, ...(args.length ? ["--", ...args] : [])];
  return ["npm", "run", name, ...(args.length ? ["--", ...args] : [])];
}

async function detectPackageManager(cwd: string): Promise<"pnpm" | "npm" | "yarn" | "bun"> {
  if (await exists(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(path.join(cwd, "yarn.lock"))) return "yarn";
  if (await exists(path.join(cwd, "bun.lock")) || await exists(path.join(cwd, "bun.lockb"))) return "bun";
  return "npm";
}

async function readPackageJson(cwd: string): Promise<PackageJson | undefined> {
  try {
    return JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as PackageJson;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw new WorkspaceError("WORKSPACE_INVALID", "package.json is invalid", {cause: error});
  }
}

function normalizeRoute(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) {
    throw new WorkspaceError("WORKSPACE_INVALID", `Unsafe route: ${value}`);
  }
  return value;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
