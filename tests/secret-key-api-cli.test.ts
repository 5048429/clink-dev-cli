import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ExitCode } from "../src/exit-codes.js";

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

  it("keeps Dashboard-only webhook management explicit when no Console token is available", () => {
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

    expect(result.status).toBe(ExitCode.AUTH_REQUIRED);
    const error = JSON.parse(result.stderr) as { error: string; exitCode: number };
    expect(error.exitCode).toBe(ExitCode.AUTH_REQUIRED);
    expect(error.error).toContain("official Secret Key API coverage does not include Dashboard webhook management");
  });
});
