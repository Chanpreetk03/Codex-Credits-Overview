import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Finds the Codex executable bundled by the official VS Code extension on Windows. */
export function resolveAppServerCommand(configured?: string, extensionsDirectory = join(homedir(), ".vscode", "extensions"), platform = process.platform): string {
  if (configured?.trim()) return configured.trim();
  if (platform !== "win32" || !existsSync(extensionsDirectory)) return "codex";
  const candidates = readdirSync(extensionsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("openai.chatgpt-"))
    .map((entry) => join(extensionsDirectory, entry.name, "bin", "windows-x86_64", "codex.exe"))
    .filter(existsSync)
    .sort();
  return candidates.at(-1) ?? "codex";
}
