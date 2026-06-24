export declare const WEBHOOK_FIXTURE_TYPES: readonly ["session.complete", "session.expired", "order.created", "order.succeeded", "order.failed", "subscription.created", "subscription.activated", "subscription.past_due", "invoice.open", "invoice.paid", "invoice.void"];
export declare function createWebhookFixture(type: string, overrides?: Record<string, unknown>): Record<string, unknown>;
