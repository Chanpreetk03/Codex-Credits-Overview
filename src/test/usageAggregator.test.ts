import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { analyzeRollout } from "../codex/sessionScanner";
import { normalizeEvent } from "../codex/eventNormalizer";

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
