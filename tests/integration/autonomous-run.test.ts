import {chmod, mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {createSession, SessionStore} from "../../packages/core/src/index.js";
import {runAutonomousSession, WorkspaceDriver} from "../../packages/runtime/src/index.js";

const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

async function setup(host: "codex" | "claude") {
  const root = await mkdtemp(path.join(os.tmpdir(), `cerberpeck-autonomous-${host}-`));
  fixtures.push(root);
  const workspace = path.join(root, "workspace");
  const mock = path.join(root, "mock-host.cjs");
  const log = path.join(root, "host-sessions.log");
  await mkdir(workspace, {recursive: true});
  await writeFile(path.join(workspace, "index.html"), "<h1>Baseline</h1>\n", "utf8");
  await writeFile(mock, `#!/usr/bin/env node
const fs=require('fs');
let prompt='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>prompt+=c);process.stdin.on('end',()=>{
  fs.appendFileSync(process.env.MOCK_LOG, process.pid+'\\n');
  let result;
  if(prompt.includes('concise project profile')) result={summary:'Static landing page',detectedFramework:'static-html'};
  else if(prompt.includes('Review the baseline')) result={summary:'Baseline is usable but generic',overallScore:3};
  else if(prompt.includes('evaluation contract')) result={primaryOutcome:'clear signup value',constraints:[],maxRounds:1};
  else if(prompt.includes('evaluation panel')) { const p=(id)=>({id,label:id,role:id,context:'web product evaluation',focus:['clarity']}); result={experts:[p('ux'),p('frontend'),p('conversion')],customers:[p('buyer'),p('user'),p('skeptic')]}; }
  else if(prompt.includes('Implement only')) { fs.writeFileSync(require('path').join(process.cwd(),'index.html'),'<h1>Improved value</h1>\\n'); result={summary:'Improved headline',changedFiles:['index.html']}; }
  else if(prompt.includes('Synthesize the independent')) result={title:'Clarify value',rationale:'Independent reviews agree',changes:['Improve headline'],stop:false};
  else if(prompt.includes('Blindly compare')) { const m=prompt.match(/persona ([a-zA-Z0-9_-]+)/); result={personaId:m?m[1]:'reviewer',preference:'B',confidence:4,scores:{A:3,B:4.5},summary:'One version communicates value better',blockingIssue:null}; }
  else if(prompt.includes('Decide whether')) result={decision:'promote',summary:'The challenger is materially clearer'};
  else throw new Error('unknown prompt '+prompt);
  const args=process.argv.slice(2); const outputIndex=args.indexOf('--output-last-message');
  if(outputIndex>=0) { fs.writeFileSync(args[outputIndex+1],JSON.stringify(result)); process.stdout.write(JSON.stringify({type:'done'})+'\\n'); }
  else process.stdout.write(JSON.stringify({structured_output:result}));
});
`, "utf8");
  await chmod(mock, 0o755);
  const sessionId = `cp_auto_${host}`;
  const store = new SessionStore(workspace);
  await store.create(createSession({
    sessionId,
    workspace,
    request: "Make the landing page clearer",
    host,
    maxRounds: 1,
    now: "2026-07-23T00:00:00.000Z",
  }));
  await new WorkspaceDriver(workspace).snapshot(sessionId);
  return {root, workspace, mock, log, sessionId};
}

describe("autonomous workflow", () => {
  it.each(["codex", "claude"] as const)("runs independent %s processes through apply and report", async (host) => {
    const fixture = await setup(host);
    const previous = process.env.MOCK_LOG;
    process.env.MOCK_LOG = fixture.log;
    try {
      const completed = await runAutonomousSession({
        workspace: fixture.workspace,
        sessionId: fixture.sessionId,
        hostExecutable: fixture.mock,
        captureCandidate: async () => ({gatesPassed: true, artifacts: []}),
      });
      expect(completed.status).toBe("completed");
      expect(completed.experiment?.championCandidateId).toBe("round-1");
      expect(await readFile(path.join(fixture.workspace, "index.html"), "utf8"))
        .toBe("<h1>Improved value</h1>\n");
      expect(await readFile(path.join(fixture.workspace, ".cerberpeck", "sessions", fixture.sessionId, "report.md"), "utf8"))
        .toContain("Final champion: round-1");
      const pids = (await readFile(fixture.log, "utf8")).trim().split("\n");
      expect(pids).toHaveLength(18);
      expect(new Set(pids).size).toBe(18);
    } finally {
      if (previous === undefined) delete process.env.MOCK_LOG;
      else process.env.MOCK_LOG = previous;
    }
  });

  it("mechanically rejects a challenger when objective gates fail", async () => {
    const fixture = await setup("codex");
    const previous = process.env.MOCK_LOG;
    process.env.MOCK_LOG = fixture.log;
    try {
      const completed = await runAutonomousSession({
        workspace: fixture.workspace,
        sessionId: fixture.sessionId,
        hostExecutable: fixture.mock,
        captureCandidate: async (_session, candidateId) => ({
          gatesPassed: candidateId === "baseline",
          artifacts: [],
        }),
      });
      expect(completed.experiment?.championCandidateId).toBe("baseline");
      expect(await readFile(path.join(fixture.workspace, "index.html"), "utf8"))
        .toBe("<h1>Baseline</h1>\n");
      expect(completed.actions.find((action) => action.kind === "decision.make")?.result?.decision)
        .toBe("reject");
    } finally {
      if (previous === undefined) delete process.env.MOCK_LOG;
      else process.env.MOCK_LOG = previous;
    }
  });
});
