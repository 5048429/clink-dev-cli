import type { Command } from "commander";
import { getConfigPath, resolveRuntimeConfig, saveProfile } from "../config.js";
import { maskSecret, printResult, requireOption } from "../output.js";
import type { ClinkEnvironment, GlobalOptions, StoredProfile } from "../types.js";

export function registerAuth(program: Command): void {
  const auth = program.command("auth").description("Configure and inspect Clink API credentials");

  auth
    .command("set")
    .description("Store a local profile. Prefer env:VARIABLE references for secrets.")
    .option("--api-key <value>", "Secret key literal or env:CLINK_SECRET_KEY")
    .option("--webhook-secret <value>", "Webhook signing key literal or env:CLINK_WEBHOOK_SIGNING_KEY")
    .option("--env <environment>", "sandbox or production", "sandbox")
    .option("--base-url <url>", "Override Clink API base URL")
    .action(async (options: { apiKey?: string; webhookSecret?: string; env?: ClinkEnvironment; baseUrl?: string }, command: Command) => {
      const global = command.optsWithGlobals<GlobalOptions>();
      const profileName = global.profile ?? "default";
      const profile: StoredProfile = {
        environment: options.env ?? "sandbox",
        baseUrl: options.baseUrl,
      };

      if (options.apiKey) {
        if (options.apiKey.startsWith("env:")) {
          profile.apiKeyEnv = options.apiKey.slice("env:".length);
        } else {
          profile.apiKey = options.apiKey;
        }
      }

      if (options.webhookSecret) {
        if (options.webhookSecret.startsWith("env:")) {
          profile.webhookSigningKeyEnv = options.webhookSecret.slice("env:".length);
        } else {
          profile.webhookSigningKey = options.webhookSecret;
        }
      }

      await saveProfile(profileName, profile);
      const runtime = await resolveRuntimeConfig(global);
      printResult(
        {
          profile: profileName,
          configPath: getConfigPath(),
          environment: profile.environment,
          baseUrl: runtime.baseUrl,
          apiKeySource: profile.apiKeyEnv ? `env:${profile.apiKeyEnv}` : profile.apiKey ? "literal" : undefined,
          webhookSigningKeySource: profile.webhookSigningKeyEnv
            ? `env:${profile.webhookSigningKeyEnv}`
            : profile.webhookSigningKey
              ? "literal"
              : undefined,
        },
        runtime.outputMode,
        `Saved profile "${profileName}" at ${getConfigPath()}`,
      );
    });

  auth
    .command("status")
    .description("Show resolved auth status without revealing secrets")
    .action(async function (this: Command) {
      const global = this.optsWithGlobals<GlobalOptions>();
      const runtime = await resolveRuntimeConfig(global);
      requireOption("baseUrl", runtime.baseUrl);
      printResult(
        {
          profile: runtime.profile,
          environment: runtime.environment,
          baseUrl: runtime.baseUrl,
          apiKey: maskSecret(runtime.apiKey),
          apiKeySource: runtime.apiKeySource,
          webhookSigningKey: maskSecret(runtime.webhookSigningKey),
          webhookSigningKeySource: runtime.webhookSigningKeySource,
          configPath: getConfigPath(),
        },
        runtime.outputMode,
        [
          `Profile: ${runtime.profile}`,
          `Environment: ${runtime.environment}`,
          `Base URL: ${runtime.baseUrl}`,
          `API key: ${maskSecret(runtime.apiKey) ?? "missing"}`,
          `Webhook signing key: ${maskSecret(runtime.webhookSigningKey) ?? "missing"}`,
        ].join("\n"),
      );
    });
}
