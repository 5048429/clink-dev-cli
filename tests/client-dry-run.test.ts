import { describe, expect, it } from "vitest";
import { ClinkApiClient } from "../src/api/client.js";
import type { RuntimeConfig } from "../src/types.js";

function testConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    profile: "default",
    environment: "sandbox",
    baseUrl: "https://uat-api.clinkbill.com/api/",
    dryRun: true,
    outputMode: "json",
    ...overrides,
  };
}

describe("dry-run request generation", () => {
  it("returns request metadata without requiring or exposing an API key", async () => {
    const client = new ClinkApiClient(testConfig());
    const body = {
      name: "Test",
      image: "oss_test",
      taxCategory: "software_service",
    };

    const result = await client.post("/product", { body });

    expect(result).toEqual({
      dryRun: true,
      request: {
        method: "POST",
        url: "https://uat-api.clinkbill.com/api/product",
        headers: {
          "X-API-KEY": "[masked]",
          "X-Timestamp": "[generated]",
          "Content-Type": "application/json",
        },
        body,
      },
    });
  });
});
