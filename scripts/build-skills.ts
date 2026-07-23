import {buildSkillBundles} from "../packages/skill-builder/src/index.js";

const manifests = await buildSkillBundles({
  sourceRoot: "skill-src",
  outputRoot: "dist/skills",
  version: "0.1.1",
});

process.stdout.write(`Built ${manifests.length} skill bundles.\n`);
