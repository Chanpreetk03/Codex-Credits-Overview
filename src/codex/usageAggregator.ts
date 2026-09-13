import { CodexEvent, InferenceUsageEvent, SessionReport, TokenUsage, TurnReport, UsageValue, ZERO_USAGE } from "./types";
import { cloneUsage } from "./usage";

interface MutableTurn {
  id: string;
  model?: string;
  inferenceKeys: Set<string>;
  usage?: UsageValue;
  lastActivity: number;
}

function timestamp(value?: string): number {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : Date.now();
}

function fallbackKey(event: InferenceUsageEvent): string {
  const usage = event.usage.usage;
  return [event.turnId, event.timestamp, usage.inputTokens, usage.outputTokens, usage.totalTokens].join(":");
}

function reportTurn(turn: MutableTurn): TurnReport {
  return { id: turn.id, model: turn.model, inferenceCalls: turn.inferenceKeys.size, usage: turn.usage ?? { usage: cloneUsage(), source: "derived", confidence: "ambiguous" } };
}

/**
 * Keeps Codex-provided thread/turn totals authoritative. Individual inference
 * records are only used for a call count and as a fallback when totals are absent.
 */
export class UsageAggregator {
  private sessionId = "unknown";
  private cwd?: string;
  private turns = new Map<string, MutableTurn>();
  private seenInference = new Set<string>();
  private total?: UsageValue;
  private latestRequest?: UsageValue;
  private modelContextWindow?: bigint;
  private currentModel?: string;
  private models = new Set<string>();
  private latestActivity = 0;
  private warningCount = 0;

  apply(event: CodexEvent): void {
    switch (event.kind) {
      case "session-meta":
        this.sessionId = event.sessionId;
        this.cwd = event.cwd ?? this.cwd;
        return;
      case "turn-context":
        this.currentModel = event.model ?? this.currentModel;
        if (event.model) this.models.add(event.model);
        if (event.turnId) this.ensureTurn(event.turnId, event.timestamp).model = event.model ?? this.currentModel;
        return;
      case "inference-usage":
        this.applyInference(event);
        return;
      case "token-count":
        this.total = event.total;
        this.latestRequest = event.last ?? this.latestRequest;
        this.modelContextWindow = event.modelContextWindow ?? this.modelContextWindow;
        this.latestActivity = Math.max(this.latestActivity, timestamp(event.timestamp));
        return;
      case "unknown":
        return;
    }
  }

  addWarning(): void { this.warningCount++; }

  toReport(): SessionReport {
    const turns = [...this.turns.values()].sort((a, b) => b.lastActivity - a.lastActivity);
    const latestTurn = turns[0] ? reportTurn(turns[0]) : undefined;
    return {
      sessionId: this.sessionId,
      cwd: this.cwd,
      latestTurn,
      total: this.total ?? { usage: cloneUsage(ZERO_USAGE), source: "derived", confidence: "ambiguous" },
      latestRequest: this.latestRequest,
      modelContextWindow: this.modelContextWindow,
      models: [...this.models],
      inferenceCalls: this.seenInference.size,
      parserWarnings: this.warningCount
    };
  }

  private ensureTurn(id: string, eventTimestamp?: string): MutableTurn {
    const existing = this.turns.get(id);
    if (existing) {
      existing.lastActivity = Math.max(existing.lastActivity, timestamp(eventTimestamp));
      return existing;
    }
    const turn = { id, model: this.currentModel, inferenceKeys: new Set<string>(), lastActivity: timestamp(eventTimestamp) };
    this.turns.set(id, turn);
    return turn;
  }

  private applyInference(event: InferenceUsageEvent): void {
    const key = event.responseId ?? fallbackKey(event);
    if (this.seenInference.has(key)) return;
    this.seenInference.add(key);
    const turnId = event.turnId ?? event.rootTurnId ?? "unattributed";
    const turn = this.ensureTurn(turnId, event.timestamp);
    turn.inferenceKeys.add(key);
    turn.usage = event.turnUsage ?? event.usage;
    this.total = event.threadUsage ?? this.total;
    this.latestRequest = event.usage;
    this.latestActivity = Math.max(this.latestActivity, timestamp(event.timestamp));
  }
}

export function formatTokens(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  if (absolute < 1_000n) return value.toString();
  const units: Array<[bigint, string]> = [[1_000_000_000n, "B"], [1_000_000n, "M"], [1_000n, "K"]];
  for (const [size, suffix] of units) {
    if (absolute >= size) {
      const tenths = (absolute * 10n) / size;
      return `${tenths / 10n}.${tenths % 10n}${suffix}`;
    }
  }
  return value.toString();
}

export function formatUsage(label: string, value: TokenUsage): string[] {
  return [
    `${label}: ${formatTokens(value.totalTokens)} total`,
    `  Input ${formatTokens(value.inputTokens)} | Cached ${formatTokens(value.cachedInputTokens)} | Cache write ${formatTokens(value.cacheWriteInputTokens)}`,
    `  Output ${formatTokens(value.outputTokens)} | Reasoning ${formatTokens(value.reasoningOutputTokens)}`
  ];
}
