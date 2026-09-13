# Architecture

## Local data model

Codex persists a durable thread/session as a rollout JSONL file under:

```text
$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl
```

The local Codex state registry maps a stable thread ID to metadata such as its
rollout path, source, model, and working directory. This extension uses only
read-only local observations. It does not attach to the official extension's
app-server connection, intercept traffic, or modify Codex files.

## Modules

`ThreadCatalog` is the seam for durable session discovery. It streams only
early rollout metadata, filters sub-agent/internal roots by default, and returns
stable thread IDs with rollout paths. It deliberately does not expose prompt
content through its interface.

`TurnTimeline` is the seam for prompt-scoped activity reconstruction. It reads a
selected rollout as a stream and produces:

```text
Thread
  -> prompt turn | background turn | pending prompt
     -> model inference records
     -> tool call / matching tool result
     -> agent-message and reasoning-item counts
```

Inference usage belongs to a turn through Codex's recorded `turn_id`. Tool calls
and results are paired by `call_id` and grouped inside task lifecycle bounds.
User-message to turn assignment is derived from event order, so a turn without a
preceding user message is shown as agent/background activity rather than being
assigned a fabricated prompt.

`RolloutWatcher` is the live seam. It tails appended JSONL bytes for the selected
thread and debounces dashboard/timeline updates.

The UI consumes normalized session reports and timelines only; it does not
interpret raw Codex JSON directly.

## Accounting rules

- Prefer Codex-reported `thread_token_usage` and `turn_token_usage` totals.
- Cached input is part of input; reasoning output is part of output. Never add
  either subset into a total a second time.
- De-duplicate inference records by response ID when present.
- Report raw local telemetry, never ChatGPT-plan quota or billing cost.
