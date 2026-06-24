import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Command } from "commander";
import { resolveSecretRef } from "../config.js";
import { formatFetchError } from "../dashboard-console.js";
import { parseIntegerOption, printResult, requireOption } from "../output.js";
import { createWebhookFixture } from "../webhook/fixtures.js";
import {
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  signWebhookPayload,
  verifyWebhookPayload,
} from "../webhook/signature.js";
import { getCommandContext } from "./helpers.js";
import { registerWebhookEndpointSubcommands } from "./webhook-endpoints.js";

export function registerWebhook(program: Command): void {
  const webhook = program.command("webhook").description("Simulate, sign, verify, and manage Clink webhooks");

  const endpoint = webhook
    .command("endpoint")
    .description("Manage webhook endpoints with the Secret Key API");
  registerWebhookEndpointSubcommands(endpoint);

  webhook
    .command("fixture")
    .description("Write a stable local webhook fixture to disk")
    .argument("<type>", "Event type, for example invoice.paid")
    .requiredOption("--out <file>", "Output JSON file")
    .action(async (type: string, options: { out: string }, command: Command) => {
      const { config } = await getCommandContext(command);
      const event = createWebhookFixture(type);
      await mkdir(dirname(options.out), { recursive: true });
      await writeFile(options.out, `${JSON.stringify(event, null, 2)}\n`, "utf8");

      printResult(
        {
          eventType: type,
          out: options.out,
          fixture: event,
        },
        config.outputMode,
        `Wrote ${type} fixture to ${options.out}`,
      );
    });

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
        let response: Response;
        try {
          response = await fetch(options.forwardTo, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Clink-Timestamp": timestamp,
              "X-Clink-Signature": signature,
            },
            body: rawBody,
          });
        } catch (error) {
          throw new Error(`Webhook forward to ${options.forwardTo} network error: ${formatFetchError(error)}`);
        }
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
    .option("--tolerance-seconds <seconds>", "Allowed timestamp drift before rejecting", String(DEFAULT_WEBHOOK_TOLERANCE_SECONDS))
    .action(async (
      options: { bodyFile: string; timestamp: string; signature: string; secret?: string; toleranceSeconds: string },
      command: Command,
    ) => {
      const { config } = await getCommandContext(command);
      const secret = resolveSecretRef(options.secret, []).secret ?? config.webhookSigningKey;
      requireOption("--secret or CLINK_WEBHOOK_SIGNING_KEY", secret);
      const rawBody = await readFile(options.bodyFile, "utf8");
      const toleranceSeconds = parseNonNegativeIntegerOption("--tolerance-seconds", options.toleranceSeconds);
      const valid = verifyWebhookPayload(secret, options.timestamp, rawBody, options.signature, { toleranceSeconds });
      printResult({ valid, toleranceSeconds }, config.outputMode, valid ? "valid" : "invalid");
      if (!valid) process.exitCode = 1;
    });
}

function parseNonNegativeIntegerOption(name: string, value: string | number | undefined): number {
  const parsed = parseIntegerOption(name, value);
  if (parsed < 0) {
    throw new Error(`Option ${name} must be greater than or equal to 0`);
  }
  return parsed;
}
