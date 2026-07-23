import {createHash, randomUUID} from "node:crypto";
import {access, mkdir, readFile, rename, rm, writeFile} from "node:fs/promises";
import {constants} from "node:fs";
import path from "node:path";
import {chromium, type Browser, type Page} from "playwright-core";
import {WorkspaceError} from "../errors.js";
import {redact, startWebProcess} from "./process.js";
import {type Journey, JourneySchema, type RunRecipe} from "./schemas.js";

export interface CaptureArtifact {
  path: string;
  mediaType: "image/png" | "application/json";
  sha256: string;
}

export interface CaptureResult {
  schemaVersion: 1;
  recipe: RunRecipe;
  browserExecutable: string;
  artifacts: CaptureArtifact[];
  consoleErrors: string[];
  networkErrors: string[];
  gatesPassed: boolean;
}

const VIEWPORTS = [
  {name: "desktop", width: 1440, height: 1000},
  {name: "mobile", width: 390, height: 844},
] as const;

export async function captureWeb(input: {
  recipe: RunRecipe;
  artifactRoot: string;
  browserExecutable?: string;
  journey?: Journey;
}): Promise<CaptureResult> {
  const executable = input.browserExecutable ?? await findSystemBrowser();
  if (!executable) {
    throw new WorkspaceError("WORKSPACE_INVALID", "No supported system browser is available", {
      details: {hint: "Install Chromium/Chrome or pass --browser-executable"},
    });
  }
  const artifactRoot = path.resolve(input.artifactRoot);
  await rm(artifactRoot, {recursive: true, force: true});
  await mkdir(artifactRoot, {recursive: true});
  const server = await startWebProcess(input.recipe);
  let browser: Browser | undefined;
  const artifacts: CaptureArtifact[] = [];
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  try {
    browser = await chromium.launch({executablePath: executable, headless: true});
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({viewport});
      const page = await context.newPage();
      collectDiagnostics(page, consoleErrors, networkErrors);
      for (const route of input.recipe.routes) {
        const url = new URL(route, input.recipe.ready.url).toString();
        const response = await page.goto(url, {waitUntil: "networkidle", timeout: 30_000});
        if (!response || response.status() >= 400) {
          networkErrors.push(redact(`${url} returned ${response?.status() ?? "no response"}`));
        }
        const routeName = route === "/" ? "root" : sanitizeName(route);
        const screenshot = path.join(artifactRoot, `${viewport.name}-${routeName}.png`);
        await page.screenshot({path: screenshot, fullPage: true});
        artifacts.push(await artifact(screenshot, artifactRoot, "image/png"));
      }
      if (viewport.name === "desktop" && input.journey) {
        await runJourney(page, input.recipe.ready.url, input.journey, artifactRoot, artifacts);
      }
      await context.close();
    }
  } finally {
    await browser?.close().catch(() => undefined);
    await server.stop();
  }

  const result: CaptureResult = {
    schemaVersion: 1,
    recipe: input.recipe,
    browserExecutable: executable,
    artifacts,
    consoleErrors: [...new Set(consoleErrors)],
    networkErrors: [...new Set(networkErrors)],
    gatesPassed: consoleErrors.length === 0 && networkErrors.length === 0,
  };
  const resultPath = path.join(artifactRoot, "capture.json");
  await atomicJson(resultPath, result);
  result.artifacts.push(await artifact(resultPath, artifactRoot, "application/json"));
  await atomicJson(path.join(artifactRoot, "manifest.json"), {
    schemaVersion: 1,
    artifacts: result.artifacts,
  });
  return result;
}

export async function readJourney(filePath: string): Promise<Journey> {
  try {
    return JourneySchema.parse(JSON.parse(await readFile(filePath, "utf8")) as unknown);
  } catch (error) {
    throw new WorkspaceError("WORKSPACE_INVALID", `Invalid journey file: ${filePath}`, {cause: error});
  }
}

async function runJourney(
  page: Page,
  baseUrl: string,
  journey: Journey,
  artifactRoot: string,
  artifacts: CaptureArtifact[],
): Promise<void> {
  await page.goto(new URL(journey.start, baseUrl).toString(), {waitUntil: "networkidle"});
  for (const step of journey.steps) {
    switch (step.action) {
      case "goto":
        await page.goto(new URL(step.path, baseUrl).toString(), {waitUntil: "networkidle"});
        break;
      case "click":
        await page.locator(step.selector).click();
        break;
      case "fill": {
        const value = step.value ?? process.env[step.valueFromEnv!];
        if (value === undefined) {
          throw new WorkspaceError("WORKSPACE_INVALID", `Journey environment value is missing: ${step.valueFromEnv}`);
        }
        await page.locator(step.selector).fill(value);
        break;
      }
      case "select":
        await page.locator(step.selector).selectOption(step.value);
        break;
      case "press":
        await page.locator(step.selector).press(step.key);
        break;
      case "wait_for":
        await page.locator(step.selector).waitFor({
          state: "visible",
          ...(step.timeoutMs ? {timeout: step.timeoutMs} : {}),
        });
        break;
      case "expect_visible":
        if (!(await page.locator(step.selector).isVisible())) throw new Error(`Not visible: ${step.selector}`);
        break;
      case "expect_text": {
        const content = await page.locator(step.selector).textContent();
        if (!content?.includes(step.text)) throw new Error(`Text not found in ${step.selector}`);
        break;
      }
      case "expect_url":
        if (new URL(page.url()).pathname !== step.path) throw new Error(`Unexpected URL: ${page.url()}`);
        break;
      case "screenshot": {
        const screenshot = path.join(artifactRoot, `journey-${step.name}.png`);
        const masks = journey.maskSelectors.map((selector) => page.locator(selector));
        await page.screenshot({path: screenshot, fullPage: true, mask: masks});
        artifacts.push(await artifact(screenshot, artifactRoot, "image/png"));
        break;
      }
    }
  }
}

function collectDiagnostics(page: Page, consoleErrors: string[], networkErrors: string[]): void {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(redact(message.text()));
  });
  page.on("requestfailed", (request) => {
    networkErrors.push(redact(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`));
  });
  page.on("response", (response) => {
    if (response.status() >= 400) networkErrors.push(redact(`${response.status()} ${response.url()}`));
  });
}

export async function findSystemBrowser(pathValue = process.env.PATH ?? ""): Promise<string | undefined> {
  const names = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge"];
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = path.join(directory, name);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Continue detection.
      }
    }
  }
  return undefined;
}

async function artifact(
  filePath: string,
  root: string,
  mediaType: CaptureArtifact["mediaType"],
): Promise<CaptureArtifact> {
  const bytes = await readFile(filePath);
  return {
    path: path.relative(root, filePath).replaceAll(path.sep, "/"),
    mediaType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function sanitizeName(route: string): string {
  return route.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-") || "root";
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), {recursive: true});
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
  await rename(temporary, filePath);
}
