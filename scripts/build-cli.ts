import {chmod, mkdir, readFile} from "node:fs/promises";
import {build} from "esbuild";

await mkdir("dist", {recursive: true});
await build({
  entryPoints: ["apps/cli/src/main.ts"],
  outfile: "dist/cerberpeck.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  sourcemap: true,
  // Playwright loads these only for WebDriver BiDi; Cerberpeck launches Chromium over CDP.
  external: [
    "chromium-bidi/lib/cjs/bidiMapper/BidiMapper",
    "chromium-bidi/lib/cjs/cdp/CdpConnection",
  ],
  plugins: [{
    name: "playwright-bundled-core-dir",
    setup(pluginBuild) {
      pluginBuild.onLoad({filter: /playwright-core.*nodePlatform\.js$/}, async (args) => ({
        contents: (await readFile(args.path, "utf8")).replace(
          'require.resolve("../../../package.json")',
          "__filename",
        ),
        loader: "js",
      }));
    },
  }],
});
await chmod("dist/cerberpeck.cjs", 0o755);
process.stdout.write("Built dist/cerberpeck.cjs.\n");
