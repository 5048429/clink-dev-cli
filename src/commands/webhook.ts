import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { resolveSecretRef } from "../config.js";
import { printResult, requireOption } from "../output.js";
import { createWebhookFixture } from "../webhook/fixtures.js";
import { signWebhookPayload, verifyWebhookPayload } from "../webhook/signature.js";
import { getCommandContext } from "./helpers.js";

export function registerWebhook(program: Command): void {
  const webhook = program.command("webhook").description("Simulate, sign, and verify Clink webhooks locally");

  webhook
    .command("simulate")
    .description("Generate a signed local event and optionally POST it to a local endpoint")
    .argument("<type>", "Event type, for example order.succeeded")
    .option("--secret <value>", "Webhook signing key literal or env:CLINK_WEBHOOK_SIGNING_KEY")
    .option("--forward-to <url>", "Local endpoint to POST the signed event to")
    .option("--body-file <path>", "Use a custom JSON event body instead of a generated fixture")
    .action(async (type: string, options: { secret?: string; forwardTo?: string; bodyFile?: string }, command: Command) => {
      const { config } = await getCommandContext(command);
      const secret = resolveSecretRef(options.secret, []).secret ?? config.webhookSigningKey;
      requireOption("--secret or CLINK_WEBHOOK_SIGNING_KEY", secret);

      const event = options.bodyFile ? JSON.parse(await readFile(options.bodyFile, "utf8")) : createWebhookFixture(type);
      const rawBody = JSON.stringify(event);
      const timestamp = String(Date.now());
      const signature = signWebhookPayload(secret, timestamp, rawBody);

      let forwardResult: unknown;
      if (options.forwardTo) {
        const response = await fetch(options.forwardTo, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Clink-Timestamp": timestamp,
            "X-Clink-Signature": signature,
          },
          body: rawBody,
        });
        forwardResult = {
          status: response.status,
          ok: response.ok,
          body: await response.text(),
        };
      }

      printResult(
        {
          event,
          timestamp,
          signature,
          headers: {
            "X-Clink-Timestamp": timestamp,
            "X-Clink-Signature": signature,
          },
          rawBody,
          forwardResult,
        },
        config.outputMode,
        options.forwardTo
          ? `Sent signed ${type} fixture to ${options.forwardTo}`
          : `Generated signed ${type} fixture. Use --json to inspect headers and body.`,
      );
    });

  webhook
    .command("sign")
    .description("Sign a raw webhook JSON body")
    .requiredOption("--body-file <path>", "JSON body file")
    .option("--secret <value>", "Webhook signing key literal or env:CLINK_WEBHOOK_SIGNING_KEY")
    .option("--timestamp <value>", "Timestamp to sign with", String(Date.now()))
    .action(async (options: { bodyFile: string; secret?: string; timestamp: string }, command: Command) => {
      const { config } = await getCommandContext(command);
      const secret = resolveSecretRef(options.secret, []).secret ?? config.webhookSigningKey;
      requireOption("--secret or CLINK_WEBHOOK_SIGNING_KEY", secret);
      const rawBody = await readFile(options.bodyFile, "utf8");
      const signature = signWebhookPayload(secret, options.timestamp, rawBody);
      printResult(
        {
          timestamp: options.timestamp,
          signature,
          headers: {
            "X-Clink-Timestamp": options.timestamp,
            "X-Clink-Signature": signature,
          },
        },
        config.outputMode,
        signature,
      );
    });

  webhook
    .command("verify")
    .description("Verify a webhook signature against a raw body")
    .requiredOption("--body-file <path>", "JSON body file")
    .requiredOption("--timestamp <value>", "X-Clink-Timestamp header")
    .requiredOption("--signature <value>", "X-Clink-Signature header")
    .option("--secret <value>", "Webhook signing key literal or env:CLINK_WEBHOOK_SIGNING_KEY")
    .action(async (
      options: { bodyFile: string; timestamp: string; signature: string; secret?: string },
      command: Command,
    ) => {
      const { config } = await getCommandContext(command);
      const secret = resolveSecretRef(options.secret, []).secret ?? config.webhookSigningKey;
      requireOption("--secret or CLINK_WEBHOOK_SIGNING_KEY", secret);
      const rawBody = await readFile(options.bodyFile, "utf8");
      const valid = verifyWebhookPayload(secret, options.timestamp, rawBody, options.signature);
      printResult({ valid }, config.outputMode, valid ? "valid" : "invalid");
      if (!valid) process.exitCode = 1;
    });
}

