import * as vscode from "vscode";
import { join } from "node:path";
import { codexSessionsPath, hasCodexSessions, resolveCodexHome } from "./codex/codexHome";
import { ThreadCatalog } from "./codex/threadCatalog";
import { buildTurnTimeline } from "./codex/turnTimeline";
import { RolloutWatcher } from "./codex/rolloutWatcher";
import { CodexAppServerClient } from "./codex/appServerClient";
import { ObservedThread, SessionReport } from "./codex/types";
import { formatTokens, formatUsage } from "./codex/usageAggregator";
import { SessionTreeProvider } from "./ui/sessionTreeProvider";
import { USAGE_VIEW_ID, UsageViewProvider } from "./ui/usageViewProvider";

const SELECTED_THREAD_KEY = "selectedThreadId";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Codex Usage");
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = "codexUsage.openDashboard";
  status.tooltip = "Codex raw model usage for the selected local session";
  context.subscriptions.push(output, status);

  const usageView = new UsageViewProvider();
  const sessionTree = new SessionTreeProvider();
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(USAGE_VIEW_ID, usageView));
  context.subscriptions.push(vscode.window.registerTreeDataProvider("codexUsage.sessions", sessionTree));

  let latestReport: SessionReport | undefined;
  let threads: ObservedThread[] = [];
  let selectedThread: ObservedThread | undefined;
  let activeWatcher: RolloutWatcher | undefined;
  let timelineTimer: NodeJS.Timeout | undefined;
  let appServer: CodexAppServerClient | undefined;

  const configuredHome = vscode.workspace.getConfiguration("codexUsage").get<string>("codexHome");
  const home = resolveCodexHome(configuredHome);
  const sessionsDirectory = codexSessionsPath(home);
  const catalog = new ThreadCatalog(sessionsDirectory, join(home, "session_index.jsonl"));

  const render = (report: SessionReport): void => {
    latestReport = report;
    usageView.setReport(report);
    const setting = vscode.workspace.getConfiguration("codexUsage").get<boolean>("showStatusBar", true);
    if (!setting) { status.hide(); return; }
    status.text = `$(pulse) Codex ${formatTokens(report.total.usage.totalTokens)}`;
    status.show();
  };

  const refreshThreads = async (): Promise<void> => {
    const config = vscode.workspace.getConfiguration("codexUsage");
    threads = await catalog.list({
      limit: config.get<number>("historySessionLimit", 20),
      includeNames: config.get<boolean>("showSessionNames", false),
      includeInternal: false
    });
    sessionTree.setThreads(threads);
  };

  const refreshTimeline = async (): Promise<void> => {
    if (!selectedThread) return;
    const config = vscode.workspace.getConfiguration("codexUsage");
    const timeline = await buildTurnTimeline(selectedThread.rolloutPath, {
      includePromptPreview: config.get<boolean>("showPromptPreview", false),
      promptPreviewLength: config.get<number>("promptPreviewLength", 160)
    });
    sessionTree.setSelectedThread(selectedThread.id, timeline);
  };

  const scheduleTimelineRefresh = (): void => {
    if (timelineTimer) clearTimeout(timelineTimer);
    timelineTimer = setTimeout(() => { void refreshTimeline(); }, 1_000);
  };

  const observeThread = async (thread: ObservedThread, selectionLabel: string): Promise<void> => {
    activeWatcher?.dispose();
    selectedThread = thread;
    usageView.setSelectionLabel(selectionLabel);
    const watcher = new RolloutWatcher(thread.rolloutPath);
    activeWatcher = watcher;
    watcher.onDidUpdate((report) => { render(report); scheduleTimelineRefresh(); });
    watcher.onDidError(() => output.appendLine("WARN: The selected Codex rollout is temporarily unavailable."));
    render(await watcher.start());
    await refreshTimeline();
  };
  context.subscriptions.push({ dispose: () => { activeWatcher?.dispose(); if (timelineTimer) clearTimeout(timelineTimer); } });
  context.subscriptions.push({ dispose: () => appServer?.dispose() });

  const refreshRateLimits = async (): Promise<void> => {
    const config = vscode.workspace.getConfiguration("codexUsage");
    if (!config.get<boolean>("enableAppServer", false)) {
      void vscode.window.showInformationMessage("Codex Usage: enable App Server Integration before requesting account limits.");
      return;
    }
    appServer ??= new CodexAppServerClient(config.get<string>("appServerCommand", "codex"));
    try {
      usageView.setRateLimits(await appServer.readRateLimits());
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const authenticationRequired = /authentication required/i.test(message);
      output.appendLine(authenticationRequired
        ? "INFO: Codex app-server requires an authenticated Codex CLI session before it can read account limits."
        : "WARN: Codex app-server rate limits are temporarily unavailable.");
      if (authenticationRequired) void vscode.window.showInformationMessage("Codex Usage: sign in to the Codex CLI before requesting account rate limits.");
      usageView.setRateLimits(undefined);
    }
  };

  const selectThread = async (threadId: string, pinned = true): Promise<void> => {
    let thread = threads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      await refreshThreads();
      thread = threads.find((candidate) => candidate.id === threadId);
    }
    if (!thread) {
      void vscode.window.showWarningMessage("Codex Usage: the selected local session is no longer available.");
      return;
    }
    await context.workspaceState.update(SELECTED_THREAD_KEY, pinned ? thread.id : undefined);
    await observeThread(thread, pinned ? "Pinned session for this VS Code workspace" : "Following newest observed session");
  };

  if (hasCodexSessions(home)) {
    try {
      await refreshThreads();
      const savedThreadId = context.workspaceState.get<string>(SELECTED_THREAD_KEY);
      const initial = (savedThreadId && threads.find((thread) => thread.id === savedThreadId)) ?? threads[0];
      if (initial) await selectThread(initial.id, Boolean(savedThreadId));
    } catch {
      output.appendLine("WARN: Could not initialize the local Codex thread catalog.");
    }
  }
  if (vscode.workspace.getConfiguration("codexUsage").get<boolean>("enableAppServer", false)) void refreshRateLimits();

  context.subscriptions.push(vscode.commands.registerCommand("codexUsage.selectThread", async (threadId: string) => selectThread(threadId, true)));
  context.subscriptions.push(vscode.commands.registerCommand("codexUsage.refreshHistory", async () => {
    if (!hasCodexSessions(home)) {
      void vscode.window.showInformationMessage("Codex Usage: no local sessions are available to scan.");
      return;
    }
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: "Codex Usage: refreshing sessions" }, refreshThreads);
    await refreshTimeline();
  }));
  context.subscriptions.push(vscode.commands.registerCommand("codexUsage.selectSession", async () => {
    if (!threads.length) await refreshThreads();
    const picked = await vscode.window.showQuickPick(threads.map((thread) => ({ label: thread.displayName || thread.model || `Session ${thread.id.slice(0, 8)}`, description: `${new Date(thread.updatedAt).toLocaleString()} · ${thread.id.slice(0, 8)}`, threadId: thread.id })), { title: "Codex Usage: Select session" });
    if (picked) await selectThread(picked.threadId, true);
  }));
  context.subscriptions.push(vscode.commands.registerCommand("codexUsage.openDashboard", async () => {
    await vscode.commands.executeCommand("workbench.view.extension.codexUsage");
    usageView.setReport(latestReport);
  }));
  context.subscriptions.push(vscode.commands.registerCommand("codexUsage.refreshRateLimits", refreshRateLimits));
  context.subscriptions.push(vscode.commands.registerCommand("codexUsage.analyzeCurrentSession", async () => {
    if (!latestReport) {
      void vscode.window.showInformationMessage(`Codex Usage: no observable rollout is available under ${sessionsDirectory}.`);
      return;
    }
    output.clear();
    output.appendLine(`Session: ${latestReport.sessionId}`);
    output.appendLine(`Models: ${latestReport.models.join(", ") || "N/A"}`);
    output.appendLine(`Inference calls: ${latestReport.inferenceCalls}`);
    for (const line of formatUsage("Session usage", latestReport.total.usage)) output.appendLine(line);
    output.appendLine(`Source: ${latestReport.total.source} (${latestReport.total.confidence})`);
    output.show(true);
  }));
}

export function deactivate(): void { /* VS Code disposes subscriptions. */ }
