import type { Command } from "commander";
import { curlForJsonRequest } from "../curl.js";
import { parseIntegerOption, parseNumberOption, printResult } from "../output.js";
import { buildUrl, getCommandContext } from "./helpers.js";

export function registerCheckout(program: Command): void {
  const checkout = program.command("checkout").description("Create checkout sessions");

  checkout
    .command("create")
    .description("Create a hosted checkout session")
    .requiredOption("--customer-email <email>", "Customer email")
    .requiredOption("--amount <amount>", "Original amount")
    .requiredOption("--currency <currency>", "Original currency, for example USD")
    .option("--name <name>", "Inline one-time product name")
    .option("--quantity <number>", "Inline one-time product quantity", "1")
    .option("--image-url <url>", "Inline product image URL")
    .option("--product-id <id>", "Registered product ID")
    .option("--price-id <id>", "Registered price ID")
    .option("--merchant-reference-id <id>", "Merchant order/reference ID")
    .option("--success-url <url>", "Success redirect URL")
    .option("--cancel-url <url>", "Cancel redirect URL")
    .option("--ui-mode <mode>", "hostedPage or elements", "hostedPage")
    .option("--return-url <url>", "Return URL for elements mode")
    .option("--payment-method-type <type>", "Default payment method type")
    .option("--allow-promotion-codes", "Enable promotion code entry")
    .action(async (options: {
      customerEmail: string;
      amount: string;
      currency: string;
      name?: string;
      quantity: string;
      imageUrl?: string;
      productId?: string;
      priceId?: string;
      merchantReferenceId?: string;
      successUrl?: string;
      cancelUrl?: string;
      uiMode: string;
      returnUrl?: string;
      paymentMethodType?: string;
      allowPromotionCodes?: boolean;
    }, command: Command) => {
      const { config, client } = await getCommandContext(command);
      const amount = parseNumberOption("--amount", options.amount);
      const body: Record<string, unknown> = {
        customerEmail: options.customerEmail,
        originalAmount: amount,
        originalCurrency: options.currency.toUpperCase(),
        merchantReferenceId: options.merchantReferenceId,
        successUrl: options.successUrl,
        cancelUrl: options.cancelUrl,
        uiMode: options.uiMode,
        returnUrl: options.returnUrl,
        paymentMethodType: options.paymentMethodType,
        allowPromotionCodes: Boolean(options.allowPromotionCodes),
      };

      if (options.productId || options.priceId) {
        body.productId = options.productId;
        body.priceId = options.priceId;
      } else {
        body.priceDataList = [
          {
            name: options.name ?? "Test Product",
            quantity: parseIntegerOption("--quantity", options.quantity),
            unitAmount: amount,
            currency: options.currency.toUpperCase(),
            imageUrl: options.imageUrl,
          },
        ];
      }

      const result = await client.post("/checkout/session", { body });
      const url = buildUrl(config.baseUrl, "/checkout/session");
      printResult(
        {
          result,
          curl: curlForJsonRequest("POST", url, body),
        },
        config.outputMode,
        `Checkout session create request completed. Use --json to view the full response and curl example.`,
      );
    });
}

