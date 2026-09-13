import { FSWatcher, watch } from "node:fs";
import { EventEmitter } from "node:events";
import { parseAppendedRollout, IncrementalJsonlState } from "./rolloutParser";
import { SessionReport } from "./types";
import { UsageAggregator } from "./usageAggregator";

/**
 * Tails one active rollout. It reads only appended bytes and delays updates so
 * a burst of Codex writes produces one consumer notification.
 */
export class RolloutWatcher {
  private readonly updates = new EventEmitter();
  private state: IncrementalJsonlState = { offset: 0, remainder: "" };
  private readonly aggregator = new UsageAggregator();
  private watcher?: FSWatcher;
  private debounce?: NodeJS.Timeout;
  private stopped = false;

  constructor(private readonly filePath: string, private readonly debounceMs = 500) {}

  async start(): Promise<SessionReport> {
    await this.readAppend();
    this.watcher = watch(this.filePath, (eventType) => {
      if (eventType === "change" || eventType === "rename") this.scheduleRead();
    });
    this.watcher.on("error", () => this.updates.emit("error"));
    return this.aggregator.toReport();
  }

  onDidUpdate(listener: (report: SessionReport) => void): () => void {
    this.updates.on("update", listener);
    return () => this.updates.off("update", listener);
  }

  onDidError(listener: () => void): () => void {
    this.updates.on("error", listener);
    return () => this.updates.off("error", listener);
  }

  dispose(): void {
    this.stopped = true;
    this.watcher?.close();
    if (this.debounce) clearTimeout(this.debounce);
    this.updates.removeAllListeners();
  }

  private scheduleRead(): void {
    if (this.stopped) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => { void this.readAppend(); }, this.debounceMs);
  }

  private async readAppend(): Promise<void> {
    try {
      const result = await parseAppendedRollout(this.filePath, this.state, (event) => this.aggregator.apply(event));
      this.state = result.state;
      for (let index = 0; index < result.malformedLines; index++) this.aggregator.addWarning();
      this.updates.emit("update", this.aggregator.toReport());
    } catch {
      // A rollout can be briefly unavailable while Codex rotates it. Consumers keep the last known report.
      this.updates.emit("error");
    }
  }
}
