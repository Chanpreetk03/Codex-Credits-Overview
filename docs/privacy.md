# Privacy

Codex Usage Monitor is local-first.

It reads local Codex rollout/session metadata to show token telemetry, model
metadata, timestamps, stable session IDs, turn IDs, working directories, and
tool activity counts.

By default it does **not** display or persist:

- user prompt text;
- session names or prompt previews that may contain prompt-derived text;
- tool arguments or tool output;
- source-code content; or
- credentials.

`codexUsage.showSessionNames` and `codexUsage.showPromptPreview` are opt-in
local display settings. They do not send data anywhere, but users should enable
them only when local display of prompt-derived text is appropriate.

The extension does not add telemetry, proxy network traffic, intercept TLS, or
modify Codex files.

## Optional app-server integration

`codexUsage.enableAppServer` is off by default. When enabled, the extension
starts its own local `codex app-server` process and sends only the documented,
read-only `account/rateLimits/read` request. That process can contact Codex
services using the user's existing Codex sign-in. The extension does not attach
to another Codex client's connection, send prompts, start turns, or write files.
