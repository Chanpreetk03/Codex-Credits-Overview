# Codex Rollout Insights

A local-first VS Code extension for observing raw Codex rollout token telemetry.
It is deliberately **not** a ChatGPT quota, credits, or billing calculator.

> Status: version 1.1.0 release candidate. See the [roadmap](docs/roadmap.md)
> for planned work.

## Current implementation

The first milestone is a streaming rollout analyzer. It reads Codex session JSONL
without modifying it, normalizes the evolving raw schema, and reports:

- latest turn and cumulative thread usage when Codex supplies them;
- input, cached-input, cache-write, output, reasoning-output, and total tokens;
- model metadata, inference-call count, and context-window capacity;
- the source and confidence of each usage total.
- a native session tree that separates prompt turns, background activity, model
  inferences, and tool call/result pairs.

Run it against the auto-discovered Codex sessions directory, or provide a rollout
file explicitly:

```powershell
npm install
npm run analyze -- "C:\path\to\rollout.jsonl"
```

Run the fixture tests with `npm test`.

No prompt text, source code, tool output, credentials, or telemetry leave the
machine. The extension does not proxy traffic, attach to Codex's app-server
connection, or modify rollout files.

## What is and is not feasible

The local rollout format currently includes `token_usage_record` entries with
per-inference, cumulative-turn, and cumulative-thread token telemetry. This
makes the raw usage view feasible without an API key. `token_count` snapshots
remain a compatible fallback and expose context-window capacity.

Rollout telemetry alone cannot authoritatively establish ChatGPT plan quota,
credits, billing cost, or rate limits. It also cannot always prove attribution
across compaction, retries, background work, or sub-agent threads. Those values
must remain unavailable or explicitly estimated until a supported authoritative
Codex surface provides them.

`model_context_window` reports capacity, not current occupancy. The monitor will
never represent cumulative session usage as context-window occupancy.

See [architecture](docs/architecture.md) for the local session/turn model and
[privacy](docs/privacy.md) for its data-handling guarantees.

## Multiple sessions on one machine

Each Codex rollout is treated as an independent observed session. Open the
native **Sessions** tree to select one and pin it for the current VS Code
workspace; the live observer then tails that exact rollout. Expand the selected
session to inspect its prompt turns, model inferences, and tool-call/result
pairs without exposing their contents.

This explicit choice is intentional: local rollout files do not reliably state
which external Codex chat or tab a person considers current when multiple
sessions are active at once. The session catalog scans only the configured
number of recent sessions (20 by default), hides sub-agent/internal threads by
default, and stores no prompt or tool-output contents. Local session names and
prompt previews are opt-in settings because either may contain prompt-derived
text.

## Optional authoritative account limits

V2 begins an opt-in integration with the local Codex app-server. Enable
`codexUsage.enableAppServer`, then run **Codex Usage: Refresh Account Rate
Limits**. This starts a separate local app-server and makes the documented
read-only account request; it does not attach to the Codex VS Code extension or
send prompts. The Codex CLI must already be authenticated. If account
authentication is unavailable, the dashboard keeps account limits unavailable.
See the [V2 app-server design](docs/v2-app-server.md) for the protocol and
privacy boundary.

## Roadmap

Planned work is recorded in [docs/roadmap.md](docs/roadmap.md). The priorities
are better local session exploration, opt-in real-time reconciliation, and
release automation—without treating raw local tokens as billing or quota data.
