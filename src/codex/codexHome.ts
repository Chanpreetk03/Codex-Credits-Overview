import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function resolveCodexHome(configuredHome?: string, environment: NodeJS.ProcessEnv = process.env): string {
  const candidate = configuredHome?.trim() || environment.CODEX_HOME?.trim();
  // The default is only used after checking an explicit configuration/environment value.
  return resolve(candidate || join(homedir(), ".codex"));
}

export function codexSessionsPath(codexHome: string): string { return join(codexHome, "sessions"); }

export function hasCodexSessions(codexHome: string): boolean { return existsSync(codexSessionsPath(codexHome)); }
