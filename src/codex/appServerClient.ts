import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import { AppServerRateLimits, AppServerThreadUsageUpdate, decodeRateLimits, decodeThreadUsageUpdate } from "./appServerProtocol";

interface JsonRpcResponse { id?: unknown; result?: unknown; error?: { message?: unknown }; }

/**
 * A separate, local Codex app-server client. It never attaches to another
 * extension's connection and it sends read-only account requests only.
 */
export class CodexAppServerClient {
  private process?: ChildProcessWithoutNullStreams;
  private starting?: Promise<void>;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout }>();
  private readonly events = new EventEmitter();
  private nextId = 1;

  constructor(private readonly command = "codex") {}

  async readRateLimits(): Promise<AppServerRateLimits | undefined> {
    await this.start();
    return decodeRateLimits(await this.request("account/rateLimits/read", {}));
  }

  onDidThreadUsage(listener: (update: AppServerThreadUsageUpdate) => void): () => void {
    this.events.on("threadUsage", listener);
    return () => this.events.off("threadUsage", listener);
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Codex app-server stopped."));
    }
    this.pending.clear();
    this.process?.kill();
    this.process = undefined;
    this.events.removeAllListeners();
  }

  private async start(): Promise<void> {
    if (this.process) return;
    if (!this.starting) this.starting = this.connect();
    return this.starting;
  }

  private async connect(): Promise<void> {
    const process = spawn(this.command, ["app-server", "--stdio"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.process = process;
    process.stderr.resume();
    process.on("error", (error) => this.failAll(error));
    process.on("exit", () => this.failAll(new Error("Codex app-server exited.")));
    const lines = createInterface({ input: process.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => this.onLine(line));
    try {
      await this.request("initialize", { clientInfo: { name: "codex_rollout_insights", title: "Codex Rollout Insights", version: "2.0.0" } });
      this.notify("initialized", {});
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server timed out while calling ${method}.`));
      }, 10_000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ method, id, params }); } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("Codex app-server is unavailable."));
      }
    });
  }

  private notify(method: string, params: unknown): void { this.send({ method, params }); }

  private send(message: unknown): void {
    if (!this.process?.stdin.writable) throw new Error("Codex app-server is unavailable.");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private onLine(line: string): void {
    let message: unknown;
    try { message = JSON.parse(line); } catch { return; }
    const update = decodeThreadUsageUpdate(message);
    if (update) this.events.emit("threadUsage", update);
    const response = message as JsonRpcResponse;
    if (typeof response.id !== "number") return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    clearTimeout(pending.timer);
    if (response.error) pending.reject(new Error(typeof response.error.message === "string" ? response.error.message : "Codex app-server request failed."));
    else pending.resolve(response.result);
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.process = undefined;
    this.starting = undefined;
  }
}
