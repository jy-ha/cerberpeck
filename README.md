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

## Progress fits where you run it

Inside Codex or Claude Code, Cerberpeck uses streamed line-by-line progress and returns the finished result in the same conversation. It does not open a child TUI or wait for terminal input.

When you run Cerberpeck directly in a real terminal, the same session uses a full-screen progress view. The experiment itself remains touchless in both modes.

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

Run this command in a real terminal on macOS, Linux, or WSL2. Node.js 24 LTS or newer is required. It opens one installation screen with Workspace and the detected host or hosts selected by default; press Enter to install or change the selections first.

```sh
curl -fsSL https://github.com/jy-ha/cerberpeck/releases/latest/download/install.sh | sh
```

In CI or another environment without a terminal, the same command installs the detected defaults without prompting.

### Complete uninstall

Remove every Cerberpeck component from the current project and your Global installation with one command:

```sh
curl -fsSL https://github.com/jy-ha/cerberpeck/releases/latest/download/uninstall.sh | sh
```

Complete uninstall always removes both scopes: the current project's Codex and Claude skills, CLI, sessions, captures, reports, candidate worktrees, caches, backups, and configuration, plus the user-level skills, CLI, data, and any PATH entry created by a Global installation. This is irreversible. If you also want to revert changes that Cerberpeck applied to your product, ask the skill to undo them before uninstalling. The uninstaller never rewrites your product code by itself.

---

<p align="center">
  <strong>Cerberpeck</strong><br>
  Your current version is the champion—until a challenger proves otherwise.
</p>
