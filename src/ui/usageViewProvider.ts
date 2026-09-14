import * as vscode from "vscode";
import { SessionReport } from "../codex/types";
import { formatTokens } from "../codex/usageAggregator";
import { AppServerRateLimits, RateLimitWindow } from "../codex/appServerProtocol";

export const USAGE_VIEW_ID = "codexUsage.dashboard";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function metric(label: string, value?: bigint): string {
  return `<div class="metric"><span>${label}</span><strong>${value === undefined ? "N/A" : formatTokens(value)}</strong></div>`;
}

export class UsageViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private report?: SessionReport;
  private rateLimits?: AppServerRateLimits;
  private selectionLabel = "Following newest observed session";

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: false };
    this.render();
  }

  setReport(report: SessionReport | undefined): void {
    this.report = report;
    this.render();
  }

  setSelectionLabel(label: string): void {
    this.selectionLabel = label;
    this.render();
  }

  setRateLimits(rateLimits: AppServerRateLimits | undefined): void {
    this.rateLimits = rateLimits;
    this.render();
  }

  private render(): void {
    if (!this.view) return;
    const report = this.report;
    if (!report) {
      this.view.webview.html = this.page("<p class=\"empty\">No observable Codex rollout is active. Start a Codex session, then reopen this view.</p>");
      return;
    }
    const total = report.total.usage;
    const turn = report.latestTurn;
    const turnBody = turn
      ? `<p class="model">${escapeHtml(turn.model ?? report.models.at(-1) ?? "Model unavailable")}</p><p class="muted">${turn.inferenceCalls} observed inference call${turn.inferenceCalls === 1 ? "" : "s"}</p>${this.metrics(turn.usage.usage)}`
      : "<p class=\"empty\">Turn usage is unavailable in this rollout.</p>";
    const context = report.modelContextWindow
      ? `${formatTokens(report.modelContextWindow)} capacity <span class="muted">— occupancy unavailable</span>`
      : "N/A";
    const body = `<section><h2>Current turn</h2>${turnBody}</section><section><h2>Selected session</h2><p class="muted">${escapeHtml(this.selectionLabel)}</p><p class="model">${escapeHtml(report.models.at(-1) ?? "Model unavailable")}</p><p class="muted">${report.inferenceCalls} observed inference calls</p>${this.metrics(total)}<p class="source">Codex rollout telemetry · ${escapeHtml(report.total.source.replaceAll("_", " "))} · ${escapeHtml(report.total.confidence)}</p></section><section><h2>Context window</h2><p class="context">${context}</p></section><section><h2>Session activity</h2><p class="muted">Use the Sessions tree below to select a session and expand its prompts, agent inferences, and tool activity.</p></section><section><h2>Rate limits</h2><p class="muted">N/A — local rollout telemetry does not authoritatively provide account limits.</p></section><p class="privacy">Local-only. Prompt and tool-output contents are not displayed or stored.</p>`;
    const renderedBody = body.replace(/<section><h2>Rate limits<\/h2>.*?<\/section>/, `<section><h2>Rate limits</h2>${this.rateLimitBody()}</section>`);
    this.view.webview.html = this.page(renderedBody);
  }

  private metrics(usage: SessionReport["total"]["usage"]): string {
    return `<div class="metrics">${metric("Input", usage.inputTokens)}${metric("Cached input", usage.cachedInputTokens)}${metric("Cache-write", usage.cacheWriteInputTokens)}${metric("Output", usage.outputTokens)}${metric("Reasoning", usage.reasoningOutputTokens)}${metric("Total", usage.totalTokens)}</div>`;
  }

  private rateLimitBody(): string {
    if (!this.rateLimits) return "<p class=\"muted\">Unavailable. Enable app-server integration to request authoritative account limits.</p>";
    const label = [this.rateLimits.limitName, this.rateLimits.planType].filter((value): value is string => Boolean(value)).map(escapeHtml).join(" · ");
    return `<p class="model">${label || "Codex account"}</p><div class="metrics">${this.rateLimitMetric("Primary", this.rateLimits.primary)}${this.rateLimitMetric("Secondary", this.rateLimits.secondary)}</div><p class="source">Codex app-server · authoritative account telemetry</p>`;
  }

  private rateLimitMetric(label: string, window: RateLimitWindow | undefined): string {
    if (!window) return "";
    const reset = window.resetsAt ? ` · resets ${escapeHtml(new Date(window.resetsAt * 1000).toLocaleString())}` : "";
    const duration = window.windowDurationMins ? ` (${window.windowDurationMins} min)` : "";
    return `<div class="metric"><span>${label}${duration}</span><strong>${window.usedPercent}%</strong></div><p class="muted">${reset}</p>`;
  }

  private page(body: string): string {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{color:var(--vscode-foreground);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);margin:0;padding:12px}section{border-bottom:1px solid var(--vscode-widget-border);padding:0 0 14px;margin:0 0 14px}h2{font-size:11px;letter-spacing:.08em;margin:0 0 9px;text-transform:uppercase}p{margin:5px 0}.model{font-weight:600}.muted,.source,.privacy{color:var(--vscode-descriptionForeground);font-size:12px}.metrics{display:grid;gap:4px;margin-top:10px}.metric{display:flex;justify-content:space-between}.metric strong{font-variant-numeric:tabular-nums}.source{margin-top:11px}.privacy{line-height:1.4}.empty{color:var(--vscode-descriptionForeground);line-height:1.5}.context{font-weight:600}</style></head><body>${body}</body></html>`;
  }
}
