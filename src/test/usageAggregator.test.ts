import assert from "node:assert/strict";
import { test } from "node:test";
import { copyFile, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeRecentSessions, analyzeRollout } from "../codex/sessionScanner";
import { normalizeEvent } from "../codex/eventNormalizer";
import { buildTurnTimeline } from "../codex/turnTimeline";
import { ThreadCatalog } from "../codex/threadCatalog";
import { parseAppendedRollout } from "../codex/rolloutParser";
import { decodeRateLimits, decodeThreadUsageUpdate } from "../codex/appServerProtocol";
import { resolveAppServerCommand } from "../codex/appServerCommand";

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

test("incremental rollout parsing retains partial records and signals a replacement file", async () => {
  const root = join(tmpdir(), `codex-usage-rollout-${Date.now()}`);
  const rollout = join(root, "rollout.jsonl");
  await mkdir(root, { recursive: true });
  try {
    const first = JSON.stringify({ type: "session_meta", payload: { session_id: "first", source: "vscode" } });
    await writeFile(rollout, first.slice(0, 20));
    const events = [];
    let result = await parseAppendedRollout(rollout, { offset: 0, remainder: "" }, (event) => events.push(event));
    assert.equal(events.length, 0);
    await writeFile(rollout, `${first.slice(20)}\n`, { flag: "a" });
    result = await parseAppendedRollout(rollout, result.state, (event) => events.push(event));
    assert.equal(events.length, 1);
    assert.equal(result.rotated, false);

    const replacement = `${JSON.stringify({ type: "session_meta", payload: { session_id: "new", source: "vscode" } })}\n`;
    await writeFile(rollout, replacement);
    const rotated = await parseAppendedRollout(rollout, result.state, () => undefined);
    assert.equal(rotated.rotated, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("decodes documented app-server thread usage without mixing it into rollout totals", () => {
  const update = decodeThreadUsageUpdate({ method: "thread/tokenUsage/updated", params: {
    threadId: "thread-1", turnId: "turn-1", tokenUsage: {
      last: { inputTokens: 30, cachedInputTokens: 20, cacheWriteInputTokens: 0, outputTokens: 10, reasoningOutputTokens: 4, totalTokens: 40 },
      total: { inputTokens: 100, cachedInputTokens: 60, cacheWriteInputTokens: 0, outputTokens: 30, reasoningOutputTokens: 12, totalTokens: 130 },
      modelContextWindow: 258400
    }
  }});
  assert.equal(update?.threadId, "thread-1");
  assert.equal(update?.total.usage.totalTokens, 130n);
  assert.equal(update?.last.source, "app_server");
  assert.equal(update?.modelContextWindow, 258400n);
});

test("decodes the authoritative Codex rate-limit bucket and rejects invalid percentages", () => {
  const limits = decodeRateLimits({ rateLimitsByLimitId: {
    other: { primary: { usedPercent: 9 } },
    codex: { planType: "plus", limitName: "Codex", primary: { usedPercent: 31, resetsAt: 1730948100, windowDurationMins: 15 }, secondary: { usedPercent: 45 } }
  }}, 1);
  assert.deepEqual(limits, { planType: "plus", limitName: "Codex", primary: { usedPercent: 31, resetsAt: 1730948100, windowDurationMins: 15 }, secondary: { usedPercent: 45 }, capturedAt: 1 });
  assert.equal(decodeRateLimits({ rateLimits: { primary: { usedPercent: 101 } } }), undefined);
});

test("uses an explicit app-server command without relying on the shell PATH", () => {
  assert.equal(resolveAppServerCommand("C:\\Codex\\codex.exe", "missing-directory"), "C:\\Codex\\codex.exe");
});

test("auto-detects the Codex executable bundled with the official Windows extension", async () => {
  const root = join(tmpdir(), `codex-usage-command-${Date.now()}`);
  const executable = join(root, "openai.chatgpt-1-win32-x64", "bin", "windows-x86_64", "codex.exe");
  await mkdir(join(root, "openai.chatgpt-1-win32-x64", "bin", "windows-x86_64"), { recursive: true });
  try {
    await writeFile(executable, "");
    assert.equal(resolveAppServerCommand("", root, "win32"), executable);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
