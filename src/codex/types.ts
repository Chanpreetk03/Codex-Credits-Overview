export type UsageSource = "rollout_token_count" | "rollout_inference_usage" | "derived";
export type UsageConfidence = "exact" | "high" | "estimated" | "ambiguous";

export interface TokenUsage {
  inputTokens: bigint;
  cachedInputTokens: bigint;
  cacheWriteInputTokens: bigint;
  outputTokens: bigint;
  reasoningOutputTokens: bigint;
  totalTokens: bigint;
}

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0n,
  cachedInputTokens: 0n,
  cacheWriteInputTokens: 0n,
  outputTokens: 0n,
  reasoningOutputTokens: 0n,
  totalTokens: 0n
};

export interface UsageValue {
  usage: TokenUsage;
  source: UsageSource;
  confidence: UsageConfidence;
}

export interface SessionMetaEvent {
  kind: "session-meta";
  sessionId: string;
  timestamp?: string;
  cwd?: string;
}

export interface TurnContextEvent {
  kind: "turn-context";
  turnId?: string;
  rootTurnId?: string;
  timestamp?: string;
  model?: string;
}

export interface InferenceUsageEvent {
  kind: "inference-usage";
  timestamp?: string;
  sessionId?: string;
  turnId?: string;
  rootTurnId?: string;
  responseId?: string;
  usage: UsageValue;
  turnUsage?: UsageValue;
  threadUsage?: UsageValue;
}

export interface TokenCountEvent {
  kind: "token-count";
  timestamp?: string;
  total: UsageValue;
  last?: UsageValue;
  modelContextWindow?: bigint;
}

export interface UnknownEvent {
  kind: "unknown";
  rawType?: string;
}

export type CodexEvent =
  | SessionMetaEvent
  | TurnContextEvent
  | InferenceUsageEvent
  | TokenCountEvent
  | UnknownEvent;

export interface TurnReport {
  id: string;
  model?: string;
  inferenceCalls: number;
  usage: UsageValue;
}

export interface SessionReport {
  sessionId: string;
  cwd?: string;
  latestTurn?: TurnReport;
  total: UsageValue;
  latestRequest?: UsageValue;
  modelContextWindow?: bigint;
  models: string[];
  inferenceCalls: number;
  parserWarnings: number;
}
