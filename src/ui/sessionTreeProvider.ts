import * as vscode from "vscode";
import { ObservedThread, ToolActivity, TurnRecord, TurnTimeline } from "../codex/types";
import { formatTokens } from "../codex/usageAggregator";

type TreeNode = ThreadNode | TurnNode | ToolNode | DetailNode;

class ThreadNode extends vscode.TreeItem {
  constructor(readonly thread: ObservedThread, selected: boolean) {
    super(thread.displayName || thread.model || `Session ${thread.id.slice(0, 8)}`, selected ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    this.id = `thread:${thread.id}`;
    this.description = `${new Date(thread.updatedAt).toLocaleString()} · ${thread.id.slice(0, 8)}`;
    this.tooltip = `Session ${thread.id}\n${thread.model ?? "Model unavailable"}\n${thread.source}`;
    this.iconPath = new vscode.ThemeIcon(selected ? "check" : "comment-discussion");
    this.command = { command: "codexUsage.selectThread", title: "Select Codex session", arguments: [thread.id] };
    this.contextValue = "codexUsage.thread";
  }
}

class TurnNode extends vscode.TreeItem {
  constructor(readonly turn: TurnRecord) {
    const label = turn.kind === "prompt" ? `Prompt ${turn.index}` : turn.kind === "background" ? `Agent/background turn ${turn.index}` : "Pending user prompt";
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `turn:${turn.id}`;
    this.description = `${turn.status} · ${turn.usage ? formatTokens(turn.usage.usage.totalTokens) : "N/A"}`;
    this.iconPath = new vscode.ThemeIcon(turn.kind === "prompt" ? "comment" : "gear");
    this.tooltip = `${label}\n${turn.inferenceCalls.length} inference calls · ${turn.toolCalls.length} tool calls`;
  }
}

class ToolNode extends vscode.TreeItem {
  constructor(readonly tool: ToolActivity) {
    super(`Tool: ${tool.name ?? "unknown"}`, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `tool:${tool.callId}`;
    this.description = tool.completed ? "completed" : "in progress";
    this.iconPath = new vscode.ThemeIcon("tools");
  }
}

class DetailNode extends vscode.TreeItem {
  constructor(label: string, description?: string, icon = "circle-small") {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

/** Native, accessible session tree. The view knows no rollout parsing details. */
export class SessionTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly changed = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this.changed.event;
  private threads: ObservedThread[] = [];
  private selectedThreadId?: string;
  private timeline?: TurnTimeline;

  setThreads(threads: ObservedThread[]): void { this.threads = threads; this.changed.fire(); }
  setSelectedThread(id: string | undefined, timeline?: TurnTimeline): void { this.selectedThreadId = id; this.timeline = timeline; this.changed.fire(); }
  refresh(): void { this.changed.fire(); }

  getTreeItem(element: TreeNode): vscode.TreeItem { return element; }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) return this.threads.map((thread) => new ThreadNode(thread, thread.id === this.selectedThreadId));
    if (element instanceof ThreadNode) return element.thread.id === this.selectedThreadId ? (this.timeline?.turns.map((turn) => new TurnNode(turn)) ?? []) : [];
    if (element instanceof TurnNode) return this.turnDetails(element.turn);
    if (element instanceof ToolNode) return [new DetailNode("Tool result", element.tool.completed ? "recorded" : "awaiting result", element.tool.completed ? "check" : "clock")];
    return [];
  }

  private turnDetails(turn: TurnRecord): TreeNode[] {
    const details: TreeNode[] = [];
    if (turn.kind === "prompt") details.push(new DetailNode(turn.promptPreview ? `User prompt: ${turn.promptPreview}` : "User prompt (hidden)", undefined, "account"));
    else if (turn.kind === "background") details.push(new DetailNode("No user prompt recorded", "Agent/background activity", "warning"));
    for (const [index, inference] of turn.inferenceCalls.entries()) details.push(new DetailNode(`Agent inference ${index + 1}`, formatTokens(inference.usage.usage.totalTokens), "sparkle"));
    details.push(...turn.toolCalls.map((tool) => new ToolNode(tool)));
    if (turn.reasoningItems) details.push(new DetailNode("Reasoning items", String(turn.reasoningItems), "lightbulb"));
    if (turn.agentMessages) details.push(new DetailNode("Agent messages", String(turn.agentMessages), "comment"));
    return details;
  }
}
