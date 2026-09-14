# V2 app-server integration

V2 uses the documented local Codex app-server protocol over a private stdio
child process. It is opt-in (`codexUsage.enableAppServer`) and off by default.

## Current scope

- Performs the required `initialize` / `initialized` handshake.
- Sends only the read-only `account/rateLimits/read` request.
- Shows authoritative account rate-limit windows when the app-server has an
  authenticated Codex session.
- Decodes documented `thread/tokenUsage/updated` notifications for the
  version-specific protocol schema.

## Deliberate boundaries

The extension starts its own app-server process. It does not attach to the
Codex VS Code extension's process or transport. Therefore V1 rollout telemetry
remains the source of truth for the selected session, and app-server thread
updates are not merged into those totals. This prevents double counting and
misattribution across independent clients.

No prompts, turns, tool calls, or file writes are sent through the app-server.
If the server reports that authentication is required, account metrics remain
unavailable rather than being estimated.

The client parses only documented fields and ignores unknown messages, so a
newer Codex version degrades to unavailable data instead of guessed values.

See the official [Codex app-server documentation](https://developers.openai.com/codex/app-server).
