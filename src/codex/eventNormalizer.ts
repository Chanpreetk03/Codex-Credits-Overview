import { CodexEvent, ResponseItemEvent, SessionMetaEvent, UsageValue } from "./types";
import { asBigInt, asTokenUsage, validateUsage } from "./usage";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function sessionSource(value: unknown): SessionMetaEvent["source"] {
  if (value === "vscode" || value === "cli") return value;
  if (value && typeof value === "object") return "subagent";
  return "unknown";
}

function usage(value: unknown, source: UsageValue["source"]): UsageValue | undefined {
  const parsed = asTokenUsage(value);
  return parsed ? { usage: parsed, source, confidence: validateUsage(parsed) } : undefined;
}

export function normalizeEvent(raw: unknown): CodexEvent {
  const record = object(raw);
  if (!record) return { kind: "unknown" };
  const rawType = text(record.type);
  const payload = object(record.payload);
  const timestamp = text(record.timestamp);

  if (rawType === "session_meta" && payload) {
    const sessionId = text(payload.session_id) ?? text(payload.id);
    return sessionId ? { kind: "session-meta", sessionId, timestamp, cwd: text(payload.cwd), source: sessionSource(payload.source), originator: text(payload.originator) } : { kind: "unknown", rawType };
  }
  if (rawType === "turn_context" && payload) {
    return { kind: "turn-context", timestamp, turnId: text(payload.turn_id), rootTurnId: text(payload.root_turn_id), model: text(payload.model) };
  }
  if (rawType === "token_usage_record" && payload) {
    const inferenceUsage = usage(payload.usage, "rollout_inference_usage");
    if (!inferenceUsage) return { kind: "unknown", rawType };
    return {
      kind: "inference-usage", timestamp, sessionId: text(payload.session_id), turnId: text(payload.turn_id),
      rootTurnId: text(payload.root_turn_id), responseId: text(payload.response_id), usage: inferenceUsage,
      turnUsage: usage(payload.turn_token_usage, "rollout_inference_usage"),
      threadUsage: usage(payload.thread_token_usage, "rollout_inference_usage")
    };
  }
  if (rawType === "event_msg" && payload && text(payload.type) === "user_message") {
    return { kind: "user-message", timestamp, preview: text(payload.message) };
  }
  if (rawType === "event_msg" && payload && text(payload.type) === "task_started") {
    const turnId = text(payload.turn_id);
    return turnId ? { kind: "turn-started", timestamp, turnId } : { kind: "unknown", rawType };
  }
  if (rawType === "event_msg" && payload && text(payload.type) === "task_complete") {
    const turnId = text(payload.turn_id);
    return turnId ? { kind: "turn-completed", timestamp, turnId } : { kind: "unknown", rawType };
  }
  if (rawType === "event_msg" && payload && text(payload.type) === "agent_message") {
    return { kind: "response-item", timestamp, itemType: "agent-message" };
  }
  if (rawType === "response_item" && payload) {
    const payloadType = text(payload.type);
    const itemType: ResponseItemEvent["itemType"] = payloadType === "function_call" || payloadType === "custom_tool_call"
      ? "tool-call"
      : payloadType === "function_call_output" || payloadType === "custom_tool_call_output"
        ? "tool-result"
        : payloadType === "reasoning"
          ? "reasoning"
          : payloadType === "message" && text(payload.role) === "assistant"
            ? "agent-message"
            : "other";
    return { kind: "response-item", timestamp, itemType, callId: text(payload.call_id), toolName: text(payload.name) };
  }
  if (rawType === "event_msg" && payload && text(payload.type) === "token_count") {
    const info = object(payload.info);
    const total = usage(info?.total_token_usage, "rollout_token_count");
    if (!total) return { kind: "unknown", rawType };
    return { kind: "token-count", timestamp, total, last: usage(info?.last_token_usage, "rollout_token_count"), modelContextWindow: asBigInt(info?.model_context_window) };
  }
  return { kind: "unknown", rawType };
}
