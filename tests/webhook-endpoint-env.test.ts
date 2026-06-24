import { describe, expect, it } from "vitest";
import { upsertEnvValue } from "../src/commands/webhook-endpoints.js";

describe("webhook endpoint env sync", () => {
  it("updates an existing CLINK_WEBHOOK_SIGNING_KEY line", () => {
    const raw = [
      "CLINK_SECRET_KEY=env-secret",
      "CLINK_WEBHOOK_SIGNING_KEY=old-secret",
      "",
    ].join("\n");

    expect(upsertEnvValue(raw, "CLINK_WEBHOOK_SIGNING_KEY", "whsec_new")).toBe([
      "CLINK_SECRET_KEY=env-secret",
      "CLINK_WEBHOOK_SIGNING_KEY=whsec_new",
      "",
    ].join("\n"));
  });

  it("appends CLINK_WEBHOOK_SIGNING_KEY when missing", () => {
    expect(upsertEnvValue("CLINK_SECRET_KEY=env-secret\n", "CLINK_WEBHOOK_SIGNING_KEY", "whsec_new")).toBe(
      "CLINK_SECRET_KEY=env-secret\nCLINK_WEBHOOK_SIGNING_KEY=whsec_new\n",
    );
  });
});
