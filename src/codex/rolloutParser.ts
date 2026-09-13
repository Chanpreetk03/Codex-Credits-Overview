import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { CodexEvent } from "./types";
import { normalizeEvent } from "./eventNormalizer";

export interface ParseResult {
  events: CodexEvent[];
  malformedLines: number;
  bytesRead: number;
}

/** Streams JSONL without retaining raw records, so large rollouts stay bounded in memory. */
export async function parseRolloutFile(filePath: string, onEvent: (event: CodexEvent) => void): Promise<ParseResult> {
  const file = await stat(filePath);
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let malformedLines = 0;
  let eventCount = 0;

  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      onEvent(normalizeEvent(JSON.parse(line)));
      eventCount++;
    } catch {
      // An active rollout can end with a partial write. The watcher retries it later.
      malformedLines++;
    }
  }
  return { events: [], malformedLines, bytesRead: file.size };
}

export interface IncrementalJsonlState {
  offset: number;
  remainder: string;
}

/** Parse only bytes appended since the preceding call; incomplete final lines are retained. */
export async function parseAppendedRollout(
  filePath: string,
  state: IncrementalJsonlState,
  onEvent: (event: CodexEvent) => void
): Promise<{ state: IncrementalJsonlState; malformedLines: number; rotated: boolean }> {
  const file = await stat(filePath);
  const rotated = file.size < state.offset;
  const start = rotated ? 0 : state.offset;
  const chunks: Buffer[] = [];
  const stream = createReadStream(filePath, { start });
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const content = (rotated ? "" : state.remainder) + Buffer.concat(chunks).toString("utf8");
  const lines = content.split(/\r?\n/);
  const remainder = lines.pop() ?? "";
  let malformedLines = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    try { onEvent(normalizeEvent(JSON.parse(line))); } catch { malformedLines++; }
  }
  return { state: { offset: file.size, remainder }, malformedLines, rotated };
}
