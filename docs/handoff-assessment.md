# Handoff feasibility assessment

## Verified local data path

The recommended local-first architecture is feasible. A current local Codex
rollout contains JSONL events for `session_meta`, `turn_context`,
`token_usage_record`, and `event_msg/token_count`.

`token_usage_record` is the preferred V1 input: it carries an inference usage
object plus Codex-maintained `turn_token_usage` and `thread_token_usage` totals.
The parser treats those supplied totals as authoritative raw telemetry, avoids
adding cached input or reasoning output to totals (they are subsets), and uses
`response_id` to suppress duplicate inference records. `token_count` provides a
compatible snapshot fallback.

This data is read as a stream, one line at a time. An active-file tailer can
persist a byte offset and unfinished final line, which makes partial writes and
multi-gigabyte files manageable without loading a rollout into memory.

## Feasibility by feature

| Handoff feature | V1 feasibility | Implementation basis |
| --- | --- | --- |
| Session totals and token breakdown | Yes | `thread_token_usage`, falling back to `token_count.total_token_usage` |
| Latest turn and model | Yes when current records contain IDs/model | `turn_token_usage`, `turn_context` |
| Inference-call count | Yes, subject to records exposing a stable response ID | Unique `response_id` records |
| Context-window capacity | Yes | `model_context_window` |
| Context-window occupancy | Not from the verified rollout fields | Show unavailable; do not derive it from cumulative totals |
| History | Yes | Scan stored rollout files, then persist metadata only |
| Live refresh | Yes | Incremental JSONL parser plus a scoped file watcher |
| Exact per-turn attribution across compaction/retries/sub-agents | Conditional | Prefer explicit `turn_id` and supplied turn totals; otherwise label as estimated/ambiguous |
| Rate limits, credits, ChatGPT quota, billing | Not from rollout telemetry | Only add after a supported authoritative source is validated |
| API cost | Conditional and out of V1 | Only for explicit API-billed sessions with an appropriate pricing source |

## Delivery sequence

1. Completed: extension scaffold, normalized event model, streaming analyzer,
   bigint-safe accounting, real-format fixture, and tests.
2. Next: persist incremental parser offsets and build the scoped rollout watcher.
3. Then: status bar and sidebar backed only by the normalized live state.
4. Finally: metadata-only session history. Rate-limit/app-server work remains a
   separately validated future milestone.

The protocol does document a `thread/tokenUsage/updated` notification for rich
clients, but V1 should not attach to another extension's connection or depend on
experimental raw-response events. See the official [Codex app-server
documentation](https://developers.openai.com/codex/app-server) and the public
[thread token-usage schema](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/ThreadTokenUsageUpdatedNotification.json).
