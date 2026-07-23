# Workflow

1. Pass the complete request to `cerberpeck run` once.
2. Do not recreate or reorder CLI Actions.
3. If the CLI returns exit code 8, ask only the provided blocking question and resume with the answer.
4. Otherwise let the run continue without confirmation.
5. Report the final Champion, applied paths, report path, and `cerberpeck undo` command.

All evaluator, builder, synthesis, and decision work runs in independent host sessions managed by the CLI.
