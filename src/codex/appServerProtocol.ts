import { asBigInt, asTokenUsage, validateUsage } from "./usage";
import { UsageValue } from "./types";

type RecordValue = Record<string, unknown>;

export interface AppServerThreadUsageUpdate {
  threadId: string;
  turnId: string;
  total: UsageValue;
  last: UsageValue;
  modelContextWindow?: bigint;
}

export interface RateLimitWindow {
  usedPercent: number;
  resetsAt?: number;
  windowDurationMins?: number;
}

export interface AppServerRateLimits {
  planType?: string;
  limitName?: string;
  primary?: RateLimitWindow;
  secondary?: RateLimitWindow;
  capturedAt: number;
}

/** Decodes only documented app-server data; unknown fields and methods are ignored. */
export function decodeThreadUsageUpdate(message: unknown): AppServerThreadUsageUpdate | undefined {
  const envelope = record(message);
  if (!envelope || envelope.method !== "thread/tokenUsage/updated") return undefined;
  const params = record(envelope.params);
  const usage = record(params?.tokenUsage);
  const total = usageValue(usage?.total);
  const last = usageValue(usage?.last);
  const threadId = text(params?.threadId);
  const turnId = text(params?.turnId);
  if (!threadId || !turnId || !total || !last) return undefined;
  return { threadId, turnId, total, last, modelContextWindow: asBigInt(usage?.modelContextWindow) };
}

/** Decodes account/rateLimits/read results and prefers the named Codex quota bucket. */
export function decodeRateLimits(result: unknown, capturedAt = Date.now()): AppServerRateLimits | undefined {
  const body = record(result);
  if (!body) return undefined;
  const buckets = record(body.rateLimitsByLimitId);
  const snapshot = record(buckets?.codex) ?? record(body.rateLimits) ?? firstRecord(buckets);
  if (!snapshot) return undefined;
  const primary = rateWindow(snapshot.primary);
  const secondary = rateWindow(snapshot.secondary);
  if (!primary && !secondary) return undefined;
  return {
    planType: text(snapshot.planType),
    limitName: text(snapshot.limitName),
    primary,
    secondary,
    capturedAt
  };
}

function usageValue(value: unknown): UsageValue | undefined {
  const usage = asTokenUsage(value);
  return usage ? { usage, source: "app_server", confidence: validateUsage(usage) } : undefined;
}

function rateWindow(value: unknown): RateLimitWindow | undefined {
  const data = record(value);
  if (!data) return undefined;
  const usedPercent = data.usedPercent;
  if (typeof usedPercent !== "number" || !Number.isInteger(usedPercent) || usedPercent < 0 || usedPercent > 100) return undefined;
  const resetsAt = timestamp(data.resetsAt);
  const windowDurationMins = positiveInteger(data.windowDurationMins);
  return {
    usedPercent,
    ...(resetsAt === undefined ? {} : { resetsAt }),
    ...(windowDurationMins === undefined ? {} : { windowDurationMins })
  };
}

function record(value: unknown): RecordValue | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
}

function firstRecord(value: RecordValue | undefined): RecordValue | undefined {
  return value ? Object.values(value).map(record).find((item): item is RecordValue => Boolean(item)) : undefined;
}

function text(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function timestamp(value: unknown): number | undefined { return positiveInteger(value); }
function positiveInteger(value: unknown): number | undefined { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined; }
