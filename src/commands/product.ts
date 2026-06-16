import type { Command } from "commander";
import { createImageUploadForm } from "../api/client.js";
import { DEFAULT_PAGE_SIZE } from "../constants.js";
import { printResult, requireOption } from "../output.js";
import { getCommandContext } from "./helpers.js";

export function registerProduct(program: Command): void {
  const product = program.command("product").description("Create and list Clink products");

  product
    .command("create")
    .description("Create a product. Use --image-file to upload a product image first.")
    .requiredOption("--name <name>", "Product name")
    .option("--description <description>", "Product description")
    .option("--image-id <ossId>", "Existing uploaded product image OSS ID")
    .option("--image-file <path>", "Local image file to upload before product creation")
    .option("--tax-category <category>", "digital_goods_or_service, ebook, or software_service", "software_service")
    .action(async (options: {
      name: string;
      description?: string;
      imageId?: string;
      imageFile?: string;
      taxCategory: string;
    }, command: Command) => {
      const { config, client } = await getCommandContext(command);
      let imageId = options.imageId;
      let uploadResult: unknown;

      if (!imageId && options.imageFile) {
        const form = await createImageUploadForm(options.imageFile);
        uploadResult = await client.post("/product/image/upload", { multipart: form });
        imageId = extractOssId(uploadResult);
      }

      requireOption("--image-id or --image-file", imageId);

      const body = {
        name: options.name,
        description: options.description,
        image: imageId,
        taxCategory: options.taxCategory,
      };
      const result = await client.post("/product", { body });

      printResult(
        { upload: uploadResult, product: result },
        config.outputMode,
        `Product create request completed for "${options.name}"`,
      );
    });

  product
    .command("list")
    .description("List products for the current merchant")
    .option("--page <number>", "Page number", "1")
    .option("--page-size <number>", "Page size", String(DEFAULT_PAGE_SIZE))
    .action(async (options: { page: string; pageSize: string }, command: Command) => {
      const { config, client } = await getCommandContext(command);
      const result = await client.get("/product", {
        query: {
          pageNum: Number(options.page),
          pageSize: Number(options.pageSize),
        },
      });
      printResult(result, config.outputMode);
    });
}

function extractOssId(uploadResult: unknown): string | undefined {
  if (!uploadResult || typeof uploadResult !== "object") return undefined;
  const data = (uploadResult as { data?: { ossId?: string } }).data;
  return data?.ossId;
}

