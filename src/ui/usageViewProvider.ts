import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import { SessionReport } from "../codex/types";
import { formatTokens } from "../codex/usageAggregator";
import { AppServerRateLimits, RateLimitWindow, formatRateLimitUsage, rateLimitLabel } from "../codex/appServerProtocol";

export const USAGE_VIEW_ID = "codexUsage.dashboard";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function metric(label: string, value?: bigint): string {
  return `<div class="metric"><span>${label}</span><strong>${value === undefined ? "N/A" : formatTokens(value)}</strong></div>`;
}

function formatReset(resetsAt: number): string {
  const milliseconds = resetsAt * 1_000 - Date.now();
  if (milliseconds <= 0) return "resets shortly";
  const minutes = Math.ceil(milliseconds / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainingMinutes = minutes % 60;
  const relative = [days ? `${days}d` : "", hours ? `${hours}h` : "", (!days && remainingMinutes) ? `${remainingMinutes}m` : ""].filter(Boolean).join(" ");
  return `resets in ${relative || "under 1m"}`;
}

export class UsageViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private report?: SessionReport;
  private rateLimits?: AppServerRateLimits;
  private selectionLabel = "Following newest observed session";

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
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
    const body = `<section><h2>Current turn</h2>${turnBody}</section><section><h2>Selected session</h2><p class="muted">${escapeHtml(this.selectionLabel)}</p><p class="model">${escapeHtml(report.models.at(-1) ?? "Model unavailable")}</p><p class="muted">${report.inferenceCalls} observed inference calls</p>${this.metrics(total)}<p class="source">Codex rollout telemetry · ${escapeHtml(report.total.source.replaceAll("_", " "))} · ${escapeHtml(report.total.confidence)}</p></section><section><h2>Context window</h2><p class="context">${context}</p></section><p class="activity muted">Use the Sessions tree below to select a session and expand prompts, agent inferences, and tool activity.</p><section><h2>Rate limits</h2><p class="muted">N/A — local rollout telemetry does not authoritatively provide account limits.</p></section><p class="privacy">Local-only. Prompt and tool-output contents are not displayed or stored.</p>`;
    const renderedBody = body.replace(/<section><h2>Rate limits<\/h2>.*?<\/section>/, `<section><h2>Rate limits</h2>${this.rateLimitBody()}</section>`);
    this.view.webview.html = this.page(renderedBody);
  }

  private metrics(usage: SessionReport["total"]["usage"]): string {
    return `<div class="metrics">${metric("Input", usage.inputTokens)}${metric("Cached input", usage.cachedInputTokens)}${metric("Cache-write", usage.cacheWriteInputTokens)}${metric("Output", usage.outputTokens)}${metric("Reasoning", usage.reasoningOutputTokens)}${metric("Total", usage.totalTokens)}</div>`;
  }

  private rateLimitBody(): string {
    if (!this.rateLimits) return "<p class=\"muted\">Unavailable. Enable app-server integration to request authoritative account limits.</p>";
    const label = [this.rateLimits.limitName, this.rateLimits.planType].filter((value): value is string => Boolean(value)).map(escapeHtml).join(" · ");
    return `<p class="model">${label || "Codex account"}</p><div class="metrics">${this.rateLimitMetric("5-hour limit", this.rateLimits.primary)}${this.rateLimitMetric("Weekly limit", this.rateLimits.secondary)}</div><p class="source">Codex app-server · authoritative account telemetry</p>`;
  }

  private rateLimitMetric(label: string, window: RateLimitWindow | undefined): string {
    if (!window) return "";
    const reset = window.resetsAt ? ` · ${formatReset(window.resetsAt)} (${escapeHtml(new Date(window.resetsAt * 1_000).toLocaleString())})` : "";
    return `<div class="metric rate-limit-metric"><span>${rateLimitLabel(window, label)}</span><strong>${formatRateLimitUsage(window)}</strong></div><p class="muted rate-limit-reset">${reset}</p>`;
  }

  private page(body: string): string {
    const nonce = randomBytes(16).toString("base64");
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><style>html{scrollbar-color:var(--vscode-scrollbarSlider-background) transparent;scrollbar-width:thin}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-background)}body{color:var(--vscode-foreground);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);margin:0;padding:10px 12px}section{border-bottom:1px solid var(--vscode-widget-border);padding:0 0 10px;margin:0 0 10px}h2{font-size:11px;letter-spacing:.08em;margin:0 0 7px;text-transform:uppercase}p{margin:4px 0}.model{font-weight:600}.muted,.source,.privacy{color:var(--vscode-descriptionForeground);font-size:12px}.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px;row-gap:4px;margin-top:8px}.metric{display:flex;gap:6px;justify-content:space-between;min-width:0}.metric span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.metric strong{font-variant-numeric:tabular-nums;white-space:nowrap}.rate-limit-metric{grid-column:1/-1}.rate-limit-reset{grid-column:1/-1;margin-top:-2px}.source{margin-top:8px}.privacy,.activity{line-height:1.35}.activity{margin:0 0 10px}.empty{color:var(--vscode-descriptionForeground);line-height:1.5}.context{font-weight:600}@media (min-width:480px){.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}</style></head><body>${body}<script nonce="${nonce}">window.scrollTo(0, 0);</script></body></html>`;
  }
}
