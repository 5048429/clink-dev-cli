export declare const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;
export type VerifyWebhookOptions = {
    toleranceSeconds?: number;
    nowMs?: number;
};
export declare function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string;
export declare function verifyWebhookPayload(secret: string, timestamp: string, rawBody: string, signature: string, options?: VerifyWebhookOptions): boolean;
export declare function isWebhookTimestampWithinTolerance(timestamp: string, toleranceSeconds?: number, nowMs?: number): boolean;
