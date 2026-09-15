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
   - Replace session-ID-first rows with user-friendly session titles. Prefer a
     Codex-provided local thread name when available; otherwise show a safe
     fallback such as repository/folder name plus date and model. Keep the
     short session ID only in the tooltip and a copy-details action.
   - Keep prompt-derived titles opt-in, because they can contain sensitive
     content. Provide a setting to choose between private fallback titles,
     local Codex titles, and prompt previews.
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

## Candidate feature: Weekly usage by repository

**Feasibility: yes, for local raw model usage.** This would answer: “Which
repositories used Codex during the trailing seven days, and how much observed
raw model usage did each have?” It would not allocate the account-level 5-hour
or weekly rate limit across repositories; Codex exposes those limits at account
scope, not repository scope.

### Data and accuracy model

- Each local rollout can record its working directory (`cwd`). Resolve that
  directory to its local Git root, when it is a repository, using read-only Git
  discovery. Group worktrees from the same repository using Git's common
  directory; keep unrelated clones separate.
- Display only a repository-folder label by default. Store a normalized local
  identifier or hash, never a remote URL, prompt, tool output, or source file.
- For the trailing seven-day report, sum only timestamped per-inference usage
  records whose event time falls inside the range. Deduplicate by session and
  response ID across rotated or repeated rollout files.
- Mark a row **exact** only when stable inference IDs and timestamped usage are
  available. Do not use a session's all-time cumulative total as a weekly
  value. Sessions with only cumulative snapshot telemetry are reported as
  unavailable or incomplete rather than guessed.
- Include normal and discoverable sub-agent sessions once, under the repository
  in which they ran; never add child usage both to a parent session and again to
  the repository total.

### Delivery plan

1. Build a read-only `repoResolver` that maps a recorded `cwd` to a local
   repository identity, a safe display name, or “Non-repository folder.” Cache
   the result for each unique path.
2. Build a streaming, seven-day inference projection. Its local metadata-only
   cache stores file signature, session ID, repository identity, event time,
   usage, and deduplication key so large historical rollouts are not reparsed
   on every refresh.
3. Add a **Usage by repository — last 7 days** view with repository name, raw
   total, inference-call count, session count, source/confidence, and an
   explicit refresh action. Start with a sortable native tree/table; add a
   chart only after the accounting tests are stable.
4. Add settings for the lookback window and retention, defaulting to seven
   days. A first scan runs in the background with progress; later scans process
   only changed files.
5. Test multiple repositories, multiple worktrees of one repository, duplicate
   inference records, sessions crossing the weekly boundary, missing `cwd`,
   non-Git folders, malformed records, partial writes, and large rollouts.

### Limits

- This is a local observability feature, not an account-quota or billing
  breakdown.
- Cloud-only sessions or sessions without a local rollout/working directory
  cannot be assigned to a repository.
- Repository names and paths can be sensitive; the feature remains local-only
  and should be opt-in if persistent metadata is introduced.

## Deliberate non-goals

- No network interception, TLS proxying, or attachment to the official Codex
  extension's app-server connection.
- No full prompts, tool outputs, source files, or telemetry sent from the
  machine by default.
- No inferred ChatGPT billing, credits, or quota values from raw local tokens.
