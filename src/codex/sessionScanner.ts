import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseRolloutFile } from "./rolloutParser";
import { SessionHistoryEntry, SessionReport } from "./types";
import { UsageAggregator } from "./usageAggregator";

async function rolloutFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return rolloutFiles(path);
    return entry.isFile() && entry.name.endsWith(".jsonl") && entry.name.startsWith("rollout-") ? [path] : [];
  }));
  return nested.flat();
}

export async function findLatestRollout(sessionsDirectory: string): Promise<string | undefined> {
  return (await mostRecentRollouts(sessionsDirectory, 1))[0]?.path;
}

export async function analyzeRollout(filePath: string): Promise<SessionReport> {
  const aggregator = new UsageAggregator();
  const parsed = await parseRolloutFile(filePath, (event) => aggregator.apply(event));
  for (let index = 0; index < parsed.malformedLines; index++) aggregator.addWarning();
  return aggregator.toReport();
}

export async function analyzeSessions(sessionsDirectory: string): Promise<SessionReport[]> {
  const files = await rolloutFiles(sessionsDirectory);
  const reports: SessionReport[] = [];
  for (const file of files) reports.push(await analyzeRollout(file));
  return reports;
}

export async function analyzeRecentSessions(sessionsDirectory: string, limit = 20): Promise<SessionHistoryEntry[]> {
  const candidates = await mostRecentRollouts(sessionsDirectory, limit);
  const history: SessionHistoryEntry[] = [];
  for (const candidate of candidates) {
    const report = await analyzeRollout(candidate.path);
    history.push({
      rolloutPath: candidate.path,
      sessionId: report.sessionId,
      cwd: report.cwd,
      model: report.models.at(-1),
      totalTokens: report.total.usage.totalTokens,
      inferenceCalls: report.inferenceCalls,
      lastActivityAt: candidate.mtimeMs,
      source: report.total.source,
      confidence: report.total.confidence
    });
  }
  return history;
}

async function mostRecentRollouts(sessionsDirectory: string, limit: number): Promise<Array<{ path: string; mtimeMs: number }>> {
  const files = await rolloutFiles(sessionsDirectory);
  const candidates = await Promise.all(files.map(async (path) => ({ path, mtimeMs: (await stat(path)).mtimeMs })));
  return candidates.sort((left, right) => right.mtimeMs - left.mtimeMs).slice(0, limit);
}
