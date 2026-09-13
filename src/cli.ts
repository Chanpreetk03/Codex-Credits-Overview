import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { analyzeRollout, analyzeSessions } from "./codex/sessionScanner";
import { codexSessionsPath, resolveCodexHome } from "./codex/codexHome";
import { formatTokens, formatUsage } from "./codex/usageAggregator";
import { SessionReport } from "./codex/types";

function display(report: SessionReport): string {
  const lines = [
    `Session: ${report.sessionId}`,
    `Models: ${report.models.join(", ") || "N/A"}`,
    `Inference calls: ${report.inferenceCalls}`,
    ...formatUsage("Session usage", report.total.usage),
    `Source: ${report.total.source} (${report.total.confidence})`
  ];
  if (report.latestTurn) {
    lines.push(`Latest turn: ${report.latestTurn.id} (${report.latestTurn.inferenceCalls} calls)`);
    lines.push(...formatUsage("Latest turn usage", report.latestTurn.usage.usage));
  }
  if (report.modelContextWindow) lines.push(`Context window capacity: ${formatTokens(report.modelContextWindow)} (current occupancy unavailable from rollout telemetry)`);
  if (report.parserWarnings) lines.push(`Parser warnings: ${report.parserWarnings}`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const suppliedPath = process.argv[2];
  const target = resolve(suppliedPath || codexSessionsPath(resolveCodexHome()));
  const targetInfo = await stat(target);
  if (targetInfo.isFile()) {
    console.log(display(await analyzeRollout(target)));
    return;
  }
  const reports = await analyzeSessions(target);
  console.log(`Analyzed ${reports.length} rollout sessions from ${target}`);
  for (const report of reports.slice(-10).reverse()) {
    console.log(`\n${basename(target)} — ${display(report)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
