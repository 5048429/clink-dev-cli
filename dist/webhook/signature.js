import { createHmac, timingSafeEqual } from "node:crypto";
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;
export function signWebhookPayload(secret, timestamp, rawBody) {
    return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}
export function verifyWebhookPayload(secret, timestamp, rawBody, signature, options = {}) {
    if (!isWebhookTimestampWithinTolerance(timestamp, options.toleranceSeconds, options.nowMs)) {
        return false;
    }
    const expected = signWebhookPayload(secret, timestamp, rawBody);
    return safeCompare(expected, signature);
}
export function isWebhookTimestampWithinTolerance(timestamp, toleranceSeconds = DEFAULT_WEBHOOK_TOLERANCE_SECONDS, nowMs = Date.now()) {
    const timestampMs = parseWebhookTimestampMs(timestamp);
    if (timestampMs === undefined || !Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) {
        return false;
    }
    return Math.abs(nowMs - timestampMs) <= toleranceSeconds * 1000;
}
function parseWebhookTimestampMs(timestamp) {
    const trimmed = timestamp.trim();
    if (trimmed === "")
        return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed))
        return undefined;
    const absolute = Math.abs(parsed);
    return absolute < 1_000_000_000_000 ? parsed * 1000 : parsed;
}
function safeCompare(a, b) {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length)
        return false;
    return timingSafeEqual(aBuffer, bBuffer);
}
//# sourceMappingURL=signature.js.map