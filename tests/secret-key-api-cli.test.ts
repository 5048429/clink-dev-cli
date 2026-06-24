import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runClink(args: string[]): CliResult {
  const tempConfig = join(tmpdir(), `clink-secret-key-api-test-${process.pid}-${Date.now()}`, "config.json");
  mkdirSync(dirname(tempConfig), { recursive: true });

  const env = {
    ...process.env,
    CLINK_CONFIG_PATH: tempConfig,
    CLINK_SECRET_KEY: "sk_test_1234567890",
    CLINK_API_KEY: "",
  };

  const result = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", ...args], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
  });

  rmSync(dirname(tempConfig), { recursive: true, force: true });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("Secret Key API commands", () => {
  it("dry-runs arbitrary official API requests with X-API-KEY authentication", () => {
    const result = runClink([
      "--json",
      "--dry-run",
      "api",
      "request",
      "POST",
      "/refund",
      "--data",
      '{"orderId":"order_123","refundMerchantOrderId":"rfd_m_123","refundAmount":10}',
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout) as {
      result: { request: { method: string; url: string; headers: Record<string, string>; body: Record<string, unknown> } };
    };
    expect(output.result.request).toMatchObject({
      method: "POST",
      url: "https://uat-api.clinkbill.com/api/refund",
      headers: {
        "X-API-KEY": "[masked]",
        "X-Timestamp": "[generated]",
        "Content-Type": "application/json",
      },
      body: {
        orderId: "order_123",
        refundMerchantOrderId: "rfd_m_123",
        refundAmount: 10,
      },
    });
  });

  it("dry-runs refund create through the dedicated command", () => {
    const result = runClink([
      "--json",
      "--dry-run",
      "refund",
      "create",
      "--order-id",
      "order_123",
      "--refund-merchant-order-id",
      "rfd_m_123",
      "--amount",
      "10",
    ]);

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as { result: { request: { body: Record<string, unknown> } } };
    expect(output.result.request.body).toMatchObject({
      orderId: "order_123",
      refundMerchantOrderId: "rfd_m_123",
      refundAmount: 10,
      refundReasonType: 2,
    });
  });

  it("dry-runs webhook endpoint ensure through the Secret Key API without a Console token", () => {
    const result = runClink([
      "--json",
      "--dry-run",
      "dashboard",
      "webhook",
      "ensure",
      "--url",
      "https://example.com/api/clink/webhook",
      "--events",
      "core",
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout) as {
      result: { request: { method: string; url: string; headers: Record<string, string>; body: Record<string, unknown> } };
    };
    expect(output.result.request).toMatchObject({
      method: "PUT",
      url: "https://uat-api.clinkbill.com/api/webhook/endpoints/ensure",
      headers: {
        "X-API-KEY": "[masked]",
        "X-Timestamp": "[generated]",
        "Content-Type": "application/json",
      },
      body: {
        url: "https://example.com/api/clink/webhook",
        events: [
          "session.complete",
          "order.succeeded",
          "order.failed",
          "refund.succeeded",
          "subscription.created",
          "invoice.paid",
        ],
        enabled: true,
      },
    });
  });

  it("dry-runs webhook endpoint ensure with env-file signing secret sync", () => {
    const result = runClink([
      "--json",
      "--dry-run",
      "webhook",
      "endpoint",
      "ensure",
      "--url",
      "https://example.com/api/clink/webhook",
      "--events",
      "core",
      "--sync-env-file",
      ".env.local",
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout) as {
      envSync: { dryRun: boolean; envFile: string; key: string };
      result: { request: { body: Record<string, unknown> } };
    };
    expect(output.envSync).toMatchObject({
      dryRun: true,
      envFile: ".env.local",
      key: "CLINK_WEBHOOK_SIGNING_KEY",
    });
    expect(output.result.request.body).toMatchObject({
      returnSigningSecret: true,
      rotateSecretIfUnavailable: true,
    });
  });

  it("prints the full fallback webhook event catalog during dry-run", () => {
    const result = runClink([
      "--json",
      "--dry-run",
      "webhook",
      "endpoint",
      "events",
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout) as {
      fallbackSupportedEvents: Array<{ name: string; code: number; description: string }>;
      fallbackAliases: { all: string[]; core: string[] };
    };
    expect(output.fallbackSupportedEvents).toHaveLength(38);
    expect(output.fallbackSupportedEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "order.created", code: 1 }),
      expect.objectContaining({ name: "session.complete", code: 22 }),
      expect.objectContaining({ name: "agent_refund.rejected", code: 38 }),
    ]));
    expect(output.fallbackAliases.all).toHaveLength(38);
    expect(output.fallbackAliases.core).toEqual([
      "session.complete",
      "order.succeeded",
      "order.failed",
      "refund.succeeded",
      "subscription.created",
      "invoice.paid",
    ]);
  });

  it("expands webhook endpoint --events all to the full Secret Key API event catalog", () => {
    const result = runClink([
      "--json",
      "--dry-run",
      "webhook",
      "endpoint",
      "ensure",
      "--url",
      "https://example.com/api/clink/webhook",
      "--events",
      "all",
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout) as {
      result: { request: { body: { events: string[] } } };
    };
    expect(output.result.request.body.events).toHaveLength(38);
    expect(output.result.request.body.events).toEqual(expect.arrayContaining([
      "order.created",
      "session.expired",
      "dispute.won",
      "customer.verify",
      "payment_method.default_change",
      "agent_refund.rejected",
    ]));
  });

  it("accepts newly supported webhook event names without --allow-unknown-events", () => {
    const result = runClink([
      "--json",
      "--dry-run",
      "webhook",
      "endpoint",
      "create",
      "--url",
      "https://example.com/api/clink/webhook",
      "--events",
      "dispute.won,customer.verify,agent_refund.approved",
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout) as {
      result: { request: { body: { events: string[] } } };
    };
    expect(output.result.request.body.events).toEqual([
      "dispute.won",
      "customer.verify",
      "agent_refund.approved",
    ]);
  });

  it("dry-runs webhook endpoint update with only secret rotation", () => {
    const result = runClink([
      "--json",
      "--dry-run",
      "webhook",
      "endpoint",
      "update",
      "whk_123",
      "--rotate-secret",
      "--save-secret",
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout) as {
      rotateResult: { request: { method: string; url: string; headers: Record<string, string> } };
    };
    expect(output.rotateResult.request).toMatchObject({
      method: "POST",
      url: "https://uat-api.clinkbill.com/api/webhook/endpoints/whk_123/rotate-secret",
      headers: {
        "X-API-KEY": "[masked]",
        "X-Timestamp": "[generated]",
      },
    });
  });
});
