import type { Command } from "commander";
import type { SubscriptionCreatePayload, SubscriptionCreateResponse } from "../api/openapi-types.js";
import { curlForJsonRequest } from "../curl.js";
import { printResult } from "../output.js";
import { buildUrl, getCommandContext, parseMetadata } from "./helpers.js";

export function registerSubscription(program: Command): void {
  const subscription = program.command("subscription").description("Create and manage subscriptions");

  subscription
    .command("create")
    .description("Create a subscription with an existing payment instrument")
    .requiredOption("--product-id <id>", "Product ID")
    .requiredOption("--price-id <id>", "Recurring price ID")
    .requiredOption("--payment-instrument-id <id>", "Payment instrument ID")
    .requiredOption("--payment-currency <currency>", "Payment currency")
    .requiredOption("--return-url <url>", "Return URL for required payment actions")
    .option("--customer-id <id>", "Existing Clink customer ID")
    .option("--customer-email <email>", "Customer email")
    .option("--reference-customer-id <id>", "Merchant-side customer ID")
    .option("--merchant-reference-id <id>", "Merchant reference ID")
    .option("--payment-method-type <type>", "CARD or GCASH", "CARD")
    .option("--metadata <key=value...>", "Metadata entry", collect, [])
    .action(async (options: {
      productId: string;
      priceId: string;
      paymentInstrumentId: string;
      paymentCurrency: string;
      returnUrl: string;
      customerId?: string;
      customerEmail?: string;
      referenceCustomerId?: string;
      merchantReferenceId?: string;
      paymentMethodType: string;
      metadata: string[];
    }, command: Command) => {
      const { config, client } = await getCommandContext(command);
      const body: SubscriptionCreatePayload = {
        customerId: options.customerId,
        customerEmail: options.customerEmail,
        referenceCustomerId: options.referenceCustomerId,
        merchantReferenceId: options.merchantReferenceId,
        productId: options.productId,
        priceId: options.priceId,
        paymentInstrumentId: options.paymentInstrumentId,
        paymentMethodType: options.paymentMethodType as SubscriptionCreatePayload["paymentMethodType"],
        paymentCurrency: options.paymentCurrency.toUpperCase(),
        returnUrl: options.returnUrl,
        metadata: parseMetadata(options.metadata),
      };
      const result = await client.post<SubscriptionCreateResponse, SubscriptionCreatePayload>("/subscription", { body });
      const url = buildUrl(config.baseUrl, "/subscription");
      printResult(
        {
          result,
          curl: curlForJsonRequest("POST", url, body),
        },
        config.outputMode,
        "Subscription create request completed. Use --json to view the full response and curl example.",
      );
    });
}

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}
