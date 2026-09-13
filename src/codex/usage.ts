import { TokenUsage, UsageConfidence, ZERO_USAGE } from "./types";

export function asTokenUsage(value: unknown): TokenUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const inputTokens = asBigInt(data.input_tokens ?? data.inputTokens);
  const cachedInputTokens = asBigInt(data.cached_input_tokens ?? data.cachedInputTokens);
  const cacheWriteInputTokens = asBigInt(data.cache_write_input_tokens ?? data.cacheWriteInputTokens);
  const outputTokens = asBigInt(data.output_tokens ?? data.outputTokens);
  const reasoningOutputTokens = asBigInt(data.reasoning_output_tokens ?? data.reasoningOutputTokens);
  const suppliedTotal = asBigInt(data.total_tokens ?? data.totalTokens);

  if ([inputTokens, cachedInputTokens, cacheWriteInputTokens, outputTokens, reasoningOutputTokens, suppliedTotal]
    .every((token) => token === undefined)) return undefined;

  const input = inputTokens ?? 0n;
  const output = outputTokens ?? 0n;
  return {
    inputTokens: input,
    cachedInputTokens: cachedInputTokens ?? 0n,
    cacheWriteInputTokens: cacheWriteInputTokens ?? 0n,
    outputTokens: output,
    reasoningOutputTokens: reasoningOutputTokens ?? 0n,
    totalTokens: suppliedTotal ?? input + output
  };
}

export function asBigInt(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value >= 0n ? value : undefined;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
}

export function validateUsage(usage: TokenUsage): UsageConfidence {
  if (usage.cachedInputTokens > usage.inputTokens || usage.reasoningOutputTokens > usage.outputTokens) {
    return "ambiguous";
  }
  if (usage.totalTokens < usage.inputTokens || usage.totalTokens < usage.outputTokens) return "ambiguous";
  return "exact";
}

export function cloneUsage(usage: TokenUsage = ZERO_USAGE): TokenUsage {
  return { ...usage };
}
