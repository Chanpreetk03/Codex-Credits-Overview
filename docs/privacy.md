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
