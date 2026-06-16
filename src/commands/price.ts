import type { Command } from "commander";
import { DEFAULT_PAGE_SIZE } from "../constants.js";
import { parseNumberOption, printResult } from "../output.js";
import { getCommandContext } from "./helpers.js";

export function registerPrice(program: Command): void {
  const price = program.command("price").description("Create and list Clink prices");

  price
    .command("create")
    .description("Create a one-time or recurring price")
    .requiredOption("--product-id <id>", "Product ID")
    .requiredOption("--amount <amount>", "Unit amount")
    .requiredOption("--currency <currency>", "Currency, for example USD")
    .option("--type <type>", "one_time or recurring", "one_time")
    .option("--interval <interval>", "day, week, month, year, quarter, half_year, or custom")
    .option("--interval-count <number>", "Interval count", "1")
    .option("--trial-days <number>", "Trial period days")
    .option("--pricing-model <model>", "flat_rate, per_seat, tiered, or usage_based", "flat_rate")
    .option("--default", "Mark as default price")
    .action(async (options: {
      productId: string;
      amount: string;
      currency: string;
      type: string;
      interval?: string;
      intervalCount: string;
      trialDays?: string;
      pricingModel: string;
      default?: boolean;
    }, command: Command) => {
      const { config, client } = await getCommandContext(command);
      const body: Record<string, unknown> = {
        productId: options.productId,
        currency: options.currency.toUpperCase(),
        unitAmount: parseNumberOption("--amount", options.amount),
        priceType: options.type,
        isDefaultPrice: Boolean(options.default),
      };

      if (options.type === "recurring") {
        body.recurringDetails = {
          interval: options.interval ?? "month",
          intervalCount: Number(options.intervalCount),
          trialPeriodDays: options.trialDays ? Number(options.trialDays) : undefined,
          pricingModel: options.pricingModel,
        };
      }

      const result = await client.post("/price", { body });
      printResult(result, config.outputMode, `Price create request completed for product ${options.productId}`);
    });

  price
    .command("list")
    .description("List prices for a product")
    .requiredOption("--product-id <id>", "Product ID")
    .option("--active <boolean>", "Filter active prices", "true")
    .option("--page <number>", "Page number", "1")
    .option("--page-size <number>", "Page size", String(DEFAULT_PAGE_SIZE))
    .action(async (options: { productId: string; active: string; page: string; pageSize: string }, command: Command) => {
      const { config, client } = await getCommandContext(command);
      const result = await client.get("/price", {
        query: {
          productId: options.productId,
          active: options.active === "true",
          pageNum: Number(options.page),
          pageSize: Number(options.pageSize),
        },
      });
      printResult(result, config.outputMode);
    });
}

