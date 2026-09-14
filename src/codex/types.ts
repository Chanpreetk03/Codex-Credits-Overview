export type UsageSource = "rollout_token_count" | "rollout_inference_usage" | "app_server" | "derived";
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
  source?: "vscode" | "cli" | "subagent" | "unknown";
  originator?: string;
}

export interface TurnContextEvent {
  kind: "turn-context";
  turnId?: string;
  rootTurnId?: string;
  timestamp?: string;
  model?: string;
}

export interface UserMessageEvent {
  kind: "user-message";
  timestamp?: string;
  preview?: string;
}

export interface TurnStartedEvent {
  kind: "turn-started";
  timestamp?: string;
  turnId: string;
}

export interface TurnCompletedEvent {
  kind: "turn-completed";
  timestamp?: string;
  turnId: string;
}

export type ResponseItemType = "tool-call" | "tool-result" | "reasoning" | "agent-message" | "other";

export interface ResponseItemEvent {
  kind: "response-item";
  timestamp?: string;
  itemType: ResponseItemType;
  callId?: string;
  toolName?: string;
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
  | UserMessageEvent
  | TurnStartedEvent
  | TurnCompletedEvent
  | ResponseItemEvent
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

export interface SessionHistoryEntry {
  rolloutPath: string;
  sessionId: string;
  cwd?: string;
  model?: string;
  totalTokens: bigint;
  inferenceCalls: number;
  lastActivityAt: number;
  source: UsageSource;
  confidence: UsageConfidence;
}

export interface ObservedThread {
  id: string;
  rolloutPath: string;
  updatedAt: number;
  cwd?: string;
  model?: string;
  source: "vscode" | "cli" | "subagent" | "unknown";
  displayName?: string;
}

export type TurnKind = "prompt" | "background" | "pending";
export type TurnStatus = "active" | "completed" | "interrupted" | "pending";

export interface ToolActivity {
  callId: string;
  name?: string;
  completed: boolean;
}

export interface InferenceActivity {
  timestamp?: string;
  usage: UsageValue;
}

export interface TurnRecord {
  id: string;
  index: number;
  kind: TurnKind;
  status: TurnStatus;
  startedAt?: string;
  completedAt?: string;
  promptPreview?: string;
  inferenceCalls: InferenceActivity[];
  toolCalls: ToolActivity[];
  reasoningItems: number;
  agentMessages: number;
  usage?: UsageValue;
}

export interface TurnTimeline {
  sessionId?: string;
  turns: TurnRecord[];
  parserWarnings: number;
}
