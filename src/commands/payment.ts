import type { Command } from "commander";
import { curlForJsonRequest } from "../curl.js";
import { printResult } from "../output.js";
import { buildUrl, getCommandContext, readJsonInput } from "./helpers.js";

export function registerPayment(program: Command): void {
  const payment = program
    .command("payment")
    .description("Create one-time payments and payment instruments with CLINK_SECRET_KEY authentication");

  payment
    .command("create")
    .description("Create a one-time payment. Provide the official API JSON payload with --data or --data-file.")
    .option("--data <json>", "Create payment JSON payload")
    .option("--data-file <path>", "Read JSON payload from a file")
    .action(async (options: { data?: string; dataFile?: string }, command: Command) => {
      const { config, client } = await getCommandContext(command);
      const body = await readJsonInput(options);
      if (body === undefined) {
        throw new Error("Missing required option: --data or --data-file");
      }
      const result = await client.post("/payment", { body });
      printResult(
        {
          result,
          curl: curlForJsonRequest("POST", buildUrl(config.baseUrl, "/payment"), body),
        },
        config.outputMode,
        "Payment create request completed. Use --json to view the full response and curl example.",
      );
    });

  const instrument = payment
    .command("instrument")
    .description("Manage payment instruments");

  instrument
    .command("create")
    .description("Create a payment instrument. Provide the official API JSON payload with --data or --data-file.")
    .option("--data <json>", "Create payment instrument JSON payload")
    .option("--data-file <path>", "Read JSON payload from a file")
    .action(async (options: { data?: string; dataFile?: string }, command: Command) => {
      const { config, client } = await getCommandContext(command);
      const body = await readJsonInput(options);
      if (body === undefined) {
        throw new Error("Missing required option: --data or --data-file");
      }
      const result = await client.post("/payment-instrument", { body });
      printResult(
        {
          result,
          curl: curlForJsonRequest("POST", buildUrl(config.baseUrl, "/payment-instrument"), body),
        },
        config.outputMode,
        "Payment instrument create request completed. Use --json to view the full response and curl example.",
      );
    });
}
