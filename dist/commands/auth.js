import { getConfigPath, resolveRuntimeConfig, saveProfile } from "../config.js";
import { maskSecret, printResult, requireOption } from "../output.js";
export function registerAuth(program) {
    const auth = program.command("auth").description("Configure and inspect Clink API credentials");
    auth
        .command("set")
        .description("Store a local profile. Prefer env:VARIABLE references for secrets.")
        .option("--api-key <value>", "Secret key literal or env:CLINK_SECRET_KEY")
        .option("--webhook-secret <value>", "Webhook signing key literal or env:CLINK_WEBHOOK_SIGNING_KEY")
        .option("--env <environment>", "sandbox or production", "sandbox")
        .option("--base-url <url>", "Override Clink API base URL")
        .action(async (options, command) => {
        const global = command.optsWithGlobals();
        const profileName = global.profile ?? "default";
        const apiKey = options.apiKey ?? global.apiKey;
        const profile = {
            environment: global.env ?? options.env ?? "sandbox",
            baseUrl: options.baseUrl ?? global.baseUrl,
        };
        if (apiKey) {
            if (apiKey.startsWith("env:")) {
                profile.apiKeyEnv = apiKey.slice("env:".length);
            }
            else {
                profile.apiKey = apiKey;
            }
        }
        if (options.webhookSecret) {
            if (options.webhookSecret.startsWith("env:")) {
                profile.webhookSigningKeyEnv = options.webhookSecret.slice("env:".length);
            }
            else {
                profile.webhookSigningKey = options.webhookSecret;
            }
        }
        await saveProfile(profileName, profile);
        const runtime = await resolveRuntimeConfig(global);
        printResult({
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
        }, runtime.outputMode, `Saved profile "${profileName}" at ${getConfigPath()}`);
    });
    const secret = auth
        .command("secret")
        .description("Configure Secret Key authentication without Dashboard login");
    secret
        .command("set")
        .description("Store an existing Clink Secret Key for API authentication. Prefer env:VARIABLE references.")
        .option("--api-key <value>", "Secret key literal or env:CLINK_SECRET_KEY")
        .option("--env <environment>", "sandbox or production", "sandbox")
        .option("--base-url <url>", "Override Clink API base URL")
        .action(async (options, command) => {
        const global = command.optsWithGlobals();
        const profileName = global.profile ?? "default";
        const apiKey = options.apiKey ?? global.apiKey;
        requireOption("--api-key", apiKey);
        const profile = {
            environment: global.env ?? options.env ?? "sandbox",
            baseUrl: options.baseUrl ?? global.baseUrl,
        };
        if (apiKey.startsWith("env:")) {
            profile.apiKeyEnv = apiKey.slice("env:".length);
        }
        else {
            profile.apiKey = apiKey;
        }
        await saveProfile(profileName, profile);
        const runtime = await resolveRuntimeConfig(global);
        const apiKeySource = profile.apiKeyEnv ? `env:${profile.apiKeyEnv}` : "literal";
        printResult({
            profile: profileName,
            configPath: getConfigPath(),
            environment: profile.environment,
            baseUrl: runtime.baseUrl,
            apiKey: maskSecret(runtime.apiKey),
            apiKeySource,
            ready: Boolean(runtime.apiKey),
            next: "clink auth status",
        }, runtime.outputMode, [
            `Saved Secret Key authentication for profile "${profileName}" at ${getConfigPath()}`,
            `Environment: ${profile.environment}`,
            `Base URL: ${runtime.baseUrl}`,
            `API key: ${maskSecret(runtime.apiKey) ?? "missing"} (${apiKeySource})`,
            runtime.apiKey ? "Next: clink auth status" : "Set the referenced environment variable before running API commands.",
        ].join("\n"));
    });
    auth
        .command("status")
        .description("Show resolved auth status without revealing secrets")
        .action(async function () {
        const global = this.optsWithGlobals();
        const runtime = await resolveRuntimeConfig(global);
        requireOption("baseUrl", runtime.baseUrl);
        printResult({
            profile: runtime.profile,
            environment: runtime.environment,
            baseUrl: runtime.baseUrl,
            apiKey: maskSecret(runtime.apiKey),
            apiKeySource: runtime.apiKeySource,
            webhookSigningKey: maskSecret(runtime.webhookSigningKey),
            webhookSigningKeySource: runtime.webhookSigningKeySource,
            configPath: getConfigPath(),
        }, runtime.outputMode, [
            `Profile: ${runtime.profile}`,
            `Environment: ${runtime.environment}`,
            `Base URL: ${runtime.baseUrl}`,
            `API key: ${maskSecret(runtime.apiKey) ?? "missing"}`,
            `Webhook signing key: ${maskSecret(runtime.webhookSigningKey) ?? "missing"}`,
        ].join("\n"));
    });
}
//# sourceMappingURL=auth.js.map