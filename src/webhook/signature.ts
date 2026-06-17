import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export type VerifyWebhookOptions = {
  toleranceSeconds?: number;
  nowMs?: number;
};

export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
  options: VerifyWebhookOptions = {},
): boolean {
  if (!isWebhookTimestampWithinTolerance(timestamp, options.toleranceSeconds, options.nowMs)) {
    return false;
  }

  const expected = signWebhookPayload(secret, timestamp, rawBody);
  return safeCompare(expected, signature);
}

export function isWebhookTimestampWithinTolerance(
  timestamp: string,
  toleranceSeconds = DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  nowMs = Date.now(),
): boolean {
  const timestampMs = parseWebhookTimestampMs(timestamp);
  if (timestampMs === undefined || !Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) {
    return false;
  }

  return Math.abs(nowMs - timestampMs) <= toleranceSeconds * 1000;
}

function parseWebhookTimestampMs(timestamp: string): number | undefined {
  const trimmed = timestamp.trim();
  if (trimmed === "") return undefined;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;

  const absolute = Math.abs(parsed);
  return absolute < 1_000_000_000_000 ? parsed * 1000 : parsed;
}

function safeCompare(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}
