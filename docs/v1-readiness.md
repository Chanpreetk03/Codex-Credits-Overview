# V1 readiness

## Functional V1 alpha — complete

- [x] Discover local Codex rollout sessions without an API key.
- [x] Show selected-session and latest-turn raw token telemetry.
- [x] Show input, cached input, cache write, output, reasoning, and total.
- [x] Show model and context-window capacity when Codex provides them.
- [x] Provide a status-bar total and a usage dashboard.
- [x] Separate root sessions, prompt turns, background turns, inferences, and
  tool activity.
- [x] Keep prompt/tool content hidden by default.
- [x] Stream rollouts defensively; tolerate unknown/malformed records and
  partial final lines.
- [x] Cover core accounting, history bounds, sub-agent filtering, and nested
  turn attribution with fixtures.

## Required before Marketplace 1.0

- [ ] Package a VSIX using `@vscode/vsce` and run an install/smoke test.
- [ ] Add Marketplace presentation metadata, support links, repository link,
  and a PNG icon at least 128x128.
- [ ] Replace the placeholder `local` publisher with a registered Marketplace
  publisher ID.
- [ ] Add an extension-host integration test and validate the Windows watcher
  against new/rotated rollout files.
- [ ] Add a bounded metadata cache so large session directories do not require
  a full startup metadata scan.
- [ ] Make a final release/security review and version the manifest `1.0.0`.

Rate limits, account quota/credits, and billing cost remain intentionally out of
V1 until an authoritative supported Codex source is integrated.
