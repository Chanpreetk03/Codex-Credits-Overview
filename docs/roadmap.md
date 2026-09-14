# Roadmap

This roadmap is deliberately local-first. Raw rollout token telemetry and
authoritative account limits are different measurements and will remain clearly
labelled as such.

## Shipped in 1.1.0

- Local rollout usage dashboard, status-bar summary, session history, and
  nested prompt/inference/tool activity.
- Privacy-safe defaults: prompt previews and local session names are opt-in;
  tool output and source contents are not stored or displayed.
- Opt-in account-rate-limit lookup through a separate local Codex app-server.
- Authoritative 5-hour and weekly limits with reset time, used percentage, and
  remaining percentage.

## Next priorities

1. **Release quality**
   - Add a repeatable installed-VSIX smoke-test checklist and CI that compiles,
     tests, packages, and validates the archive on every change.
   - Add Marketplace screenshots, issue templates, and a short troubleshooting
     guide for Codex authentication and app-server availability.

2. **Better local exploration**
   - Sort and filter sessions by recency, total raw usage, model, and project.
   - Add model and workspace/project breakdowns based only on locally recorded
     metadata.
   - Export selected local metadata and token totals to CSV or JSON on demand.
   - Add configurable local history retention after choosing a stable,
     metadata-only persistence format.

3. **More reliable live observability**
   - Reconcile documented `thread/tokenUsage/updated` notifications with
     rollout observations without double counting.
   - Improve visibility of retries, interrupted work, compaction, and
     discoverable sub-agent relationships; mark uncertain attribution as
     estimated or ambiguous.

4. **Account dashboard polish**
   - Add accessible progress bars and live reset countdown updates for
     authoritative account windows.
   - Display credits only when the supported Codex account response explicitly
     provides them.

5. **Charts, after the accounting model is stable**
   - Local daily/weekly raw-usage trends and session comparisons.
   - Charts will identify their source and never be presented as ChatGPT billing
     or quota estimates.

## Deliberate non-goals

- No network interception, TLS proxying, or attachment to the official Codex
  extension's app-server connection.
- No full prompts, tool outputs, source files, or telemetry sent from the
  machine by default.
- No inferred ChatGPT billing, credits, or quota values from raw local tokens.
