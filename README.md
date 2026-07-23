<p align="center">
  <img src="docs/assets/cerberpeck-logo.png" width="240" alt="Cerberpeck — Cerberus and woodpecker emblem">
</p>

<h1 align="center">Cerberpeck</h1>

<p align="center">
  <strong>Three heads inspect. One beak keeps pecking. Only the better version survives.</strong>
</p>

<p align="center">
  A development skill that builds, reviews, and improves your web product<br>
  until a challenger can no longer beat the current version.
</p>

---

## Cerberus × Woodpecker

Cerberus guards the gate and refuses to let weak results pass. A woodpecker works the same point with relentless precision until something changes.

Cerberpeck brings both traits to web development. Instead of letting one Agent build something and approve its own work, it asks independent reviewers to critique each result and compare it blindly against the previous version. A challenger becomes the new champion only when it proves that it is better.

> Build. Evaluate. Keep only what is better.

## Just ask

Once installed, type `cbp` followed by your request in either Codex or Claude Code. The shorthand implicitly activates Cerberpeck, so no explicit skill command is required:

```text
cbp make this landing page better
```

```text
cbp improve this onboarding flow
```

That is enough. You do not need to define the audience, evaluation rubric, test plan, reviewer panel, or implementation strategy yourself. Cerberpeck inspects the repository and the running product first, then works those details out from the available evidence.

Add a constraint only when it genuinely matters:

```text
cbp improve this dashboard, but keep the existing API
```

Explicit `$cerberpeck` and `/cerberpeck` invocations remain available when you prefer them.

If one missing decision would materially change what “better” means, Cerberpeck asks a short question with clear choices. Otherwise, it proceeds without stopping for confirmation.

## One request becomes an experiment

```text
Inspect the current product
    ↓
Define the goal and evaluation criteria
    ↓
Create 3 expert + 3 customer reviewers
    ↓
Critique the baseline independently
    ↓
Build and validate an isolated challenger
    ↓
Run a blind A/B comparison
    ↓
Promote the winner or keep the champion
    ↺ up to 10 rounds
```

Every review runs in a fresh, independent session. Reviewers can inspect the code, desktop and mobile captures, and actual browser behavior. Their perspectives cover product UX, conversion, visual design, accessibility, implementation quality, and realistic customer needs. Each group expands to four or five reviewers only when the product genuinely needs more perspectives.

Cerberpeck does not choose a winner by averaging scores. It weighs the evaluation goal, concrete evidence, regressions, and objective validation results before promoting a challenger.

## Failed experiments do not damage your work

- Every challenger is built outside the current workspace.
- It must pass builds, type checks, existing tests, and browser validation before comparison.
- If the challenger is not better, the current champion remains untouched.
- Only the final winner is applied to the workspace.
- The entire session can be undone, and an undone result can be restored again.

Restoration works through the installed skill too:

```text
cbp undo the last session
cbp reapply the session I just undid
```

Files that Cerberpeck did not change are left alone, and the state immediately before restoration is preserved.

## What it works well on

- Marketing landing pages and conversion flows
- SaaS and web application interfaces
- Sign-up, login, onboarding, and checkout flows
- Dashboards and administration screens
- Responsive design and accessibility
- Web copy, information architecture, and trust
- Related frontend code and limited supporting backend changes

Cerberpeck currently focuses on web-service development. It does not automatically deploy to production or modify real payment and operational data.

## Install

The following command installs the CLI and both Codex and Claude Code skills into the current project on macOS, Linux, or WSL2. Workspace installation is the default, and the progress TUI completes without requiring input.

```sh
curl -fsSL https://github.com/jy-ha/cerberpeck/releases/latest/download/install.sh | sh
```

Use the installation TUI only when you want to change the Workspace/Global scope or choose different hosts.

### Complete uninstall

Remove every Cerberpeck component from the current project with one command:

```sh
curl -fsSL https://github.com/jy-ha/cerberpeck/releases/latest/download/uninstall.sh | sh
```

For a Global installation, specify the scope:

```sh
curl -fsSL https://github.com/jy-ha/cerberpeck/releases/latest/download/uninstall.sh | sh -s -- --scope global
```

Complete uninstall removes the Codex and Claude skills, CLI, installation manifest, sessions, captures, reports, candidate worktrees, caches, backups, configuration, and any PATH entry created by a Global installation. This is irreversible. If you also want to revert changes that Cerberpeck applied to your product, ask the skill to undo them before uninstalling. The uninstaller never rewrites your product code by itself.

---

<p align="center">
  <strong>Cerberpeck</strong><br>
  Your current version is the champion—until a challenger proves otherwise.
</p>
