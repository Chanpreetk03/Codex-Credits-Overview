import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";
import { createInterface } from "node:readline";
import { normalizeEvent } from "./eventNormalizer";
import { ObservedThread, SessionMetaEvent, TurnContextEvent } from "./types";

interface SessionIndexRecord { id?: unknown; thread_name?: unknown; updated_at?: unknown; }

export interface ThreadCatalogOptions {
  includeInternal?: boolean;
  includeNames?: boolean;
  cwd?: string;
  limit?: number;
}

/** A read-only catalog of durable Codex threads. It never loads transcripts or prompt content. */
export class ThreadCatalog {
  private readonly metadataCache = new Map<string, { mtimeMs: number; metadata?: SessionMetaEvent & { model?: string } }>();

  constructor(private readonly sessionsDirectory: string, private readonly sessionIndexPath?: string) {}

  async list(options: ThreadCatalogOptions = {}): Promise<ObservedThread[]> {
    const names = options.includeNames && this.sessionIndexPath ? await readSessionNames(this.sessionIndexPath) : new Map<string, string>();
    const files = await rolloutFiles(this.sessionsDirectory);
    const candidates = await Promise.all(files.map(async (rolloutPath) => ({ rolloutPath, updatedAt: (await stat(rolloutPath)).mtimeMs })));
    const selected = new Map<string, ObservedThread>();
    // Listing may stat many files, but parsing is bounded to a recent window and
    // unchanged metadata is reused across refreshes.
    const scanLimit = Math.max((options.limit ?? 20) * 5, 100);
    const recent = candidates.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, scanLimit);
    const retainedPaths = new Set(candidates.map((candidate) => candidate.rolloutPath));
    for (const cachedPath of this.metadataCache.keys()) if (!retainedPaths.has(cachedPath)) this.metadataCache.delete(cachedPath);
    for (const candidate of recent) {
      const cached = this.metadataCache.get(candidate.rolloutPath);
      const meta = cached?.mtimeMs === candidate.updatedAt
        ? cached.metadata
        : await this.refreshMetadata(candidate.rolloutPath, candidate.updatedAt);
      if (!meta?.sessionId) continue;
      const source = meta.source ?? "unknown";
      if (!options.includeInternal && source === "subagent") continue;
      if (options.cwd && meta.cwd && !samePath(options.cwd, meta.cwd)) continue;
      if (selected.has(meta.sessionId)) continue;
      selected.set(meta.sessionId, {
        id: meta.sessionId,
        rolloutPath: candidate.rolloutPath,
        updatedAt: candidate.updatedAt,
        cwd: meta.cwd,
        model: meta.model,
        source,
        displayName: names.get(meta.sessionId)
      });
      if (options.limit && selected.size >= options.limit) break;
    }
    return [...selected.values()];
  }

  private async refreshMetadata(filePath: string, mtimeMs: number): Promise<(SessionMetaEvent & { model?: string }) | undefined> {
    const metadata = await readRolloutMetadata(filePath);
    this.metadataCache.set(filePath, { mtimeMs, metadata });
    return metadata;
  }
}

async function rolloutFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return rolloutFiles(path);
    return entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl") ? [path] : [];
  }));
  return nested.flat();
}

async function readRolloutMetadata(filePath: string): Promise<(SessionMetaEvent & { model?: string }) | undefined> {
  const input = createReadStream(filePath, { encoding: "utf8", end: 512 * 1024 - 1 });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let meta: SessionMetaEvent | undefined;
  let model: string | undefined;
  try {
    for await (const line of lines) {
      try {
        const event = normalizeEvent(JSON.parse(line));
        if (event.kind === "session-meta") meta = event;
        if (event.kind === "turn-context") model = event.model;
        if (meta && model !== undefined) break;
      } catch { /* Ignore malformed records while locating metadata. */ }
    }
  } finally {
    lines.close();
    input.destroy();
  }
  return meta ? { ...meta, model } : undefined;
}

async function readSessionNames(indexPath: string): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const input = createReadStream(indexPath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      try {
        const record = JSON.parse(line) as SessionIndexRecord;
        if (typeof record.id === "string" && typeof record.thread_name === "string") names.set(record.id, record.thread_name);
      } catch { /* Ignore an incomplete active index line. */ }
    }
  } finally {
    lines.close();
    input.destroy();
  }
  return names;
}

function samePath(left: string, right: string): boolean {
  const clean = (value: string) => normalize(resolve(value.replace(/^\\\\\?\\/, ""))).replace(/\\/g, "/").toLowerCase();
  return clean(left) === clean(right);
}
