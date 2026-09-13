import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseRolloutFile } from "./rolloutParser";
import { SessionReport } from "./types";
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
  const files = await rolloutFiles(sessionsDirectory);
  let latest: { path: string; mtimeMs: number } | undefined;
  for (const path of files) {
    const details = await stat(path);
    if (!latest || details.mtimeMs > latest.mtimeMs) latest = { path, mtimeMs: details.mtimeMs };
  }
  return latest?.path;
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
