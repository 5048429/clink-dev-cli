import { printResult } from "../output.js";
import { createWebhookFixture } from "../webhook/fixtures.js";
import { signWebhookPayload } from "../webhook/signature.js";
import { getCommandContext } from "./helpers.js";
export function registerSmokeTest(program) {
    program
        .command("smoke-test")
        .description("Run a minimal checkout and optional webhook smoke test")
        .option("--customer-email <email>", "Customer email", "test@example.com")
        .option("--amount <amount>", "Checkout amount", "1")
        .option("--currency <currency>", "Checkout currency", "USD")
        .option("--name <name>", "Inline product name", "CLI Smoke Test Product")
        .option("--success-url <url>", "Success URL", "http://localhost:3000/success")
        .option("--cancel-url <url>", "Cancel URL", "http://localhost:3000/cancel")
        .option("--webhook-url <url>", "Optional local webhook URL to receive a signed fixture")
        .action(async (options, command) => {
        const { config, client } = await getCommandContext(command);
        const steps = [];
        const checkoutBody = {
            customerEmail: options.customerEmail,
            originalAmount: Number(options.amount),
            originalCurrency: options.currency.toUpperCase(),
            successUrl: options.successUrl,
            cancelUrl: options.cancelUrl,
            uiMode: "hostedPage",
            priceDataList: [
                {
                    name: options.name,
                    quantity: 1,
                    unitAmount: Number(options.amount),
                    currency: options.currency.toUpperCase(),
                },
            ],
        };
        const checkout = await client.post("/checkout/session", { body: checkoutBody });
        steps.push({ name: "checkout_session", ok: true, result: checkout });
        if (options.webhookUrl) {
            if (!config.webhookSigningKey) {
                steps.push({ name: "webhook_simulation", ok: false, error: "Missing CLINK_WEBHOOK_SIGNING_KEY" });
            }
            else {
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
                steps.push({
                    name: "webhook_simulation",
                    ok: response.ok,
                    status: response.status,
                    body: await response.text(),
                });
            }
        }
        const ok = steps.every((step) => typeof step === "object" && step !== null && step.ok);
        printResult({ ok, steps }, config.outputMode, ok ? "Smoke test passed" : "Smoke test completed with failures");
        if (!ok)
            process.exitCode = 1;
    });
}
//# sourceMappingURL=smoke-test.js.map