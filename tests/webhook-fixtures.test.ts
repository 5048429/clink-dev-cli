import { describe, expect, it } from "vitest";
import { createWebhookFixture } from "../src/webhook/fixtures.js";

describe("webhook fixtures", () => {
  it("matches the documented session.complete payload shape", () => {
    const event = createWebhookFixture("session.complete");
    const data = event.data as Record<string, unknown>;

    expect(event).toMatchObject({
      object: "event",
      type: "session.complete",
    });
    expect(data).toMatchObject({
      sessionId: "sess_test_123",
      orderId: "ord_test_123",
      merchantReferenceId: "order_test_123",
      status: "completed",
      paymentStatus: "paid",
    });
    expect(data).toHaveProperty("created");
    expect(data).toHaveProperty("expire");
  });

  it("matches the documented order.succeeded payload shape", () => {
    const event = createWebhookFixture("order.succeeded");
    const data = event.data as Record<string, unknown>;

    expect(event).toMatchObject({
      object: "event",
      type: "order.succeeded",
    });
    expect(data).toMatchObject({
      orderId: "ord_test_123",
      sessionId: "sess_test_123",
      merchantReferenceId: "order_test_123",
      status: "success",
    });
    expect(typeof data.paymentTime).toBe("number");
  });
});
