import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConfigPath, resolveRuntimeConfig, saveProfile } from "../src/config.js";
import { maskSecret } from "../src/output.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `clink-config-test-${process.pid}-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });
  vi.stubEnv("CLINK_CONFIG_PATH", join(tempDir, "config.json"));
  vi.stubEnv("PROFILE_API_KEY", "test_api_key_profile_abcdef");
  vi.stubEnv("PROFILE_WEBHOOK_KEY", "test_webhook_key_profile_abcdef");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(tempDir, { recursive: true, force: true });
});

describe("config resolution", () => {
  it("resolves profile env refs, normalizes base urls, and keeps runtime flags", async () => {
    await saveProfile("default", {
      environment: "production",
      baseUrl: "https://api.example.test/api",
      apiKeyEnv: "PROFILE_API_KEY",
      webhookSigningKeyEnv: "PROFILE_WEBHOOK_KEY",
    });

    const config = await resolveRuntimeConfig({
      json: true,
      dryRun: true,
      profile: "default",
    });

    expect(getConfigPath()).toBe(join(tempDir, "config.json"));
    expect(config).toMatchObject({
      profile: "default",
      environment: "production",
      baseUrl: "https://api.example.test/api/",
      apiKey: "test_api_key_profile_abcdef",
      apiKeySource: "env:PROFILE_API_KEY",
      webhookSigningKey: "test_webhook_key_profile_abcdef",
      webhookSigningKeySource: "env:PROFILE_WEBHOOK_KEY",
      dryRun: true,
      outputMode: "json",
    });
  });

  it("lets command options override stored profile secrets and base urls", async () => {
    await saveProfile("default", {
      environment: "sandbox",
      baseUrl: "https://profile.example.test/api/",
      apiKeyEnv: "PROFILE_API_KEY",
    });

    const config = await resolveRuntimeConfig({
      apiKey: "test_literal_override",
      baseUrl: "https://override.example.test/api",
      env: "production",
    });

    expect(config).toMatchObject({
      environment: "production",
      baseUrl: "https://override.example.test/api/",
      apiKey: "test_literal_override",
      apiKeySource: "literal",
      outputMode: "pretty",
    });
  });
});

describe("secret masking", () => {
  it("never exposes complete secrets", () => {
    expect(maskSecret("secret_value_1234567890")).toBe("secr...7890");
    expect(maskSecret("short")).toBe("****");
    expect(maskSecret(undefined)).toBeUndefined();
  });
});
