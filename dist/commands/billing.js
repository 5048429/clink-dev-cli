import { curlForJsonRequest } from "../curl.js";
import { printResult } from "../output.js";
import { buildUrl, getCommandContext } from "./helpers.js";
export function registerBilling(program) {
    const billing = program
        .command("billing")
        .description("Create customer billing portal sessions with CLINK_SECRET_KEY authentication");
    billing
        .command("portal-session")
        .description("Create a customer portal session")
        .requiredOption("--customer-id <id>", "Existing Clink customer ID")
        .option("--return-url <url>", "Return URL when the customer leaves the portal")
        .action(async (options, command) => {
        const { config, client } = await getCommandContext(command);
        const body = {
            customerId: options.customerId,
            returnUrl: options.returnUrl,
        };
        const result = await client.post("/billing/session", { body });
        printResult({
            portalUrl: extractPortalUrl(result),
            result,
            curl: curlForJsonRequest("POST", buildUrl(config.baseUrl, "/billing/session"), body),
        }, config.outputMode, "Billing portal session create request completed. Use --json to view the full response and curl example.");
    });
}
function extractPortalUrl(result) {
    const data = result && typeof result === "object" ? result.data : undefined;
    return typeof data?.url === "string" ? data.url : undefined;
}
//# sourceMappingURL=billing.js.map