# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added

- Opt-in local Codex app-server client for authoritative account rate limits.
- Schema-validated decoding for app-server thread token-usage notifications.

## [1.0.0] - 2026-09-13

### Added

- Native session tree with prompt/turn, inference, and tool activity nesting.
- Per-workspace selected-session persistence.
- Privacy-safe session names and prompt previews as opt-in settings.
- Marketplace-ready manifest metadata, support and publishing documentation,
  and a 1254px PNG extension icon.
- Reproducible `vsce` packaging that runs the test suite before creating a
  minimal VSIX archive.
- Partial-write and rollout-replacement parsing coverage, plus bounded cached
  session-catalog metadata reads.

## [0.1.0] - 2026-09-13

### Added

- Local rollout JSONL analyzer and live selected-rollout observer.
- Usage dashboard, status bar, raw-token breakdown, and context capacity.
- Defensive parsing, bigint-safe accounting, and fixture tests.
