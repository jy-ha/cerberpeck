---
name: cerberpeck
description: Iteratively improve web services, landing pages, web apps, onboarding flows, dashboards, responsive UI, frontend code, and web copy through independent expert and customer evaluation, isolated challengers, and blind comparisons. Always use when the user writes the standalone shorthand cbp, especially as the first token, and treat the remaining text as the Cerberpeck request. Also use when the user asks to make a website or web product better, compare revisions, resume or inspect a Cerberpeck session, or undo or redo changes applied by Cerberpeck.
---

# Cerberpeck

Do not start another Cerberpeck session when `CERBERPECK_CHILD=1` is set.

Treat a leading standalone `cbp` token, case-insensitively, as an implicit invocation. Remove that token and surrounding whitespace before routing the request. Do not ask the user to invoke `/cerberpeck` explicitly.

Use the workspace CLI when present or the global CLI otherwise. Route an explicit session-management request directly instead of starting a new experiment:

- Undo: run `undo`, with the session id when the user supplied one.
- Redo: resolve the requested or most recent undone session with `sessions list`, then run `redo <session-id>`.
- Resume: run `sessions resume <session-id>`.
- Inspect or report: run `sessions show <session-id>` or `report <session-id>`.

For every other request, write the user's complete request to a temporary UTF-8 file and start a run:

```sh
if [ -x ./.cerberpeck/bin/cerberpeck ]; then
  CERBERPECK_HOSTED=1 ./.cerberpeck/bin/cerberpeck run --host claude --request-file <path>
else
  CERBERPECK_HOSTED=1 cerberpeck run --host claude --request-file <path>
fi
```

Run the CLI without requesting or emulating a PTY. In a host conversation it emits line-mode progress and never waits for TUI input. Keep streamed progress available, relay only genuine blocking questions, and summarize the final result. Let the CLI own workflow order, retries, evaluators, promotion, application, and restoration records. Never reproduce those workflows inside the host conversation.

Read [workflow.md](references/workflow.md) when starting or resuming a run. Read the other references only when the CLI returns the matching blocking action.
