import { parseRolloutFile } from "./rolloutParser";
import { CodexEvent, InferenceActivity, ToolActivity, TurnRecord, TurnTimeline, UsageValue } from "./types";

export interface TurnTimelineOptions { includePromptPreview?: boolean; promptPreviewLength?: number; }

interface MutableTurn extends TurnRecord { tools: Map<string, ToolActivity>; }

/** Reconstructs prompt-scoped activity without retaining tool or prompt content by default. */
export async function buildTurnTimeline(filePath: string, options: TurnTimelineOptions = {}): Promise<TurnTimeline> {
  const turns = new Map<string, MutableTurn>();
  const pendingPrompts: Array<{ timestamp?: string; preview?: string }> = [];
  let activeTurnId: string | undefined;
  let sessionId: string | undefined;
  let index = 0;

  const ensure = (id: string, kind: TurnRecord["kind"] = "background"): MutableTurn => {
    const existing = turns.get(id);
    if (existing) return existing;
    const turn: MutableTurn = { id, index: ++index, kind, status: kind === "pending" ? "pending" : "active", inferenceCalls: [], toolCalls: [], tools: new Map(), reasoningItems: 0, agentMessages: 0 };
    turns.set(id, turn);
    return turn;
  };

  const apply = (event: CodexEvent): void => {
    switch (event.kind) {
      case "session-meta": sessionId = event.sessionId; return;
      case "user-message":
        pendingPrompts.push({ timestamp: event.timestamp, preview: options.includePromptPreview ? truncate(event.preview, options.promptPreviewLength ?? 160) : undefined });
        return;
      case "turn-started": {
        if (activeTurnId && activeTurnId !== event.turnId) {
          const prior = ensure(activeTurnId);
          if (prior.status === "active") prior.status = "interrupted";
        }
        const prompt = pendingPrompts.pop();
        const turn = ensure(event.turnId, prompt ? "prompt" : "background");
        turn.kind = prompt ? "prompt" : turn.kind;
        turn.startedAt = event.timestamp ?? turn.startedAt;
        turn.promptPreview = prompt?.preview;
        turn.status = "active";
        activeTurnId = event.turnId;
        return;
      }
      case "turn-completed": {
        const turn = ensure(event.turnId);
        turn.completedAt = event.timestamp ?? turn.completedAt;
        turn.status = "completed";
        if (activeTurnId === event.turnId) activeTurnId = undefined;
        return;
      }
      case "inference-usage": {
        const turn = ensure(event.turnId ?? event.rootTurnId ?? activeTurnId ?? `background-${index + 1}`);
        turn.inferenceCalls.push({ timestamp: event.timestamp, usage: event.usage });
        turn.usage = event.turnUsage ?? turn.usage ?? event.usage;
        return;
      }
      case "response-item": {
        if (!activeTurnId) return;
        const turn = ensure(activeTurnId);
        if (event.itemType === "tool-call") {
          const callId = event.callId ?? `unidentified-tool-${turn.toolCalls.length + 1}`;
          const tool: ToolActivity = { callId, name: event.toolName, completed: false };
          turn.tools.set(callId, tool);
          turn.toolCalls.push(tool);
        } else if (event.itemType === "tool-result") {
          const tool = event.callId ? turn.tools.get(event.callId) : undefined;
          if (tool) tool.completed = true;
        } else if (event.itemType === "reasoning") turn.reasoningItems++;
        else if (event.itemType === "agent-message") turn.agentMessages++;
        return;
      }
      default: return;
    }
  };

  const parsed = await parseRolloutFile(filePath, apply);
  for (const prompt of pendingPrompts) {
    const turn = ensure(`pending-${index + 1}`, "pending");
    turn.startedAt = prompt.timestamp;
    turn.promptPreview = prompt.preview;
  }
  return { sessionId, turns: [...turns.values()].sort((left, right) => left.index - right.index).map(({ tools: _tools, ...turn }) => turn), parserWarnings: parsed.malformedLines };
}

function truncate(value: string | undefined, maximum: number): string | undefined {
  if (!value) return undefined;
  return value.length <= maximum ? value : `${value.slice(0, Math.max(0, maximum - 1))}…`;
}
