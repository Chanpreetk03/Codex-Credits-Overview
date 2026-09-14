# Changelog

All notable changes to this project are documented here.

## [1.1.0] - 2026-09-14

### Added

- Opt-in local Codex app-server client for authoritative account rate limits.
- Schema-validated decoding for app-server thread token-usage notifications.
- Automatic Windows detection of the Codex executable bundled with the official
  VS Code extension, so an otherwise missing shell `PATH` does not block setup.
- Standard 5-hour and weekly account-limit labels, reset countdowns, and an
  explicit used-versus-remaining percentage display.

### Changed

- Compact the dashboard metrics and reset its scroll position after refresh.

## [Unreleased]

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
