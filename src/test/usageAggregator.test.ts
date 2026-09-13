import assert from "node:assert/strict";
import { test } from "node:test";
import { copyFile, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeRecentSessions, analyzeRollout } from "../codex/sessionScanner";
import { normalizeEvent } from "../codex/eventNormalizer";
import { buildTurnTimeline } from "../codex/turnTimeline";
import { ThreadCatalog } from "../codex/threadCatalog";

test("uses Codex-reported turn and thread totals without double counting subsets", async () => {
  const report = await analyzeRollout(join(process.cwd(), "src", "test", "fixtures", "simple-rollout.jsonl"));
  assert.equal(report.sessionId, "session-1");
  assert.equal(report.inferenceCalls, 1);
  assert.equal(report.total.usage.totalTokens, 120n);
  assert.equal(report.total.usage.cachedInputTokens, 60n);
  assert.equal(report.latestTurn?.usage.usage.totalTokens, 120n);
  assert.equal(report.modelContextWindow, 258400n);
  assert.deepEqual(report.models, ["gpt-5.6-sol"]);
});

test("deduplicates repeated inference records by response id", async () => {
  const raw = {
    type: "token_usage_record",
    payload: {
      session_id: "s", turn_id: "t", response_id: "r",
      usage: { input_tokens: 8, output_tokens: 3, total_tokens: 11 },
      turn_token_usage: { input_tokens: 8, output_tokens: 3, total_tokens: 11 },
      thread_token_usage: { input_tokens: 8, output_tokens: 3, total_tokens: 11 }
    }
  };
  const { UsageAggregator } = await import("../codex/usageAggregator");
  const aggregator = new UsageAggregator();
  aggregator.apply(normalizeEvent(raw));
  aggregator.apply(normalizeEvent(raw));
  assert.equal(aggregator.toReport().inferenceCalls, 1);
});

test("marks invalid subset values ambiguous", () => {
  const event = normalizeEvent({ type: "token_usage_record", payload: {
    usage: { input_tokens: 10, cached_input_tokens: 11, output_tokens: 1, total_tokens: 11 }
  }});
  assert.equal(event.kind, "inference-usage");
  if (event.kind === "inference-usage") assert.equal(event.usage.confidence, "ambiguous");
});

test("history scan is bounded to the most recently modified rollout files", async () => {
  const root = join(tmpdir(), `codex-usage-monitor-${Date.now()}`);
  const directory = join(root, "2026", "09", "13");
  const fixture = join(process.cwd(), "src", "test", "fixtures", "simple-rollout.jsonl");
  const older = join(directory, "rollout-older.jsonl");
  const newer = join(directory, "rollout-newer.jsonl");
  await mkdir(directory, { recursive: true });
  try {
    await copyFile(fixture, older);
    await copyFile(fixture, newer);
    await utimes(older, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
    await utimes(newer, new Date("2026-01-02T00:00:00Z"), new Date("2026-01-02T00:00:00Z"));
    const history = await analyzeRecentSessions(root, 1);
    assert.equal(history.length, 1);
    assert.equal(history[0].rolloutPath, newer);
    assert.equal(history[0].sessionId, "session-1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("turn timeline nests tool activity under a user prompt and keeps background work separate", async () => {
  const fixture = join(process.cwd(), "src", "test", "fixtures", "nested-turns-rollout.jsonl");
  const timeline = await buildTurnTimeline(fixture);
  assert.equal(timeline.sessionId, "session-nested");
  assert.equal(timeline.turns.length, 2);
  assert.deepEqual(timeline.turns.map((turn) => [turn.id, turn.kind, turn.status]), [
    ["turn-one", "prompt", "completed"],
    ["turn-background", "background", "completed"]
  ]);
  assert.equal(timeline.turns[0].inferenceCalls.length, 1);
  assert.equal(timeline.turns[0].toolCalls[0].name, "shell");
  assert.equal(timeline.turns[0].toolCalls[0].completed, true);
  assert.equal(timeline.turns[0].agentMessages, 1);
  assert.equal(timeline.turns[0].promptPreview, undefined);
});

test("prompt preview is only included when explicitly requested", async () => {
  const fixture = join(process.cwd(), "src", "test", "fixtures", "nested-turns-rollout.jsonl");
  const timeline = await buildTurnTimeline(fixture, { includePromptPreview: true, promptPreviewLength: 8 });
  assert.equal(timeline.turns[0].promptPreview, "First p…");
});

test("thread catalog hides internal sub-agent threads unless explicitly requested", async () => {
  const root = join(tmpdir(), `codex-usage-catalog-${Date.now()}`);
  const directory = join(root, "2026", "09", "13");
  const index = join(root, "session_index.jsonl");
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(join(directory, "rollout-user.jsonl"), `${JSON.stringify({ type: "session_meta", payload: { session_id: "user-thread", source: "vscode", cwd: "C:\\work" } })}\n${JSON.stringify({ type: "turn_context", payload: { model: "gpt-test" } })}\n`);
    await writeFile(join(directory, "rollout-agent.jsonl"), `${JSON.stringify({ type: "session_meta", payload: { session_id: "agent-thread", source: { subagent: {} }, cwd: "C:\\work" } })}\n${JSON.stringify({ type: "turn_context", payload: { model: "gpt-test" } })}\n`);
    await writeFile(index, `${JSON.stringify({ id: "user-thread", thread_name: "Prompt-derived title" })}\n`);
    const catalog = new ThreadCatalog(root, index);
    const roots = await catalog.list();
    assert.equal(roots.length, 1);
    assert.equal(roots[0].id, "user-thread");
    assert.equal(roots[0].displayName, undefined);
    const all = await catalog.list({ includeInternal: true, includeNames: true });
    assert.equal(all.length, 2);
    assert.equal(all.find((thread) => thread.id === "user-thread")?.displayName, "Prompt-derived title");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
