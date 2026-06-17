import type { Command } from "commander";
import type {
  PriceCreatePayload,
  PriceCreateResponse,
  PriceListQuery,
  PriceListResponse,
} from "../api/openapi-types.js";
import { DEFAULT_PAGE_SIZE } from "../constants.js";
import { parseNumberOption, printResult } from "../output.js";
import { getCommandContext } from "./helpers.js";

type PriceRecurringDetails = NonNullable<PriceCreatePayload["recurringDetails"]>;

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
      const body: PriceCreatePayload = {
        productId: options.productId,
        currency: options.currency.toUpperCase() as PriceCreatePayload["currency"],
        unitAmount: parseNumberOption("--amount", options.amount),
        priceType: options.type as PriceCreatePayload["priceType"],
        isDefaultPrice: Boolean(options.default),
      };

      if (options.type === "recurring") {
        body.recurringDetails = {
          interval: (options.interval ?? "month") as PriceRecurringDetails["interval"],
          intervalCount: Number(options.intervalCount),
          trialPeriodDays: options.trialDays ? Number(options.trialDays) : undefined,
          pricingModel: options.pricingModel as PriceRecurringDetails["pricingModel"],
        };
      }

      const result = await client.post<PriceCreateResponse, PriceCreatePayload>("/price", { body });
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
      const query: PriceListQuery = {
        productId: options.productId,
        active: options.active === "true",
        pageNum: Number(options.page),
        pageSize: Number(options.pageSize),
      };
      const result = await client.get<PriceListResponse, PriceListQuery>("/price", {
        query,
      });
      printResult(result, config.outputMode);
    });
}
