import { maskSecret, printResult } from "../output.js";
import { createWebhookFixture } from "../webhook/fixtures.js";
import { signWebhookPayload } from "../webhook/signature.js";
import { getCommandContext } from "./helpers.js";
export function registerDoctor(program) {
    program
        .command("doctor")
        .description("Run Clink integration health checks")
        .option("--skip-network", "Do not call the Clink API")
        .option("--webhook-url <url>", "POST a signed local webhook fixture to this endpoint")
        .action(async (options, command) => {
        const { config, client } = await getCommandContext(command);
        const checks = [];
        checks.push({
            name: "environment",
            status: config.environment === "sandbox" ? "pass" : "warn",
            message: `Using ${config.environment} (${config.baseUrl})`,
        });
        checks.push({
            name: "api_key",
            status: config.apiKey ? "pass" : "fail",
            message: config.apiKey ? `Resolved ${maskSecret(config.apiKey)} from ${config.apiKeySource}` : "Missing CLINK_SECRET_KEY",
        });
        checks.push({
            name: "webhook_signing_key",
            status: config.webhookSigningKey ? "pass" : "warn",
            message: config.webhookSigningKey
                ? `Resolved ${maskSecret(config.webhookSigningKey)} from ${config.webhookSigningKeySource}`
                : "Missing CLINK_WEBHOOK_SIGNING_KEY. Webhook simulation requires it.",
        });
        if (!options.skipNetwork && config.apiKey) {
            try {
                await client.get("/product", { query: { pageNum: 1, pageSize: 1 } });
                checks.push({ name: "api_connectivity", status: "pass", message: "Product list endpoint responded" });
            }
            catch (error) {
                checks.push({ name: "api_connectivity", status: "fail", message: error.message });
            }
        }
        if (options.webhookUrl) {
            if (!config.webhookSigningKey) {
                checks.push({
                    name: "webhook_simulation",
                    status: "fail",
                    message: "Cannot simulate webhook without CLINK_WEBHOOK_SIGNING_KEY",
                });
            }
            else {
                try {
                    const event = createWebhookFixture("order.succeeded");
                    const rawBody = JSON.stringify(event);
                    const timestamp = String(Date.now());
                    const signature = signWebhookPayload(config.webhookSigningKey, timestamp, rawBody);
                    const response = await fetch(options.webhookUrl, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-Clink-Timestamp": timestamp,
                            "X-Clink-Signature": signature,
                        },
                        body: rawBody,
                    });
                    checks.push({
                        name: "webhook_simulation",
                        status: response.ok ? "pass" : "fail",
                        message: `Webhook endpoint responded with ${response.status}`,
                    });
                }
                catch (error) {
                    checks.push({ name: "webhook_simulation", status: "fail", message: error.message });
                }
            }
        }
        const failed = checks.some((check) => check.status === "fail");
        printResult({ ok: !failed, checks }, config.outputMode, checks.map((check) => `[${check.status}] ${check.name}: ${check.message}`).join("\n"));
        if (failed)
            process.exitCode = 1;
    });
}
//# sourceMappingURL=doctor.js.map