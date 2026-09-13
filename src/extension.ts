import * as vscode from "vscode";
import { codexSessionsPath, hasCodexSessions, resolveCodexHome } from "./codex/codexHome";
import { findLatestRollout } from "./codex/sessionScanner";
import { RolloutWatcher } from "./codex/rolloutWatcher";
import { SessionReport } from "./codex/types";
import { formatTokens, formatUsage } from "./codex/usageAggregator";
import { USAGE_VIEW_ID, UsageViewProvider } from "./ui/usageViewProvider";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Codex Usage");
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = "codexUsage.openDashboard";
  status.tooltip = "Codex raw model usage for the active local rollout";
  context.subscriptions.push(output);
  context.subscriptions.push(status);
  const usageView = new UsageViewProvider();
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(USAGE_VIEW_ID, usageView));
  let latestReport: SessionReport | undefined;

  const render = (report: SessionReport): void => {
    latestReport = report;
    usageView.setReport(report);
    const setting = vscode.workspace.getConfiguration("codexUsage").get<boolean>("showStatusBar", true);
    if (!setting) { status.hide(); return; }
    status.text = `$(pulse) Codex ${formatTokens(report.total.usage.totalTokens)}`;
    status.show();
  };

  const configuredHome = vscode.workspace.getConfiguration("codexUsage").get<string>("codexHome");
  const home = resolveCodexHome(configuredHome);
  if (hasCodexSessions(home)) {
    try {
      const activeRollout = await findLatestRollout(codexSessionsPath(home));
      if (activeRollout) {
        const watcher = new RolloutWatcher(activeRollout);
        watcher.onDidUpdate(render);
        await watcher.start().then(render);
        context.subscriptions.push({ dispose: () => watcher.dispose() });
      }
    } catch {
      output.appendLine("WARN: Could not initialize the local Codex rollout observer.");
    }
  }

  context.subscriptions.push(vscode.commands.registerCommand("codexUsage.analyzeCurrentSession", async () => {
    if (!latestReport) {
      void vscode.window.showInformationMessage(`Codex Usage: no observable rollout is available under ${codexSessionsPath(home)}.`);
      return;
    }
    output.clear();
    output.appendLine(`Session: ${latestReport.sessionId}`);
    output.appendLine(`Models: ${latestReport.models.join(", ") || "N/A"}`);
    output.appendLine(`Inference calls: ${latestReport.inferenceCalls}`);
    for (const line of formatUsage("Session usage", latestReport.total.usage)) output.appendLine(line);
    output.appendLine(`Source: ${latestReport.total.source} (${latestReport.total.confidence})`);
    if (latestReport.latestTurn) {
      output.appendLine(`Latest turn: ${latestReport.latestTurn.id} (${latestReport.latestTurn.inferenceCalls} calls)`);
      for (const line of formatUsage("Latest turn usage", latestReport.latestTurn.usage.usage)) output.appendLine(line);
    }
    if (latestReport.modelContextWindow) output.appendLine(`Context window capacity: ${formatTokens(latestReport.modelContextWindow)}; occupancy unavailable`);
    output.show(true);
  }));
  context.subscriptions.push(vscode.commands.registerCommand("codexUsage.openDashboard", async () => {
    await vscode.commands.executeCommand("workbench.view.extension.codexUsage");
    usageView.setReport(latestReport);
  }));
}

export function deactivate(): void { /* VS Code disposes subscriptions. */ }
