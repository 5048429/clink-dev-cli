#!/usr/bin/env node
import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { registerAuth } from "./commands/auth.js";
import { registerCheckout } from "./commands/checkout.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerInit } from "./commands/init.js";
import { registerPrice } from "./commands/price.js";
import { registerProduct } from "./commands/product.js";
import { registerSmokeTest } from "./commands/smoke-test.js";
import { registerSubscription } from "./commands/subscription.js";
import { registerWebhook } from "./commands/webhook.js";

async function main(): Promise<void> {
  const packageJson = await readPackageJson();
  const program = new Command();

  program
    .name("clink")
    .description("Merchant developer CLI for ClinkBill integrations")
    .version(packageJson.version)
    .option("--json", "Output machine-readable JSON")
    .option("--profile <name>", "Use a named local profile", "default")
    .option("--env <environment>", "sandbox or production")
    .option("--base-url <url>", "Override Clink API base URL")
    .option("--api-key <value>", "Secret key literal or env:CLINK_SECRET_KEY")
    .option("--dry-run", "Print request metadata instead of executing Clink API writes");

  registerAuth(program);
  registerInit(program);
  registerProduct(program);
  registerPrice(program);
  registerCheckout(program);
  registerSubscription(program);
  registerWebhook(program);
  registerDoctor(program);
  registerSmokeTest(program);

  await program.parseAsync(process.argv);
}

async function readPackageJson(): Promise<{ version: string }> {
  const currentFile = fileURLToPath(import.meta.url);
  const root = join(dirname(currentFile), "..");
  try {
    const raw = await readFile(join(root, "package.json"), "utf8");
    return JSON.parse(raw) as { version: string };
  } catch {
    const raw = await readFile(join(root, "..", "package.json"), "utf8");
    return JSON.parse(raw) as { version: string };
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const wantsJson = process.argv.includes("--json");
  if (wantsJson) {
    console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(`Error: ${message}`);
  }
  process.exitCode = 1;
});

